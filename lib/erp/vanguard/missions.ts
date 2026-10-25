import "server-only";

import { withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import { mirrorClients, type ClientIdentity } from "@/lib/erp/vanguard/clients";
import { createAdminClient } from "@/lib/firebase/server";
import { readTableVersions, versionOf } from "@/lib/firebase/table-versions";
import { calculateProjectProgress } from "@/lib/projects/helpers";
import type { Profile } from "@/types/auth";
import type { ClientRecord } from "@/types/client";
import type { ProjectKind, ProjectRecord, ProjectStatus, ProjectTaskPreview } from "@/types/project";

// Missions are BUMEX One's projects (every kind, internal ones too), created and edited from Vanguard's Missions room
// (mission-actions.ts) while their data stays in BUMEX One's database. Each is mirrored in erp.engagement so that the
// ERP's documents can point to it (an invoice's mission, a planning line, an archive box); its customer is the ERP
// customer of the project's client, linked by the client's id, created when the entity has its chart of accounts.
// The ERP's own fields of a mission (fee type, hours budget) are kept in erp.engagement and never mirrored over.

export type MissionSource = {
  projectId: string;
  entityCode: string;
  name: string;
  kind: ProjectKind;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  progress: number; // as BUMEX One shows it (tickets done, or the progress set by hand)
  hours: number; // timesheets
  staff: string[]; // the members' initials
  client: { id: string; name: string; email: string | null; country: string | null; taxId: string | null } | null;
};

const statusOf: Record<ProjectStatus, string> = { draft: "planned", active: "active", on_hold: "on_hold", completed: "completed", cancelled: "cancelled" };
const kindLabel: Record<ProjectKind, string> = {
  client_mission: "Mission client",
  institutional_partnership: "Partenariat institutionnel",
  internal_product: "Produit interne",
  internal_tool: "Outil interne",
};

// "Mariem Sow" → "M.S.", as the ERP writes initials
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  return [words[0], words.length > 1 ? words[words.length - 1] : ""].filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join("");
}

async function customerFor(tx: ErpTransaction, entityId: string, currency: string, client: NonNullable<MissionSource["client"]>) {
  const [linked] = await tx.query<{ id: string }>("select id from erp.customer where entity_id = $1 and bumex_client_id = $2", [entityId, client.id]);
  if (linked) return linked.id;
  // a customer of the same name entered in Vanguard becomes this client's
  const [named] = await tx.query<{ id: string }>(
    `update erp.customer set bumex_client_id = $2
      where id = (select id from erp.customer where entity_id = $1 and bumex_client_id is null and lower(name) = lower($3) order by code limit 1)
      returning id`,
    [entityId, client.id, client.name],
  );
  if (named) return named.id;
  // a new customer needs the customers' collective account of the entity's chart
  const [{ ready }] = await tx.query<{ ready: boolean }>("select erp.collective_for($1, 'customer') is not null as ready", [entityId]);
  if (!ready) return null;
  const [made] = await tx.query<{ id: string }>(
    `insert into erp.customer (entity_id, code, name, country, email, nif, default_currency, bumex_client_id)
     values ($1, null, $2, $3, $4, $5, $6, $7) returning id`,
    [entityId, client.name, client.country && /^[a-z]{2}$/i.test(client.country) ? client.country.toUpperCase() : null, client.email, client.taxId, currency, client.id],
  );
  return made.id;
}

// Writes the missions as BUMEX One has them; a project gone from the list (deleted) is cancelled, so what points to it
// keeps its history. A row is only written when something changed.
export async function mirrorMissions(tx: ErpTransaction, missions: MissionSource[]) {
  const entities = new Map(
    (await tx.query<{ id: string; code: string; currency: string }>("select id, code, functional_currency::text as currency from erp.entity where active")).map((e) => [e.code, e]),
  );
  const mirrored: string[] = [];
  for (const m of missions) {
    const entity = entities.get(m.entityCode);
    if (!entity) continue;
    mirrored.push(m.projectId);
    const customerId = m.client ? await customerFor(tx, entity.id, entity.currency, m.client) : null;
    await tx.query(
      `insert into erp.engagement (entity_id, customer_id, code, name, kind, status, start_date, deadline, fee_type, fixed_fee, currency, progress, actual_hours,
                                   staff, bumex_project_id)
       values ($1, $2, (select 'M-' || lpad((count(*) + 1)::text, 3, '0') from erp.engagement where entity_id = $1), $3, $4, $5::erp.engagement_status,
               $6, $7, 'fixed', $8, $9, $10, $11, $12, $13)
       on conflict (bumex_project_id) do update
         set customer_id = coalesce(excluded.customer_id, erp.engagement.customer_id), name = excluded.name, kind = excluded.kind, status = excluded.status,
             start_date = excluded.start_date, deadline = excluded.deadline, fixed_fee = excluded.fixed_fee, progress = excluded.progress,
             actual_hours = excluded.actual_hours, staff = excluded.staff
       where (erp.engagement.customer_id, erp.engagement.name, erp.engagement.kind, erp.engagement.status, erp.engagement.start_date, erp.engagement.deadline,
              erp.engagement.fixed_fee, erp.engagement.progress, erp.engagement.actual_hours, erp.engagement.staff)
             is distinct from
             (coalesce(excluded.customer_id, erp.engagement.customer_id), excluded.name, excluded.kind, excluded.status, excluded.start_date, excluded.deadline,
              excluded.fixed_fee, excluded.progress, excluded.actual_hours, excluded.staff)`,
      [
        entity.id, customerId, m.name, kindLabel[m.kind], statusOf[m.status], m.startDate, m.endDate, m.budget, entity.currency,
        Math.max(0, Math.min(100, Math.round(m.progress))), Math.round(m.hours * 100) / 100, m.staff, m.projectId,
      ],
    );
  }
  await tx.query(
    "update erp.engagement set status = 'cancelled' where bumex_project_id is not null and status <> 'cancelled' and not (bumex_project_id = any($1::text[]))",
    [mirrored],
  );
}

