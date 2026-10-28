"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getAdminTimesheetOverview, getTimesheet } from "@/lib/timesheet/service";
import { weekBounds } from "@/lib/timesheet/validation";
import type { TimeEntry, TimeMission, TimeMissionFavorite, TimeProject, TimeTicket, TimesheetProfile, TimesheetWeekEvent, TimesheetWeekStatus } from "@/types/timesheet";

// The "Temps" room (vanguard/one/Time.tsx): BUMEX One's timesheet, mine and, for the administrator and managers, the
// team's review. Read and saved with BUMEX One's timesheet code (the person's current entity, its projects, its rules).

type Week = { week: string; days: string[]; today: string };

function weekOf(requested?: string | null): Week {
  const today = new Date().toISOString().slice(0, 10);
  const bounds = (requested ? weekBounds(requested) : null) ?? weekBounds(today)!;
  return { week: bounds.start, days: bounds.days, today };
}

export type MyTime = Week & {
  entries: TimeEntry[];
  projects: TimeProject[];
  missions: TimeMission[];
  favorites: TimeMissionFavorite[];
  tickets: TimeTicket[]; // my open tickets on these missions (0012)
  weekStatus: TimesheetWeekStatus | null;
  events: TimesheetWeekEvent[];
  capacityHours: number;
  test: boolean; // the test floor's lines (0011)
};

// test: the test floor's lines (0011), apart from the person's real week
export async function myTimeAction(week?: string | null, test = false): Promise<MyTime> {
  const auth = await requireRouteAccess("timesheet");
  const at = weekOf(week);
  const sheet = await getTimesheet(at.week, test);
  return { ...at, ...sheet, capacityHours: auth.profile.weekly_capacity_hours, test };
}

export type TeamTime = Week & {
  profiles: TimesheetProfile[];
  entries: TimeEntry[];
  statuses: TimesheetWeekStatus[];
  events: TimesheetWeekEvent[];
  companyWide: boolean;
  me: string;
};

export async function teamTimeAction(week?: string | null): Promise<TeamTime | null> {
  const auth = await requireRouteAccess("timesheet");
  if (auth.role !== "admin" && auth.role !== "manager") return null;
  const at = weekOf(week);
  return { ...at, ...(await getAdminTimesheetOverview(at.week)), companyWide: auth.role === "admin", me: auth.profile.id };
}
