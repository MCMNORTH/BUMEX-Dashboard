// A person's load: the hours assigned to them through their tickets, against their weekly capacity (asked on
// 2026-10-30, replacing the week's weighted hours left of 2026-10-27, which showed 0 % to someone with a full board
// due next week). One computation for every screen that shows it (My work, My day, People, a person's page, the
// pickers, the overview). Pure: the tickets and the day come in.
//
// - Every open ticket counts its estimate, whatever its due date and its stage (in review too); a done or archived one
//   does not. Without an estimate it counts 0 and is flagged "to estimate".
// - The hours are not weighted; byPriority splits them by priority. openHours is what remains once the time logged
//   on each ticket is taken off.

export type LoadPriority = "low" | "medium" | "high" | "urgent";
export type LoadLevel = "light" | "balanced" | "high" | "overloaded";

export type LoadTicket = {
  priority: string;
  status: string;
  estimated_hours: number | null;
  logged_minutes?: number | null;
  due_date: string | null;
};

export type Load = {
  weekHours: number;
  rawWeekHours: number;
  openHours: number;
  capacityHours: number;
  percent: number;
  level: LoadLevel;
  byPriority: Record<LoadPriority, number>;
  count: number;
  weekCount: number;
  overdue: number;
  unestimated: number;
  pressure: boolean;
};

export const PRIORITY_WEIGHT: Record<LoadPriority, number> = { urgent: 1.5, high: 1.25, medium: 1, low: 0.75 };
export const LOAD_PRIORITIES: LoadPriority[] = ["urgent", "high", "medium", "low"];

const priorityOf = (value: string): LoadPriority => (value === "urgent" || value === "high" || value === "low" ? value : "medium");
const round = (n: number) => Math.round(n * 10) / 10;

/** Monday-based: the Sunday that ends the week of `today` (YYYY-MM-DD). */
export function weekEnd(today: string) {
  const day = new Date(`${today}T00:00:00Z`);
  const offset = (7 - day.getUTCDay()) % 7;
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

/** The hours still to do on a ticket: its estimate less the time logged on it, never below 0. */
export function remainingHours(ticket: Pick<LoadTicket, "estimated_hours" | "logged_minutes">) {
  const estimate = Number(ticket.estimated_hours ?? 0);
  if (!(estimate > 0)) return 0;
  return Math.max(0, estimate - Number(ticket.logged_minutes ?? 0) / 60);
}

export function levelOf(percent: number): LoadLevel {
  if (percent > 110) return "overloaded";
  if (percent >= 85) return "high";
  if (percent >= 50) return "balanced";
  return "light";
}

const counts = (status: string) => status !== "done" && status !== "archived";

export function loadOf(tickets: LoadTicket[], options: { capacityHours: number; today: string }): Load {
  const byPriority: Record<LoadPriority, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
  let assigned = 0;
  let openHours = 0;
  let count = 0;
  let overdue = 0;
  let unestimated = 0;
  for (const ticket of tickets) {
    if (!counts(ticket.status)) continue;
    count += 1;
    const due = ticket.due_date?.slice(0, 10) ?? null;
    if (due && due < options.today) overdue += 1;
    const estimate = Number(ticket.estimated_hours ?? 0);
    if (!(estimate > 0)) { unestimated += 1; continue; }
    assigned += estimate;
    byPriority[priorityOf(ticket.priority)] += estimate;
    openHours += remainingHours(ticket);
  }
  const capacityHours = Math.max(0, Number(options.capacityHours) || 0);
  const percent = capacityHours > 0 ? Math.round((assigned / capacityHours) * 100) : assigned > 0 ? 999 : 0;
  return {
    weekHours: round(assigned),
    rawWeekHours: round(assigned),
    openHours: round(openHours),
    capacityHours,
    percent,
    level: levelOf(percent),
    byPriority: { urgent: round(byPriority.urgent), high: round(byPriority.high), medium: round(byPriority.medium), low: round(byPriority.low) },
    count,
    weekCount: count,
    overdue,
    unestimated,
    pressure: overdue >= 2,
  };
}

/** "6 h", "1,5 h", "45 min": an amount of hours as people say it. */
export function formatHours(hours: number, locale: "fr" | "en" = "fr") {
  if (hours > 0 && hours < 1) return `${Math.round(hours * 60)} min`;
  const value = Math.round(hours * 10) / 10;
  return `${locale === "fr" ? String(value).replace(".", ",") : value} h`;
}
