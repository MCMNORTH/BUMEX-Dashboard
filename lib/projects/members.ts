import "server-only";

import { logActivity } from "@/lib/activity/service";
import { getBumexEntity } from "@/lib/entities/config";
import type { PickerPerson } from "@/lib/entities/people-options";
import { createClient } from "@/lib/firebase/server";
import { createAssignmentNotification } from "@/lib/notifications/service";
import { invalidateProjectReadCache } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

type CandidateRow = PickerPerson & { role: AppRole; availability_status: string | null };

async function requireDb() {
  const db = await createClient();

  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  return db;
}

/**
 * People who can join a project's team, from every entity: active staff who are
 * not on it yet. Shareholders are left out, as in Staffing.
 */
export async function getProjectMemberCandidates(memberIds: string[]): Promise<PickerPerson[]> {
  const db = await requireDb();
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, email, job_title, entity_code, role, availability_status")
    .neq("role", "shareholder")
    .order("full_name", { ascending: true })
    .returns<CandidateRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const members = new Set(memberIds);

  return (data ?? [])
    .filter((person) => !members.has(person.id) && person.availability_status !== "inactive")
    .map(({ id, full_name, email, job_title, entity_code }) => ({ id, full_name, email, job_title, entity_code }));
}

async function readProject(projectId: string) {
  const db = await requireDb();
  const { data: project } = await db
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string }>();

  if (!project) {
    throw new Error("Project not found.");
  }

  return { db, project };
}

// The row policies only let the project's managers write project_members, so a
// caller without that right gets a refused write rather than a silent change.
export async function addProjectMember(projectId: string, userId: string, actorUserId: string) {
  const { db, project } = await readProject(projectId);
  const { data: person } = await db
    .from("profiles")
    .select("id, full_name, role, availability_status, entity_code")
    .eq("id", userId)
    .maybeSingle<{ id: string; full_name: string; role: AppRole; availability_status: string | null; entity_code: BumexEntityCode | null }>();

  if (!person) {
    throw new Error("Person not found.");
  }

  if (person.availability_status === "inactive") {
    throw new Error("This person is inactive.");
  }

  if (person.role === "shareholder") {
    throw new Error("Shareholders cannot join a project team.");
  }

  const { error } = await db
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, role: person.role }, { onConflict: "project_id,user_id" });

  if (error) {
    throw new Error(error.message);
  }

  invalidateProjectReadCache();
  const entityName = getBumexEntity(person.entity_code)?.name;
  await logActivity({
    userId: actorUserId,
    action: `Added ${person.full_name} to the team`,
    entityType: "project",
    entityId: projectId,
    metadata: {
      kind: "assignment_change",
      summary: entityName ? `${person.full_name} (${entityName}) joined the team` : `${person.full_name} joined the team`,
      assignee_id: userId,
    },
  });
  await createAssignmentNotification({
    userId,
    skipUserId: actorUserId,
    title: "Added to a project team",
    body: `You were added to the ${project.name} team.`,
    entityType: "project",
    entityId: projectId,
  });
}

export async function removeProjectMember(projectId: string, userId: string, actorUserId: string) {
  const { db } = await readProject(projectId);
  const { count: staffed } = await db
    .from("staffing_assignments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .in("status", ["requested", "confirmed"]);

  // Staffing keeps the team in step with assignments, so it has to end them itself.
  if (staffed) {
    throw new Error("staffed");
  }

  const { data: removed, error } = await db
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!removed?.length) {
    throw new Error("This person could not be removed from the team.");
  }

  invalidateProjectReadCache();
  const { data: person } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle<{ full_name: string }>();
  await logActivity({
    userId: actorUserId,
    action: `Removed ${person?.full_name ?? "a member"} from the team`,
    entityType: "project",
    entityId: projectId,
    metadata: {
      kind: "assignment_change",
      summary: `${person?.full_name ?? "A member"} left the team`,
      assignee_id: userId,
    },
  });
}
