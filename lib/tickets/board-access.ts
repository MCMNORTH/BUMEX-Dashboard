import "server-only";

import { asPerson, selectOne } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";

/**
 * Who may configure a board's workflow and its team: the people the rules let manage the mission (administrators, and
 * managers who own it or are among its members: work.can_manage_project).
 */
export async function canManageBoard(role: AppRole | null, _userId: string, projectId: string) {
  if (role === "admin") return true;
  if (role !== "manager" || !projectId) return false;
  const row = await asPerson((tx) => selectOne<{ ok: boolean }>(tx, "select work.can_manage_project($1::uuid) as ok", [projectId])).catch(() => null);
  return Boolean(row?.ok);
}
