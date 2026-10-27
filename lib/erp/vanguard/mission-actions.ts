"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { loadVanguard, type VanguardResult } from "@/lib/erp/vanguard/run";
import { getCurrentLocale } from "@/lib/i18n/server";
import { validateProjectValues } from "@/lib/projects/form";
import { addProjectMember, removeProjectMember } from "@/lib/projects/members";
import { createProject, setMissionTerms, updateProject } from "@/lib/projects/service";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { BumexEntityCode } from "@/types/entity";
import type { ProjectFormValues } from "@/types/project";

// Vanguard's Missions room creates and edits missions (erp.engagement, every kind of project): the project's fields and
// its activity, notifications and default board (lib/projects/service.ts), its team (lib/projects/members.ts), and the
// ERP's own fields of the mission (fee type, hours budget).

export type MissionInput = ProjectFormValues & {
  project_id?: string;
  entity_id: string; // the ERP entity (Vanguard's floor)
  member_ids: string[];
  fee_type: "fixed" | "time";
  budget_hours: string;
};

export type MissionOptions = {
  clients: { id: string; name: string }[];
  people: { id: string; name: string }[];
  me: string;
};

// A mission's id, or the id its project had in BUMEX One (an old link, an e-mail sent before the move).
export async function resolveMissionId(id: string): Promise<string | null> {
  if (!id) return null;
  const row = await asPerson((tx) =>
    selectOne<{ id: string }>(tx, "select id from erp.engagement where id::text = $1 or bumex_project_id = $1 order by (id::text = $1) desc limit 1", [id]),
  ).catch(() => null);
  return row?.id ?? null;
}

// Who may create and edit missions, by ERP role: partners, the finance lead and the administrator any mission of
// the entities they see; managers the missions they lead (before and after the change).
async function missionAccess(input: MissionInput) {
  const { auth, access } = await requireErpAccess();
  const fr = (await getCurrentLocale()) === "fr";
  let allowed = ["admin", "partner", "raf"].includes(access.role);
  if (!allowed && access.role === "manager" && input.owner_id === auth.profile.id) {
    allowed = !input.project_id || (await missionDetailsAction(input.project_id))?.owner_id === auth.profile.id;
  }
  return { auth, access, fr, allowed };
}

// on a floor, its kind of clients: a test mission takes the test floor's, a real one the real ones (0011)
export async function missionOptionsAction(entityId?: string | null): Promise<MissionOptions> {
  const { auth } = await requireErpAccess();
  const { clients, people } = await asPerson(async (tx) => ({
    clients: await select<{ id: string; name: string }>(
      tx,
      "select id, name from work.client where $1::uuid is null or is_test = erp.is_test_entity($1::uuid) order by name",
      [entityId ?? null],
    ),
    people: await select<{ id: string; name: string }>(tx, "select id, coalesce(nullif(trim(full_name), ''), email) as name from work.person order by full_name"),
  }));
  return { clients, people, me: auth.profile.id };
}

// What the edit form starts from: the mission, its team and its ERP fields.
export async function missionDetailsAction(projectId: string): Promise<Omit<MissionInput, "entity_id"> | null> {
  await requireErpAccess();
  const id = await resolveMissionId(projectId);
  if (!id) return null;
  type Row = Record<string, string | number | null> & { member_ids: string[] };
  const mission = await asPerson((tx) =>
    selectOne<Row>(
      tx,
      `select e.id, e.name, e.client_id, e.description, e.owner_id, case when e.status = 'planned' then 'draft' else e.status::text end as status,
              e.start_date, e.deadline as end_date, e.fixed_fee::float8 as budget_amount, e.priority, coalesce(e.project_kind, 'client_mission') as project_kind,
              e.manual_progress, e.fee_type, e.budget_hours::float8 as budget_hours,
              coalesce((select array_agg(s.user_id order by s.user_id) from erp.engagement_staff s where s.engagement_id = e.id), '{}') as member_ids
         from erp.engagement e where e.id = $1::uuid`,
      [id],
    ),
  );
  if (!mission) return null;
  const text = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  return {
    project_id: id,
    name: text(mission.name),
    client_id: text(mission.client_id),
    description: text(mission.description),
    owner_id: text(mission.owner_id),
    status: (mission.status as ProjectFormValues["status"]) ?? "active",
    start_date: text(mission.start_date),
    end_date: text(mission.end_date),
    budget_amount: text(mission.budget_amount),
    priority: (mission.priority as ProjectFormValues["priority"]) ?? "",
    project_kind: (mission.project_kind as ProjectFormValues["project_kind"]) ?? "client_mission",
    manual_progress: text(mission.manual_progress),
    member_ids: mission.member_ids,
    fee_type: (mission.fee_type as MissionInput["fee_type"]) ?? "fixed",
    budget_hours: text(mission.budget_hours),
  };
}

export async function saveMissionAction(input: MissionInput): Promise<VanguardResult & { projectId?: string }> {
  const { auth, access, fr, allowed } = await missionAccess(input);
  const refuse = (error: string) => ({ ok: false as const, error });
  if (!allowed) {
    return refuse(fr ? "Votre rôle ERP ne permet pas de créer ou modifier cette mission." : "Your ERP role cannot create or edit this mission.");
  }
  // the floor's entity, among those the person sees
  const entity = await asPerson((tx) =>
    selectOne<{ code: BumexEntityCode }>(tx, "select code from erp.entity where id = $1::uuid and erp.can_see_entity(id)", [input.entity_id]),
  );
  if (!entity) return refuse(fr ? "Entité non autorisée." : "Entity not allowed.");
  const values: ProjectFormValues = {
    name: input.name.trim(),
    client_id: input.client_id,
    description: input.description.trim(),
    owner_id: input.owner_id,
    status: input.status,
    start_date: input.start_date,
    end_date: input.end_date,
    budget_amount: input.budget_amount.trim(),
    priority: input.priority,
    project_kind: input.project_kind,
    manual_progress: input.manual_progress.trim(),
  };
  const invalid = validateProjectValues(values, fr ? "fr" : "en");
  const hours = input.budget_hours.trim() === "" ? null : Number(input.budget_hours.replace(",", "."));
  if (invalid) return refuse(invalid);
  if (hours !== null && !(hours >= 0)) return refuse(fr ? "Le budget d'heures est un nombre positif." : "The hours budget is a positive number.");

  let projectId = input.project_id;
  try {
    if (projectId) await updateProject(projectId, values, auth.profile.id);
    else projectId = await createProject(values, auth.profile.id, entity.code);

    const id = projectId;
    const current = await asPerson((tx) => select<{ user_id: string }>(tx, "select user_id from erp.engagement_staff where engagement_id = $1::uuid", [id]));
    const before = new Set(current.map((m) => m.user_id));
    const after = new Set(input.member_ids);
    for (const person of after) if (!before.has(person)) await addProjectMember(id, person, auth.profile.id);
    for (const person of before) if (!after.has(person)) await removeProjectMember(id, person, auth.profile.id);
    await asPerson((tx) => setMissionTerms(tx, id, input.fee_type, hours));
  } catch (error) {
    console.error("[erp:missions] save", error instanceof Error ? error.message : error);
    return refuse(fr ? "La mission n'a pas pu être enregistrée." : "The mission could not be saved.");
  }

  return { ok: true, projectId, ...(await loadVanguard(auth.profile, access)) };
}
