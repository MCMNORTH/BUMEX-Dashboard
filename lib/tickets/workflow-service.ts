import "server-only";

import { getCurrentLocale } from "@/lib/i18n/server";
import { getLegacyWorkflow, getNewBoardWorkflow, type WorkflowDraft } from "@/lib/tickets/workflow";
import { asPerson, select } from "@/lib/work/db";
import type { BoardWorkflow, WorkflowStage } from "@/types/workflow";

// A mission's board: work.board (0008), one row per mission that saved its workflow.
const WORKFLOW_COLUMNS =
  "engagement_id as id, engagement_id as project_id, stages, transitions, allow_backward, allow_skip_forward, allow_reopen, require_reason, custom_transitions_enabled, updated_at";

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

  const rows = await asPerson((tx) => select<WorkflowRow>(tx, `select ${WORKFLOW_COLUMNS} from work.board where engagement_id = any($1::uuid[])`, [ids]));
  return new Map(rows.map((row) => [row.project_id, mapWorkflow(row)]));
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
  await asPerson((tx) =>
    tx.query(
      `insert into work.board (engagement_id, stages, transitions, allow_backward, allow_skip_forward, allow_reopen, require_reason,
                               custom_transitions_enabled, updated_by)
       values ($1::uuid, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9)`,
      [projectId, JSON.stringify(workflow.stages), JSON.stringify(workflow.transitions), workflow.allow_backward, workflow.allow_skip_forward,
        workflow.allow_reopen, workflow.require_reason, workflow.custom_transitions_enabled, actorUserId],
    ),
  );
}

/** Writes a draft that already passed validateWorkflowDraft. */
export async function saveBoardWorkflow(previous: BoardWorkflow, draft: WorkflowDraft, actorUserId: string) {
  const written = await asPerson((tx) =>
    tx.query(
      `insert into work.board (engagement_id, stages, transitions, allow_backward, allow_skip_forward, allow_reopen, require_reason,
                               custom_transitions_enabled, updated_by)
       values ($1::uuid, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9)
       on conflict (engagement_id) do update
         set stages = excluded.stages, transitions = excluded.transitions, allow_backward = excluded.allow_backward,
             allow_skip_forward = excluded.allow_skip_forward, allow_reopen = excluded.allow_reopen, require_reason = excluded.require_reason,
             custom_transitions_enabled = excluded.custom_transitions_enabled, updated_by = excluded.updated_by
       returning engagement_id`,
      [previous.project_id, JSON.stringify(draft.stages), JSON.stringify(draft.transitions), draft.allow_backward, draft.allow_skip_forward,
        draft.allow_reopen, draft.require_reason, draft.custom_transitions_enabled, actorUserId],
    ),
  );

  // The rules refuse the write of someone who does not manage the mission.
  if (!written.length) {
    throw new Error("You do not have permission to change this board's workflow.");
  }
}
