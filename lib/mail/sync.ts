import "server-only";

import { insertActivity } from "@/lib/activity/service";
import { getStoragePath, insertDocument, MAX_DOCUMENT_FILE_SIZE } from "@/lib/documents/service";
import { storage } from "@/lib/firebase/storage";
import { analyzeEmail, checkVerdict, RetryLater, type AiResult, type EmailForAi } from "@/lib/mail/ai";
import { mailAiModel } from "@/lib/mail/config";
import { open, seal } from "@/lib/mail/crypto";
import { GraphError, Mailbox, ReconnectError, refreshTokens, type GraphAttachment, type GraphMessage, type Tokens } from "@/lib/mail/graph";
import {
  addressOf,
  bodyText,
  cleanSubject,
  isColleague,
  nameOf,
  ownSenderAddresses,
  pickAssignee,
  replyText,
  skipReason,
  threadIds,
  type SkipReason,
} from "@/lib/mail/rules";
import * as store from "@/lib/mail/store";
import { dispatchNotificationEmails } from "@/lib/notifications/email-delivery";
import { insertNotifications, selectProjectRecipients, type NewNotification } from "@/lib/notifications/service";
import { insertTicket } from "@/lib/tickets/service";
import { getDefaultStage, getLegacyWorkflow, stageStatus } from "@/lib/tickets/workflow";
import { readConfiguredWorkflows } from "@/lib/tickets/workflow-service";
import { asSystem, selectOne, type Tx } from "@/lib/work/db";

// E-mails to tickets, the cron's work (app/api/cron/mail/route.ts), in two stages:
//   A. fetch: each connected inbox's new e-mails (its Graph delta), stored once as `pending`;
//   B. process: each pending e-mail read — the free rules, a reply in a ticket's thread made a comment, the others read
//      by Claude; a task becomes a ticket on one of its person's missions (else their floor's "Demandes par e-mail"),
//      with its files; what is not a task is `skipped` with the reason.
// Writes run in the system session for the person concerned (asSystem(personId): the rules pass — an employee may
// not create a ticket — and the history, the audit and the documents' floor say whom it was for). Network calls run
// between transactions (a pool of 5, statements of 15 s at most). Everything it calls is in `deps`, for the tests.

export type MailDeps = {
  system: <T>(actorId: string, work: (tx: Tx) => Promise<T>) => Promise<T>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  mailbox: (accessToken: string) => Pick<Mailbox, "deltaFrom" | "deltaPage" | "message" | "attachments" | "attachmentBytes">;
  analyze: (input: EmailForAi) => Promise<AiResult>;
  upload: (path: string, bytes: Buffer, contentType: string) => Promise<{ error: { message: string } | null }>;
  remove: (path: string) => Promise<unknown>;
  dispatch: (notificationIds: string[]) => Promise<unknown>;
};

export const productionDeps: MailDeps = {
  system: asSystem,
  refresh: (token) => refreshTokens(token),
  mailbox: (accessToken) => new Mailbox(accessToken),
  analyze: (input) => analyzeEmail(input),
  upload: (path, bytes, contentType) => storage.from("documents").upload(path, bytes, { contentType, upsert: false }),
  remove: (path) => storage.from("documents").remove([path]),
  dispatch: (ids) => dispatchNotificationEmails(ids),
};

const SYNC_ACTOR = "mail-sync";
const MAX_FILES = 10;

export type MailRunStats = { inboxes: number; fetched: number; tickets: number; comments: number; skipped: number; failed: number; later: number };

type Outcome = "ticket" | "comment" | "skipped" | "failed" | "later";
const TALLY: Record<Outcome, keyof MailRunStats> = { ticket: "tickets", comment: "comments", skipped: "skipped", failed: "failed", later: "later" };

/** One run's shared state: each inbox's access token, its inboxes held back by Graph, the notifications to e-mail. */
class Run {
  private tokens = new Map<string, Promise<ReturnType<MailDeps["mailbox"]>>>();
  private people: Promise<Map<string, string>> | null = null;
  readonly throttled = new Map<string, number>();
  readonly notificationIds: string[] = [];
  readonly ownSenders = ownSenderAddresses([
    process.env.NOTIFICATION_EMAIL_FROM || "BUMEX <bumex@bumex.mr>",
    process.env.NOTIFICATION_EMAIL_SENDER_EMAIL,
    process.env.SMTP_FROM,
  ]);

