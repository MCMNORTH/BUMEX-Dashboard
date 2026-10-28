// Board workflow rules, shared by the server (which enforces them on every stage
// change) and the browser (which uses them to explain a move before sending it).
// Nothing here touches the database.

import type { TicketStatus } from "@/types/ticket";
import type {
  BoardWorkflow,
  StageCategory,
  TransitionCheck,
  TransitionError,
  TransitionOptions,
  WorkflowSettings,
  WorkflowStage,
} from "@/types/workflow";

type Locale = "en" | "fr";

export const STAGE_CATEGORIES: StageCategory[] = ["backlog", "todo", "in_progress", "review", "blocked"];
export const STAGE_NAME_MAX_LENGTH = 40;
export const MAX_ACTIVE_STAGES = 12;
export const MOVE_REASON_MAX_LENGTH = 500;

/** Form value of the "Archived" choice in a ticket's stage picker. Never a stage id. */
export const ARCHIVED_STAGE_VALUE = "archived";

const STAGE_ID_PATTERN = /^[a-z0-9_]{1,40}$/;

type BuiltInStage = StageCategory | "done";

const builtInStageNames: Record<Locale, Record<BuiltInStage, string>> = {
  en: { backlog: "Backlog", todo: "To do", in_progress: "In progress", review: "Review", blocked: "Blocked", done: "Done" },
  fr: { backlog: "En attente", todo: "À faire", in_progress: "En cours", review: "En révision", blocked: "Bloqué", done: "Terminé" },
};

export function getStageCategoryLabel(category: TicketStatus, locale: Locale) {
  if (category === "archived") {
    return locale === "fr" ? "Archivé" : "Archived";
  }

  return builtInStageNames[locale][category];
}

function builtInStage(id: BuiltInStage, position: number, name: string, isDefault: boolean): WorkflowStage {
  return {
    id,
    name,
    position,
    is_default: isDefault,
    is_completed: id === "done",
    // Ignored while the stage is completed; it is what the stage reports as if that flag is cleared.
    category: id === "done" ? "in_progress" : id,
    archived_at: null,
  };
}

/**
 * The workflow of a board nothing was ever saved for: the six columns every board had
 * before workflows existed, with free movement. Stage ids equal the old statuses, so
 * existing tickets land in their current column without any data migration.
 */
export function getLegacyWorkflow(projectId: string, locale: Locale = "en"): BoardWorkflow {
  const names = builtInStageNames[locale];
  const ids: BuiltInStage[] = ["backlog", "todo", "in_progress", "review", "blocked", "done"];

  return {
    project_id: projectId,
    stages: ids.map((id, position) => builtInStage(id, position, names[id], id === "todo")),
    transitions: {},
    allow_backward: true,
    allow_skip_forward: true,
    allow_reopen: true,
    require_reason: false,
    custom_transitions_enabled: false,
    is_configured: false,
    updated_at: null,
  };
}

/** Restrictive defaults given to boards (projects) created once workflows exist. */
export const NEW_BOARD_SETTINGS: WorkflowSettings = {
  allow_backward: false,
  allow_skip_forward: false,
  allow_reopen: false,
  require_reason: false,
  custom_transitions_enabled: false,
};

export function getNewBoardWorkflow(projectId: string, locale: Locale = "en"): BoardWorkflow {
  const fr = locale === "fr";

  return {
    project_id: projectId,
    stages: [
      builtInStage("todo", 0, fr ? "À faire" : "To do", true),
      builtInStage("in_progress", 1, fr ? "En cours" : "In progress", false),
      builtInStage("review", 2, fr ? "En révision" : "In review", false),
      builtInStage("done", 3, fr ? "Terminé" : "Done", false),
    ],
    transitions: {},
    ...NEW_BOARD_SETTINGS,
    is_configured: true,
    updated_at: null,
  };
}

