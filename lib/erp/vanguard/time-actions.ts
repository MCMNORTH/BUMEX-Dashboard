"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getAdminTimesheetOverview, getTimesheet } from "@/lib/timesheet/service";
import { getTicketsByIds } from "@/lib/tickets/service";
import { weekBounds } from "@/lib/timesheet/validation";
import { asPerson, select } from "@/lib/work/db";
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
  // the tickets the person moved on a board lately, the last moved first, then their own in progress (2026-10-28: time is
  // logged on what one just worked on)
  recent: RecentTicket[];
};

export type RecentTicket = TimeTicket & { stage: string | null; movedAt: string | null; projectName: string | null };

// test: the test floor's lines (0011), apart from the person's real week
export async function myTimeAction(week?: string | null, test = false): Promise<MyTime> {
  const auth = await requireRouteAccess("timesheet");
  const at = weekOf(week);
  const [sheet, recent] = await Promise.all([getTimesheet(at.week, test), recentTickets(auth.profile.id).catch(() => [])]);
  // only what the person may log time on (their timesheet's missions)
  const allowed = new Map(sheet.projects.map((p) => [p.id, p.name]));
  return {
    ...at,
    ...sheet,
    capacityHours: auth.profile.weekly_capacity_hours,
    test,
    recent: recent.filter((t) => allowed.has(t.project_id)).map((t) => ({ ...t, projectName: allowed.get(t.project_id) ?? null })),
  };
}

// The tickets moved by the person (their stage changes, work.activity) in the last three weeks, the last moved first;
// then their own tickets in progress or in review not among them. The session's rules and mode apply (test tickets only
// on the test floor).
async function recentTickets(me: string): Promise<Omit<RecentTicket, "projectName">[]> {
  return asPerson((tx) =>
    select<Omit<RecentTicket, "projectName">>(
      tx,
      `with moves as (
         select work.uuid_or_null(a.subject_id) as id, max(a.created_at) as moved_at
           from work.activity a
          where a.user_id = $1 and a.subject_type in ('task', 'ticket') and a.metadata->>'kind' = 'status_change'
            and a.created_at > now() - interval '21 days'
          group by 1
       ), picked as (
         select m.id, m.moved_at, 0 as rank from moves m
         union all
         select k.id, null, 1 from erp.task k
          where k.assignee_id = $1 and k.status in ('in_progress', 'review') and k.id not in (select id from moves where id is not null)
       )
       select k.id::text as id, kx.ticket_prefix || '-' || k.number as key, k.title, k.engagement_id::text as project_id,
              (select s->>'name' from work.floor_board b, jsonb_array_elements(b.stages) s
                where b.entity_id = k.entity_id and s->>'id' = coalesce(k.stage_id, k.status) limit 1) as stage,
              p.moved_at as "movedAt"
         from picked p join erp.task k on k.id = p.id join erp.entity kx on kx.id = k.entity_id
        where k.engagement_id is not null and k.status <> 'archived'
        order by p.rank, p.moved_at desc nulls last, k.updated_at desc
        limit 12`,
      [me],
    ),
  );
}

export type TeamTime = Week & {
  profiles: TimesheetProfile[];
  entries: TimeEntry[];
  statuses: TimesheetWeekStatus[];
  events: TimesheetWeekEvent[];
  companyWide: boolean;
  me: string;
};

// A ticket a reviewed line was logged on: what it is, who asked for it, and its estimate against all the time logged
// on it (asked on 2026-10-30, to review a week like Jira shows a ticket on hover).
export type ReviewTicket = {
  id: string;
  key: string | null;
  title: string;
  description: string;
  reporter: string | null;
  assignee: string | null;
  stage: string;
  priority: string;
  dueDate: string | null;
  estimatedHours: number | null;
  loggedMinutes: number;
};

export async function reviewTicketsAction(ids: string[]): Promise<ReviewTicket[]> {
  const auth = await requireRouteAccess("timesheet");
  if (auth.role !== "admin" && auth.role !== "manager") return [];
  const tickets = await getTicketsByIds(auth.role, Array.isArray(ids) ? ids.map(String) : []);
  return tickets.map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    description: (t.description ?? "").slice(0, 600),
    reporter: (Array.isArray(t.reporter) ? t.reporter[0] : t.reporter)?.full_name ?? null,
    assignee: (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee)?.full_name ?? null,
    stage: t.stage_name ?? t.status,
    priority: t.priority,
    dueDate: t.due_date,
    estimatedHours: t.estimated_hours,
    loggedMinutes: t.logged_minutes,
  }));
}

export async function teamTimeAction(week?: string | null): Promise<TeamTime | null> {
  const auth = await requireRouteAccess("timesheet");
  if (auth.role !== "admin" && auth.role !== "manager") return null;
  const at = weekOf(week);
  return { ...at, ...(await getAdminTimesheetOverview(at.week)), companyWide: auth.role === "admin", me: auth.profile.id };
}