// BUMEX One's projects, with what Vanguard shows of them (read with the server's own access: every entity).
async function readMissionSources(): Promise<{ missions: MissionSource[]; clients: ClientIdentity[] }> {
  const db = createAdminClient();
  if (!db) return { missions: [], clients: [] };
  const [projects, people, clients, members, tasks, entries] = await Promise.all([
    db.from("projects").select("id, name, client_id, status, owner_id, start_date, end_date, budget_amount, project_kind, manual_progress, entity_code")
      .returns<Pick<ProjectRecord, "id" | "name" | "client_id" | "status" | "owner_id" | "start_date" | "end_date" | "budget_amount" | "project_kind" | "manual_progress" | "entity_code">[]>(),
    db.from("profiles").select("id, full_name, entity_code").returns<Pick<Profile, "id" | "full_name" | "entity_code">[]>(),
    db.from("clients").select("id, name, contact_email, country, tax_id").returns<Pick<ClientRecord, "id" | "name" | "contact_email" | "country" | "tax_id">[]>(),
    db.from("project_members").select("project_id, user_id").returns<{ project_id: string; user_id: string }[]>(),
    db.from("tasks").select("project_id, status").returns<{ project_id: string | null; status: string }[]>(),
    db.from("time_entries").select("project_id, duration_minutes").returns<{ project_id: string; duration_minutes: number }[]>(),
  ]);
  for (const read of [projects, people, clients, members, tasks, entries]) if (read.error) throw new Error(read.error.message);

  const person = new Map((people.data ?? []).map((p) => [p.id, p]));
  const client = new Map((clients.data ?? []).map((c) => [c.id, c]));
  const group = <T,>(rows: T[], key: (row: T) => string | null) => {
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      if (k) out.set(k, [...(out.get(k) ?? []), row]);
    }
    return out;
  };
  const membersOf = group(members.data ?? [], (m) => m.project_id);
  const tasksOf = group(tasks.data ?? [], (t) => t.project_id);
  const entriesOf = group(entries.data ?? [], (e) => e.project_id);

  const identities = (clients.data ?? []).map((c) => ({ id: c.id, name: c.name, email: c.contact_email, country: c.country, taxId: c.tax_id }));
  const missions = (projects.data ?? []).flatMap((p): MissionSource[] => {
    const kind = p.project_kind ?? "client_mission";
    const entityCode = p.entity_code ?? person.get(p.owner_id)?.entity_code;
    if (!entityCode) return [];
    const c = p.client_id ? client.get(p.client_id) : undefined;
    // BUMEX One's rule (lib/projects/service.ts); it reads only the tickets' status
    const tickets = (tasksOf.get(p.id) ?? []) as unknown as ProjectTaskPreview[];
    const progress = p.status === "completed" ? 100 : (p.manual_progress ?? calculateProjectProgress(tickets));
    return [{
      projectId: p.id,
      entityCode,
      name: p.name,
      kind,
      status: p.status,
      startDate: p.start_date,
      endDate: p.end_date,
      budget: p.budget_amount ?? null,
      progress,
      hours: (entriesOf.get(p.id) ?? []).reduce((sum, e) => sum + (Number(e.duration_minutes) || 0), 0) / 60,
      staff: [...new Set((membersOf.get(p.id) ?? []).map((m) => person.get(m.user_id)?.full_name).filter((n): n is string => Boolean(n)).map(initialsOf))],
      client: c ? { id: c.id, name: c.name, email: c.contact_email, country: c.country, taxId: c.tax_id } : null,
    }];
  });
  return { missions, clients: identities };
}

// What the mirror depends on in BUMEX One: when none of these tables moved, nothing is read again (one document read).
const WATCHED = ["projects", "tasks", "project_members", "clients", "profiles", "time_entries"];

// The part of a screen's version that BUMEX One's data makes: its watched tables' counters only ever grow.
export async function bumexOneVersion() {
  const versions = await readTableVersions();
  return WATCHED.reduce((sum, table) => sum + versionOf(versions, table), 0);
}
const holder = globalThis as typeof globalThis & { __vanguardMissions?: { key: string; at: number } };

// force: right after a project was saved from Vanguard (its mission must exist before the ERP fields are written)
export async function syncMissions(actorId: string, { force = false } = {}) {
  try {
    const versions = await readTableVersions();
    const key = WATCHED.map((t) => versionOf(versions, t)).join(".");
    const last = holder.__vanguardMissions;
    // edits made outside the app move no counter: read again every 15 minutes anyway
    if (!force && last && last.key === key && Date.now() - last.at < 15 * 60_000) return;
    const { missions, clients } = await readMissionSources();
    await withErpSystemSession(actorId, async (tx) => {
      await mirrorClients(tx, clients);
      await mirrorMissions(tx, missions);
    });
    holder.__vanguardMissions = { key, at: Date.now() };
  } catch (error) {
    // Vanguard opens with the missions it has
    console.error("[erp:missions]", error instanceof Error ? error.message : error);
  }
}
