"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getOverviewDashboardData, type OverviewDashboardData } from "@/lib/overview/service";
import { getTicketDueState } from "@/lib/tickets/helpers";
import { getMyTickets } from "@/lib/tickets/service";
import { getMySubtasks } from "@/lib/tickets/subtasks";
import { getTimesheet } from "@/lib/timesheet/service";
import { weekBounds } from "@/lib/timesheet/validation";

// Vanguard's "My day" panel (vanguard/one/MyDay.tsx): BUMEX One's overview for the signed-in person, without its
// finance figures (the ERP keeps the books now).
export type MyDayData = Pick<OverviewDashboardData, "unavailable" | "attentionProjects" | "attentionTickets" | "myTickets" | "signOff" | "upcoming" | "workload"> & {
  kpis: Pick<OverviewDashboardData["kpis"], "openTickets" | "attentionTickets" | "atRiskProjects" | "activeProjects">;
  me: string;
};

export async function myDayAction(): Promise<MyDayData> {
  const auth = await requireRouteAccess("overview");
  const data = await getOverviewDashboardData(auth.role, auth.profile.id);
  return {
    unavailable: data.unavailable,
    kpis: {
      openTickets: data.kpis.openTickets,
      attentionTickets: data.kpis.attentionTickets,
      atRiskProjects: data.kpis.atRiskProjects,
      activeProjects: data.kpis.activeProjects,
    },
    attentionProjects: data.attentionProjects,
    attentionTickets: data.attentionTickets,
    myTickets: data.myTickets,
    signOff: data.signOff,
    upcoming: data.upcoming.filter((item) => item.kind === "project" || item.kind === "ticket"),
    workload: data.workload,
    me: auth.profile.id,
  };
}

// My day's "Mon travail" tab (vanguard/one/MyWork.tsx): BUMEX One's My Work page, merged into My day (choice of
// 2026-10-25): my week's time against my capacity, every ticket of mine by state, and my sub-tasks.
export type MyWorkTicket = {
  id: string;
  title: string;
  projectName: string | null;
  status: string;
  stageName: string | null;
  priority: string;
  dueDate: string | null;
  dueState: ReturnType<typeof getTicketDueState>; // overdue, soon (7 days), planned, none
  updatedAt: string;
};

export type MyWorkData = {
  tickets: MyWorkTicket[];
  subtasks: { id: string; title: string; done: boolean; dueDate: string | null; ticketId: string | null; ticketTitle: string | null }[];
  week: { loggedMinutes: number; capacityHours: number; status: string | null } | null;
};

export async function myWorkAction(): Promise<MyWorkData> {
  const auth = await requireRouteAccess("my-work");
  const me = auth.profile.id;
  const shareholder = auth.role === "shareholder";
  const week = weekBounds(new Date().toISOString().slice(0, 10))!;
  const [tickets, subtasks, timesheet] = await Promise.all([
    getMyTickets(me, auth.role),
    shareholder ? Promise.resolve([]) : getMySubtasks(me),
    shareholder ? Promise.resolve(null) : getTimesheet(week.start).catch(() => null),
  ]);
  return {
    tickets: tickets.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.project?.name ?? null,
      status: t.status,
      stageName: t.stage_name,
      priority: t.priority,
      dueDate: t.due_date?.slice(0, 10) ?? null,
      dueState: getTicketDueState(t.due_date),
      updatedAt: t.updated_at,
    })),
    subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.is_done, dueDate: s.due_date?.slice(0, 10) ?? null, ticketId: s.task?.id ?? null, ticketTitle: s.task?.title ?? null })),
    week: timesheet
      ? { loggedMinutes: timesheet.entries.reduce((sum, e) => sum + e.duration_minutes, 0), capacityHours: auth.profile.weekly_capacity_hours, status: timesheet.weekStatus?.status ?? null }
      : null,
  };
}
