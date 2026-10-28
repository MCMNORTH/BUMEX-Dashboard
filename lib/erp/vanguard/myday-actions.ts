"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getOverviewDashboardData, getSignOffTickets, type OverviewDashboardData } from "@/lib/overview/service";
import { getTickets } from "@/lib/tickets/service";
import { asPerson, select } from "@/lib/work/db";
import { loadOf, type Load } from "@/lib/work/load";
import type { TicketRecord } from "@/types/ticket";
import { getMySubtasks } from "@/lib/tickets/subtasks";
import { asItem, pressing, type MyWorkTicket } from "@/lib/erp/vanguard/work-items";
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

// "Mon travail" (vanguard/one/MyWork.tsx, a room of its own since 2026-10-27): everything the person has to do, on
// every floor. Their open tickets, most pressing first, and their load (lib/work/load.ts); their week's time; what
// waits for their sign-off; their sub-tasks in others' tickets; the mentions and comments they have not read; the
// tickets they reported that others carry; and, for whoever leads missions, the tickets there that are unassigned,
// unestimated or late.
export type MyWorkData = {
  tickets: MyWorkTicket[]; // assigned to me: the open ones, and the last done
  load: Load;
  signOff: (MyWorkTicket & { completedStageId: string; completedStageName: string })[];
  subtasks: { id: string; title: string; done: boolean; dueDate: string | null; ticketId: string | null; ticketTitle: string | null }[];
  mentions: { id: string; type: string; title: string; body: string; subjectType: string; subjectId: string | null; at: string }[];
  reported: MyWorkTicket[]; // reported by me, open, carried by someone else
  lead: { ticket: MyWorkTicket; reasons: ("unassigned" | "unestimated" | "late")[] }[];
  week: { loggedMinutes: number; capacityHours: number; status: string | null } | null;
};

export async function myWorkAction(): Promise<MyWorkData> {
  const auth = await requireRouteAccess("my-work");
  const me = auth.profile.id;
  const shareholder = auth.role === "shareholder";
  const today = new Date().toISOString().slice(0, 10);
  const week = weekBounds(today)!;
  const [tickets, subtasks, timesheet, extra] = await Promise.all([
    getTickets(auth.role),
    shareholder ? Promise.resolve([]) : getMySubtasks(me),
    shareholder ? Promise.resolve(null) : getTimesheet(week.start).catch(() => null),
    asPerson(async (tx) => ({
      mentions: await select<MyWorkData["mentions"][number]>(
        tx,
        `select n.id, n.type, n.title, n.body, n.subject_type as "subjectType", n.subject_id as "subjectId", n.created_at as at
           from work.notification n
          where n.user_id = $1 and not n.is_read and n.archived_at is null and n.type in ('mention', 'comment')
          order by n.created_at desc limit 12`,
        [me],
      ),
      led: (await select<{ id: string }>(tx, "select id from erp.engagement where owner_id = $1 and status not in ('completed', 'cancelled')", [me])).map((r) => r.id),
    })).catch(() => ({ mentions: [], led: [] as string[] })),
  ]);
  const open = (t: TicketRecord) => t.status !== "done" && t.status !== "archived";
  const mine = tickets.filter((t) => t.assignee_id === me);
  const mineOpen = mine.filter(open);
  const doneRecently = mine.filter((t) => t.status === "done").sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10);
  const reportedOpen = tickets.filter((t) => t.reporter_id === me && open(t));
  const signOff = shareholder ? [] : await getSignOffTickets(reportedOpen).catch(() => []);
  const signOffIds = new Map(signOff.map((s) => [s.id, s]));
  const led = new Set(extra.led);
  const lead = tickets
    .filter((t) => led.has(t.project_id) && open(t) && t.assignee_id !== me)
    .map((t) => {
      const item = asItem(t);
      const reasons: MyWorkData["lead"][number]["reasons"] = [];
      if (!t.assignee_id) reasons.push("unassigned");
      if (!(Number(t.estimated_hours ?? 0) > 0)) reasons.push("unestimated");
      if (item.dueState === "overdue") reasons.push("late");
      return { ticket: item, reasons };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => pressing(a.ticket, b.ticket));
  return {
    tickets: [...mineOpen.map(asItem).sort(pressing), ...doneRecently.map(asItem)],
    load: loadOf(mineOpen, { capacityHours: auth.profile.weekly_capacity_hours, today }),
    signOff: reportedOpen.filter((t) => signOffIds.has(t.id)).map((t) => ({ ...asItem(t), completedStageId: signOffIds.get(t.id)!.completedStageId, completedStageName: signOffIds.get(t.id)!.completedStageName })),
    subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.is_done, dueDate: s.due_date?.slice(0, 10) ?? null, ticketId: s.task?.id ?? null, ticketTitle: s.task?.title ?? null })),
    mentions: extra.mentions,
    reported: reportedOpen.filter((t) => t.assignee_id !== me && !signOffIds.has(t.id)).map(asItem).sort(pressing),
    lead: lead.slice(0, 30),
    week: timesheet
      ? { loggedMinutes: timesheet.entries.reduce((sum, e) => sum + e.duration_minutes, 0), capacityHours: auth.profile.weekly_capacity_hours, status: timesheet.weekStatus?.status ?? null }
      : null,
  };
}
