"use server";

import { revalidatePath } from "next/cache";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { addProjectMember, removeProjectMember } from "@/lib/projects/members";
import { canManageBoard } from "@/lib/tickets/board-access";

export type ProjectMemberActionResult = { ok: true } | { ok: false; error: string };

async function runMemberChange(
  projectId: string,
  userId: string,
  change: (projectId: string, userId: string, actorUserId: string) => Promise<void>,
): Promise<ProjectMemberActionResult> {
  const auth = await requireRouteAccess("projects");
  const isFr = (await getCurrentLocale()) === "fr";

  if (!projectId || !userId) {
    return { ok: false, error: isFr ? "Choisissez une personne." : "Choose a person." };
  }

  // The project's managers: admins, and managers who own it or are on its team.
  if (!(await canManageBoard(auth.role, auth.profile.id, projectId))) {
    return {
      ok: false,
      error: isFr ? "Vous ne pouvez pas gérer l’équipe de ce projet." : "You can't manage this project's team.",
    };
  }

  try {
    await change(projectId, userId, auth.profile.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, error: message || (isFr ? "L’équipe n’a pas pu être modifiée." : "The team could not be updated.") };
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function addProjectMemberAction(projectId: string, userId: string) {
  return runMemberChange(projectId, userId, addProjectMember);
}

export async function removeProjectMemberAction(projectId: string, userId: string) {
  return runMemberChange(projectId, userId, removeProjectMember);
}