  constructor(readonly deps: MailDeps) {}

  /** The person's inbox, with a fresh access token (the refresh token Microsoft rotates is kept, sealed). */
  mailbox(personId: string) {
    let box = this.tokens.get(personId);
    if (!box) {
      box = (async () => {
        const sealed = await this.deps.system(personId, (tx) => store.readToken(tx, personId));
        if (!sealed) throw new ReconnectError("no token");
        const tokens = await this.deps.refresh(open(sealed));
        await this.deps.system(personId, (tx) => store.saveToken(tx, personId, seal(tokens.refreshToken)));
        return this.deps.mailbox(tokens.accessToken);
      })();
      box.catch(() => this.tokens.delete(personId));
      this.tokens.set(personId, box);
    }
    return box;
  }

  connected() {
    return (this.people ??= this.deps.system(SYNC_ACTOR, (tx) => store.connectedPeople(tx)));
  }
}

export async function syncMail({ budgetMs = 40_000, deps = productionDeps }: { budgetMs?: number; deps?: MailDeps } = {}): Promise<MailRunStats> {
  const started = Date.now();
  const run = new Run(deps);
  const stats: MailRunStats = { inboxes: 0, fetched: 0, tickets: 0, comments: 0, skipped: 0, failed: 0, later: 0 };

  // A. the inboxes, one at a time, half the time at most (an inbox read less than 90 s ago waits for the next run)
  while (Date.now() - started < budgetMs / 2) {
    const [connection] = await deps.system(SYNC_ACTOR, (tx) => store.claimConnections(tx, 1));
    if (!connection) break;
    stats.inboxes += 1;
    stats.fetched += await fetchInbox(run, connection);
  }

  // B. the e-mails, one at a time while there is time, 25 at most per run (the next run takes the rest)
  for (let done = 0; done < 25 && Date.now() - started < budgetMs; done += 1) {
    const [row] = await deps.system(SYNC_ACTOR, (tx) => store.claimMessages(tx, 1));
    if (!row) break;
    stats[TALLY[await processMessage(run, row)]] += 1;
  }

  await deps.system(SYNC_ACTOR, (tx) => store.purgeSkipped(tx));
  if (run.notificationIds.length) await deps.dispatch(run.notificationIds).catch((error) => console.error("[mail:notifications]", errorText(error)));
  return stats;
}

/** One e-mail read now, at its person's request ("Créer le ticket" on a skipped one): Claude writes it, whatever its verdict. */
export async function processNow(messageId: string, deps: MailDeps = productionDeps) {
  const run = new Run(deps);
  const [row] = await deps.system(SYNC_ACTOR, (tx) => store.claimMessages(tx, 1, [messageId]));
  if (!row) return null;
  const outcome = await processMessage(run, row);
  if (run.notificationIds.length) await deps.dispatch(run.notificationIds).catch((error) => console.error("[mail:notifications]", errorText(error)));
  return outcome;
}

// ---- A. fetch ----------------------------------------------------------------

async function fetchInbox(run: Run, connection: store.MailConnectionRow) {
  const { deps } = run;
  const personId = connection.person_id;
  let queued = 0;
  try {
    const mailbox = await run.mailbox(personId);
    let url: string | null = connection.delta_link ?? mailbox.deltaFrom(new Date(connection.connected_at));
    let deltaLink: string | null = null;
    let restarted = false;

    for (let pages = 0; url && pages < 20; pages += 1) {
      let page;
      try {
        page = await mailbox.deltaPage(url);
      } catch (error) {
        // the delta's state expired at Microsoft: start again from the last read (the e-mails already stored stay once)
        if (error instanceof GraphError && error.status === 410 && !restarted) {
          restarted = true;
          url = mailbox.deltaFrom(new Date(connection.last_sync_at ?? connection.connected_at));
          continue;
        }
        throw error;
      }
      queued += await deps.system(personId, (tx) => store.queueMessages(tx, personId, page.messages));
      deltaLink = page.deltaLink ?? page.nextLink;
      url = page.deltaLink ? null : page.nextLink;
    }
    await deps.system(personId, (tx) => store.releaseConnection(tx, personId, { deltaLink }));
  } catch (error) {
    await connectionFailed(run, personId, error);
  }
  return queued;
}

