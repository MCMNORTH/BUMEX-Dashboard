// E-mails to tickets on the real schema (every migration, on PGlite), the cron's two stages as production runs them —
// the system session for each person, the rules — with Microsoft Graph, Claude and Storage played by the test.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { EmailForAi, Verdict } from "@/lib/mail/ai";
import { seal } from "@/lib/mail/crypto";
import type { GraphAttachment, GraphMessage } from "@/lib/mail/graph";
import * as store from "@/lib/mail/store";
import { processNow, syncMail, type MailDeps } from "@/lib/mail/sync";
import type { Tx } from "@/lib/work/db";

process.env.MAIL_TOKEN_KEY = Buffer.alloc(32, 3).toString("base64");
process.env.NOTIFICATION_EMAIL_FROM = "BUMEX Dashboard <notifications@verify.bumex.mr>";

const migrations = join(process.cwd(), "db/erp/migrations");
let db: PGlite;
const tx: Tx = {
  query: async <T,>(sql: string, params?: unknown[]) => (await db.query(sql, params as never[])).rows as T[],
  run: async (sql: string, params?: unknown[]) => (await db.query(sql, params as never[])).affectedRows ?? 0,
};

async function within<T>(open: () => Promise<unknown>, work: (tx: Tx) => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role erp_app");
    await open();
    const out = await work(tx);
    await db.exec("commit");
    return out;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const system = <T,>(actor: string, work: (tx: Tx) => Promise<T>) => within(() => db.query("select erp.open_system_session($1)", [actor]), work);
const person = <T,>(uid: string, work: (tx: Tx) => Promise<T>) => within(() => db.query("select erp.open_session($1)", [uid]), work);
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params as never[])).rows[0];
const all = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params as never[])).rows;

// ---- Microsoft, Claude and Storage, as the test plays them ------------------

const who = (address: string, name = address.split("@")[0]) => ({ emailAddress: { address, name } });
let inboxes: Record<string, GraphMessage[]>; // the e-mails each person's next delta brings
let messages: Record<string, GraphMessage>; // by Graph id
let files: Record<string, GraphAttachment[]>;
let verdicts: Record<string, Partial<Verdict>>; // by subject
let asked: EmailForAi[];
let uploads: string[];
let dispatched: string[];

const deps: MailDeps = {
  system,
  refresh: async (token) => ({ accessToken: `at:${token}`, refreshToken: token }),
  mailbox: (accessToken) => {
    const personId = accessToken.replace(/^at:rt-/, "");
    return {
      deltaFrom: () => `delta:${personId}:start`,
      deltaPage: async () => {
        const page = inboxes[personId] ?? [];
        inboxes[personId] = [];
        return { messages: page, nextLink: null, deltaLink: `delta:${personId}:next` };
      },
      message: async (id) => messages[id],
      attachments: async (id) => files[id] ?? [],
      attachmentBytes: async () => Buffer.from("%PDF-1.4 bilan"),
    };
  },
  analyze: async (input) => {
    asked.push(input);
    const answer = verdicts[input.subject] ?? {};
    return {
      kind: "verdict",
      verdict: { is_task: true, reason: "A request.", title: input.subject, summary: "**Demande** du client.", priority: "high", due_date: "2026-11-07", mission_id: null, ...answer },
      usage: { input: 1000, output: 100, cached: 600 },
    };
  },
  upload: async (path) => {
    uploads.push(path);
    return { error: null };
  },
  remove: async () => null,
  dispatch: async (ids) => {
    dispatched.push(...ids);
  },
};

function arrive(personIds: string[], message: Partial<GraphMessage> & { id: string; subject: string }, headers: Record<string, string> = {}) {
  const full: GraphMessage = {
    internetMessageId: `<${message.id}@acme.com>`,
    from: who("awa@acme.com", "Awa ACME"),
    toRecipients: [who("sidi@bumex.mr")],
    ccRecipients: [],
    receivedDateTime: "2026-11-03T09:00:00Z",
    body: { contentType: "text", content: "Pouvez-vous nous envoyer le rapport ?" },
    hasAttachments: false,
    webLink: `https://outlook.office.com/${message.id}`,
    ...message,
    internetMessageHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
  };
  messages[full.id] = full;
  for (const id of personIds) (inboxes[id] ??= []).push(full);
  return full;
}

