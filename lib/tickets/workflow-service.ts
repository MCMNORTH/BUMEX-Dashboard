import "server-only";

import { getCurrentLocale } from "@/lib/i18n/server";
import { getLegacyWorkflow, type WorkflowDraft } from "@/lib/tickets/workflow";
import { asPerson, asSystem, select } from "@/lib/work/db";
import type { BoardWorkflow, WorkflowStage } from "@/types/workflow";

// The boards are the floors' (0014, asked on 2026-10-28): work.floor_board, one per entity, which every mission of the
// floor follows. A mission's board is its floor's, under the mission's id (project_id), so everything that reads a
// ticket's board by its mission keeps doing so; the floor's editor reads and saves it by the entity's id.
const FLOOR_COLUMNS =
  "f.entity_id::text as entity_id, f.stages, f.transitions, f.allow_backward, f.allow_skip_forward, f.allow_reopen, f.require_reason, f.custom_transitions_enabled, f.updated_at";

type FloorRow = {
  entity_id: string;
  stages: WorkflowStage[] | null;
  transitions: Record<string, string[]> | null;
  allow_backward: boolean | null;
  allow_skip_forward: boolean | null;
  allow_reopen: boolean | null;
  require_reason: boolean | null;
  custom_transitions_enabled: boolean | null;
  updated_at: string | null;
};

function mapWorkflow(row: FloorRow, projectId: string): BoardWorkflow {
  return {
    project_id: projectId,
    entity_id: row.entity_id,
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

/** The missions' boards (their floors'), keyed by mission id. A mission the person cannot read is left out. */
export async function getConfiguredWorkflows(projectIds: string[]): Promise<Map<string, BoardWorkflow>> {
  const ids = [...new Set(projectIds.filter(Boolean))];

  if (!ids.length) {
    return new Map();
  }

  const rows = await asPerson((tx) =>
    select<FloorRow & { project_id: string }>(
      tx,
      `select g.id::text as project_id, ${FLOOR_COLUMNS} from erp.engagement g join work.floor_board f on f.entity_id = g.entity_id where g.id = any($1::uuid[])`,
      [ids],
    ),
  );
  return new Map(rows.map((row) => [row.project_id, mapWorkflow(row, row.project_id)]));
}

export async function getBoardWorkflow(projectId: string): Promise<BoardWorkflow> {
  const [configured, locale] = await Promise.all([getConfiguredWorkflows([projectId]), getCurrentLocale()]);
  return configured.get(projectId) ?? getLegacyWorkflow(projectId, locale);
}

/** Every listed mission's board, for the browser (a mission the person cannot read: the built-in stages, free moves). */
export async function getBoardWorkflows(projectIds: string[]): Promise<Record<string, BoardWorkflow>> {
  const [configured, locale] = await Promise.all([getConfiguredWorkflows(projectIds), getCurrentLocale()]);

  return Object.fromEntries(
    [...new Set(projectIds.filter(Boolean))].map((id) => [id, configured.get(id) ?? getLegacyWorkflow(id, locale)]),
  );
}

/** A floor's board, under the floor's id (its editor). Null when the person may not read it. */
export async function getFloorWorkflow(entityId: string): Promise<BoardWorkflow | null> {
  const rows = await asPerson((tx) => select<FloorRow>(tx, `select ${FLOOR_COLUMNS} from work.floor_board f where f.entity_id = $1::uuid`, [entityId]));
  return rows[0] ? mapWorkflow(rows[0], entityId) : null;
}

/** May the person change this floor's board: the administrators and the floor's managers (0014's rule). */
export async function canManageFloorBoard(entityId: string): Promise<boolean> {
  const rows = await asPerson((tx) =>
    select<{ ok: boolean }>(tx, "select (work.actor_class() = 'admin' or work.is_entity_manager($1::uuid)) and not work.hidden(erp.is_test_entity($1::uuid)) as ok", [entityId]),
  ).catch(() => []);
  return Boolean(rows[0]?.ok);
}

/**
 * Every ticket of the floor with what stage bookkeeping needs, archived ones included: read by the server for whoever
 * edits the board, since a stage that still holds cards cannot go, whoever may see them.
 */
export async function getFloorTicketStages(entityId: string, actorId: string) {
  return asSystem(actorId, (tx) =>
    select<{ id: string; status: string; stage_id?: string | null }>(tx, "select id, status, stage_id from erp.task where entity_id = $1::uuid and engagement_id is not null", [entityId]),
  );
}

/** Writes a draft that already passed validateWorkflowDraft. The rules refuse whoever does not manage the floor. */
export async function saveFloorWorkflow(entityId: string, draft: WorkflowDraft, actorUserId: string) {
  const written = await asPerson((tx) =>
    tx.query(
      `update work.floor_board
          set stages = $2::jsonb, transitions = $3::jsonb, allow_backward = $4, allow_skip_forward = $5, allow_reopen = $6,
              require_reason = $7, custom_transitions_enabled = $8, updated_by = $9
        where entity_id = $1::uuid
       returning entity_id`,
      [entityId, JSON.stringify(draft.stages), JSON.stringify(draft.transitions), draft.allow_backward, draft.allow_skip_forward,
        draft.allow_reopen, draft.require_reason, draft.custom_transitions_enabled, actorUserId],
    ),
  );

  if (!written.length) {
    throw new Error("You do not have permission to change this floor's board.");
  }
}
