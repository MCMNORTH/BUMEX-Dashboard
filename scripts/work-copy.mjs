#!/usr/bin/env node
// BUMEX — the one-shot copy of BUMEX One's Firestore data into PostgreSQL (db/erp/migrations/0008_work.sql).
//
//   node scripts/work-copy.mjs --dry-run     # everything, in one transaction, then rolled back: the report only
//   node scripts/work-copy.mjs               # the same, committed
//
// Environment:
//   ERP_DATABASE_URL       the database as its administrator (cloud-sql-proxy, as for npm run erp:migrate)
//   FIREBASE_PROJECT_ID    the Firebase project (bumex-one)
//   FIREBASE_DATABASE_ID   the Firestore database (default: bumex)
//   Firestore credentials: Application Default Credentials (gcloud auth application-default login), or
//   FIRESTORE_EMULATOR_HOST for the emulator.
//
// One transaction: either everything is copied or nothing is. Firestore is only read (it stays as it is, the way
// back). The copy is for empty tables (it stops when work.person already has rows). What cannot be copied as it is
// (a reference to a record that is gone, a value the database refuses) is set right or left out, and listed.
//
// Ids are kept: people, clients, tickets, documents, comments, … keep theirs. A project becomes an erp.engagement: the
// one already mirrored for it (whose id the ERP's records already use), or a new one with the project's id; every
// reference to the project (its tickets, time, members, board, milestones, contracts, comments, notes, documents,
// activity, notifications, old finance records) is pointed at it.

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const databaseUrl = process.env.ERP_DATABASE_URL?.trim();
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (!databaseUrl || !projectId) {
  console.error("Set ERP_DATABASE_URL and FIREBASE_PROJECT_ID (see the head of this file).");
  process.exit(1);
}

const firestore = getFirestore(initializeApp({ projectId }), process.env.FIREBASE_DATABASE_ID?.trim() || "bumex");

// ---------------------------------------------------------------------------------------------------------------
// Values

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID.test(v);

function plain(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

const text = (v) => (v === undefined || v === null ? null : String(v));
const trimmed = (v) => {
  const t = text(v)?.trim();
  return t ? t : null;
};
const date = (v) => {
  const t = text(v);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) && !Number.isNaN(Date.parse(t.slice(0, 10))) ? t.slice(0, 10) : null;
};
const stamp = (v, fallback = null) => {
  const t = text(v);
  return t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : fallback;
};
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

// ---------------------------------------------------------------------------------------------------------------
// The report: per table, how many rows came in, went in, were set right and were left out (with why)

const report = new Map();
const tally = (table) => {
  if (!report.has(table)) report.set(table, { read: 0, copied: 0, fixed: new Map(), skipped: new Map() });
  return report.get(table);
};
const fixed = (table, why) => {
  const t = tally(table);
  t.fixed.set(why, (t.fixed.get(why) ?? 0) + 1);
};
const skipped = (table, why) => {
  const t = tally(table);
  t.skipped.set(why, (t.skipped.get(why) ?? 0) + 1);
};

// ---------------------------------------------------------------------------------------------------------------
// Firestore

async function read(collection) {
  const snapshot = await firestore.collection(collection).get();
  const rows = snapshot.docs.map((doc) => ({ ...plain(doc.data()), id: doc.get("id") ?? doc.id }));
  tally(collection).read = rows.length;
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// PostgreSQL

const client = new pg.Client({ connectionString: databaseUrl, options: "-c TimeZone=UTC" });

// rows inserted through jsonb_to_recordset, a thousand at a time
async function insert(table, columns, rows, { conflict = "", source = table } = {}) {
  if (!rows.length) return;
  const definition = columns.map(([name, type]) => `"${name}" ${type}`).join(", ");
  const names = columns.map(([name]) => `"${name}"`).join(", ");
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const result = await client.query(
      `insert into ${table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as r(${definition}) ${conflict}`,
      [JSON.stringify(chunk)],
    );
    tally(source).copied += result.rowCount ?? chunk.length;
  }
}

// triggers that must not run on copied rows: the audit log (the copy is not a change anyone made), the e-mail of a
// notification (sent long ago), the history of a week (copied as it is)
// time lines are copied as they were (a day over 24 hours, a date ahead: BUMEX One let them in), without their guard
const QUIET = [
  ["erp.task", "audit_task"],
  ["erp.engagement", "audit_engagement"],
  ["erp.time_entry", "audit_time_entry"],
  ["erp.time_entry", "time_entry_guard"],
  ["work.notification", "queue_notification_email"],
  ["work.timesheet_week", "record_week_event"],
];

