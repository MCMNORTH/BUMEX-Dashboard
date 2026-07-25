"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getProjectById } from "@/lib/projects/service";
import { getTicketById, createTicket, deleteTicket, updateTicket, updateTicketStatus } from "@/lib/tickets/service";
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

  if (isManagerLikeRole(auth.role)) {
    const canManage = await canManageProjectScope(values.project_id, auth.profile.id);

    if (!canManage) {
      return { error: "Entity-level leads can only create tickets in projects they manage." };
    }
  }

  await createTicket(values, auth.profile.id);
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
