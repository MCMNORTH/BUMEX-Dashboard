import "server-only";

import type { CandidateMission } from "@/lib/mail/ai";
import type { GraphMessage } from "@/lib/mail/graph";
import { addressOf, nameOf, SENDER_DAILY_LIMIT } from "@/lib/mail/rules";
import { select, selectOne, type Tx } from "@/lib/work/db";

// E-mails to tickets in the database (0017): the connected inboxes, their sealed tokens, every e-mail an inbox brought
// and what became of it. Each function runs in a transaction its caller holds — the system session (lib/work/db.ts
// asSystem) for the server's work, the person's for what they read of their own.

export type MailConnectionRow = {
  person_id: string;
  ms_email: string;
  status: "active" | "paused" | "reconnect";
  delta_link: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
};

export type MailMessageRow = {
  id: string;
  internet_message_id: string;
  person_id: string;
  graph_id: string;
  conversation_id: string | null;
  from_name: string | null;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  status: "pending" | "processing" | "ticket" | "comment" | "skipped" | "failed";
  reason: string | null;
  ticket_id: string | null;
  forced: boolean;
  attempts: number;
};

// ---- connections -------------------------------------------------------------

/** A connected inbox, read from now on (its first delta starts at connected_at: lib/mail/sync.ts). */
export async function saveConnection(tx: Tx, personId: string, msEmail: string, sealedToken: string) {
  await tx.query(
    `insert into work.mail_connection (person_id, ms_email, status, delta_link, connected_at, last_error, locked_until, updated_at)
     values ($1, $2, 'active', null, now(), null, null, now())
     on conflict (person_id) do update set ms_email = excluded.ms_email, status = 'active', delta_link = null,
       connected_at = now(), last_error = null, locked_until = null, updated_at = now()`,
    [personId, msEmail],
  );
  await saveToken(tx, personId, sealedToken);
}

export async function saveToken(tx: Tx, personId: string, sealedToken: string) {
  await tx.query(
    `insert into work.mail_token (person_id, refresh_token_enc, updated_at) values ($1, $2, now())
     on conflict (person_id) do update set refresh_token_enc = excluded.refresh_token_enc, updated_at = now()`,
    [personId, sealedToken],
  );
}

export async function readToken(tx: Tx, personId: string) {
  return (await selectOne<{ refresh_token_enc: string }>(tx, "select refresh_token_enc from work.mail_token where person_id = $1", [personId]))?.refresh_token_enc ?? null;
}

export function readConnection(tx: Tx, personId: string) {
  return selectOne<MailConnectionRow>(
    tx,
    "select person_id, ms_email, status, delta_link, connected_at, last_sync_at, last_error from work.mail_connection where person_id = $1",
    [personId],
  );
}

/**
 * Active inboxes no other run is reading (each held 3 minutes) and not read in the last 90 seconds, the least recently
 * read first.
 */
export function claimConnections(tx: Tx, limit: number) {
  return select<MailConnectionRow>(
    tx,
    `update work.mail_connection c set locked_until = now() + interval '3 minutes'
      where c.person_id in (select person_id from work.mail_connection
                             where status = 'active' and (locked_until is null or locked_until < now())
                               and (last_sync_at is null or last_sync_at < now() - interval '90 seconds')
                             order by last_sync_at nulls first limit $1 for update skip locked)
     returning c.person_id, c.ms_email, c.status, c.delta_link, c.connected_at, c.last_sync_at, c.last_error`,
    [limit],
  );
}

export async function releaseConnection(tx: Tx, personId: string, result: { deltaLink?: string | null; error?: string | null; reconnect?: boolean }) {
  await tx.query(
    `update work.mail_connection set locked_until = null, last_sync_at = now(), updated_at = now(),
       delta_link = coalesce($2, delta_link), last_error = $3, status = case when $4 then 'reconnect' else status end
     where person_id = $1`,
    [personId, result.deltaLink ?? null, result.error?.slice(0, 500) ?? null, Boolean(result.reconnect)],
  );
}

/** Paused, or read again — from now on: what arrived during the pause is left out. */
export async function setConnectionStatus(tx: Tx, personId: string, status: "active" | "paused") {
  return tx.run(
    `update work.mail_connection set status = $2, last_error = null, updated_at = now(),
       delta_link = case when $2 = 'active' then null else delta_link end,
       connected_at = case when $2 = 'active' then now() else connected_at end
     where person_id = $1 and status <> 'reconnect'`,
    [personId, status],
  );
}

/** Disconnected: the token goes with the connection, and the e-mails not read yet with them. */
export async function deleteConnection(tx: Tx, personId: string) {
  await tx.query("delete from work.mail_message where person_id = $1 and status in ('pending', 'processing')", [personId]);
  await tx.query("delete from work.mail_connection where person_id = $1", [personId]);
}

/** The people with a connected inbox, by their Vanguard address (whose ticket a new e-mail is: rules.ts pickAssignee). */
export async function connectedPeople(tx: Tx) {
  const rows = await select<{ id: string; email: string }>(
    tx,
    "select p.id, lower(p.email) as email from work.mail_connection c join work.person p on p.id = c.person_id where c.status = 'active'",
  );
  return new Map(rows.map((row) => [row.email, row.id]));
}

