import type { PlanningSummary, PlanningWeekDay } from "@/types/planning";
import type { TicketRecord } from "@/types/ticket";

function toStartOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function getWeekStart(value?: string) {
  const baseDate = value ? new Date(value) : new Date();
  const date = toStartOfDay(baseDate);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekDays(weekStart: Date): PlanningWeekDay[] {
  const todayKey = formatDateKey(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);

    return {
      label: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
      shortLabel: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      date: formatDateKey(date),
      isToday: formatDateKey(date) === todayKey,
    };
  });
}

export function getWeekRangeLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`;
}

function isOpenTicket(ticket: TicketRecord) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

export function getPlanningSummary(
  visibleTickets: TicketRecord[],
  weekDays: PlanningWeekDay[],
): PlanningSummary {
  const weekSet = new Set(weekDays.map((day) => day.date));
  const todayKey = formatDateKey(new Date());

  return {
    scheduledThisWeek: visibleTickets.filter(
      (ticket) => ticket.due_date && weekSet.has(ticket.due_date) && ticket.status !== "archived",
    ).length,
    dueToday: visibleTickets.filter(
      (ticket) => ticket.due_date === todayKey && isOpenTicket(ticket),
    ).length,
    overdueCount: visibleTickets.filter((ticket) => {
      if (!ticket.due_date || !isOpenTicket(ticket)) {
        return false;
      }

      return ticket.due_date < todayKey;
    }).length,
    unscheduledCount: visibleTickets.filter(
      (ticket) => !ticket.due_date && ticket.status !== "archived",
    ).length,
  };
}
