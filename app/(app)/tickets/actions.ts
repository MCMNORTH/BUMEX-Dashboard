"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getProjectById } from "@/lib/projects/service";
import { getTicketById, createTicket, deleteTicket, updateTicket, updateTicketStatus } from "@/lib/tickets/service";
import {
  createSubtasks,
  deleteSubtask,
  getSubtaskById,
  getSubtaskOwnerCandidate,
  renameSubtask,
  reorderSubtasks,
  setSubtaskDone,
  setSubtaskDueDate,
  setSubtaskOwner,
  SUBTASK_BATCH_LIMIT,
  SUBTASK_TITLE_MAX_LENGTH,
} from "@/lib/tickets/subtasks";
import type {
  TicketFormValues,
  TicketPriority,
  TicketRecord,
  TicketStatus,
  TicketType,
} from "@/types/ticket";

export type TicketActionState = {
  error?: string;
};

export type TicketStatusActionState = {
  error?: string;
  success?: boolean;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseTicketFormData(formData: FormData): TicketFormValues {
  return {
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    project_id: getString(formData, "project_id"),
    assignee_id: getString(formData, "assignee_id"),
    reporter_id: getString(formData, "reporter_id"),
    status: getString(formData, "status") as TicketStatus,
    priority: getString(formData, "priority") as TicketPriority,
    type: getString(formData, "type") as TicketType,
    due_date: getString(formData, "due_date"),
    estimated_hours: getString(formData, "estimated_hours"),
    actual_hours: getString(formData, "actual_hours"),
    github_issue_url: getString(formData, "github_issue_url"),
  };
}

function validate(values: TicketFormValues) {
  if (!values.title || !values.project_id || !values.status || !values.priority || !values.type) {
    return "Title, project, status, priority, and type are required.";
  }

  if (values.estimated_hours && (Number.isNaN(Number(values.estimated_hours)) || Number(values.estimated_hours) < 0)) {
    return "Estimated hours must be a valid positive number.";
  }

  if (values.actual_hours && (Number.isNaN(Number(values.actual_hours)) || Number(values.actual_hours) < 0)) {
    return "Actual hours must be a valid positive number.";
  }

  if (values.github_issue_url) {
    try {
      const url = new URL(values.github_issue_url);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "GitHub issue URL must be a valid web address.";
      }
    } catch {
      return "GitHub issue URL must be a valid web address.";
    }
  }

  return null;
}

async function canManageProjectScope(projectId: string, userId: string) {
  const project = await getProjectById(projectId);

  if (!project) {
    return false;
  }

  return (
    project.owner_id === userId
    || project.members.some((member) => member.user?.id === userId)
  );
}

async function assertCanMutateTicket(
  ticket: TicketRecord,
  userId: string,
  role: "admin" | "manager" | "supervisor" | "employee" | "shareholder",
  nextValues?: TicketFormValues,
) {
  if (role === "shareholder") {
    return "Shareholders have read-only ticket access.";
  }

  if (isManagerLikeRole(role)) {
    const canManage = await canManageProjectScope(ticket.project_id, userId);

    if (!canManage) {
      return "Entity-level leads can only update tickets in projects they manage.";
    }
  }

  if (role === "employee") {
    if (!canEmployeeMutateTicket(ticket, userId)) {
      return "Employees can only update tickets assigned to them.";
    }

    if (nextValues && !isEmployeePayloadSafe(nextValues, ticket, userId)) {
      return "Employees cannot reassign or move tickets.";
    }
  }

  return null;
}

function canEmployeeMutateTicket(ticket: TicketRecord, userId: string) {
  return ticket.assignee_id === userId;
}

function isEmployeePayloadSafe(values: TicketFormValues, ticket: TicketRecord, userId: string) {
  return (
    values.project_id === ticket.project_id
    && values.assignee_id === userId
    && values.reporter_id === (ticket.reporter_id ?? "")
  );
}

export async function createTicketAction(
  _prevState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const auth = await requireRouteAccess("tickets");

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    return { error: "You do not have permission to create tickets." };
  }

  const values = parseTicketFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  const subtaskTitles = parseSubtaskTitles(formData);

  if ("error" in subtaskTitles) {
    return { error: subtaskTitles.error };
  }

  if (isManagerLikeRole(auth.role)) {
    const canManage = await canManageProjectScope(values.project_id, auth.profile.id);

    if (!canManage) {
      return { error: "Entity-level leads can only create tickets in projects they manage." };
    }
  }

  const ticketId = await createTicket(values, auth.profile.id);
  await createSubtasks(ticketId, subtaskTitles.titles, auth.profile.id);
  revalidatePath("/tickets");
  if (values.project_id) {
    revalidatePath(`/projects/${values.project_id}`);
  }
  redirect("/tickets?toast=ticket-created");
}