export function createStageId() {
  return `stg_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

// ---- reading a workflow ------------------------------------------------------

export function sortStages(stages: WorkflowStage[]) {
  return [...stages].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

export function getActiveStages(workflow: BoardWorkflow) {
  return sortStages(workflow.stages.filter((stage) => !stage.archived_at));
}

export function findStage(workflow: BoardWorkflow, stageId: string | null | undefined) {
  return stageId ? workflow.stages.find((stage) => stage.id === stageId) : undefined;
}

export function getDefaultStage(workflow: BoardWorkflow): WorkflowStage {
  const active = getActiveStages(workflow);
  return active.find((stage) => stage.is_default) ?? active[0] ?? sortStages(workflow.stages)[0];
}

/** The status a ticket in this stage carries for filters, reports and project health. */
export function stageStatus(stage: Pick<WorkflowStage, "is_completed" | "category">): TicketStatus {
  return stage.is_completed ? "done" : stage.category;
}

/**
 * The stage a ticket is in. Tickets saved before workflows existed have no `stage_id`;
 * their status is their stage on a built-in board.
 */
export function resolveTicketStageId(
  workflow: BoardWorkflow,
  ticket: { stage_id?: string | null; status: TicketStatus },
): string {
  if (findStage(workflow, ticket.stage_id)) {
    return ticket.stage_id!;
  }

  if (findStage(workflow, ticket.status)) {
    return ticket.status;
  }

  const active = getActiveStages(workflow);

  if (ticket.status === "done" || ticket.status === "archived") {
    const completed = active.find((stage) => stage.is_completed)
      ?? sortStages(workflow.stages).find((stage) => stage.is_completed);

    if (completed) {
      return completed.id;
    }
  }

  return active.find((stage) => !stage.is_completed && stage.category === ticket.status)?.id
    ?? getDefaultStage(workflow).id;
}

/** The first active completed stage: where a reporter's sign-off puts a ticket. */
export function getCompletedStage(workflow: BoardWorkflow) {
  return getActiveStages(workflow).find((stage) => stage.is_completed);
}

/**
 * Where finished work waits for the reporter: the last active stage before the completed
 * one. Blocked stages are skipped, since the built-in board puts Blocked between Review
 * and Done.
 */
export function getSignOffStage(workflow: BoardWorkflow) {
  const active = getActiveStages(workflow);
  const completedIndex = active.findIndex((stage) => stage.is_completed);

  return completedIndex > 0
    ? active.slice(0, completedIndex).reverse().find((stage) => stage.category !== "blocked")
    : undefined;
}

// ---- movement rules ----------------------------------------------------------

/**
 * Moving a ticket into a completed stage is its reporter's sign-off, so the assignee
 * cannot close their own work. A ticket without a reporter may be completed by anyone
 * else who may move it.
 */
export function getCompletionRule(
  ticket: { reporter_id: string | null; assignee_id: string | null },
  userId: string,
): TransitionOptions {
  return {
    canComplete: ticket.reporter_id ? ticket.reporter_id === userId : ticket.assignee_id !== userId,
    hasReporter: Boolean(ticket.reporter_id),
  };
}

function fail(error: TransitionError): TransitionCheck {
  return { ok: false, error };
}

/**
 * Whether a card may move from one stage to another. Who may complete it is checked
 * first; then either the custom transition list, when enabled (it then says alone which
 * moves exist: backward, skipping and reopening are what it lists, 2026-10-28), or the
 * board-level settings; then the reason requirement, for a move back or a reopening.
 */
export function evaluateTransition(
  workflow: BoardWorkflow,
  fromStageId: string,
  toStageId: string,
  reason?: string | null,
  options: TransitionOptions = {},
): TransitionCheck {
  const from = findStage(workflow, fromStageId);
  const to = findStage(workflow, toStageId);

  if (!to) {
    return fail({ code: "unknown_stage", from: from?.name ?? fromStageId, to: toStageId });
  }

  if (from && from.id === to.id) {
    return { ok: true, noop: true, backward: false, reopen: false };
  }

  if (to.archived_at) {
    return fail({ code: "archived_stage", from: from?.name ?? fromStageId, to: to.name });
  }

  // Checked before the stranded-card escape below, so no route around the reporter exists.
  if (to.is_completed && !from?.is_completed && options.canComplete === false) {
    return fail({ code: "reporter_only", from: from?.name ?? fromStageId, to: to.name, noReporter: options.hasReporter === false });
  }

  // A card whose stage is gone or archived is outside the workflow: it may be put back
  // on any active stage, so it can never get stuck.
  if (!from || from.archived_at) {
    return { ok: true, noop: false, backward: false, reopen: false };
  }

  const backward = to.position < from.position;
  const reopen = from.is_completed && !to.is_completed;

  if (workflow.custom_transitions_enabled) {
    if (!(workflow.transitions[from.id] ?? []).includes(to.id)) {
      return fail({ code: "not_listed", from: from.name, to: to.name });
    }
  } else {
    if (reopen && !workflow.allow_reopen) {
      return fail({ code: "reopen", from: from.name, to: to.name });
    }

    if (backward && !workflow.allow_backward) {
      return fail({ code: "backward", from: from.name, to: to.name });
    }

    if (!backward && !workflow.allow_skip_forward) {
      const skipped = getActiveStages(workflow).filter(
        (stage) => stage.position > from.position && stage.position < to.position,
      );

      if (skipped.length) {
        return fail({ code: "skip", from: from.name, to: to.name, via: skipped[0].name });
      }
    }
  }

  if (workflow.require_reason && (backward || reopen) && !reason?.trim()) {
    return fail({ code: "reason_required", from: from.name, to: to.name, needsReasonFor: reopen ? "reopen" : "backward" });
  }

  return { ok: true, noop: false, backward, reopen };
}

/** The moves the board's settings allow, as a custom transition list: where the editor's list starts from. */
export function transitionsFromSettings(workflow: BoardWorkflow): Record<string, string[]> {
  const board = { ...workflow, custom_transitions_enabled: false, require_reason: false };
  const active = getActiveStages(board);
  return Object.fromEntries(
    active.map((from) => [from.id, active.filter((to) => to.id !== from.id && evaluateTransition(board, from.id, to.id).ok).map((to) => to.id)]),
  );
}

/**
 * With a custom transition list: the active stages no card can leave (a completed one excepted: work ends there) and
 * those no card can reach (the default one excepted: new tickets start there).
 */
export function strandedStages(workflow: BoardWorkflow) {
  if (!workflow.custom_transitions_enabled) return { noWayOut: [], noWayIn: [] };
  const active = getActiveStages(workflow);
  const ids = new Set(active.map((stage) => stage.id));
  const out = (id: string) => (workflow.transitions[id] ?? []).some((to) => ids.has(to) && to !== id);
  const into = (id: string) => active.some((from) => from.id !== id && (workflow.transitions[from.id] ?? []).includes(id));
  return {
    noWayOut: active.filter((stage) => !stage.is_completed && !out(stage.id)),
    noWayIn: active.filter((stage) => !stage.is_default && !into(stage.id)),
  };
}

export type CategoryTarget =
  | { ok: true; stageId: string; noop: boolean }
  | { ok: false; error: TransitionError; stageId?: string };

/**
 * Boards that mix several projects show one column per status instead of per stage.
 * Dropping a card there picks the first stage of the card's own board that reports as
 * that status and that the card may move to.
 */
export function resolveCategoryTarget(
  workflow: BoardWorkflow,
  fromStageId: string,
  category: TicketStatus,
  locale: Locale,
  reason?: string | null,
  options: TransitionOptions = {},
): CategoryTarget {
  const candidates = getActiveStages(workflow).filter((stage) => stageStatus(stage) === category);

  if (candidates.some((stage) => stage.id === fromStageId)) {
    return { ok: true, stageId: fromStageId, noop: true };
  }

  if (!candidates.length) {
    return {
      ok: false,
      error: {
        code: "no_matching_stage",
        from: findStage(workflow, fromStageId)?.name ?? fromStageId,
        to: getStageCategoryLabel(category, locale),
      },
    };
  }

  const checks = candidates.map((stage) => ({ stage, check: evaluateTransition(workflow, fromStageId, stage.id, reason, options) }));
  const allowed = checks.find((entry) => entry.check.ok);

  if (allowed) {
    return { ok: true, stageId: allowed.stage.id, noop: false };
  }

  const needsReason = checks.find((entry) => !entry.check.ok && entry.check.error.code === "reason_required");
  const chosen = needsReason ?? checks[0];

  return { ok: false, error: (chosen.check as Extract<TransitionCheck, { ok: false }>).error, stageId: chosen.stage.id };
}

export function describeTransitionError(error: TransitionError, locale: Locale) {
  const fr = locale === "fr";

  switch (error.code) {
    case "unknown_stage":
      return fr ? "Cette étape n’existe pas sur le tableau de ce ticket." : "That stage does not exist on this ticket's board.";
    case "archived_stage":
      return fr ? `L’étape « ${error.to} » est archivée. Choisissez une étape active.` : `"${error.to}" is archived. Pick an active stage.`;
    case "skip":
      return fr
        ? `Les cartes doivent passer par « ${error.via} » avant « ${error.to} ».`
        : `Cards must pass through ${error.via} before moving to ${error.to}.`;
    case "backward":
      return fr ? "Le retour à une étape précédente est désactivé sur ce tableau." : "Backward movement is disabled for this board.";
    case "reopen":
      return fr ? "La réouverture des cartes terminées est désactivée." : "Reopening completed cards is disabled.";
    case "not_listed":
      return fr
        ? `Le passage de « ${error.from} » à « ${error.to} » n’est pas autorisé sur ce tableau.`
        : `Moving from ${error.from} to ${error.to} is not an allowed transition on this board.`;
    case "no_matching_stage":
      return fr
        ? `Le tableau de ce ticket n’a pas d’étape « ${error.to} ».`
        : `This ticket's board has no "${error.to}" stage.`;
    case "reason_required":
      return error.needsReasonFor === "reopen"
        ? (fr ? "Indiquez une raison pour rouvrir une carte terminée." : "A reason is required to reopen a completed card.")
        : (fr ? "Indiquez une raison pour ramener une carte à une étape précédente." : "A reason is required to move a card backward.");
    case "reporter_only":
      if (error.noReporter) {
        return fr
          ? `Ce ticket n’a pas de rapporteur, et son assigné ne peut pas le passer à « ${error.to} ».`
          : `This ticket has no reporter, and its assignee cannot move it to ${error.to}.`;
      }

      return fr
        ? `Seul le rapporteur du ticket peut le passer à « ${error.to} ».`
        : `Only the ticket's reporter can move it to ${error.to}.`;
  }
}