// ---- e-mails -----------------------------------------------------------------

/** New e-mails of an inbox, once each: one already brought by another inbox is left as it is. */
export async function queueMessages(tx: Tx, personId: string, messages: GraphMessage[]) {
  if (!messages.length) return 0;
  const rows = messages.map((m) => ({
    internet_message_id: m.internetMessageId,
    graph_id: m.id,
    conversation_id: m.conversationId ?? null,
    from_name: nameOf(m.from) || null,
    from_address: addressOf(m.from) || null,
    subject: (m.subject ?? "").slice(0, 500),
    received_at: m.receivedDateTime ?? null,
  }));
  return tx.run(
    `insert into work.mail_message (internet_message_id, person_id, graph_id, conversation_id, from_name, from_address, subject, received_at)
     select r.internet_message_id, $1, r.graph_id, r.conversation_id, r.from_name, r.from_address, r.subject, r.received_at
       from jsonb_to_recordset($2::jsonb) as r(internet_message_id text, graph_id text, conversation_id text, from_name text, from_address text,
                                               subject text, received_at timestamptz)
     on conflict (internet_message_id) do nothing`,
    [personId, JSON.stringify(rows)],
  );
}

const MESSAGE_COLUMNS = "m.id, m.internet_message_id, m.person_id, m.graph_id, m.conversation_id, m.from_name, m.from_address, m.subject, m.received_at, m.status, m.reason, m.ticket_id, m.forced, m.attempts";

/**
 * E-mails to read now (pending, or left processing by a run that died), as the notification outbox claims (0008): those
 * of active inboxes (a paused one's wait; named ones are read whatever their inbox's state, at their person's request).
 */
export function claimMessages(tx: Tx, limit: number, ids: string[] | null = null) {
  return select<MailMessageRow>(
    tx,
    `update work.mail_message m set status = 'processing', attempts = m.attempts + 1, locked_at = now(), last_error = null
      where m.id in (select q.id from work.mail_message q
                      where q.attempts < 5
                        and ((q.status = 'pending' and q.next_attempt_at <= now()) or (q.status = 'processing' and q.locked_at < now() - interval '10 minutes'))
                        and (case when $2::uuid[] is null
                                  then exists (select 1 from work.mail_connection c where c.person_id = q.person_id and c.status = 'active')
                                  else q.id = any($2::uuid[]) end)
                      order by q.created_at limit $1 for update skip locked)
     returning ${MESSAGE_COLUMNS}`,
    [limit, ids],
  );
}

const RETRY_MINUTES = [2, 10, 30, 120];

/** Read again later, or given up after the fifth attempt. */
export async function retryMessage(tx: Tx, row: MailMessageRow, error: string, afterSeconds = 0) {
  const minutes = Math.max(RETRY_MINUTES[Math.min(row.attempts, RETRY_MINUTES.length) - 1] ?? 2, Math.ceil(afterSeconds / 60));
  await tx.query(
    `update work.mail_message set status = case when attempts >= 5 then 'failed' else 'pending' end,
       next_attempt_at = now() + make_interval(mins => $2), locked_at = null, last_error = $3
     where id = $1::uuid and status = 'processing'`,
    [row.id, minutes, error.slice(0, 500)],
  );
}

export async function settleMessage(
  tx: Tx,
  id: string,
  outcome: {
    status: "ticket" | "comment" | "skipped" | "failed";
    reason?: string | null;
    ticketId?: string | null;
    commentId?: string | null;
    bodyText?: string | null;
    webLink?: string | null;
    skippedFiles?: string[];
    ai?: unknown;
  },
) {
  await tx.query(
    `update work.mail_message set status = $2, reason = $3, ticket_id = coalesce($4::uuid, ticket_id), comment_id = $5::uuid, body_text = $6,
       web_link = $7, skipped_files = coalesce($8::text[], '{}'), ai = $9::jsonb, locked_at = null, last_error = null, processed_at = now()
     where id = $1::uuid`,
    [id, outcome.status, outcome.reason?.slice(0, 300) ?? null, outcome.ticketId ?? null, outcome.commentId ?? null,
      outcome.bodyText?.slice(0, 50_000) ?? null, outcome.webLink ?? null, outcome.skippedFiles ?? [], outcome.ai === undefined ? null : JSON.stringify(outcome.ai)],
  );
}

/** A skipped (or failed) e-mail of this person, to be made a ticket whatever Claude said ("Créer le ticket"). */
export async function forceMessage(tx: Tx, id: string, personId: string) {
  return (await tx.run(
    `update work.mail_message set status = 'pending', forced = true, attempts = 0, next_attempt_at = now(), last_error = null
     where id = $1::uuid and person_id = $2 and status in ('skipped', 'failed')`,
    [id, personId],
  )) > 0;
}

export async function addSkippedFiles(tx: Tx, id: string, files: string[]) {
  if (!files.length) return;
  await tx.query("update work.mail_message set skipped_files = skipped_files || $2::text[] where id = $1::uuid", [id, files]);
}

