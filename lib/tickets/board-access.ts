import "server-only";

import { getProjectById } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";

/**
 * Who may configure a board's workflow: the people the row policies let manage the
 * project (admins, and managers who own it or are among its members).
 */
export async function canManageBoard(role: AppRole | null, userId: string, projectId: string) {
  if (role === "admin") {
    return true;
  }

  if (role !== "manager" || !projectId) {
    return false;
  }

  const project = await getProjectById(projectId);

  return Boolean(
    project
    && (project.owner_id === userId || project.members.some((member) => member.user?.id === userId)),
  );
}