let ids: Record<string, string>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(migrations, f), "utf8")).join("\n"));
});

// The office: Sidi (staff, Audit) on the team of Mission ACME (led by Mariem, a manager), Awa (staff, IT); both
// connected. A mission of Sidi's on the test floor, which no e-mail may land on.
beforeEach(async () => {
  await db.exec(`truncate work.mail_message, work.mail_token, work.mail_connection, work.notification, work.activity, work.document,
                 work.comment, erp.engagement_staff, erp.engagement, work.client, erp.user_access, work.person cascade`);
  inboxes = {};
  messages = {};
  files = {};
  verdicts = {};
  asked = [];
  uploads = [];
  dispatched = [];
  ids = Object.fromEntries((await all<{ id: string; code: string }>("select id, code from erp.entity")).map((r) => [r.code, r.id]));
  await system("test", async () => {
    for (const [id, entity, role] of [["sidi", "bumex_audit", "staff"], ["mariem", "bumex_audit", "manager"], ["awa", "bumex_it", "staff"]]) {
      await db.query("insert into work.person (id, email, full_name, entity_code) values ($1, $2, $3, $4)", [id, `${id}@bumex.mr`, id[0].toUpperCase() + id.slice(1), entity]);
      await db.query("insert into erp.user_access (user_id, erp_role, entity_codes) values ($1, $2, $3)", [id, role, [entity]]);
    }
    await db.query("update erp.user_access set test_floor = true where user_id = 'sidi'");
    ids.acme = (await one<{ id: string }>("insert into work.client (name, contact_email, website, status) values ('ACME', 'awa@acme.com', 'https://acme.com', 'active') returning id"))!.id;
    ids.mission = (await one<{ id: string }>(
      "insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status) values ($1, 'mariem', $2, 'Mission ACME', 'client_mission', 'active') returning id",
      [ids.bumex_audit, ids.acme],
    ))!.id;
    await db.query("insert into erp.engagement_staff (engagement_id, user_id, role) values ($1, 'sidi', 'employee')", [ids.mission]);
    ids.testMission = (await one<{ id: string }>(
      "insert into erp.engagement (entity_id, owner_id, name, project_kind, status) values ($1, 'sidi', 'Mission test', 'internal_tool', 'active') returning id",
      [ids.bumex_testing],
    ))!.id;
    for (const id of ["sidi", "awa"]) {
      await store.saveConnection(tx, id, `${id}@bumex.mr`, seal(`rt-${id}`));
      await db.query("update work.mail_connection set last_sync_at = null where person_id = $1", [id]);
    }
  });
});

const tickets = () => all<{ id: string; engagement_id: string; title: string; assignee_id: string; reporter_id: string; type: string; labels: string[]; priority: string; due_date: string; stage_id: string; status: string; notes: string }>(
  "select id, engagement_id, title, assignee_id, reporter_id, type, labels, priority, due_date::text, stage_id, status, notes from erp.task order by created_at",
);
const mail = (graphId: string) => one<{ status: string; reason: string | null; ticket_id: string | null; comment_id: string | null; body_text: string | null }>(
  "select status, reason, ticket_id, comment_id, body_text from work.mail_message where graph_id = $1",
  [graphId],
);