// ---- editing a workflow ------------------------------------------------------

export type WorkflowDraft = WorkflowSettings & {
  /** In board order; positions are reassigned from this order when saved. */
  stages: WorkflowStage[];
  transitions: Record<string, string[]>;
};

/** Trims names, renumbers positions, and drops transitions that point nowhere. */
export function normalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  const stages = draft.stages.map((stage, position) => ({
    id: String(stage.id),
    name: String(stage.name ?? "").trim().replace(/\s+/g, " "),
    position,
    is_default: Boolean(stage.is_default) && !stage.archived_at,
    is_completed: Boolean(stage.is_completed),
    category: stage.category,
    archived_at: stage.archived_at ? String(stage.archived_at) : null,
  }));
  const ids = new Set(stages.map((stage) => stage.id));
  const transitions: Record<string, string[]> = {};

  for (const [from, destinations] of Object.entries(draft.transitions ?? {})) {
    if (!ids.has(from) || !Array.isArray(destinations)) continue;
    const valid = [...new Set(destinations.map(String))].filter((to) => ids.has(to) && to !== from);
    if (valid.length) transitions[from] = valid;
  }

  return {
    stages,
    transitions,
    allow_backward: Boolean(draft.allow_backward),
    allow_skip_forward: Boolean(draft.allow_skip_forward),
    allow_reopen: Boolean(draft.allow_reopen),
    require_reason: Boolean(draft.require_reason),
    custom_transitions_enabled: Boolean(draft.custom_transitions_enabled),
  };
}