async function connectionFailed(run: Run, personId: string, error: unknown) {
  const reconnect = error instanceof ReconnectError;
  if (!reconnect) console.error("[mail:fetch]", errorText(error));
  const ids = await run.deps.system(personId, async (tx) => {
    const before = await store.readConnection(tx, personId);
    await store.releaseConnection(tx, personId, { error: errorText(error), reconnect });
    // told once, when the inbox stops being read (a disconnected one has nothing to tell)
    return reconnect && before && before.status !== "reconnect"
      ? insertNotifications(tx, [{
          user_id: personId,
          type: "system",
          title: "Reconnect Outlook",
          body: "Vanguard can no longer read your inbox for tickets. Sign in to Microsoft again in Settings, My account.",
          entity_type: "system",
          entity_id: personId,
        }])
      : [];
  });
  run.notificationIds.push(...ids);
}

// ---- B. process --------------------------------------------------------------

async function processMessage(run: Run, row: store.MailMessageRow): Promise<Outcome> {
  const { deps } = run;
  try {
    const wait = run.throttled.get(row.person_id);
    if (wait !== undefined) {
      await deps.system(SYNC_ACTOR, (tx) => store.retryMessage(tx, row, "Microsoft Graph asked to wait.", wait));
      return "later";
    }

    const mailbox = await run.mailbox(row.person_id);
    let message: GraphMessage;
    try {
      message = await mailbox.message(row.graph_id);
    } catch (error) {
      if (error instanceof GraphError && error.status === 404) return skip(run, row, "deleted");
      throw error;
    }

    const reason = row.forced ? null : skipReason(message, run.ownSenders);
    if (reason) return skip(run, row, reason);

    const answered = threadIds(message);
    if (!row.forced && (answered.length || message.conversationId)) {
      const ticketId = await deps.system(row.person_id, (tx) => store.threadTicket(tx, answered, row.person_id, message.conversationId ?? null));
      if (ticketId) return addReply(run, row, message, mailbox, ticketId);
    }

    return await newTicket(run, row, message, mailbox);
  } catch (error) {
    if (error instanceof ReconnectError) await connectionFailed(run, row.person_id, error);
    if (error instanceof GraphError && error.status === 429) run.throttled.set(row.person_id, error.retryAfter || 60);
    const retryable = error instanceof RetryLater || error instanceof ReconnectError || error instanceof GraphError || error instanceof TypeError || isTimeout(error);
    if (!retryable) console.error("[mail:process]", errorText(error));
    await deps.system(SYNC_ACTOR, (tx) => store.retryMessage(tx, row, errorText(error), error instanceof GraphError ? error.retryAfter : 0));
    return row.attempts >= 5 ? "failed" : "later";
  }
}

async function skip(run: Run, row: store.MailMessageRow, reason: SkipReason, detail?: string, ai?: unknown): Promise<Outcome> {
  await run.deps.system(SYNC_ACTOR, (tx) => store.settleMessage(tx, row.id, { status: "skipped", reason: detail ? `${reason}: ${detail}` : reason, ai }));
  return "skipped";
}

const recipients = (list: GraphMessage["toRecipients"]) => (list ?? []).map((r) => `${nameOf(r)} <${addressOf(r)}>`);
const today = () => new Date().toISOString().slice(0, 10);

