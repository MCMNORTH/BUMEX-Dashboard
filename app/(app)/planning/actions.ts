"use server";

import { revalidatePath } from "next/cache";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getProjectById } from "@/lib/projects/service";
import { updateTaskDueDate } from "@/lib/planning/service";
import { getTicketById } from "@/lib/tickets/service";

export type PlanningActionState = {
  error?: string;
  success?: boolean;
};

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

export async function updateTaskDueDateAction(
  ticketId: string,
  nextDueDate: string | null,
): Promise<PlanningActionState> {
  const auth = await requireRouteAccess("planning");
  const ticket = await getTicketById(ticketId, auth.role);

  if (!ticket) {
    return { error: "The task could not be found." };
  }

  if (auth.role === "shareholder") {
    return { error: "Shareholders have read-only planning access." };
  }

  if (isManagerLikeRole(auth.role)) {
    const canManage = await canManageProjectScope(ticket.project_id, auth.profile.id);

    if (!canManage) {
      return { error: "Entity-level leads can only update planning for their own projects." };
    }
  }

  if (auth.role === "employee" && ticket.assignee_id !== auth.profile.id) {
    return { error: "Employees can only reschedule tickets assigned to them." };
  }

  await updateTaskDueDate(ticketId, nextDueDate, auth.profile.id);

  revalidatePath("/planning");
  revalidatePath("/my-work");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/projects/${ticket.project_id}`);

  return { success: true };
}