describe("a task by e-mail", () => {
  it("becomes a ticket on the chosen mission, assigned to and reported by whoever received it, with its file", async () => {
    verdicts["Rapport annuel"] = { mission_id: ids.mission };
    arrive(["sidi"], { id: "m1", subject: "Rapport annuel", hasAttachments: true });
    files.m1 = [
      { id: "f1", "@odata.type": "#microsoft.graph.fileAttachment", name: "bilan.pdf", contentType: "application/pdf", size: 15, isInline: false },
      { id: "f2", "@odata.type": "#microsoft.graph.fileAttachment", name: "logo.png", contentType: "image/png", size: 900, isInline: true },
    ];

    const stats = await syncMail({ deps });
    expect(stats).toMatchObject({ inboxes: 2, fetched: 1, tickets: 1 });

    const [ticket] = await tickets();
    expect(ticket).toMatchObject({ engagement_id: ids.mission, title: "Rapport annuel", assignee_id: "sidi", reporter_id: "sidi", type: "client_request", labels: ["e-mail"], priority: "high", due_date: "2026-11-07", stage_id: "todo", status: "todo" });
    expect(asked[0].missions.map((m) => m.id)).toEqual([ids.mission]); // the test floor's mission is never offered
    expect(await mail("m1")).toMatchObject({ status: "ticket", ticket_id: ticket.id, body_text: "Pouvez-vous nous envoyer le rapport ?" });

    const docs = await all<{ file_name: string; uploaded_by: string; related_type: string }>("select file_name, uploaded_by, related_type from work.document where related_id = $1", [ticket.id]);
    expect(docs).toEqual([{ file_name: "bilan.pdf", uploaded_by: "sidi", related_type: "task" }]); // the signature's picture left out
    expect(uploads[0]).toMatch(/^sidi\/\d{4}\/\d{2}\/.+-bilan\.pdf$/);

    const notes = await all<{ user_id: string; skip_email: boolean }>("select user_id, skip_email from work.notification order by user_id");
    expect(notes).toEqual([{ user_id: "mariem", skip_email: false }, { user_id: "sidi", skip_email: true }]);
    expect(dispatched).toHaveLength(2);

    // Sidi reads it in their own session: the ticket and the e-mail it came from
    const seen = await person("sidi", (t) => t.query<{ n: number }>("select count(*)::int n from work.mail_message where ticket_id = $1", [ticket.id]));
    expect(seen[0].n).toBe(1);
  });

  it("is one ticket however many connected inboxes received it, the To recipient's", async () => {
    arrive(["awa", "sidi"], { id: "m2", subject: "Devis", toRecipients: [who("sidi@bumex.mr")], ccRecipients: [who("awa@bumex.mr")] });
    await syncMail({ deps });
    const list = await tickets();
    expect(list).toHaveLength(1);
    expect(list[0].assignee_id).toBe("sidi");
    expect(asked).toHaveLength(1);
  });

  it("lands on the person's floor's « Demandes par e-mail » when no mission of theirs fits, created once", async () => {
    arrive(["sidi"], { id: "m3", subject: "Nouvelle demande" });
    arrive(["sidi"], { id: "m4", subject: "Autre demande" });
    await syncMail({ deps });
    const intake = await all<{ id: string; entity_id: string; name: string }>("select id, entity_id, name from erp.engagement where is_email_intake");
    expect(intake).toEqual([{ id: expect.any(String), entity_id: ids.bumex_audit, name: "Demandes par e-mail" }]);
    expect((await tickets()).map((t) => t.engagement_id)).toEqual([intake[0].id, intake[0].id]);
  });
});