async function newTicket(run: Run, row: store.MailMessageRow, message: GraphMessage, mailbox: ReturnType<MailDeps["mailbox"]>): Promise<Outcome> {
  const { deps } = run;
  const from = { name: nameOf(message.from), address: addressOf(message.from) };
  const assignee = row.forced ? { personId: row.person_id, via: "self" as const } : pickAssignee(message, await run.connected());
  if (!assignee) return skip(run, row, "not_direct");
  if (!row.forced && from.address && (await deps.system(SYNC_ACTOR, (tx) => store.ticketsFromSenderToday(tx, from.address)))) {
    return skip(run, row, "sender_limit");
  }

  const { person, missions } = await deps.system(assignee.personId, async (tx) => ({
    person: await store.readPerson(tx, assignee.personId),
    missions: await store.candidateMissions(tx, assignee.personId),
  }));
  if (!person) return skip(run, row, "no_floor");

  const attachments = message.hasAttachments ? await mailbox.attachments(row.graph_id) : [];
  const result = await deps.analyze({
    today: today(),
    person: { name: person.full_name, via: assignee.via },
    missions,
    from: { ...from, colleague: isColleague(from.address) },
    to: recipients(message.toRecipients),
    cc: recipients(message.ccRecipients),
    subject: message.subject ?? "",
    receivedAt: message.receivedDateTime ?? "",
    attachments: attachments.filter((a) => !a.isInline).map((a) => a.name ?? ""),
    body: bodyText(message),
  });
  if (result.kind === "declined") return skip(run, row, "ai_declined");

  const ai = { model: mailAiModel(), verdict: { is_task: result.verdict.is_task, reason: result.verdict.reason, mission_id: result.verdict.mission_id }, usage: result.usage };
  if (!result.verdict.is_task && !row.forced) return skip(run, row, "not_a_task", result.verdict.reason, ai);

  const checked = checkVerdict(result.verdict, new Set(missions.map((m) => m.id)), cleanSubject(message.subject));
  const created = await deps.system(assignee.personId, async (tx) => {
    const missionId = checked.missionId ?? (await intakeOf(tx, assignee.personId));
    if (!missionId) return null;

    const workflow = (await readConfiguredWorkflows(tx, [missionId])).get(missionId) ?? getLegacyWorkflow(missionId, "fr");
    const stage = getDefaultStage(workflow);
    const ticket = await insertTicket(tx, {
      title: checked.title,
      description: checked.summary,
      project_id: missionId,
      assignee_id: assignee.personId,
      reporter_id: assignee.personId,
      status: stageStatus(stage),
      stage_id: stage.id,
      stage_reason: "",
      priority: checked.priority,
      type: isColleague(from.address) ? "task" : "client_request",
      due_date: checked.dueDate ?? "",
      estimated_hours: "",
      actual_hours: "",
      github_issue_url: "",
      labels: JSON.stringify(["e-mail"]),
    });
    if (!ticket) throw new Error("Ticket creation did not return an id.");

    await insertActivity(tx, {
      userId: null,
      action: `Created ticket ${checked.title} from an e-mail`,
      entityType: "task",
      entityId: ticket.id,
      metadata: { kind: "create", summary: "Ticket created from an e-mail", source: "email", from: from.address },
    });
    const team = await selectProjectRecipients(tx, missionId);
    const notifications: NewNotification[] = [
      // in the app only: the e-mail itself is already in their inbox
      { user_id: assignee.personId, type: "assignment", title: "New ticket from an e-mail", body: `${checked.title}, from ${from.name}.`, entity_type: "ticket", entity_id: ticket.id, skip_email: true },
      ...team
        .filter((member) => member.id !== assignee.personId)
        .map((member) => ({ user_id: member.id, type: "comment" as const, title: "New ticket created", body: `${checked.title} was added from an e-mail.`, entity_type: "ticket" as const, entity_id: ticket.id })),
    ];
    const ids = await insertNotifications(tx, notifications);
    await store.settleMessage(tx, row.id, {
      status: "ticket",
      reason: result.verdict.reason,
      ticketId: ticket.id,
      bodyText: bodyText(message),
      webLink: message.webLink ?? null,
      ai,
    });
    return { ticketId: ticket.id, ids };
  });
  if (!created) return skip(run, row, "no_floor");

  run.notificationIds.push(...created.ids);
  await attachFiles(run, row, mailbox, created.ticketId, assignee.personId, attachments);
  return "ticket";
}

async function intakeOf(tx: Tx, personId: string) {
  const floor = await store.personFloor(tx, personId);
  return floor ? store.intakeMission(tx, floor) : null;
}