export async function updateTicketAction(
  _prevState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const auth = await requireRouteAccess("tickets");
  const ticketId = getString(formData, "ticket_id");

  if (!ticketId) {
    return { error: "Missing ticket identifier." };
  }

  const currentTicket = await getTicketById(ticketId, auth.role);

  if (!currentTicket) {
    return { error: "The ticket could not be found." };
  }

  const values = parseTicketFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  const permissionError = await assertCanMutateTicket(
    currentTicket,
    auth.profile.id,
    auth.role,
    values,
  );

  if (permissionError) {
    return { error: permissionError };
  }

  await updateTicket(ticketId, values, auth.profile.id);
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/projects/${currentTicket.project_id}`);
  redirect(`/tickets/${ticketId}?toast=ticket-updated`);
}

export async function deleteTicketAction(formData: FormData) {
  const auth = await requireRouteAccess("tickets");
  const ticketId = getString(formData, "ticket_id");

  if (!ticketId) {
    redirect("/tickets?toast=ticket-delete-error");
  }

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    redirect(`/tickets/${ticketId}?toast=ticket-delete-error`);
  }

  const ticket = await getTicketById(ticketId, auth.role);

  if (!ticket) {
    redirect("/tickets?toast=ticket-delete-error");
  }

  if (isManagerLikeRole(auth.role)) {
    const canManage = await canManageProjectScope(ticket.project_id, auth.profile.id);

    if (!canManage) {
      redirect(`/tickets/${ticketId}?toast=ticket-delete-error`);
    }
  }

  await deleteTicket(ticketId);
  revalidatePath("/tickets");
  revalidatePath(`/projects/${ticket.project_id}`);
  redirect("/tickets?toast=ticket-deleted");
}

export async function updateTicketStatusAction(
  ticketId: string,
  nextStatus: TicketStatus,
): Promise<TicketStatusActionState> {
  const auth = await requireRouteAccess("tickets");
  const ticket = await getTicketById(ticketId, auth.role);

  if (!ticket) {
    return { error: "The ticket could not be found." };
  }

  const permissionError = await assertCanMutateTicket(ticket, auth.profile.id, auth.role);

  if (permissionError) {
    return { error: permissionError };
  }

  await updateTicketStatus(ticketId, nextStatus, auth.profile.id);
  revalidatePath("/tickets");
  revalidatePath("/my-work");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/projects/${ticket.project_id}`);

  return { success: true };
}

// ---- sub-tasks ----------------------------------------------------------------
// Anyone who may update a ticket may manage its sub-tasks. Choosing owners is
// limited to admins and managers, like ticket assignment, and a sub-task's
// owner may tick it off even when they cannot edit the rest of the ticket.

