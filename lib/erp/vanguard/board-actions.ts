"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { canManageBoard } from "@/lib/tickets/board-access";
import { getBoardWorkflow, getBoardWorkflows } from "@/lib/tickets/workflow-service";
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

// Every listed mission's board, for the stage pickers and the cross-mission board (vanguard/one/stages.tsx). The
// person's session reads them: a board they may not see is the built-in one, and moves are checked again anyway.
export async function boardWorkflowsAction(projectIds: string[]): Promise<Record<string, BoardWorkflow>> {
  await requireErpAccess();
  return getBoardWorkflows(projectIds.filter((id) => typeof id === "string").slice(0, 200));
}