async function addReply(run: Run, row: store.MailMessageRow, message: GraphMessage, mailbox: ReturnType<MailDeps["mailbox"]>, ticketId: string): Promise<Outcome> {
  const { deps } = run;
  const from = { name: nameOf(message.from), address: addressOf(message.from) };
  const attachments = message.hasAttachments ? await mailbox.attachments(row.graph_id) : [];
  const files = attachments.filter((a) => !a.isInline).map((a) => a.name || "pièce jointe");
  const text = replyText(message).slice(0, 10_000);
  const body = [text || "(e-mail sans texte)", files.length ? `Pièces jointes : ${files.join(", ")}` : ""].filter(Boolean).join("\n\n");

  const ids = await deps.system(row.person_id, async (tx) => {
    const ticket = await store.ticketParticipants(tx, ticketId);
    const comment = await selectOne<{ id: string }>(
      tx,
      `insert into work.comment (subject_type, subject_id, author_id, body, is_internal, email_from_name, email_from_address)
       values ('ticket', $1::uuid, $2, $3, true, $4, $5) returning id`,
      [ticketId, row.person_id, body, from.name || null, from.address || null],
    );
    const people = [...new Set([ticket?.assignee_id, ticket?.reporter_id].filter((id): id is string => Boolean(id)))];
    const notified = await insertNotifications(
      tx,
      people.map((id) => ({
        user_id: id,
        type: "comment" as const,
        title: "New e-mail reply",
        body: `${from.name} replied on ${ticket?.key ?? "a ticket"}: ${ticket?.title ?? ""}`.trim(),
        entity_type: "ticket" as const,
        entity_id: ticketId,
        // the inbox's person has the reply already
        ...(id === row.person_id ? { skip_email: true as const } : {}),
      })),
    );
    await store.settleMessage(tx, row.id, { status: "comment", ticketId, commentId: comment?.id ?? null, bodyText: text, webLink: message.webLink ?? null });
    return notified;
  });

  run.notificationIds.push(...ids);
  await attachFiles(run, row, mailbox, ticketId, row.person_id, attachments);
  return "comment";
}

/**
 * The e-mail's files on the ticket (work.document, as a ticket's attachments are): files of 10 MB at most, 10 at most;
 * the pictures of a signature (inline) are left out. Those that could not be brought are listed on the e-mail.
 */
async function attachFiles(run: Run, row: store.MailMessageRow, mailbox: ReturnType<MailDeps["mailbox"]>, ticketId: string, uploaderId: string, attachments: GraphAttachment[]) {
  const { deps } = run;
  const notImported: string[] = [];
  let imported = 0;

  for (const attachment of attachments.filter((a) => !a.isInline)) {
    const name = (attachment.name || "piece-jointe").slice(0, 200);
    const isFile = (attachment["@odata.type"] ?? "#microsoft.graph.fileAttachment").toLowerCase().includes("fileattachment");
    if (!isFile || (attachment.size ?? 0) > MAX_DOCUMENT_FILE_SIZE || imported >= MAX_FILES) {
      notImported.push(name);
      continue;
    }
    try {
      const bytes = await mailbox.attachmentBytes(row.graph_id, attachment.id);
      if (!bytes.length || bytes.length > MAX_DOCUMENT_FILE_SIZE) {
        notImported.push(name);
        continue;
      }
      const path = getStoragePath(name, uploaderId);
      const contentType = attachment.contentType || "application/octet-stream";
      const { error } = await deps.upload(path, bytes, contentType);
      if (error) throw new Error(error.message);
      try {
        await deps.system(uploaderId, (tx) =>
          insertDocument(tx, {
            title: name.replace(/\.[^.]+$/, "") || name,
            description: null,
            document_type: "other",
            related_type: "task",
            related_id: ticketId,
            visibility: "internal",
            path,
            fileName: name,
            fileSize: bytes.length,
            mimeType: attachment.contentType || null,
            uploadedBy: uploaderId,
          }),
        );
        imported += 1;
      } catch (error) {
        await deps.remove(path);
        throw error;
      }
    } catch (error) {
      console.error("[mail:attachment]", errorText(error));
      notImported.push(name);
    }
  }

  if (notImported.length) await deps.system(uploaderId, (tx) => store.addSkippedFiles(tx, row.id, notImported));
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
