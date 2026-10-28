"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { countCardsByStage, syncTicketsToWorkflow } from "@/lib/tickets/service";
import {
  draftToWorkflow,
  findStage,
  normalizeWorkflowDraft,
  validateWorkflowDraft,
  type WorkflowDraft,
} from "@/lib/tickets/workflow";
import { canManageFloorBoard, getFloorTicketStages, getFloorWorkflow, saveFloorWorkflow } from "@/lib/tickets/workflow-service";
import type { BoardWorkflow, WorkflowSettings } from "@/types/workflow";

export type WorkflowActionState = {
  error?: string;
  success?: boolean;
  /** The saved version, to send back with the next save. */
  updatedAt?: string | null;
};

const settingLabels: Record<keyof WorkflowSettings, string> = {
  allow_backward: "backward movement",
  allow_skip_forward: "skipping forward",
  allow_reopen: "reopening",
  require_reason: "required reasons",
  custom_transitions_enabled: "custom transitions",
};

function summarizeChanges(previous: BoardWorkflow, next: WorkflowDraft) {
  const parts: string[] = [];

  for (const stage of next.stages) {
    const before = findStage(previous, stage.id);

    if (!before) {
      parts.push(`added ${stage.name}`);
      continue;
    }

    if (before.name !== stage.name) parts.push(`renamed ${before.name} to ${stage.name}`);
    if (!before.archived_at && stage.archived_at) parts.push(`archived ${stage.name}`);
    if (before.archived_at && !stage.archived_at) parts.push(`restored ${stage.name}`);
    if (!before.is_default && stage.is_default) parts.push(`${stage.name} is the default stage`);
    if (before.is_completed !== stage.is_completed) parts.push(`${stage.name} ${stage.is_completed ? "marks cards completed" : "no longer marks cards completed"}`);
    if (!stage.is_completed && before.category !== stage.category) parts.push(`${stage.name} counts as ${stage.category.replaceAll("_", " ")}`);
  }

  const order = (stages: { id: string; position: number }[]) =>
    [...stages].sort((left, right) => left.position - right.position).map((stage) => stage.id).join(",");

  if (previous.is_configured && order(previous.stages) !== order(next.stages.filter((stage) => findStage(previous, stage.id)))) {
    parts.push("reordered stages");
  }

  for (const key of Object.keys(settingLabels) as Array<keyof WorkflowSettings>) {
    if (previous[key] !== next[key]) parts.push(`${next[key] ? "enabled" : "disabled"} ${settingLabels[key]}`);
  }

  if (JSON.stringify(previous.transitions) !== JSON.stringify(next.transitions) && next.custom_transitions_enabled) {
    parts.push("updated allowed transitions");
  }

  return parts.length ? `Workflow: ${parts.join("; ")}.` : "Workflow saved without changes.";
}

// A floor's board (0014: every mission of the floor follows it). Saved by the administrators and the floor's managers;
// checked against every ticket of the floor; no card changes stage.
export async function saveFloorBoardAction(
  entityId: string,
  draft: WorkflowDraft,
  expectedUpdatedAt: string | null,
): Promise<WorkflowActionState> {
  const auth = await requireRouteAccess("projects");
  const locale = await getCurrentLocale();
  const fr = locale === "fr";
  const id = String(entityId);

  if (!(await canManageFloorBoard(id))) {
    return { error: fr ? "Seuls l’administrateur et les managers de l’étage changent son tableau." : "Only the administrator and the floor's managers change its board." };
  }

  if (!draft || !Array.isArray(draft.stages)) {
    return { error: fr ? "Configuration invalide." : "Invalid workflow configuration." };
  }

  const previous = await getFloorWorkflow(id);
  if (!previous) {
    return { error: fr ? "Ce tableau est introuvable." : "This board cannot be found." };
  }

  // Two managers editing at once: the second save must not silently undo the first.
  if ((previous.updated_at ?? null) !== (expectedUpdatedAt ?? null)) {
    return {
      error: fr
        ? "Quelqu’un d’autre a modifié ce tableau entre-temps. Rechargez la page pour voir la dernière version."
        : "Someone else changed this board in the meantime. Reload the page to see the latest version.",
    };
  }

  const now = new Date().toISOString();
  const normalized = normalizeWorkflowDraft(draft);
  // Archive dates come from the server, and keep their original value.
  normalized.stages = normalized.stages.map((stage) => ({
    ...stage,
    archived_at: stage.archived_at ? findStage(previous, stage.id)?.archived_at ?? now : null,
  }));

  const rows = await getFloorTicketStages(id, auth.profile.id);
  const validationError = validateWorkflowDraft(normalized, previous, countCardsByStage(rows, previous), locale);

  if (validationError) {
    return { error: validationError };
  }

  try {
    await saveFloorWorkflow(id, normalized, auth.profile.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  // Pins tickets to the stage they were already in; no card changes stage.
  await syncTicketsToWorkflow(rows, previous, draftToWorkflow(normalized, id), auth.profile.id);
  console.info(`[floor-board] ${id} by ${auth.profile.id}: ${summarizeChanges(previous, normalized)}`);

  const saved = await getFloorWorkflow(id);
  return { success: true, updatedAt: saved?.updated_at ?? null };
}