/**
 * The ticket a reply belongs to: an e-mail it answers (In-Reply-To, References) that made a ticket or a comment, or the
 * same inbox's conversation. A ticket since deleted (ticket_id set null) is none.
 */
export async function threadTicket(tx: Tx, ids: string[], personId: string, conversationId: string | null) {
  const row = await selectOne<{ ticket_id: string }>(
    tx,
    `select m.ticket_id from work.mail_message m join erp.task t on t.id = m.ticket_id
      where m.status in ('ticket', 'comment')
        and (m.internet_message_id = any($1::text[]) or ($3::text is not null and m.person_id = $2 and m.conversation_id = $3))
      order by (m.internet_message_id = any($1::text[])) desc, m.created_at desc limit 1`,
    [ids, personId, conversationId],
  );
  return row?.ticket_id ?? null;
}

export async function ticketsFromSenderToday(tx: Tx, address: string) {
  const row = await selectOne<{ n: number }>(
    tx,
    "select count(*)::int as n from work.mail_message where from_address = $1 and status = 'ticket' and processed_at > now() - interval '1 day'",
    [address],
  );
  return (row?.n ?? 0) >= SENDER_DAILY_LIMIT;
}

/** A skipped e-mail keeps its sender, subject and reason 30 days; then it goes. */
export function purgeSkipped(tx: Tx) {
  return tx.run("delete from work.mail_message where status = 'skipped' and created_at < now() - interval '30 days'");
}

// ---- where a ticket goes -----------------------------------------------------

export type MailPerson = { id: string; full_name: string; email: string };

export function readPerson(tx: Tx, personId: string) {
  return selectOne<MailPerson>(tx, "select id, full_name, email from work.person where id = $1", [personId]);
}

/**
 * The missions an e-mail of this person may land on (what Claude chooses from): those they lead or are on the team of,
 * open, real (never the test floor's), the floors' "Demandes par e-mail" apart; the most recent first.
 */
export function candidateMissions(tx: Tx, personId: string) {
  return select<CandidateMission>(
    tx,
    `select g.id::text as id, g.name, c.name as client, c.contact_email as "clientEmail", c.website as "clientWebsite", x.name as floor
       from erp.engagement g
       join erp.entity x on x.id = g.entity_id
       left join work.client c on c.id = g.client_id
      where (g.owner_id = $1 or exists (select 1 from erp.engagement_staff s where s.engagement_id = g.id and s.user_id = $1))
        and g.status in ('planned', 'active', 'on_hold') and not x.is_test and not g.is_email_intake
      order by g.created_at desc limit 40`,
    [personId],
  );
}

/** The person's floor for a ticket no mission fitted: their default entity, else their home one; never the test floor. */
export async function personFloor(tx: Tx, personId: string) {
  const row = await selectOne<{ id: string }>(
    tx,
    `select x.id from work.person p join erp.entity x on x.code = coalesce(p.default_entity_code, p.entity_code)
      where p.id = $1 and not x.is_test`,
    [personId],
  );
  return row?.id ?? null;
}

/** The floor's "Demandes par e-mail", created on first use (no lead: an administrator gives it one). */
export async function intakeMission(tx: Tx, entityId: string) {
  await tx.query(
    `insert into erp.engagement (entity_id, name, description, status, project_kind, is_email_intake)
     select $1::uuid, 'Demandes par e-mail', 'Les tickets créés depuis un e-mail qu''aucune mission de la personne ne couvrait. À déplacer vers la bonne mission.',
            'active', 'internal_tool', true
      where not exists (select 1 from erp.engagement where entity_id = $1::uuid and is_email_intake)
     on conflict do nothing`,
    [entityId],
  );
  const row = await selectOne<{ id: string }>(tx, "select id from erp.engagement where entity_id = $1::uuid and is_email_intake", [entityId]);
  if (!row) throw new Error("The floor's e-mail mission could not be created.");
  return row.id;
}

/** The ticket's people (a reply notifies them) and its key (AUD-142). */
export function ticketParticipants(tx: Tx, ticketId: string) {
  return selectOne<{ assignee_id: string | null; reporter_id: string | null; title: string; key: string }>(
    tx,
    "select assignee_id, reporter_id, title, work.task_key(id) as key from erp.task where id = $1::uuid",
    [ticketId],
  );
}

// ---- what a person reads of their own ---------------------------------------

export type MailLogRow = {
  id: string;
  from_name: string | null;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  status: MailMessageRow["status"];
  reason: string | null;
  ticket_id: string | null;
  ticket_key: string | null;
};

export function recentMessages(tx: Tx, personId: string) {
  return select<MailLogRow>(
    tx,
    `select m.id, m.from_name, m.from_address, m.subject, m.received_at, m.status, m.reason, m.ticket_id,
            case when m.ticket_id is not null then work.task_key(m.ticket_id) end as ticket_key
       from work.mail_message m
      where m.person_id = $1 and m.created_at > now() - interval '30 days'
      order by coalesce(m.received_at, m.created_at) desc limit 100`,
    [personId],
  );
}