export type SubtaskActionState = {
  error?: string;
  success?: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateSubtaskTitle(title: string) {
  if (!title) {
    return "A sub-task needs a title.";
  }

  if (title.length > SUBTASK_TITLE_MAX_LENGTH) {
    return `Sub-task titles are limited to ${SUBTASK_TITLE_MAX_LENGTH} characters.`;
  }

  return null;
}

/** Sub-task titles typed into the create-ticket form (repeated `subtasks` fields). */
function parseSubtaskTitles(formData: FormData) {
  const titles = formData
    .getAll("subtasks")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (titles.length > SUBTASK_BATCH_LIMIT) {
    return { error: `A ticket can start with at most ${SUBTASK_BATCH_LIMIT} sub-tasks.` } as const;
  }

  const invalid = titles.map(validateSubtaskTitle).find(Boolean);

  return invalid ? { error: invalid } as const : { titles } as const;
}

async function loadMutableTicket(ticketId: string) {
  const auth = await requireRouteAccess("tickets");
  const ticket = await getTicketById(ticketId, auth.role);

  if (!ticket) {
    return { error: "The ticket could not be found." } as const;
  }

  const permissionError = await assertCanMutateTicket(ticket, auth.profile.id, auth.role);

  if (permissionError) {
    return { error: permissionError } as const;
  }

  return { auth, ticket } as const;
}

/** Loads a sub-task with its ticket; `permissionError` is set when the caller cannot edit the ticket. */
async function loadSubtask(subtaskId: string) {
  const auth = await requireRouteAccess("tickets");
  const subtask = await getSubtaskById(subtaskId);

  if (!subtask) {
    return { error: "The sub-task could not be found." } as const;
  }

  const ticket = await getTicketById(subtask.task_id, auth.role);

  if (!ticket) {
    return { error: "The ticket could not be found." } as const;
  }

  const permissionError = await assertCanMutateTicket(ticket, auth.profile.id, auth.role);

  return { auth, ticket, subtask, permissionError } as const;
}

function revalidateSubtaskViews(ticket: TicketRecord) {
  revalidatePath("/tickets");
  revalidatePath("/my-work");
  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath(`/projects/${ticket.project_id}`);
}

export async function createSubtaskAction(ticketId: string, rawTitle: string): Promise<SubtaskActionState> {
  const title = rawTitle.trim();
  const validationError = validateSubtaskTitle(title);

  if (validationError) {
    return { error: validationError };
  }

  const scope = await loadMutableTicket(ticketId);

  if ("error" in scope) {
    return { error: scope.error };
  }

  await createSubtasks(scope.ticket.id, [title], scope.auth.profile.id);
  revalidateSubtaskViews(scope.ticket);

  return { success: true };
}

export async function toggleSubtaskAction(subtaskId: string, isDone: boolean): Promise<SubtaskActionState> {
  const scope = await loadSubtask(subtaskId);

  if ("error" in scope) {
    return { error: scope.error };
  }

  if (scope.permissionError && scope.subtask.assignee_id !== scope.auth.profile.id) {
    return { error: scope.permissionError };
  }

  if (scope.subtask.is_done !== isDone) {
    await setSubtaskDone(scope.subtask, isDone, scope.auth.profile.id);
    revalidateSubtaskViews(scope.ticket);
  }

  return { success: true };
}

export async function renameSubtaskAction(subtaskId: string, rawTitle: string): Promise<SubtaskActionState> {
  const title = rawTitle.trim();
  const validationError = validateSubtaskTitle(title);

  if (validationError) {
    return { error: validationError };
  }

  const scope = await loadSubtask(subtaskId);

  if ("error" in scope || scope.permissionError) {
    return { error: scope.error ?? scope.permissionError ?? undefined };
  }

  if (scope.subtask.title !== title) {
    await renameSubtask(scope.subtask, title);
    revalidateSubtaskViews(scope.ticket);
  }

  return { success: true };
}

export async function setSubtaskOwnerAction(subtaskId: string, assigneeId: string | null): Promise<SubtaskActionState> {
  const scope = await loadSubtask(subtaskId);

  if ("error" in scope || scope.permissionError) {
    return { error: scope.error ?? scope.permissionError ?? undefined };
  }

  if (scope.auth.role !== "admin" && !isManagerLikeRole(scope.auth.role)) {
    return { error: "Only admins and managers can choose sub-task owners." };
  }

  const owner = assigneeId ? await getSubtaskOwnerCandidate(assigneeId) : null;

  if (assigneeId && !owner) {
    return { error: "That person could not be found." };
  }

  if (scope.subtask.assignee_id !== (owner?.id ?? null)) {
    await setSubtaskOwner(scope.subtask, owner, scope.ticket.title, scope.auth.profile.id);
    revalidateSubtaskViews(scope.ticket);
  }

  return { success: true };
}

export async function setSubtaskDueDateAction(subtaskId: string, dueDate: string | null): Promise<SubtaskActionState> {
  if (dueDate !== null && !DATE_PATTERN.test(dueDate)) {
    return { error: "The due date is not a valid date." };
  }

  const scope = await loadSubtask(subtaskId);

  if ("error" in scope || scope.permissionError) {
    return { error: scope.error ?? scope.permissionError ?? undefined };
  }

  if (scope.subtask.due_date !== dueDate) {
    await setSubtaskDueDate(scope.subtask, dueDate, scope.auth.profile.id);
    revalidateSubtaskViews(scope.ticket);
  }

  return { success: true };
}

export async function reorderSubtasksAction(ticketId: string, orderedIds: string[]): Promise<SubtaskActionState> {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return { error: "The new order is not valid." };
  }

  const scope = await loadMutableTicket(ticketId);

  if ("error" in scope) {
    return { error: scope.error };
  }

  const reordered = await reorderSubtasks(scope.ticket.id, orderedIds);

  if (!reordered) {
    return { error: "The sub-task list changed in the meantime. Refresh the page and try again." };
  }

  revalidatePath(`/tickets/${scope.ticket.id}`);

  return { success: true };
}

export async function deleteSubtaskAction(subtaskId: string): Promise<SubtaskActionState> {
  const scope = await loadSubtask(subtaskId);

  if ("error" in scope || scope.permissionError) {
    return { error: scope.error ?? scope.permissionError ?? undefined };
  }

  await deleteSubtask(scope.subtask, scope.auth.profile.id);
  revalidateSubtaskViews(scope.ticket);

  return { success: true };
}
