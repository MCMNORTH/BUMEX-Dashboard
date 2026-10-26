import "server-only";

import { logActivity } from "@/lib/activity/service";
import { createAssignmentNotification } from "@/lib/notifications/service";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { MySubtask, SubtaskOwner, TicketSubtask } from "@/types/ticket";

// A ticket's sub-tasks: work.subtask (0008). The rules let administrators, the mission's managers and the ticket's
// assignee edit them, and a sub-task's owner tick theirs; the ticket's counts are read from them.

export const SUBTASK_TITLE_MAX_LENGTH = 200;
/** Most sub-tasks added in one go, e.g. from the create-ticket form. */
export const SUBTASK_BATCH_LIMIT = 50;

const SUBTASK_COLUMNS = `
  s.id, s.task_id, s.title, s.is_done, s.assignee_id, s.due_date, s.position, s.completed_at, s.created_by, s.created_at, s.updated_at,
  (select jsonb_build_object('id', p.id, 'full_name', p.full_name) from work.person p where p.id = s.assignee_id) as assignee`;

export async function getTicketSubtasks(taskId: string) {
  return asPerson((tx) =>
    select<TicketSubtask>(tx, `select ${SUBTASK_COLUMNS} from work.subtask s where s.task_id = $1::uuid order by s.position, s.created_at`, [taskId]),
  );
}

export async function getSubtaskById(id: string) {
  return asPerson((tx) => selectOne<TicketSubtask>(tx, `select ${SUBTASK_COLUMNS} from work.subtask s where s.id = $1::uuid`, [id])).catch(() => null);
}

/** Open sub-tasks owned by `userId`, soonest due first, for My Work. */
export async function getMySubtasks(userId: string): Promise<MySubtask[]> {
  return asPerson((tx) =>
    select<MySubtask>(
      tx,
      `select ${SUBTASK_COLUMNS},
              jsonb_build_object('id', t.id, 'title', t.title, 'entity_code', (select x.code from erp.entity x where x.id = t.entity_id)) as task
         from work.subtask s join erp.task t on t.id = s.task_id
        where s.assignee_id = $1 and not s.is_done
        order by coalesce(s.due_date, date '9999-12-31'), s.created_at`,
      [userId],
    ),
  );
}

/** The person a sub-task may be handed to, or null when they do not exist. */
export async function getSubtaskOwnerCandidate(userId: string) {
  return asPerson((tx) => selectOne<SubtaskOwner>(tx, "select id, full_name from work.person where id = $1", [userId]));
}

export async function createSubtasks(taskId: string, titles: string[], actorUserId: string) {
  if (!titles.length) {
    return;
  }

  await asPerson((tx) =>
    tx.query(
      `insert into work.subtask (task_id, title, position, created_by)
       select $1::uuid, t.title, (select coalesce(max(position), -1) + 1 from work.subtask where task_id = $1::uuid) + t.n - 1, $3
         from unnest($2::text[]) with ordinality as t(title, n)`,
      [taskId, titles, actorUserId],
    ),
  );

  await logActivity({
    userId: actorUserId,
    action: titles.length === 1 ? `Added sub-task ${titles[0]}` : `Added ${titles.length} sub-tasks`,
    entityType: "task",
    entityId: taskId,
    metadata: { kind: "update", summary: titles.length === 1 ? "Sub-task added" : "Sub-tasks added" },
  });
}

// One sub-task changed by the person; the rules skip a row they may not write, which is said so.
async function writeSubtask(id: string, set: string, params: unknown[]) {
  const written = await asPerson((tx) => tx.run(`update work.subtask set ${set} where id = $1::uuid`, [id, ...params]));
  if (!written) throw new Error("You cannot change this sub-task.");
}

export async function setSubtaskDone(subtask: TicketSubtask, isDone: boolean, actorUserId: string) {
  await writeSubtask(subtask.id, "is_done = $2, completed_at = case when $2 then coalesce(completed_at, now()) end", [isDone]);
  await logActivity({
    userId: actorUserId,
    action: `${isDone ? "Completed" : "Reopened"} sub-task ${subtask.title}`,
    entityType: "task",
    entityId: subtask.task_id,
    metadata: { kind: "completion_change", summary: isDone ? "Sub-task completed" : "Sub-task reopened" },
  });
}

export async function renameSubtask(subtask: TicketSubtask, title: string) {
  await writeSubtask(subtask.id, "title = $2", [title]);
}

export async function setSubtaskOwner(
  subtask: TicketSubtask,
  owner: SubtaskOwner | null,
  ticketTitle: string,
  actorUserId: string,
) {
  await writeSubtask(subtask.id, "assignee_id = $2", [owner?.id ?? null]);
  await Promise.all([
    logActivity({
      userId: actorUserId,
      action: owner ? `Assigned sub-task ${subtask.title} to ${owner.full_name}` : `Unassigned sub-task ${subtask.title}`,
      entityType: "task",
      entityId: subtask.task_id,
      metadata: { kind: "assignment_change", summary: "Sub-task assignee changed" },
    }),
    createAssignmentNotification({
      userId: owner?.id,
      title: "New sub-task assignment",
      body: `You are assigned the sub-task “${subtask.title}” on ${ticketTitle}.`,
      entityType: "ticket",
      entityId: subtask.task_id,
      skipUserId: actorUserId,
    }),
  ]);
}

export async function setSubtaskDueDate(subtask: TicketSubtask, dueDate: string | null, actorUserId: string) {
  await writeSubtask(subtask.id, "due_date = $2::date", [dueDate]);
  await logActivity({
    userId: actorUserId,
    action: dueDate ? `Set the due date of sub-task ${subtask.title} to ${dueDate}` : `Cleared the due date of sub-task ${subtask.title}`,
    entityType: "task",
    entityId: subtask.task_id,
    metadata: { kind: "due_date_change", summary: "Sub-task due date changed" },
  });
}

/**
 * Stores a new order for a ticket's sub-tasks. Returns false, writing nothing, when `orderedIds` is not exactly the
 * ticket's current sub-tasks.
 */
export async function reorderSubtasks(taskId: string, orderedIds: string[]) {
  return asPerson(async (tx) => {
    const current = new Map(
      (await select<{ id: string; position: number }>(tx, "select id, position from work.subtask where task_id = $1::uuid", [taskId])).map((row) => [row.id, row.position]),
    );

    if (orderedIds.length !== current.size || new Set(orderedIds).size !== current.size || orderedIds.some((id) => !current.has(id))) {
      return false;
    }

    await tx.query(
      `update work.subtask s set position = o.n - 1
         from unnest($2::uuid[]) with ordinality as o(id, n)
        where s.id = o.id and s.task_id = $1::uuid and s.position <> o.n - 1`,
      [taskId, orderedIds],
    );
    return true;
  });
}

export async function deleteSubtask(subtask: TicketSubtask, actorUserId: string) {
  const deleted = await asPerson((tx) => tx.query("delete from work.subtask where id = $1::uuid returning id", [subtask.id]));
  if (!deleted.length) throw new Error("You cannot remove this sub-task.");
  await logActivity({
    userId: actorUserId,
    action: `Removed sub-task ${subtask.title}`,
    entityType: "task",
    entityId: subtask.task_id,
    metadata: { kind: "delete", summary: "Sub-task removed" },
  });
}
