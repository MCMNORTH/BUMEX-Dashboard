import "server-only";

import { logActivity } from "@/lib/activity/service";
import { getTeamWorkloadPreview, getTickets } from "@/lib/tickets/service";
import { createClient } from "@/lib/supabase/server";
import { getWeekDays, getWeekStart } from "@/lib/planning/helpers";
import type { AppRole } from "@/types/auth";
import type { PlanningFilters, PlanningSummary, WeeklyTasksResult } from "@/types/planning";
import type { TicketRecord } from "@/types/ticket";

function isArchived(ticket: TicketRecord) {
  return ticket.status === "archived";
}

function isOpen(ticket: TicketRecord) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

function normalizeFilters(filters: PlanningFilters) {
  return {
    assigneeId: filters.assigneeId ?? "",
    projectId: filters.projectId ?? "",
    priority: filters.priority ?? "",
    status: filters.status ?? "",
    type: filters.type ?? "",
  };
}

export async function getWeeklyTasks(
  role: AppRole,
  weekValue?: string,
  filters: PlanningFilters = {},
): Promise<WeeklyTasksResult> {
  const weekStart = getWeekStart(weekValue);
  const weekDays = getWeekDays(weekStart);
  const dayLookup = Object.fromEntries(weekDays.map((day) => [day.date, [] as TicketRecord[]]));
  const visibleTickets = (await getTickets(role, normalizeFilters(filters))).filter((ticket) => !isArchived(ticket));

  const unscheduledTasks: TicketRecord[] = [];

  for (const ticket of visibleTickets) {
    if (!ticket.due_date) {
      unscheduledTasks.push(ticket);
      continue;
    }

    if (ticket.due_date in dayLookup) {
      dayLookup[ticket.due_date].push(ticket);
    }
  }

  return {
    weekDays,
    ticketsByDay: dayLookup,
    unscheduledTasks,
    visibleTickets,
  };
}

export async function getOverdueTasks(
  role: AppRole,
  filters: PlanningFilters = {},
) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const visibleTickets = await getTickets(role, normalizeFilters(filters));

  return visibleTickets.filter(
    (ticket) => ticket.due_date && ticket.due_date < todayKey && isOpen(ticket),
  );
}

export async function updateTaskDueDate(
  ticketId: string,
  dueDate: string | null,
  actorUserId: string,
) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: previousTask, error: previousError } = await supabase
    .from("tasks")
    .select("title, due_date")
    .eq("id", ticketId)
    .maybeSingle<{ title: string; due_date: string | null }>();

  if (previousError) {
    throw new Error(previousError.message);
  }

  const { error } = await supabase.from("tasks").update({ due_date: dueDate }).eq("id", ticketId);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: dueDate ? `Moved task to ${dueDate}` : "Moved task to unscheduled",
    entityType: "task",
    entityId: ticketId,
    metadata: {
      kind: "due_date_change",
      field: "due_date",
      from: previousTask?.due_date ?? null,
      to: dueDate,
    },
  });
}

export function getPlanningSummary(
  weeklyTasks: WeeklyTasksResult,
): PlanningSummary {
  const todayKey = new Date().toISOString().slice(0, 10);

  return {
    scheduledThisWeek: Object.values(weeklyTasks.ticketsByDay).flat().length,
    dueToday: weeklyTasks.ticketsByDay[todayKey]?.filter(isOpen).length ?? 0,
    overdueCount: weeklyTasks.visibleTickets.filter(
      (ticket) => ticket.due_date && ticket.due_date < todayKey && isOpen(ticket),
    ).length,
    unscheduledCount: weeklyTasks.unscheduledTasks.length,
  };
}

export function getUpcomingDeadlines(visibleTickets: TicketRecord[]) {
  const todayKey = new Date().toISOString().slice(0, 10);

  return visibleTickets
    .filter((ticket) => ticket.due_date && ticket.due_date >= todayKey && isOpen(ticket))
    .sort((left, right) => {
      if (!left.due_date || !right.due_date) {
        return 0;
      }

      return left.due_date.localeCompare(right.due_date);
    })
    .slice(0, 6);
}

export { getTeamWorkloadPreview };
