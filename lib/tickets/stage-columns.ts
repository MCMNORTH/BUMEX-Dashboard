// A board showing several missions (Vanguard's "all missions" board, My work's board) shows the stages of the boards
// in view, merged by name, as Jira shows a project's statuses (asked on 2026-10-28): "Code review" is one column
// whatever board it comes from. A card sits in its own stage's column; dropped on a column, it moves to the stage of
// that name on its own board, if its board has one. Nothing here touches the database.

import { findStage, getActiveStages, resolveTicketStageId, sortStages, stageStatus } from "@/lib/tickets/workflow";
import type { TicketStatus } from "@/types/ticket";
import type { BoardWorkflow, WorkflowStage } from "@/types/workflow";

export type StageColumn = {
  key: string; // the stage's name, folded: the same column on every board
  name: string; // as the first board in view writes it
  status: TicketStatus; // what its stages report as (their category, or done)
  completed: boolean;
  archived: boolean; // archived on every board that has it, but still holds cards: shown dashed so no card is hidden
  rank: number;
};

const ORDER: Record<string, number> = { backlog: 0, todo: 1, in_progress: 2, review: 3, blocked: 4, done: 5, archived: 6 };

/** "Code Review", "code review " and "Côde review" are one column. */
export function stageKey(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Where a stage stands: its status first (the order every board shares), then its place on its own board.
function rankOf(workflow: BoardWorkflow, stage: WorkflowStage) {
  const all = sortStages(workflow.stages);
  const place = all.length > 1 ? all.findIndex((s) => s.id === stage.id) / (all.length - 1) : 0;
  return ORDER[stageStatus(stage)] * 1000 + Math.round(place * 999);
}

/**
 * The columns of several boards. `occupied(projectId, stageId)` says whether a card is in that stage: an archived stage
 * becomes a column only then.
 */
export function mergeStageColumns(workflows: BoardWorkflow[], occupied: (projectId: string, stageId: string) => boolean = () => false): StageColumn[] {
  const columns = new Map<string, StageColumn>();
  for (const workflow of workflows) {
    for (const stage of sortStages(workflow.stages)) {
      const archived = Boolean(stage.archived_at);
      if (archived && !occupied(workflow.project_id, stage.id)) continue;
      const key = stageKey(stage.name);
      const rank = rankOf(workflow, stage);
      const seen = columns.get(key);
      if (!seen) {
        columns.set(key, { key, name: stage.name, status: stageStatus(stage), completed: stage.is_completed, archived, rank });
      } else {
        seen.archived &&= archived;
        if (!archived && rank < seen.rank) seen.rank = rank;
      }
    }
  }
  return [...columns.values()].sort((a, b) => Number(a.archived) - Number(b.archived) || a.rank - b.rank || a.name.localeCompare(b.name));
}

/** The column a ticket shows in: its stage's name on its board. */
export function columnOfTicket(workflow: BoardWorkflow, ticket: { stage_id?: string | null; status: TicketStatus }) {
  const stage = findStage(workflow, resolveTicketStageId(workflow, ticket));
  return stage ? stageKey(stage.name) : ticket.status;
}

/** Where a card dropped on a column goes on its own board: the active stage of that name, if the board has one. */
export function stageForColumn(workflow: BoardWorkflow, key: string) {
  return getActiveStages(workflow).find((stage) => stageKey(stage.name) === key);
}