describe("what is not a new task", () => {
  it("a reply in the thread is a comment from its writer, without Claude", async () => {
    verdicts.Rapport = { mission_id: null };
    arrive(["sidi"], { id: "m1", subject: "Rapport" });
    await syncMail({ deps });
    arrive(["sidi"], { id: "m5", subject: "RE: Rapport", uniqueBody: { content: "Voici la version signée." } }, { "In-Reply-To": "<m1@acme.com>" });
    await db.query("update work.mail_connection set last_sync_at = null");
    await syncMail({ deps });

    const [ticket] = await tickets();
    const comments = await all<{ subject_id: string; author_id: string; body: string; email_from_address: string }>("select subject_id, author_id, body, email_from_address from work.comment");
    expect(comments).toEqual([{ subject_id: ticket.id, author_id: "sidi", body: "Voici la version signée.", email_from_address: "awa@acme.com" }]);
    expect(await mail("m5")).toMatchObject({ status: "comment", ticket_id: ticket.id });
    expect(asked).toHaveLength(1);
  });

  it("the free rules and Claude's verdict leave e-mails out, with the reason; its person can still make the ticket", async () => {
    arrive(["sidi"], { id: "n1", subject: "Newsletter" }, { "List-Unsubscribe": "<mailto:out@acme.com>" });
    arrive(["sidi"], { id: "n2", subject: "New ticket assignment", from: who("notifications@verify.bumex.mr") });
    arrive(["sidi"], { id: "n3", subject: "Réunion d'équipe", toRecipients: [who("equipe@bumex.mr")] });
    arrive(["sidi"], { id: "n4", subject: "Merci" });
    verdicts.Merci = { is_task: false, reason: "A thank-you." };

    await syncMail({ deps });
    expect(await mail("n1")).toMatchObject({ status: "skipped", reason: "newsletter" });
    expect(await mail("n2")).toMatchObject({ status: "skipped", reason: "vanguard" });
    expect(await mail("n3")).toMatchObject({ status: "skipped", reason: "not_direct" });
    expect(await mail("n4")).toMatchObject({ status: "skipped", reason: "not_a_task: A thank-you.", body_text: null });
    expect(asked.map((a) => a.subject)).toEqual(["Merci"]);
    expect(await tickets()).toHaveLength(0);

    // "Créer le ticket": forced, Claude writes it whatever its verdict
    const row = await one<{ id: string }>("select id from work.mail_message where graph_id = 'n4'");
    expect(await system("sidi", (t) => store.forceMessage(t, row!.id, "awa"))).toBe(false); // not Awa's e-mail
    expect(await system("sidi", (t) => store.forceMessage(t, row!.id, "sidi"))).toBe(true);
    expect(await processNow(row!.id, deps)).toBe("ticket");
    expect((await tickets())[0]).toMatchObject({ title: "Merci", assignee_id: "sidi" });
  });
});

describe("the tables' rules (0017)", () => {
  it("a person reads their own connection and e-mails; nobody but the server reads a token", async () => {
    arrive(["awa"], { id: "p1", subject: "Pour Awa", toRecipients: [who("awa@bumex.mr")] });
    await syncMail({ deps });
    const read = (uid: string) => person(uid, async (t) => ({
      connections: (await t.query<{ person_id: string }>("select person_id from work.mail_connection order by 1")).map((r) => r.person_id),
      messages: (await t.query<{ n: number }>("select count(*)::int n from work.mail_message"))[0].n,
      tokens: (await t.query<{ n: number }>("select count(*)::int n from work.mail_token"))[0].n,
    }));
    expect(await read("sidi")).toEqual({ connections: ["sidi"], messages: 0, tokens: 0 });
    expect(await read("awa")).toEqual({ connections: ["awa"], messages: 1, tokens: 0 });
    await expect(person("sidi", (t) => t.query("update work.mail_connection set status = 'paused' where person_id = 'awa' returning 1"))).resolves.toEqual([]);
  });
});

describe("a paused or disconnected inbox", () => {
  it("waits while paused, loses its unread e-mails when disconnected, and is told nothing", async () => {
    arrive(["sidi"], { id: "q1", subject: "Pendant la pause" });
    // fetched, then paused before it is processed
    await system("sidi", async (t) => {
      await store.queueMessages(t, "sidi", [messages.q1]);
      await store.setConnectionStatus(t, "sidi", "paused");
    });
    inboxes.sidi = [];
    await syncMail({ deps });
    expect(await mail("q1")).toMatchObject({ status: "pending" });
    expect(asked).toHaveLength(0);

    await system("sidi", (t) => store.deleteConnection(t, "sidi"));
    expect(await mail("q1")).toBeUndefined();
    expect(await one("select count(*)::int n from work.mail_token where person_id = 'sidi'")).toEqual({ n: 0 });
    expect(await one("select count(*)::int n from work.notification")).toEqual({ n: 0 });
  });
});
