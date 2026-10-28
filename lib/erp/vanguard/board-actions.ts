"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { countCardsByStage } from "@/lib/tickets/service";
import { canManageFloorBoard, getBoardWorkflows, getFloorTicketStages, getFloorWorkflow } from "@/lib/tickets/workflow-service";
import { asPerson, select } from "@/lib/work/db";
import type { BoardWorkflow } from "@/types/workflow";

// The floor's board (0014: one per entity, which all its missions follow), for the Tasks room's board
// (vanguard/one/Board.tsx) and its editor ("Statuts et règles", vanguard/one/Workflow.tsx), and whether the person may
// change it. Moves go through BUMEX One's ticket action, which checks the board's rules again.
export type FloorBoard = { workflow: BoardWorkflow; canManage: boolean };

export async function floorBoardAction(entityId: string): Promise<FloorBoard | null> {
  await requireErpAccess();
  const id = String(entityId);
  const [workflow, canManage] = await Promise.all([getFloorWorkflow(id), canManageFloorBoard(id)]);
  return workflow ? { workflow, canManage } : null;
}

// The editor's: the board, how many cards each stage holds on the whole floor (a stage with cards cannot simply go),
// and the other floors' boards it can start from.
export type FloorBoardEditor = FloorBoard & { cardCounts: Record<string, number>; others: { id: string; name: string }[] };

export async function floorBoardEditorAction(entityId: string): Promise<FloorBoardEditor | null> {
  const { auth } = await requireErpAccess();
  const id = String(entityId);
  const [workflow, canManage, rows, others] = await Promise.all([
    getFloorWorkflow(id),
    canManageFloorBoard(id),
    getFloorTicketStages(id, auth.profile.id),
    asPerson((tx) => select<{ id: string; name: string }>(tx, "select f.entity_id::text as id, e.name from work.floor_board f join erp.entity e on e.id = f.entity_id where f.entity_id <> $1::uuid order by e.floor_order nulls last, e.name", [id])),
  ]);
  if (!workflow) return null;
  return { workflow, canManage, cardCounts: countCardsByStage(rows, workflow), others };
}

/** Another floor's board, to start from (its editor's "copy"). */
export async function floorBoardSourceAction(entityId: string): Promise<BoardWorkflow | null> {
  await requireErpAccess();
  return getFloorWorkflow(String(entityId));
}

// Every listed mission's board (its floor's), for the stage pickers and My work (vanguard/one/stages.tsx). The person's
// session reads them: a board they may not see is the built-in one, and moves are checked again anyway.
export async function boardWorkflowsAction(projectIds: string[]): Promise<Record<string, BoardWorkflow>> {
  await requireErpAccess();
  return getBoardWorkflows(projectIds.filter((id) => typeof id === "string").slice(0, 200));
}
