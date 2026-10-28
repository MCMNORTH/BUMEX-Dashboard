import type { TicketStatus } from "@/types/ticket";

/**
 * What a non-completed stage reports as. Filters, quick counts, reports and project
 * health read the ticket's `status`, which is derived from its stage: a completed
 * stage reports as "done", any other stage as its category.
 */
export type StageCategory = Exclude<TicketStatus, "done" | "archived">;

/** One column of a board. `id` never changes, whatever happens to the name or order. */
export type WorkflowStage = {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  is_completed: boolean;
  category: StageCategory;
  archived_at: string | null;
};

export type WorkflowSettings = {
  allow_backward: boolean;
  allow_skip_forward: boolean;
  allow_reopen: boolean;
  require_reason: boolean;
  custom_transitions_enabled: boolean;
};

/** A board's workflow: its floor's (0014), read under a mission's id or, in its editor, the floor's. */
export type BoardWorkflow = WorkflowSettings & {
  project_id: string;
  /** The floor (entity) whose board it is. */
  entity_id?: string | null;
  stages: WorkflowStage[];
  /** Source stage id → destination stage ids. Only read when custom transitions are enabled. */
  transitions: Record<string, string[]>;
  /** False while the board still runs on the built-in workflow (nothing was ever saved). */
  is_configured: boolean;
  updated_at: string | null;
};

export type TransitionErrorCode =
  | "unknown_stage"
  | "archived_stage"
  | "skip"
  | "backward"
  | "reopen"
  | "not_listed"
  | "no_matching_stage"
  | "reason_required"
  | "reporter_only";

export type TransitionError = {
  code: TransitionErrorCode;
  /** Stage names, so the message reads the same whichever way the move was attempted. */
  from: string;
  to: string;
  /** For "skip": the first stage the card would have jumped over. */
  via?: string;
  /** For "reason_required": what made the move need a reason. */
  needsReasonFor?: "backward" | "reopen";
  /** For "reporter_only": the ticket has no reporter, and the mover is its assignee. */
  noReporter?: boolean;
};

/** What a move depends on besides the board: who is making it (see getCompletionRule). */
export type TransitionOptions = {
  /** False when the mover may not move this ticket to a completed stage. */
  canComplete?: boolean;
  hasReporter?: boolean;
};

export type TransitionCheck =
  | { ok: true; noop: boolean; backward: boolean; reopen: boolean }
  | { ok: false; error: TransitionError };