async function main() {
  await client.connect();
  console.log(`${dryRun ? "DRY RUN — nothing will be kept" : "COPY"} · Firestore ${projectId}/${process.env.FIREBASE_DATABASE_ID || "bumex"} → ${new URL(databaseUrl).pathname.slice(1)}`);

  const [{ applied }] = (await client.query("select exists (select 1 from public.erp_schema_migrations where name = '0008_work.sql') as applied")).rows;
  if (!applied) throw new Error("Migration 0008_work.sql is not applied: run npm run erp:migrate first.");

  // -------------------------------------------------------------------------------------------------------------
  // Read everything first (Firestore is not touched again)
  const names = [
    "profiles", "clients", "projects", "project_members", "project_workflows", "milestones", "tasks", "subtasks", "contracts", "documents",
    "comments", "internal_notes", "notifications", "activity_logs", "time_entries", "time_mission_favorites", "timesheet_week_status",
    "timesheet_week_events", "timesheet_reminders", "timesheet_weekly_reminders", "invoices", "payments", "receipts", "transfers",
    "bank_statements", "bank_statement_lines", "notification_email_outbox",
  ];
  // what has no place any more: counted, so nothing is lost silently (Firestore keeps it)
  const leftBehind = ["teams", "team_members", "mentions", "comment_attachments", "task_dependencies", "staffing_assignments"];
  const data = {};
  for (const name of [...names, ...leftBehind]) data[name] = await read(name);
  for (const name of leftBehind) if (data[name].length) skipped(name, "not copied: no longer used (Firestore keeps it)");

  await client.query("begin");
  try {
    // the system session: every rule passes, the history records the copy as its actor
    await client.query("select erp.open_system_session('work-copy')");
    const [{ n: existing }] = (await client.query("select count(*)::int as n from work.person")).rows;
    if (existing) throw new Error(`work.person already has ${existing} rows: the copy is for empty tables.`);
    for (const [table, trigger] of QUIET) await client.query(`alter table ${table} disable trigger ${trigger}`);

    const entities = new Map((await client.query("select id, code, functional_currency from erp.entity")).rows.map((e) => [e.code, e]));
    const entityId = (code) => entities.get(code)?.id ?? null;
    const validCode = (code) => (entities.has(code) ? code : null);

    // ---------------------------------------------------------------------------------------------------------------
    // People (and the Vanguard access of those who never opened it)
    const emails = new Set();
    const people = [];
    // two profiles of one e-mail: the one already in Vanguard (its access), else the oldest, is kept
    const granted = new Set((await client.query("select user_id from erp.user_access")).rows.map((r) => r.user_id));
    const profiles = [...data.profiles].sort((a, b) =>
      Number(granted.has(String(b.id))) - Number(granted.has(String(a.id))) || String(a.created_at ?? "9").localeCompare(String(b.created_at ?? "9")));
    // a profile of an e-mail already kept (BUMEX One compared e-mails with their case) is merged into it: what points
    // to it points to the kept one
    const personAlias = new Map();
    const keptByEmail = new Map();
    for (const p of profiles) {
      const email = trimmed(p.email)?.toLowerCase();
      if (!email || !email.includes("@")) {
        skipped("profiles", "no e-mail");
        continue;
      }
      if (emails.has(email)) {
        personAlias.set(String(p.id), keptByEmail.get(email));
        fixed("profiles", `e-mail used twice (${email}): merged into the profile kept`);
        continue;
      }
      emails.add(email);
      keptByEmail.set(email, String(p.id));
      if (p.entity_code && !validCode(p.entity_code)) fixed("profiles", "unknown entity: none");
      people.push({
        id: String(p.id), email: trimmed(p.email), full_name: trimmed(p.full_name) ?? email.split("@")[0], entity_code: validCode(p.entity_code),
        is_super_admin: p.is_super_admin === true, avatar_url: trimmed(p.avatar_url), job_title: trimmed(p.job_title), department: trimmed(p.department),
        phone: trimmed(p.phone), skills: Array.isArray(p.skills) ? p.skills.map(String) : [],
        availability_status: oneOf(p.availability_status, ["available", "busy", "overloaded", "away", "inactive"], "available"),
        weekly_capacity_hours: Math.max(0, Math.min(168, Math.round(num(p.weekly_capacity_hours) ?? 40))),
        email_notifications: p.email_notifications !== false,
        created_at: stamp(p.created_at, new Date().toISOString()), updated_at: stamp(p.updated_at, stamp(p.created_at, new Date().toISOString())),
        role: p.role,
      });
    }
    await insert("work.person", [
      ["id", "text"], ["email", "text"], ["full_name", "text"], ["entity_code", "text"], ["is_super_admin", "boolean"], ["avatar_url", "text"],
      ["job_title", "text"], ["department", "text"], ["phone", "text"], ["skills", "text[]"], ["availability_status", "text"],
      ["weekly_capacity_hours", "integer"], ["email_notifications", "boolean"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], people, { source: "profiles" });
    const person = new Set(people.map((p) => p.id));
    const anyone = (id) => {
      const kept = id ? (personAlias.get(String(id)) ?? String(id)) : null;
      return kept && person.has(kept) ? kept : null;
    };
    // a record whose author is gone is the super administrator's (the database needs an author)
    const fallbackAuthor = people.find((p) => p.is_super_admin)?.id ?? people.find((p) => p.role === "admin")?.id ?? people[0]?.id;

    // lib/erp/roles.ts erpAccessFor: BUMEX One's role → Vanguard's, for whoever has none yet (and was not removed); a
    // person without an entity chooses it first and gets theirs then, as today (an access of no entity is every entity)
    const removed = new Set((await client.query(`select distinct coalesce(after_row, before_row) ->> 'user_id' as id from erp.audit_log where table_name = 'user_access'`)).rows.map((r) => r.id));
    const accesses = people
      .filter((p) => !granted.has(p.id) && !removed.has(p.id))
      .filter((p) => p.entity_code || p.is_super_admin || p.role === "admin" || p.role === "shareholder")
      .map((p) => {
        const own = p.entity_code ? [p.entity_code] : null;
        if (p.is_super_admin || p.role === "admin") return { user_id: p.id, erp_role: "admin", entity_codes: null, modules: null };
        if (p.role === "manager" || p.role === "supervisor") return { user_id: p.id, erp_role: "manager", entity_codes: own, modules: null };
        if (p.role === "shareholder") return { user_id: p.id, erp_role: "staff", entity_codes: null, modules: ["reports"] };
        return { user_id: p.id, erp_role: "staff", entity_codes: own, modules: null };
      });
    await insert("erp.user_access", [["user_id", "text"], ["erp_role", "text"], ["entity_codes", "text[]"], ["modules", "text[]"]], accesses, { source: "access given" });
    tally("access given").read = accesses.length;

    // ---------------------------------------------------------------------------------------------------------------
    // Clients, and the customers already linked to them
    // a client of a name already kept (BUMEX One compared names with their case) is merged into the oldest one
    const clientNames = new Map();
    const clientAlias = new Map();
    const clients = [];
    for (const c of [...data.clients].sort((a, b) => String(a.created_at ?? "9").localeCompare(String(b.created_at ?? "9")))) {
      const name = trimmed(c.name);
      if (!isUuid(c.id) || !name) {
        skipped("clients", "no id or no name");
        continue;
      }
      if (clientNames.has(name.toLowerCase())) {
        clientAlias.set(String(c.id), clientNames.get(name.toLowerCase()));
        fixed("clients", `name used twice (${name}): merged into the client kept`);
        continue;
      }
      clientNames.set(name.toLowerCase(), String(c.id));
      const status = oneOf(c.status, ["prospect", "active", "inactive", "suspended", "archived"], "active");
      const website = trimmed(c.website);
      if (website && !/^https?:\/\//i.test(website)) fixed("clients", "website without http(s): kept in the notes");
      clients.push({
        id: c.id, name, legal_name: trimmed(c.legal_name), industry: trimmed(c.industry),
        type: oneOf(c.type, ["company", "public_institution", "ngo", "individual", "other"], "company"),
        contact_email: trimmed(c.contact_email)?.includes("@") ? trimmed(c.contact_email) : null, contact_phone: trimmed(c.contact_phone),
        address: trimmed(c.address), country: trimmed(c.country), city: trimmed(c.city), website: website && /^https?:\/\//i.test(website) ? website : null,
        tax_id: trimmed(c.tax_id), notes: [trimmed(c.notes), website && !/^https?:\/\//i.test(website) ? `Site : ${website}` : null].filter(Boolean).join("\n") || null,
        status, prospect_stage: status === "prospect" ? oneOf(c.prospect_stage, ["initial_contact", "qualification", "negotiation", "proposal_sent", "pending_signature"], "initial_contact") : null,
        next_follow_up_at: status === "prospect" ? date(c.next_follow_up_at) : null, account_manager_id: anyone(c.account_manager_id),
        entity_code: validCode(c.entity_code), created_at: stamp(c.created_at, new Date().toISOString()), updated_at: stamp(c.updated_at, stamp(c.created_at, new Date().toISOString())),
      });
    }
    await insert("work.client", [
      ["id", "uuid"], ["name", "text"], ["legal_name", "text"], ["industry", "text"], ["type", "text"], ["contact_email", "text"], ["contact_phone", "text"],
      ["address", "text"], ["country", "text"], ["city", "text"], ["website", "text"], ["tax_id", "text"], ["notes", "text"], ["status", "text"],
      ["prospect_stage", "text"], ["next_follow_up_at", "date"], ["account_manager_id", "text"], ["entity_code", "text"], ["created_at", "timestamptz"],
      ["updated_at", "timestamptz"],
    ], clients, { source: "clients" });
    const client_ = new Set(clients.map((c) => c.id));
    const aClient = (id) => {
      const kept = id ? (clientAlias.get(String(id)) ?? String(id)) : null;
      return kept && client_.has(kept) ? kept : null;
    };
    // the customers the mirror linked to a client, linked to it (or to the client it was merged into), one per entity
    for (const c of (await client.query("select id, entity_id, bumex_client_id from erp.customer where bumex_client_id is not null and client_id is null")).rows) {
      const target = aClient(c.bumex_client_id);
      if (!target) continue;
      const linked = await client.query(
        "update erp.customer set client_id = $2 where id = $1 and not exists (select 1 from erp.customer o where o.entity_id = $3 and o.client_id = $2)",
        [c.id, target, c.entity_id],
      );
      tally("customers linked").copied += linked.rowCount;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Projects → missions
    const mirrored = new Map((await client.query("select id, bumex_project_id, entity_id from erp.engagement where bumex_project_id is not null")).rows.map((e) => [e.bumex_project_id, e]));
    const ownerEntity = new Map(people.map((p) => [p.id, p.entity_code]));
    const mission = new Map(); // project id → engagement id
    const missionEntity = new Map(); // engagement id → entity id
    const newMissions = [];
    const updatedMissions = [];
    for (const p of data.projects) {
      const name = trimmed(p.name);
      if (!isUuid(p.id) || !name) {
        skipped("projects", "no id or no name");
        continue;
      }
      const fields = {
        name, description: trimmed(p.description), client_id: ["internal_product", "internal_tool"].includes(p.project_kind) ? null : aClient(p.client_id),
        owner_id: anyone(p.owner_id), status: { draft: "planned", active: "active", on_hold: "on_hold", completed: "completed", cancelled: "cancelled" }[p.status] ?? "active",
        start_date: date(p.start_date), deadline: date(p.end_date), fixed_fee: num(p.budget_amount),
        priority: oneOf(p.priority, ["low", "medium", "high", "critical"], "medium"),
        project_kind: oneOf(p.project_kind, ["client_mission", "institutional_partnership", "internal_product", "internal_tool"], "client_mission"),
        manual_progress: num(p.manual_progress) === null ? null : Math.max(0, Math.min(100, Math.round(num(p.manual_progress)))),
        created_at: stamp(p.created_at, new Date().toISOString()),
      };
      if (p.client_id && !fields.client_id && !["internal_product", "internal_tool"].includes(p.project_kind)) fixed("projects", "client gone: none");
      const existing = mirrored.get(p.id);
      if (existing) {
        mission.set(p.id, existing.id);
        missionEntity.set(existing.id, existing.entity_id);
        updatedMissions.push({ id: existing.id, ...fields });
        continue;
      }
      // a project the mirror never placed on a floor: its own entity, its owner's, or the holding
      let code = validCode(p.entity_code) ?? validCode(ownerEntity.get(String(p.owner_id)));
      if (!code) {
        code = "bumex_holding";
        fixed("projects", "no entity, nor its owner: BUMEX Holding");
      }
      mission.set(p.id, p.id);
      missionEntity.set(p.id, entityId(code));
      newMissions.push({ id: p.id, entity_id: entityId(code), ...fields });
    }
    const missionColumns = [
      ["name", "text"], ["description", "text"], ["client_id", "uuid"], ["owner_id", "text"], ["status", "erp.engagement_status"], ["start_date", "date"],
      ["deadline", "date"], ["fixed_fee", "numeric"], ["priority", "text"], ["project_kind", "text"], ["manual_progress", "smallint"], ["created_at", "timestamptz"],
    ];
    await insert("erp.engagement", [["id", "uuid"], ["entity_id", "uuid"], ...missionColumns], newMissions, { source: "projects" });
    for (const m of updatedMissions) {
      await client.query(
        `update erp.engagement set name = $2, description = $3, client_id = $4, owner_id = $5, status = $6, start_date = $7, deadline = $8, fixed_fee = $9,
                priority = $10, project_kind = $11, manual_progress = $12, created_at = $13 where id = $1`,
        [m.id, m.name, m.description, m.client_id, m.owner_id, m.status, m.start_date, m.deadline, m.fixed_fee, m.priority, m.project_kind, m.manual_progress, m.created_at],
      );
      tally("projects").copied += 1;
    }
    // missions the mirror cancelled because their project was deleted: gone too, unless the books point to them
    const orphans = await client.query(
      `delete from erp.engagement e where e.bumex_project_id is not null and not (e.bumex_project_id = any($1::text[]))
          and not exists (select 1 from erp.task where engagement_id = e.id) and not exists (select 1 from erp.time_entry where engagement_id = e.id)
          and not exists (select 1 from erp.archive_record where engagement_id = e.id) and not exists (select 1 from erp.assignment where engagement_id = e.id)
          and not exists (select 1 from erp.sales_invoice where engagement_id = e.id) and not exists (select 1 from erp.supplier_invoice where engagement_id = e.id)
          and not exists (select 1 from erp.journal_line where engagement_id = e.id) and not exists (select 1 from erp.wip_snapshot where engagement_id = e.id)
          and not exists (select 1 from erp.sales_invoice_line where engagement_id = e.id) and not exists (select 1 from erp.supplier_invoice_line where engagement_id = e.id)
       returning id`,
      [[...mission.keys()]],
    );
    tally("deleted projects' missions removed").copied = orphans.rowCount;
    const aMission = (projectId) => mission.get(String(projectId)) ?? null;
    // a polymorphic reference: a project's id becomes its mission's, a merged client's the kept one's
    const subject = (type, id) => (type === "project" ? aMission(id) : type === "client" ? (aClient(id) ?? text(id)) : text(id));

    // members, boards, milestones
    const members = [];
    const seenMembers = new Set();
    for (const m of data.project_members) {
      const e = aMission(m.project_id);
      const user = anyone(m.user_id);
      if (!e || !user) {
        skipped("project_members", !e ? "project gone" : "person gone");
        continue;
      }
      if (seenMembers.has(`${e}|${user}`)) {
        skipped("project_members", "twice");
        continue;
      }
      seenMembers.add(`${e}|${user}`);
      members.push({ engagement_id: e, user_id: user, role: text(m.role) ?? "employee" });
    }
    await insert("erp.engagement_staff", [["engagement_id", "uuid"], ["user_id", "text"], ["role", "text"]], members, { source: "project_members" });

    const boards = [];
    for (const w of data.project_workflows) {
      const e = aMission(w.project_id ?? w.id);
      if (!e) {
        skipped("project_workflows", "project gone");
        continue;
      }
      boards.push({
        engagement_id: e, stages: Array.isArray(w.stages) ? w.stages : [], transitions: w.transitions && typeof w.transitions === "object" ? w.transitions : {},
        allow_backward: w.allow_backward === true, allow_skip_forward: w.allow_skip_forward === true, allow_reopen: w.allow_reopen === true,
        require_reason: w.require_reason === true, custom_transitions_enabled: w.custom_transitions_enabled === true, updated_by: anyone(w.updated_by),
        created_at: stamp(w.created_at, new Date().toISOString()), updated_at: stamp(w.updated_at, stamp(w.created_at, new Date().toISOString())),
      });
    }
    await insert("work.board", [
      ["engagement_id", "uuid"], ["stages", "jsonb"], ["transitions", "jsonb"], ["allow_backward", "boolean"], ["allow_skip_forward", "boolean"],
      ["allow_reopen", "boolean"], ["require_reason", "boolean"], ["custom_transitions_enabled", "boolean"], ["updated_by", "text"], ["created_at", "timestamptz"],
      ["updated_at", "timestamptz"],
    ], boards, { source: "project_workflows", conflict: "on conflict (engagement_id) do nothing" });

    const milestones = [];
    for (const m of data.milestones) {
      const e = aMission(m.project_id);
      const due = date(m.due_date);
      if (!isUuid(m.id) || !e || !trimmed(m.title) || !due) {
        skipped("milestones", !e ? "project gone" : "no title or no due date");
        continue;
      }
      const status = oneOf(m.status, ["planned", "in_progress", "completed", "delayed", "cancelled"], "planned");
      milestones.push({
        id: m.id, engagement_id: e, title: trimmed(m.title), description: trimmed(m.description), status, due_date: due,
        completed_at: status === "completed" ? stamp(m.completed_at, stamp(m.updated_at, new Date().toISOString())) : null, owner_id: anyone(m.owner_id),
        created_at: stamp(m.created_at, new Date().toISOString()), updated_at: stamp(m.updated_at, stamp(m.created_at, new Date().toISOString())),
      });
    }
    await insert("work.milestone", [
      ["id", "uuid"], ["engagement_id", "uuid"], ["title", "text"], ["description", "text"], ["status", "text"], ["due_date", "date"], ["completed_at", "timestamptz"],
      ["owner_id", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], milestones, { source: "milestones" });

    // ---------------------------------------------------------------------------------------------------------------
    // Tickets and their sub-tasks
    const tickets = [];
    for (const t of data.tasks) {
      const e = aMission(t.project_id);
      if (!isUuid(t.id) || !e) {
        skipped("tasks", !e ? "project gone" : "no id");
        continue;
      }
      const raw = t.status === "in_review" ? "review" : t.status === "cancelled" ? "archived" : t.status;
      const status = oneOf(raw, ["backlog", "todo", "in_progress", "review", "blocked", "done", "archived"], "todo");
      const updated = stamp(t.updated_at, stamp(t.created_at, new Date().toISOString()));
      tickets.push({
        id: t.id, engagement_id: e, entity_id: missionEntity.get(e), title: trimmed(t.title) ?? "(sans titre)", notes: trimmed(t.description), status,
        completed_at: status === "done" ? updated.slice(0, 10) : null,
        priority: t.priority === "critical" ? "urgent" : oneOf(t.priority, ["low", "medium", "high", "urgent"], "medium"),
        type: oneOf(t.type, ["task", "bug", "feature", "support", "client_request", "internal"], "task"), stage_id: trimmed(t.stage_id),
        assignee_id: anyone(t.assignee_id), reporter_id: anyone(t.reporter_id), due_date: date(t.due_date),
        estimated_hours: num(t.estimated_hours) !== null && num(t.estimated_hours) >= 0 ? num(t.estimated_hours) : null,
        actual_hours: num(t.actual_hours) !== null && num(t.actual_hours) >= 0 ? num(t.actual_hours) : null, github_issue_url: trimmed(t.github_issue_url),
        created_at: stamp(t.created_at, updated), updated_at: updated, module: "missions",
      });
    }
    await insert("erp.task", [
      ["id", "uuid"], ["engagement_id", "uuid"], ["entity_id", "uuid"], ["title", "text"], ["notes", "text"], ["status", "text"], ["completed_at", "date"],
      ["priority", "text"], ["type", "text"], ["stage_id", "text"], ["assignee_id", "text"], ["reporter_id", "text"], ["due_date", "date"],
      ["estimated_hours", "numeric"], ["actual_hours", "numeric"], ["github_issue_url", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
      ["module", "text"],
    ], tickets, { source: "tasks" });
    const ticket = new Set(tickets.map((t) => t.id));

    const subtasks = [];
    for (const s of data.subtasks) {
      if (!isUuid(s.id) || !ticket.has(String(s.task_id)) || !trimmed(s.title)) {
        skipped("subtasks", !ticket.has(String(s.task_id)) ? "ticket gone" : "no title");
        continue;
      }
      subtasks.push({
        id: s.id, task_id: s.task_id, title: trimmed(s.title).slice(0, 200), is_done: s.is_done === true, assignee_id: anyone(s.assignee_id), due_date: date(s.due_date),
        position: Math.round(num(s.position) ?? 0), completed_at: s.is_done === true ? stamp(s.completed_at) : null, created_by: anyone(s.created_by),
        created_at: stamp(s.created_at, new Date().toISOString()), updated_at: stamp(s.updated_at, stamp(s.created_at, new Date().toISOString())),
      });
    }
    await insert("work.subtask", [
      ["id", "uuid"], ["task_id", "uuid"], ["title", "text"], ["is_done", "boolean"], ["assignee_id", "text"], ["due_date", "date"], ["position", "integer"],
      ["completed_at", "timestamptz"], ["created_by", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], subtasks, { source: "subtasks" });

    // ---------------------------------------------------------------------------------------------------------------
    // Contracts and documents
    const contracts = [];
    const contractTitles = new Set();
    for (const k of data.contracts) {
      const clientId = aClient(k.client_id);
      if (!isUuid(k.id) || !clientId || !trimmed(k.title)) {
        skipped("contracts", !clientId ? "client gone" : "no title");
        continue;
      }
      let title = trimmed(k.title);
      while (contractTitles.has(`${clientId}|${title.toLowerCase()}`)) {
        title = `${title} (2)`;
        fixed("contracts", "title used twice for the client: suffixed");
      }
      contractTitles.add(`${clientId}|${title.toLowerCase()}`);
      let end = date(k.end_date);
      if (end && date(k.start_date) && end < date(k.start_date)) {
        end = null;
        fixed("contracts", "end before start: no end");
      }
      contracts.push({
        id: k.id, client_id: clientId, engagement_id: k.project_id ? aMission(k.project_id) : null, title, contract_number: trimmed(k.contract_number),
        status: oneOf(k.status, ["draft", "under_review", "signed", "active", "expired", "cancelled", "archived"], "draft"),
        contract_type: oneOf(k.contract_type, ["development", "maintenance", "consulting", "support", "hosting", "audit", "other"], "other"),
        start_date: date(k.start_date), end_date: end, signed_date: date(k.signed_date), renewal_date: date(k.renewal_date),
        amount: num(k.amount) !== null && num(k.amount) >= 0 ? num(k.amount) : null, currency: trimmed(k.currency) ?? "USD", payment_terms: trimmed(k.payment_terms),
        notes: trimmed(k.notes), responsible_user_id: anyone(k.responsible_user_id), entity_code: validCode(k.entity_code),
        created_at: stamp(k.created_at, new Date().toISOString()), updated_at: stamp(k.updated_at, stamp(k.created_at, new Date().toISOString())),
      });
    }
    await insert("work.contract", [
      ["id", "uuid"], ["client_id", "uuid"], ["engagement_id", "uuid"], ["title", "text"], ["contract_number", "text"], ["status", "text"], ["contract_type", "text"],
      ["start_date", "date"], ["end_date", "date"], ["signed_date", "date"], ["renewal_date", "date"], ["amount", "numeric"], ["currency", "text"],
      ["payment_terms", "text"], ["notes", "text"], ["responsible_user_id", "text"], ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], contracts, { source: "contracts" });

    const documents = [];
    for (const d of data.documents) {
      if (!isUuid(d.id) || !trimmed(d.file_url)) {
        skipped("documents", "no id or no file");
        continue;
      }
      // the link is kept as it was (a record since deleted included); a document of an unknown or missing link is filed
      // in the general archive, readable by the administrators only
      let relatedType = oneOf(d.related_type, ["client", "project", "task", "contract", "invoice", "payment", "transfer", "archive"], null);
      let relatedId = relatedType === "archive" || !relatedType ? null
        : relatedType === "project" ? (aMission(d.related_id) ?? (isUuid(d.related_id) ? d.related_id : null))
        : relatedType === "client" ? (aClient(d.related_id) ?? (isUuid(d.related_id) ? d.related_id : null))
        : isUuid(d.related_id) ? d.related_id : null;
      let visibility = oneOf(d.visibility, ["internal", "management", "shareholders", "restricted"], "internal");
      if (relatedType !== "archive" && !relatedId) {
        relatedType = "archive";
        visibility = "restricted";
        fixed("documents", "no link to a record: general archive, administrators only");
      }
      let uploader = anyone(d.uploaded_by);
      if (!uploader) {
        uploader = fallbackAuthor;
        fixed("documents", "uploader gone: the super administrator");
      }
      documents.push({
        id: d.id, title: trimmed(d.title) ?? trimmed(d.file_name) ?? "Document", description: trimmed(d.description),
        document_type: oneOf(d.document_type, ["contract", "invoice", "receipt", "bank_transfer", "proposal", "report", "meeting_note", "technical_document", "legal_document", "other"], "other"),
        related_type: relatedType, related_id: relatedId, file_url: trimmed(d.file_url), file_name: trimmed(d.file_name) ?? "document", file_size: Math.max(0, Math.round(num(d.file_size) ?? 0)),
        mime_type: trimmed(d.mime_type), uploaded_by: uploader, visibility,
        is_archived: d.is_archived === true, entity_code: validCode(d.entity_code),
        created_at: stamp(d.created_at, new Date().toISOString()), updated_at: stamp(d.updated_at, stamp(d.created_at, new Date().toISOString())),
      });
    }
    await insert("work.document", [
      ["id", "uuid"], ["title", "text"], ["description", "text"], ["document_type", "text"], ["related_type", "text"], ["related_id", "uuid"], ["file_url", "text"],
      ["file_name", "text"], ["file_size", "bigint"], ["mime_type", "text"], ["uploaded_by", "text"], ["visibility", "text"], ["is_archived", "boolean"],
      ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], documents, { source: "documents" });

    // ---------------------------------------------------------------------------------------------------------------
    // Comments, notes, notifications, activity
    const comments = [];
    for (const c of data.comments) {
      const type = oneOf(c.entity_type, ["project", "ticket", "client", "contract", "document", "invoice", "payment", "transfer"], null);
      const subjectId = type ? subject(type, c.entity_id) : null;
      if (!isUuid(c.id) || !type || !isUuid(subjectId) || !trimmed(c.body)) {
        skipped("comments", !type ? "unknown subject" : !isUuid(subjectId) ? "subject gone" : "empty");
        continue;
      }
      let author = anyone(c.author_id);
      if (!author) {
        author = fallbackAuthor;
        fixed("comments", "author gone: the super administrator");
      }
      comments.push({
        id: c.id, subject_type: type, subject_id: subjectId, author_id: author, body: trimmed(c.body), is_internal: c.is_internal !== false,
        created_at: stamp(c.created_at, new Date().toISOString()), updated_at: stamp(c.updated_at, stamp(c.created_at, new Date().toISOString())), deleted_at: stamp(c.deleted_at),
      });
    }
    await insert("work.comment", [
      ["id", "uuid"], ["subject_type", "text"], ["subject_id", "uuid"], ["author_id", "text"], ["body", "text"], ["is_internal", "boolean"], ["created_at", "timestamptz"],
      ["updated_at", "timestamptz"], ["deleted_at", "timestamptz"],
    ], comments, { source: "comments" });

    const notes = [];
    for (const n of data.internal_notes) {
      const type = oneOf(n.entity_type, ["project", "client", "contract", "finance", "shareholder"], null);
      const subjectId = type ? subject(type, n.entity_id) : null;
      if (!isUuid(n.id) || !type || !isUuid(subjectId) || !trimmed(n.title) || !trimmed(n.body)) {
        skipped("internal_notes", !type ? "unknown subject" : !isUuid(subjectId) ? "subject gone" : "empty");
        continue;
      }
      let author = anyone(n.author_id);
      if (!author) {
        author = fallbackAuthor;
        fixed("internal_notes", "author gone: the super administrator");
      }
      notes.push({
        id: n.id, subject_type: type, subject_id: subjectId, author_id: author, title: trimmed(n.title), body: trimmed(n.body),
        visibility: oneOf(n.visibility, ["private", "team", "management", "shareholders"], "team"), pinned: n.pinned === true,
        created_at: stamp(n.created_at, new Date().toISOString()), updated_at: stamp(n.updated_at, stamp(n.created_at, new Date().toISOString())), archived_at: stamp(n.archived_at),
      });
    }
    await insert("work.note", [
      ["id", "uuid"], ["subject_type", "text"], ["subject_id", "uuid"], ["author_id", "text"], ["title", "text"], ["body", "text"], ["visibility", "text"],
      ["pinned", "boolean"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"], ["archived_at", "timestamptz"],
    ], notes, { source: "internal_notes" });

    const notifications = [];
    for (const n of data.notifications) {
      const user = anyone(n.user_id);
      if (!isUuid(n.id) || !user || !trimmed(n.title) || !trimmed(n.body)) {
        skipped("notifications", !user ? "person gone" : "empty");
        continue;
      }
      const type = text(n.entity_type) ?? "system";
      notifications.push({
        id: n.id, user_id: user, type: oneOf(n.type, ["mention", "assignment", "status_change", "comment", "deadline", "overdue", "payment_due", "contract_due", "system"], "system"),
        title: trimmed(n.title), body: trimmed(n.body), subject_type: type, subject_id: subject(type, n.entity_id) ?? text(n.entity_id), is_read: n.is_read === true,
        skip_email: n.skip_email === true, created_at: stamp(n.created_at, new Date().toISOString()), archived_at: stamp(n.archived_at),
      });
    }
    await insert("work.notification", [
      ["id", "uuid"], ["user_id", "text"], ["type", "text"], ["title", "text"], ["body", "text"], ["subject_type", "text"], ["subject_id", "text"], ["is_read", "boolean"],
      ["skip_email", "boolean"], ["created_at", "timestamptz"], ["archived_at", "timestamptz"],
    ], notifications, { source: "notifications" });

    // a note's or comment's activity names the record it is on (metadata.related_type / related_id)
    const remapMetadata = (metadata) => {
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
      if (!metadata.related_id || !["project", "client"].includes(metadata.related_type)) return metadata;
      return { ...metadata, related_id: subject(metadata.related_type, metadata.related_id) ?? metadata.related_id };
    };
    // the e-mails not sent yet (less than a day old, as the sender expires older ones) go out from here; the others are
    // history, left in Firestore
    const copiedNotification = new Set(notifications.map((n) => n.id));
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const emails_ = [];
    for (const o of data.notification_email_outbox) {
      const fresh = ["pending", "processing"].includes(o.status) && (stamp(o.created_at) ?? "") > dayAgo;
      if (!isUuid(o.id) || !fresh || !copiedNotification.has(String(o.notification_id)) || !trimmed(o.recipient_email)) {
        skipped("notification_email_outbox", fresh ? "notification not copied" : "sent, failed or older than a day: history");
        continue;
      }
      emails_.push({
        id: o.id, notification_id: o.notification_id, user_id: anyone(o.user_id) ?? text(o.user_id), recipient_email: trimmed(o.recipient_email),
        subject: text(o.subject) ?? "", body: text(o.body) ?? "", subject_type: text(o.entity_type), subject_id: subject(text(o.entity_type), o.entity_id) ?? text(o.entity_id),
        attempts: Math.max(0, Math.round(num(o.attempts) ?? 0)), created_at: stamp(o.created_at, new Date().toISOString()),
      });
    }
    await insert("work.notification_email", [
      ["id", "uuid"], ["notification_id", "uuid"], ["user_id", "text"], ["recipient_email", "text"], ["subject", "text"], ["body", "text"], ["subject_type", "text"],
      ["subject_id", "text"], ["attempts", "integer"], ["created_at", "timestamptz"],
    ], emails_, { source: "notification_email_outbox", conflict: "on conflict (notification_id) do nothing" });

    const activity = [];
    for (const a of data.activity_logs) {
      if (!isUuid(a.id) || !trimmed(a.action)) {
        skipped("activity_logs", "no id or no action");
        continue;
      }
      const type = text(a.entity_type) ?? "system";
      activity.push({
        id: a.id, user_id: anyone(a.user_id), action: trimmed(a.action), subject_type: type, subject_id: subject(type, a.entity_id) ?? text(a.entity_id),
        metadata: remapMetadata(a.metadata), entity_code: text(a.entity_code),
        created_at: stamp(a.created_at, new Date().toISOString()),
      });
    }
    await insert("work.activity", [
      ["id", "uuid"], ["user_id", "text"], ["action", "text"], ["subject_type", "text"], ["subject_id", "text"], ["metadata", "jsonb"], ["entity_code", "text"],
      ["created_at", "timestamptz"],
    ], activity, { source: "activity_logs" });

    // ---------------------------------------------------------------------------------------------------------------
    // Time: the lines first (no week is locked yet), then the weeks, their history and reminders, the favourites
    const today = new Date().toISOString().slice(0, 10);
    const lines = [];
    for (const t of data.time_entries) {
      const e = aMission(t.project_id);
      const user = anyone(t.user_id);
      const minutes = Math.round(num(t.duration_minutes) ?? 0);
      const day = date(t.work_date);
      if (!isUuid(t.id) || !e || !user || !day || minutes < 1 || minutes > 1440) {
        skipped("time_entries", !e ? "project gone" : !user ? "person gone" : !day ? "no date" : "duration outside 1 min – 24 h");
        continue;
      }
      if (day > today) fixed("time_entries", "dated ahead: kept as it was");
      if (validCode(t.entity_code) && entityId(t.entity_code) !== missionEntity.get(e)) fixed("time_entries", "entity of the line ≠ the mission's: the mission's");
      lines.push({
        id: t.id, engagement_id: e, entity_id: missionEntity.get(e), user_id: user, work_date: day, minutes, description: text(t.note) ?? "",
        mission: (text(t.mission) ?? "").trim().replace(/\s+/g, " ").slice(0, 200), created_at: stamp(t.created_at, new Date().toISOString()),
      });
    }
    // a day over 24 hours (two writes that raced in Firestore) is kept as it was, and said
    const perDay = new Map();
    for (const l of lines) perDay.set(`${l.user_id}|${l.work_date}`, (perDay.get(`${l.user_id}|${l.work_date}`) ?? 0) + l.minutes);
    for (const l of lines) if (perDay.get(`${l.user_id}|${l.work_date}`) > 1440) fixed("time_entries", "in a day of more than 24 hours: kept as it was");
    const okLines = lines;
    await insert("erp.time_entry", [
      ["id", "uuid"], ["engagement_id", "uuid"], ["entity_id", "uuid"], ["user_id", "text"], ["work_date", "date"], ["minutes", "integer"], ["description", "text"],
      ["mission", "text"], ["created_at", "timestamptz"],
    ], okLines, { source: "time_entries" });

    const homeEntity = (userId) => entityId(ownerEntity.get(userId));
    const weeks = [];
    for (const w of data.timesheet_week_status) {
      const user = anyone(w.user_id);
      const start = date(w.week_start);
      const entity = entityId(w.entity_code) ?? (user ? homeEntity(user) : null);
      if (!user || !start || new Date(`${start}T00:00:00Z`).getUTCDay() !== 1 || !entity) {
        skipped("timesheet_week_status", !user ? "person gone" : !entity ? "no entity" : "week not starting on a Monday");
        continue;
      }
      weeks.push({
        user_id: user, week_start: start, entity_id: entity, status: oneOf(w.status, ["submitted", "approved", "returned"], "submitted"),
        submitted_at: stamp(w.submitted_at, new Date().toISOString()), reviewed_at: stamp(w.reviewed_at), reviewed_by: anyone(w.reviewed_by), review_note: trimmed(w.review_note),
      });
    }
    await insert("work.timesheet_week", [
      ["user_id", "text"], ["week_start", "date"], ["entity_id", "uuid"], ["status", "text"], ["submitted_at", "timestamptz"], ["reviewed_at", "timestamptz"],
      ["reviewed_by", "text"], ["review_note", "text"],
    ], weeks, { source: "timesheet_week_status", conflict: "on conflict (user_id, week_start) do nothing" });

    const events = [];
    for (const v of data.timesheet_week_events) {
      const user = anyone(v.user_id);
      const entity = entityId(v.entity_code) ?? (user ? homeEntity(user) : null);
      if (!isUuid(v.id) || !user || !date(v.week_start) || !entity) {
        skipped("timesheet_week_events", !user ? "person gone" : "no week or no entity");
        continue;
      }
      events.push({
        id: v.id, user_id: user, week_start: date(v.week_start), entity_id: entity, status: oneOf(v.status, ["submitted", "approved", "returned"], "submitted"),
        actor_id: anyone(v.actor_id), note: trimmed(v.note), created_at: stamp(v.created_at, new Date().toISOString()),
      });
    }
    await insert("work.timesheet_week_event", [
      ["id", "uuid"], ["user_id", "text"], ["week_start", "date"], ["entity_id", "uuid"], ["status", "text"], ["actor_id", "text"], ["note", "text"], ["created_at", "timestamptz"],
    ], events, { source: "timesheet_week_events" });

    const reminders = [];
    for (const r of data.timesheet_reminders) {
      const user = anyone(r.user_id);
      const by = anyone(r.sent_by);
      if (!user || !by || !date(r.week_start)) {
        skipped("timesheet_reminders", "person gone or no week");
        continue;
      }
      reminders.push({ user_id: user, week_start: date(r.week_start), sent_date: date(r.sent_date) ?? date(r.created_at) ?? today, entity_id: entityId(r.entity_code), sent_by: by, created_at: stamp(r.created_at, new Date().toISOString()) });
    }
    await insert("work.timesheet_reminder", [
      ["user_id", "text"], ["week_start", "date"], ["sent_date", "date"], ["entity_id", "uuid"], ["sent_by", "text"], ["created_at", "timestamptz"],
    ], reminders, { source: "timesheet_reminders", conflict: "on conflict do nothing" });

    const autoReminders = [];
    for (const r of data.timesheet_weekly_reminders) {
      const user = anyone(r.user_id);
      if (!user || !date(r.week_start)) {
        skipped("timesheet_weekly_reminders", "person gone or no week");
        continue;
      }
      autoReminders.push({ user_id: user, week_start: date(r.week_start), entity_id: entityId(r.entity_code), created_at: stamp(r.created_at, new Date().toISOString()) });
    }
    await insert("work.timesheet_auto_reminder", [["user_id", "text"], ["week_start", "date"], ["entity_id", "uuid"], ["created_at", "timestamptz"]], autoReminders, {
      source: "timesheet_weekly_reminders",
      conflict: "on conflict do nothing",
    });

    const favorites = [];
    for (const f of data.time_mission_favorites) {
      const e = aMission(f.project_id);
      const user = anyone(f.user_id);
      const label = (text(f.mission) ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
      if (!e || !user || !label) {
        skipped("time_mission_favorites", !e ? "project gone" : !user ? "person gone" : "no mission");
        continue;
      }
      favorites.push({ user_id: user, engagement_id: e, mission: label, entity_id: missionEntity.get(e), created_at: stamp(f.created_at, new Date().toISOString()) });
    }
    await insert("work.mission_favorite", [["user_id", "text"], ["engagement_id", "uuid"], ["mission", "text"], ["entity_id", "uuid"], ["created_at", "timestamptz"]], favorites, {
      source: "time_mission_favorites",
      conflict: "on conflict do nothing",
    });

    // ---------------------------------------------------------------------------------------------------------------
    // The old finance records, as they are (read only from now on)
    const keep = (table, rows, map) => {
      const out = [];
      for (const r of rows) {
        if (!isUuid(r.id)) {
          skipped(table, "no id");
          continue;
        }
        out.push(map(r));
      }
      return out;
    };
    const times = (r) => ({ created_at: stamp(r.created_at, new Date().toISOString()), updated_at: stamp(r.updated_at, stamp(r.created_at, new Date().toISOString())) });
    await insert("work.finance_invoice", [
      ["id", "uuid"], ["invoice_number", "text"], ["client_id", "uuid"], ["engagement_id", "uuid"], ["contract_id", "uuid"], ["issue_date", "date"], ["due_date", "date"],
      ["amount_ht", "numeric"], ["tax_amount", "numeric"], ["amount_ttc", "numeric"], ["currency", "text"], ["status", "text"], ["notes", "text"], ["approval_status", "text"],
      ["approved_by", "text"], ["approved_at", "timestamptz"], ["created_by", "text"], ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], keep("invoices", data.invoices, (r) => ({
      id: r.id, invoice_number: text(r.invoice_number) ?? r.id, client_id: aClient(r.client_id) ?? (isUuid(r.client_id) ? r.client_id : null), engagement_id: r.project_id ? (aMission(r.project_id) ?? (isUuid(r.project_id) ? r.project_id : null)) : null,
      contract_id: isUuid(r.contract_id) ? r.contract_id : null, issue_date: date(r.issue_date), due_date: date(r.due_date), amount_ht: num(r.amount_ht) ?? 0,
      tax_amount: num(r.tax_amount) ?? 0, amount_ttc: num(r.amount_ttc) ?? 0, currency: text(r.currency) ?? "USD", status: text(r.status) ?? "draft", notes: text(r.notes),
      approval_status: text(r.approval_status) ?? "pending", approved_by: text(r.approved_by), approved_at: stamp(r.approved_at), created_by: text(r.created_by),
      entity_code: text(r.entity_code), ...times(r),
    })), { source: "invoices" });
    await insert("work.finance_payment", [
      ["id", "uuid"], ["invoice_id", "uuid"], ["client_id", "uuid"], ["engagement_id", "uuid"], ["contract_id", "uuid"], ["amount", "numeric"], ["currency", "text"],
      ["payment_date", "date"], ["due_date", "date"], ["method", "text"], ["status", "text"], ["reference", "text"], ["notes", "text"], ["created_by", "text"],
      ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], keep("payments", data.payments, (r) => ({
      id: r.id, invoice_id: isUuid(r.invoice_id) ? r.invoice_id : null, client_id: aClient(r.client_id) ?? (isUuid(r.client_id) ? r.client_id : null), engagement_id: r.project_id ? (aMission(r.project_id) ?? (isUuid(r.project_id) ? r.project_id : null)) : null,
      contract_id: isUuid(r.contract_id) ? r.contract_id : null, amount: num(r.amount) ?? 0, currency: text(r.currency) ?? "USD", payment_date: date(r.payment_date),
      due_date: date(r.due_date), method: text(r.method), status: text(r.status) ?? "expected", reference: text(r.reference), notes: text(r.notes), created_by: text(r.created_by),
      entity_code: text(r.entity_code), ...times(r),
    })), { source: "payments" });
    await insert("work.finance_receipt", [
      ["id", "uuid"], ["receipt_number", "text"], ["payment_id", "uuid"], ["issue_date", "date"], ["amount", "numeric"], ["document_id", "uuid"], ["notes", "text"],
      ["created_by", "text"], ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], keep("receipts", data.receipts, (r) => ({
      id: r.id, receipt_number: text(r.receipt_number) ?? r.id, payment_id: isUuid(r.payment_id) ? r.payment_id : null, issue_date: date(r.issue_date), amount: num(r.amount) ?? 0,
      document_id: isUuid(r.document_id) ? r.document_id : null, notes: text(r.notes), created_by: text(r.created_by), entity_code: text(r.entity_code), ...times(r),
    })), { source: "receipts" });
    await insert("work.finance_transfer", [
      ["id", "uuid"], ["transfer_reference", "text"], ["beneficiary_name", "text"], ["beneficiary_bank", "text"], ["beneficiary_account", "text"], ["amount", "numeric"],
      ["currency", "text"], ["transfer_date", "date"], ["status", "text"], ["category", "text"], ["engagement_id", "uuid"], ["client_id", "uuid"], ["notes", "text"],
      ["created_by", "text"], ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], keep("transfers", data.transfers, (r) => ({
      id: r.id, transfer_reference: text(r.transfer_reference) ?? r.id, beneficiary_name: text(r.beneficiary_name) ?? "—", beneficiary_bank: text(r.beneficiary_bank),
      beneficiary_account: text(r.beneficiary_account), amount: num(r.amount) ?? 0, currency: text(r.currency) ?? "USD", transfer_date: date(r.transfer_date),
      status: text(r.status) ?? "planned", category: text(r.category), engagement_id: r.related_project_id ? (aMission(r.related_project_id) ?? (isUuid(r.related_project_id) ? r.related_project_id : null)) : null,
      client_id: aClient(r.related_client_id) ?? (isUuid(r.related_client_id) ? r.related_client_id : null), notes: text(r.notes), created_by: text(r.created_by), entity_code: text(r.entity_code), ...times(r),
    })), { source: "transfers" });
    await insert("work.finance_bank_statement", [
      ["id", "uuid"], ["account_label", "text"], ["statement_label", "text"], ["statement_date", "date"], ["currency", "text"], ["raw_content", "text"], ["notes", "text"],
      ["created_by", "text"], ["entity_code", "text"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], keep("bank_statements", data.bank_statements, (r) => ({
      id: r.id, account_label: text(r.account_label), statement_label: text(r.statement_label), statement_date: date(r.statement_date), currency: text(r.currency),
      raw_content: text(r.raw_content), notes: text(r.notes), created_by: text(r.created_by), entity_code: text(r.entity_code), ...times(r),
    })), { source: "bank_statements" });
    await insert("work.finance_bank_statement_line", [
      ["id", "uuid"], ["statement_id", "uuid"], ["line_date", "date"], ["description", "text"], ["reference", "text"], ["credit_amount", "numeric"], ["debit_amount", "numeric"],
      ["currency", "text"], ["match_status", "text"], ["matched_entity_type", "text"], ["matched_entity_id", "uuid"], ["match_confidence", "numeric"], ["match_reason", "text"],
      ["entity_code", "text"], ["created_at", "timestamptz"],
    ], keep("bank_statement_lines", data.bank_statement_lines, (r) => ({
      id: r.id, statement_id: isUuid(r.statement_id) ? r.statement_id : null, line_date: date(r.line_date), description: text(r.description), reference: text(r.reference),
      credit_amount: num(r.credit_amount) ?? 0, debit_amount: num(r.debit_amount) ?? 0, currency: text(r.currency), match_status: text(r.match_status),
      matched_entity_type: text(r.matched_entity_type), matched_entity_id: isUuid(r.matched_entity_id) ? r.matched_entity_id : null, match_confidence: num(r.match_confidence),
      match_reason: text(r.match_reason), entity_code: text(r.entity_code), created_at: stamp(r.created_at, new Date().toISOString()),
    })), { source: "bank_statement_lines" });

    for (const [table, trigger] of QUIET) await client.query(`alter table ${table} enable trigger ${trigger}`);
    // the screens read again once the copy is in
    await client.query("select nextval('work.change_seq')");

    printReport();
    if (dryRun) {
      await client.query("rollback");
      console.log("\nDry run: rolled back, nothing kept.");
    } else {
      await client.query("commit");
      console.log("\nCommitted.");
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

function printReport() {
  console.log("\n%s  %s  %s", "what".padEnd(38), "read".padStart(6), "copied".padStart(6));
  for (const [table, t] of report) {
    if (!t.read && !t.copied && !t.skipped.size) continue;
    console.log("%s  %s  %s", table.padEnd(38), String(t.read).padStart(6), String(t.copied).padStart(6));
    for (const [why, n] of t.fixed) console.log("    set right: %s × %d", why, n);
    for (const [why, n] of t.skipped) console.log("    left out:  %s × %d", why, n);
  }
}

main()
  .catch((error) => {
    console.error("\nStopped, nothing kept:", error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => undefined));
