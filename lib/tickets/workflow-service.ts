import "server-only";

import { createClient } from "@/lib/firebase/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getLegacyWorkflow, getNewBoardWorkflow, type WorkflowDraft } from "@/lib/tickets/workflow";
import type { BoardWorkflow, WorkflowStage } from "@/types/workflow";

const WORKFLOW_COLUMNS =
  "id, project_id, stages, transitions, allow_backward, allow_skip_forward, allow_reopen, require_reason, custom_transitions_enabled, updated_at";

type WorkflowRow = {
  id: string;
  project_id: string;
  stages: WorkflowStage[] | null;
  transitions: Record<string, string[]> | null;
  allow_backward: boolean | null;
  allow_skip_forward: boolean | null;
  allow_reopen: boolean | null;
  require_reason: boolean | null;
  custom_transitions_enabled: boolean | null;
  updated_at: string | null;
};

async function getClient() {
  const db = await createClient();

  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  return db;
}

function mapWorkflow(row: WorkflowRow): BoardWorkflow {
  return {
    project_id: row.project_id,
    stages: (row.stages ?? []).map((stage) => ({
      id: String(stage.id),
      name: String(stage.name),
      position: Number(stage.position) || 0,
      is_default: Boolean(stage.is_default),
      is_completed: Boolean(stage.is_completed),
      category: stage.category,
      archived_at: stage.archived_at ?? null,
    })),
    transitions: row.transitions ?? {},
    allow_backward: Boolean(row.allow_backward),
    allow_skip_forward: Boolean(row.allow_skip_forward),
    allow_reopen: Boolean(row.allow_reopen),
    require_reason: Boolean(row.require_reason),
    custom_transitions_enabled: Boolean(row.custom_transitions_enabled),
    is_configured: true,
    updated_at: row.updated_at,
  };
}

/** Saved workflows only, keyed by project id. Boards missing here use the built-in stages. */
export async function getConfiguredWorkflows(projectIds: string[]): Promise<Map<string, BoardWorkflow>> {
  const ids = [...new Set(projectIds.filter(Boolean))];

  if (!ids.length) {
    return new Map();
  }

  const db = await getClient();
  const { data, error } = await db
    .from("project_workflows")
    .select(WORKFLOW_COLUMNS)
    .in("id", ids)
    .returns<WorkflowRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.project_id, mapWorkflow(row)]));
}

export async function getBoardWorkflow(projectId: string): Promise<BoardWorkflow> {
  const [configured, locale] = await Promise.all([getConfiguredWorkflows([projectId]), getCurrentLocale()]);
  return configured.get(projectId) ?? getLegacyWorkflow(projectId, locale);
}

/** Every listed board's workflow, built-in ones included, for the browser. */
export async function getBoardWorkflows(projectIds: string[]): Promise<Record<string, BoardWorkflow>> {
  const [configured, locale] = await Promise.all([getConfiguredWorkflows(projectIds), getCurrentLocale()]);

  return Object.fromEntries(
    [...new Set(projectIds.filter(Boolean))].map((id) => [id, configured.get(id) ?? getLegacyWorkflow(id, locale)]),
  );
}

/** New projects start with the restrictive To do → In progress → In review → Done board. */
export async function createDefaultBoardWorkflow(projectId: string, actorUserId: string) {
  const locale = await getCurrentLocale();
  const workflow = getNewBoardWorkflow(projectId, locale);
  const db = await getClient();
  const { error } = await db.from("project_workflows").insert({
    id: projectId,
    project_id: projectId,
    stages: workflow.stages,
    transitions: workflow.transitions,
    allow_backward: workflow.allow_backward,
    allow_skip_forward: workflow.allow_skip_forward,
    allow_reopen: workflow.allow_reopen,
    require_reason: workflow.require_reason,
    custom_transitions_enabled: workflow.custom_transitions_enabled,
    updated_by: actorUserId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** Writes a draft that already passed validateWorkflowDraft. */
export async function saveBoardWorkflow(previous: BoardWorkflow, draft: WorkflowDraft, actorUserId: string) {
  const db = await getClient();
  const payload = {
    stages: draft.stages,
    transitions: draft.transitions,
    allow_backward: draft.allow_backward,
    allow_skip_forward: draft.allow_skip_forward,
    allow_reopen: draft.allow_reopen,
    require_reason: draft.require_reason,
    custom_transitions_enabled: draft.custom_transitions_enabled,
    updated_by: actorUserId,
  };

  const { data, error } = previous.is_configured
    ? await db.from("project_workflows").update(payload).eq("id", previous.project_id).select("id")
    : await db.from("project_workflows").insert({ id: previous.project_id, project_id: previous.project_id, ...payload }).select("id");

  if (error) {
    throw new Error(error.message);
  }

  // Row policies skip rows the caller may not update instead of failing.
  if (!data?.length) {
    throw new Error("You do not have permission to change this board's workflow.");
  }
}
