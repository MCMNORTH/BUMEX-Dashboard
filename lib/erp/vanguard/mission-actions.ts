"use server";

import { withErpSession } from "@/lib/erp/db";
import { requireErpAccess } from "@/lib/erp/server";
import { syncMissions } from "@/lib/erp/vanguard/missions";
import { loadVanguard, type VanguardResult } from "@/lib/erp/vanguard/run";
import { createClient } from "@/lib/firebase/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { validateProjectValues } from "@/lib/projects/form";
import { addProjectMember, removeProjectMember } from "@/lib/projects/members";
import { createProject, updateProject } from "@/lib/projects/service";
import type { BumexEntityCode } from "@/types/entity";
import type { ProjectFormValues } from "@/types/project";

// Vanguard's Missions room creates and edits missions, which are BUMEX One's projects (lib/erp/vanguard/missions.ts):
// the project is saved with BUMEX One's own code (its activity log, notifications and default board), its team with
// BUMEX One's members, and the ERP's fields of the mission (fee type, hours budget) in erp.engagement.

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

export async function missionOptionsAction(): Promise<MissionOptions> {
  const { auth } = await requireErpAccess();
  const db = await createClient();
  if (!db) return { clients: [], people: [], me: auth.profile.id };
  const [clients, people] = await Promise.all([
    db.from("clients").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    db.from("profiles").select("id, full_name, email").order("full_name").returns<{ id: string; full_name: string | null; email: string }[]>(),
  ]);
  return {
    clients: clients.data ?? [],
    people: (people.data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email })),
    me: auth.profile.id,
  };
}

// What the edit form starts from: the project as BUMEX One has it, its team, and the mission's ERP fields.
export async function missionDetailsAction(projectId: string): Promise<Omit<MissionInput, "entity_id"> | null> {
  const { auth } = await requireErpAccess();
  const db = await createClient();
  if (!db || !projectId) return null;
  const [{ data: project }, { data: members }] = await Promise.all([
    db
      .from("projects")
      .select("id, name, client_id, description, owner_id, status, start_date, end_date, budget_amount, priority, project_kind, manual_progress, entity_code")
      .eq("id", projectId)
      .maybeSingle<Record<string, string | number | null>>(),
    db.from("project_members").select("user_id").eq("project_id", projectId).returns<{ user_id: string }[]>(),
  ]);
  if (!project) return null;
  const [mission] = await withErpSession(auth.profile.id, (tx) =>
    tx.query<{ fee_type: "fixed" | "time"; budget_hours: number | null }>(
      "select fee_type, budget_hours::float8 as budget_hours from erp.engagement where bumex_project_id = $1",
      [projectId],
    ),
  );
  const text = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  return {
    project_id: projectId,
    name: text(project.name),
    client_id: text(project.client_id),
    description: text(project.description),
    owner_id: text(project.owner_id),
    status: (project.status as ProjectFormValues["status"]) ?? "active",
    start_date: text(project.start_date),
    end_date: text(project.end_date),
    budget_amount: text(project.budget_amount),
    priority: (project.priority as ProjectFormValues["priority"]) ?? "",
    project_kind: (project.project_kind as ProjectFormValues["project_kind"]) ?? "client_mission",
    manual_progress: text(project.manual_progress),
    member_ids: (members ?? []).map((m) => m.user_id),
    fee_type: mission?.fee_type ?? "fixed",
    budget_hours: text(mission?.budget_hours),
  };
}

export async function saveMissionAction(input: MissionInput): Promise<VanguardResult & { projectId?: string }> {
  const { auth, access, fr, allowed } = await missionAccess(input);
  const refuse = (error: string) => ({ ok: false as const, error });
  if (!allowed) {
    return refuse(fr ? "Votre rôle ERP ne permet pas de créer ou modifier cette mission." : "Your ERP role cannot create or edit this mission.");
  }
  // the floor's entity, as BUMEX One codes it, among those the person sees
  const [entity] = await withErpSession(auth.profile.id, (tx) =>
    tx.query<{ code: BumexEntityCode }>("select code from erp.entity where id = $1 and erp.can_see_entity(id)", [input.entity_id]),
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

    // the team: BUMEX One's members of the project
    const db = await createClient();
    const { data: current } = db
      ? await db.from("project_members").select("user_id").eq("project_id", projectId).returns<{ user_id: string }[]>()
      : { data: [] };
    const before = new Set((current ?? []).map((m) => m.user_id));
    const after = new Set(input.member_ids);
    for (const id of after) if (!before.has(id)) await addProjectMember(projectId, id, auth.profile.id);
    for (const id of before) if (!after.has(id)) await removeProjectMember(projectId, id, auth.profile.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "staffed") {
      return refuse(fr ? "Une personne retirée de l'équipe a encore une affectation sur cette mission." : "A person removed from the team still has an assignment on this mission.");
    }
    console.error("[erp:missions] save", message);
    return refuse(fr ? "La mission n'a pas pu être enregistrée." : "The mission could not be saved.");
  }

  // the mission exists in the ERP now; its own fields go there
  await syncMissions(auth.profile.id, { force: true });
  await withErpSession(auth.profile.id, (tx) =>
    tx.query("update erp.engagement set fee_type = $2, budget_hours = $3 where bumex_project_id = $1", [projectId, input.fee_type, hours]),
  );
  return { ok: true, projectId, ...(await loadVanguard(auth.profile, access)) };
}
