import "server-only";

import { logActivity } from "@/lib/activity/service";
import { getOptionalCurrentEntityCode, isEntityScopingEnabled } from "@/lib/entities/scope";
import { createAdminClient, createClient } from "@/lib/firebase/server";
import { createAssignmentNotification } from "@/lib/notifications/service";
import { invalidateTicketReadCache } from "@/lib/tickets/service";
import type { MySubtask, SubtaskOwner, TicketSubtask } from "@/types/ticket";

export const SUBTASK_TITLE_MAX_LENGTH = 200;
/** Most sub-tasks added in one go, e.g. from the create-ticket form. */
export const SUBTASK_BATCH_LIMIT = 50;

const SUBTASK_COLUMNS = `
  id,
  task_id,
  title,
  is_done,
  assignee_id,
  due_date,
  position,
  completed_at,
  created_by,
  created_at,
  updated_at,
  assignee:profiles!subtasks_assignee_id_fkey (
    id,
    full_name
  )
`;

async function getClient() {
  const db = await createClient();

  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  return db;
}

export async function getTicketSubtasks(taskId: string) {
  const db = await getClient();
  const { data, error } = await db
    .from("subtasks")
    .select(SUBTASK_COLUMNS)
    .eq("task_id", taskId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<TicketSubtask[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getSubtaskById(id: string) {
  const db = await getClient();
  const { data, error } = await db
    .from("subtasks")
    .select(SUBTASK_COLUMNS)
    .eq("id", id)
    .maybeSingle<TicketSubtask>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/** Open sub-tasks owned by `userId`, soonest due first, for My Work. */
export async function getMySubtasks(userId: string): Promise<MySubtask[]> {
  const db = await getClient();
  const [{ data, error }, entityCode] = await Promise.all([
    db
      .from("subtasks")
      .select(`${SUBTASK_COLUMNS}, task:tasks ( id, title, entity_code )`)
      .eq("assignee_id", userId)
      .eq("is_done", false)
      .returns<MySubtask[]>(),
    isEntityScopingEnabled() ? getOptionalCurrentEntityCode() : Promise.resolve(null),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((subtask) => subtask.task && (!entityCode || subtask.task.entity_code === entityCode))
    .sort((left, right) =>
      (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31")
      || left.created_at.localeCompare(right.created_at));
}

/** The profile a sub-task may be handed to, or null when it does not exist. */
export async function getSubtaskOwnerCandidate(userId: string) {
  const db = await getClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle<SubtaskOwner>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// The counts on the ticket are derived data, like a trigger's: they are
// recounted from the rows with full access so that a sub-task owner, who may
// not edit the ticket itself, still keeps them right.
async function syncSubtaskCounts(taskId: string) {
  const db = createAdminClient();

  if (!db) {
    throw new Error("Firebase is not configured.");
  }

  const { data, error } = await db
    .from("subtasks")
    .select("is_done")
    .eq("task_id", taskId)
    .returns<Array<{ is_done: boolean }>>();

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const { error: updateError } = await db
    .from("tasks")
    .update({ subtasks_total: rows.length, subtasks_done: rows.filter((row) => row.is_done).length })
    .eq("id", taskId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  invalidateTicketReadCache();
}

export async function createSubtasks(taskId: string, titles: string[], actorUserId: string) {
  if (!titles.length) {
    return;
  }

  const db = await getClient();
  const { data: existing, error: existingError } = await db
    .from("subtasks")
    .select("position")
    .eq("task_id", taskId)
    .returns<Array<{ position: number | null }>>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const nextPosition = Math.max(-1, ...(existing ?? []).map((row) => row.position ?? 0)) + 1;
  const { error } = await db.from("subtasks").insert(
    titles.map((title, index) => ({
      task_id: taskId,
      title,
      position: nextPosition + index,
      created_by: actorUserId,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all([
    syncSubtaskCounts(taskId),
    logActivity({
      userId: actorUserId,
      action: titles.length === 1 ? `Added sub-task ${titles[0]}` : `Added ${titles.length} sub-tasks`,
      entityType: "task",
      entityId: taskId,
      metadata: { kind: "update", summary: titles.length === 1 ? "Sub-task added" : "Sub-tasks added" },
    }),
  ]);
}

export async function setSubtaskDone(subtask: TicketSubtask, isDone: boolean, actorUserId: string) {
  const db = await getClient();
  const { error } = await db
    .from("subtasks")
    .update({ is_done: isDone, completed_at: isDone ? new Date().toISOString() : null })
    .eq("id", subtask.id);

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all([
    syncSubtaskCounts(subtask.task_id),
    logActivity({
      userId: actorUserId,
      action: `${isDone ? "Completed" : "Reopened"} sub-task ${subtask.title}`,
      entityType: "task",
      entityId: subtask.task_id,
      metadata: { kind: "completion_change", summary: isDone ? "Sub-task completed" : "Sub-task reopened" },
    }),
  ]);
}

export async function renameSubtask(subtask: TicketSubtask, title: string) {
  const db = await getClient();
  const { error } = await db.from("subtasks").update({ title }).eq("id", subtask.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setSubtaskOwner(
  subtask: TicketSubtask,
  owner: SubtaskOwner | null,
  ticketTitle: string,
  actorUserId: string,
) {
  const db = await getClient();
  const { error } = await db.from("subtasks").update({ assignee_id: owner?.id ?? null }).eq("id", subtask.id);

  if (error) {
    throw new Error(error.message);
  }

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
  invalidateTicketReadCache();
}

export async function setSubtaskDueDate(subtask: TicketSubtask, dueDate: string | null, actorUserId: string) {
  const db = await getClient();
  const { error } = await db.from("subtasks").update({ due_date: dueDate }).eq("id", subtask.id);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: dueDate ? `Set the due date of sub-task ${subtask.title} to ${dueDate}` : `Cleared the due date of sub-task ${subtask.title}`,
    entityType: "task",
    entityId: subtask.task_id,
    metadata: { kind: "due_date_change", summary: "Sub-task due date changed" },
  });
}

/**
 * Stores a new order for a ticket's sub-tasks. Returns false, writing nothing,
 * when `orderedIds` is not exactly the ticket's current sub-tasks.
 */
export async function reorderSubtasks(taskId: string, orderedIds: string[]) {
  const db = await getClient();
  const { data, error } = await db
    .from("subtasks")
    .select("id, position")
    .eq("task_id", taskId)
    .returns<Array<{ id: string; position: number | null }>>();

  if (error) {
    throw new Error(error.message);
  }

  const current = new Map((data ?? []).map((row) => [row.id, row.position]));

  if (orderedIds.length !== current.size || new Set(orderedIds).size !== current.size || orderedIds.some((id) => !current.has(id))) {
    return false;
  }

  const moved = orderedIds
    .map((id, position) => ({ id, position }))
    .filter(({ id, position }) => current.get(id) !== position);

  if (moved.length) {
    // One upsert keeps it to a single batched write and policy check.
    const { error: writeError } = await db.from("subtasks").upsert(moved, { onConflict: "id" });

    if (writeError) {
      throw new Error(writeError.message);
    }
  }

  return true;
}

export async function deleteSubtask(subtask: TicketSubtask, actorUserId: string) {
  const db = await getClient();
  const { error } = await db.from("subtasks").delete().eq("id", subtask.id);

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all([
    syncSubtaskCounts(subtask.task_id),
    logActivity({
      userId: actorUserId,
      action: `Removed sub-task ${subtask.title}`,
      entityType: "task",
      entityId: subtask.task_id,
      metadata: { kind: "delete", summary: "Sub-task removed" },
    }),
  ]);
}
