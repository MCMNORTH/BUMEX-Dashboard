import type { TicketFilters, TicketRecord } from "@/types/ticket";

export type PlanningWeekDay = {
  label: string;
  shortLabel: string;
  date: string;
  isToday: boolean;
};

export type PlanningFilters = Pick<
  TicketFilters,
  "assigneeId" | "projectId" | "priority" | "status" | "type"
>;

export type WeeklyTasksResult = {
  weekDays: PlanningWeekDay[];
  ticketsByDay: Record<string, TicketRecord[]>;
  unscheduledTasks: TicketRecord[];
  visibleTickets: TicketRecord[];
};

export type PlanningSummary = {
  scheduledThisWeek: number;
  dueToday: number;
  overdueCount: number;
  unscheduledCount: number;
};
