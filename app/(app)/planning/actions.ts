"use server";

import { revalidatePath } from "next/cache";

import { requireRouteAccess } from "@/lib/auth/server";
import { getProjectById } from "@/lib/projects/service";
import { updateTaskDueDate, updateTaskPlanning } from "@/lib/planning/service";
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

  if (auth.role === "supervisor") {
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

export async function rebalanceTaskAction(ticketId: string, nextDueDate: string, assigneeId: string): Promise<PlanningActionState> {
  const auth = await requireRouteAccess("planning");
  if (auth.role !== "admin" && auth.role !== "manager") return { error: "Only administrators and managers can rebalance team work." };
  const ticket = await getTicketById(ticketId, auth.role);
  if (!ticket) return { error: "The task could not be found." };

  const supabaseModule = await import("@/lib/supabase/server");
  const supabase = await supabaseModule.createClient();
  if (!supabase) return { error: "Planning is unavailable." };
  let profileQuery = supabase.from("profiles").select("id, entity_code, availability_status").eq("id", assigneeId);
  if (auth.role === "manager") profileQuery = profileQuery.eq("entity_code", auth.profile.entity_code);
  const { data: target, error } = await profileQuery.maybeSingle<{ id: string; entity_code: string | null; availability_status: string }>();
  if (error || !target) return { error: "This person is outside your planning scope." };
  if (target.availability_status === "away" || target.availability_status === "inactive") return { error: "This person is currently unavailable." };

  await updateTaskPlanning(ticketId, nextDueDate, assigneeId, auth.profile.id);
  revalidatePath("/planning");
  revalidatePath("/my-work");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/projects/${ticket.project_id}`);
  return { success: true };
}

export async function rebalanceTasksAction(items: Array<{ ticketId: string; nextDueDate: string; assigneeId: string }>): Promise<PlanningActionState> {
  const auth = await requireRouteAccess("planning");
  if (auth.role !== "admin" && auth.role !== "manager") return { error: "Only administrators and managers can rebalance team work." };
  if (!items.length || items.length > 20) return { error: "Select between 1 and 20 tasks." };
  const supabaseModule = await import("@/lib/supabase/server");
  const supabase = await supabaseModule.createClient();
  if (!supabase) return { error: "Planning is unavailable." };

  const uniqueItems = [...new Map(items.map(item => [item.ticketId, item])).values()];
  const validated: Array<{ ticketId: string; nextDueDate: string; assigneeId: string; projectId: string }> = [];
  for (const item of uniqueItems) {
    const ticket = await getTicketById(item.ticketId, auth.role);
    if (!ticket) return { error: "One of the selected tasks is outside your planning scope." };
    let targetQuery = supabase.from("profiles").select("id, entity_code, availability_status").eq("id", item.assigneeId);
    if (auth.role === "manager") targetQuery = targetQuery.eq("entity_code", auth.profile.entity_code);
    const { data: target } = await targetQuery.maybeSingle<{ id: string; entity_code: string | null; availability_status: string }>();
    if (!target || target.availability_status === "away" || target.availability_status === "inactive") return { error: "One of the suggested assignees is no longer available." };
    validated.push({ ...item, projectId: ticket.project_id });
  }

  await Promise.all(validated.map(item => updateTaskPlanning(item.ticketId, item.nextDueDate, item.assigneeId, auth.profile.id)));
  revalidatePath("/planning");
  revalidatePath("/my-work");
  revalidatePath("/tickets");
  for (const item of validated) {
    revalidatePath(`/tickets/${item.ticketId}`);
    revalidatePath(`/projects/${item.projectId}`);
  }
  return { success: true };
}