/**
 * Checks a normalized draft against the board as it is saved now.
 * `cardCounts` is the number of non-archived tickets per stage id.
 */
export function validateWorkflowDraft(
  draft: WorkflowDraft,
  previous: BoardWorkflow,
  cardCounts: Record<string, number>,
  locale: Locale,
): string | null {
  const fr = locale === "fr";
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const stage of draft.stages) {
    if (!STAGE_ID_PATTERN.test(stage.id) || ids.has(stage.id)) {
      return fr ? "Identifiant d’étape invalide. Rechargez la page." : "Invalid stage identifier. Reload the page.";
    }

    ids.add(stage.id);

    if (!stage.name) {
      return fr ? "Chaque étape doit avoir un nom." : "Every stage needs a name.";
    }

    if (stage.name.length > STAGE_NAME_MAX_LENGTH) {
      return fr
        ? `Les noms d’étape sont limités à ${STAGE_NAME_MAX_LENGTH} caractères.`
        : `Stage names are limited to ${STAGE_NAME_MAX_LENGTH} characters.`;
    }

    const key = stage.name.toLocaleLowerCase();

    if (names.has(key)) {
      return fr ? `Deux étapes s’appellent « ${stage.name} ». Les noms doivent être uniques.` : `Two stages are named "${stage.name}". Stage names must be unique.`;
    }

    names.add(key);

    if (!STAGE_CATEGORIES.includes(stage.category)) {
      return fr ? `Catégorie invalide pour « ${stage.name} ».` : `Invalid category for "${stage.name}".`;
    }
  }

  // Stages are archived, never deleted, so tickets and history always resolve.
  const missing = previous.stages.find((stage) => !ids.has(stage.id));

  if (missing) {
    return fr
      ? `L’étape « ${missing.name} » ne peut pas être supprimée ; archivez-la à la place.`
      : `"${missing.name}" cannot be deleted; archive it instead.`;
  }

  const active = draft.stages.filter((stage) => !stage.archived_at);

  if (!active.length) {
    return fr ? "Un tableau doit garder au moins une étape active." : "A board must keep at least one active stage.";
  }

  if (active.length > MAX_ACTIVE_STAGES) {
    return fr ? `Un tableau est limité à ${MAX_ACTIVE_STAGES} étapes actives.` : `A board is limited to ${MAX_ACTIVE_STAGES} active stages.`;
  }

  const defaults = active.filter((stage) => stage.is_default);

  if (defaults.length !== 1) {
    return fr ? "Choisissez exactement une étape active par défaut pour les nouveaux tickets." : "Choose exactly one active default stage for new tickets.";
  }

  // a custom list with no move at all would freeze every card
  if (draft.custom_transitions_enabled && !active.some((stage) => (draft.transitions[stage.id] ?? []).some((to) => active.some((other) => other.id === to)))) {
    return fr
      ? "Les transitions personnalisées sont activées mais aucun déplacement n’est coché : aucune carte ne pourrait bouger."
      : "Custom transitions are on but no move is ticked: no card could move.";
  }

  for (const stage of draft.stages) {
    const wasActive = !findStage(previous, stage.id)?.archived_at;
    const cards = cardCounts[stage.id] ?? 0;

    if (stage.archived_at && wasActive && cards > 0) {
      return fr
        ? `« ${stage.name} » contient encore ${cards} ticket(s). Déplacez-les vers une autre étape active avant de l’archiver.`
        : `"${stage.name}" still holds ${cards} ticket${cards === 1 ? "" : "s"}. Move ${cards === 1 ? "it" : "them"} to another active stage before archiving it.`;
    }
  }

  return null;
}

/** The settings form starts from this: the saved board, in order. */
export function toWorkflowDraft(workflow: BoardWorkflow): WorkflowDraft {
  return {
    stages: sortStages(workflow.stages),
    transitions: workflow.transitions,
    allow_backward: workflow.allow_backward,
    allow_skip_forward: workflow.allow_skip_forward,
    allow_reopen: workflow.allow_reopen,
    require_reason: workflow.require_reason,
    custom_transitions_enabled: workflow.custom_transitions_enabled,
  };
}

export function draftToWorkflow(draft: WorkflowDraft, projectId: string): BoardWorkflow {
  return { ...draft, project_id: projectId, is_configured: true, updated_at: null };
}
