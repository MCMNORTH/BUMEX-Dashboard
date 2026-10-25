"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { canManageBoard } from "@/lib/tickets/board-access";
import { getBoardWorkflow } from "@/lib/tickets/workflow-service";
import type { BoardWorkflow } from "@/types/workflow";

// A mission's board in the Tasks room (vanguard/one/Board.tsx): its BUMEX One workflow (its own columns, or the
// built-in ones) and whether the person may change it. Moves go through BUMEX One's ticket action, which checks the
// workflow's rules again.
export type MissionBoard = { workflow: BoardWorkflow; canManage: boolean };

export async function missionBoardAction(projectId: string): Promise<MissionBoard> {
  const { auth } = await requireErpAccess();
  const [workflow, canManage] = await Promise.all([getBoardWorkflow(projectId), canManageBoard(auth.role, auth.profile.id, projectId)]);
  return { workflow, canManage };
}
