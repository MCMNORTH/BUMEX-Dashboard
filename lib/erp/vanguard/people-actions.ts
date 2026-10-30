"use server";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { listErpAccessGrants } from "@/lib/erp/access";
import { requireErpAccess } from "@/lib/erp/server";
import { floors } from "@/lib/erp/vanguard/floors";
import { getTeamMemberById, getTeamMembers, getTeamWorkload, getUserPerformance, getUserWorkload } from "@/lib/team/service";
import type { Load } from "@/lib/work/load";
import { asItem, pressing, type MyWorkTicket } from "@/lib/erp/vanguard/work-items";
import { getTickets } from "@/lib/tickets/service";
import { weekBounds } from "@/lib/timesheet/validation";
import { asPerson, select } from "@/lib/work/db";
import type { AvailabilityStatus } from "@/types/auth";
import type { ErpRole } from "@/types/erp";
import type { TeamWorkloadLevel, UserPerformance } from "@/types/team";

// The HR room's "Personnes" tab (vanguard/one/People.tsx): everyone in BUMEX One's team, as its Team page showed them
// (BUMEX One's rules: shareholders see no one), with their Vanguard role. Their HR record, when they have one, comes
// from the room's own state, which only people with the HR module receive.
export type PersonRow = {
  id: string;
  name: string;
  email: string;
  floor: string | null; // the Vanguard floor code (AUD, IT…)
  jobTitle: string | null;
  department: string | null;
  role: ErpRole | null;
  availability: AvailabilityStatus;
  capacity: number;
  projects: number;
  tasks: number;
  overdue: number;
  workload: TeamWorkloadLevel;
  load: Load; // hours assigned through their open tickets, against their capacity (lib/work/load.ts)
};

export async function peopleAction(): Promise<PersonRow[]> {
  const { auth } = await requireErpAccess();
  const [members, grants] = await Promise.all([
    getTeamMembers(auth.role),
    listErpAccessGrants(auth.profile.id).catch(() => new Map<string, { role: ErpRole }>()),
  ]);
  return members
    .map((m) => ({
      id: m.id,
      name: m.full_name || m.email,
      email: m.email,
      floor: m.entity_code ? (floors[m.entity_code]?.code ?? null) : null,
      jobTitle: m.job_title,
      department: m.department,
      role: grants.get(m.id)?.role ?? null,
      availability: m.availability_status,
      capacity: m.weekly_capacity_hours,
      projects: m.active_projects_count,
      tasks: m.active_tasks_count,
      overdue: m.overdue_tasks_count,
      workload: m.workload_level,
      load: m.load,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Each person's load, for the pickers (vanguard/one/Tasks.tsx, Ticket.tsx): the hours of the week against their capacity.
export async function peopleLoadsAction(): Promise<Record<string, Pick<Load, "weekHours" | "capacityHours" | "percent" | "level">>> {
  const { auth } = await requireErpAccess();
  if (auth.role === "shareholder") return {};
  const workload = await getTeamWorkload(auth.role, auth.profile.id).catch(() => []);
  return Object.fromEntries(workload.map((w) => [w.id, { weekHours: w.load.weekHours, capacityHours: w.load.capacityHours, percent: w.load.percent, level: w.load.level }]));
}

// A person's page (vanguard/one/Person.tsx: the People tab, and the floor's overview since 2026-10-28), as BUMEX One's
// team member page had it: profile, load, missions, tickets, activity and, for the administrator, managers and the
// person, their delivery figures. [bumex-one] Their week (hours by day against their capacity, its timesheet's state,
// where the time went) when the database lets the viewer read it; their current tickets with their stage; and what
// comes next: the backlog assigned to them, most pressing first.
export type PersonView = {
  member: { id: string; name: string; email: string; role: string; floor: string | null; jobTitle: string | null; department: string | null; phone: string | null; skills: string[]; availability: AvailabilityStatus; capacity: number; avatarUrl: string | null };
  figures: { completed: number; overdue: number; recentlyUpdated: number; utilization: number };
  load: Load | null;
  projects: { id: string; name: string; status: string; role: string; clientName: string | null }[];
  tickets: { id: string; title: string; status: string; priority: string; dueDate: string | null; projectName: string | null }[];
  history: { id: string; at: string; action: string; detail: string }[];
  current: MyWorkTicket[]; // in progress, in review, blocked
  next: MyWorkTicket[]; // to do and backlog, most pressing first
  week: { days: string[]; byDay: number[]; minutes: number; status: string | null; missions: { mission: string; project: string | null; minutes: number }[] } | null; // null: not the viewer's to read
  performance: UserPerformance | null;
  canEdit: boolean;
  isSelf: boolean;
};

export async function personViewAction(personId: string): Promise<PersonView | null> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  if (role === "shareholder") return null;
  const week = weekBounds(new Date().toISOString().slice(0, 10))!;
  const [detail, workload, tickets, time] = await Promise.all([
    getTeamMemberById(String(personId), role),
    getUserWorkload(String(personId), role).catch(() => null),
    getTickets(role).catch(() => []),
    asPerson(async (tx) => {
      const [who] = await select<{ readable: boolean }>(
        tx,
        `select work.actor_class() = 'admin' or p.id = erp.actor_id() or work.is_entity_manager((select e.id from erp.entity e where e.code = p.entity_code)) as readable
           from work.person p where p.id = $1`,
        [String(personId)],
      );
      if (!who?.readable) return null;
      const lines = await select<{ work_date: string; minutes: number; mission: string | null; project: string | null }>(
        tx,
        `select t.work_date::text as work_date, t.minutes, t.mission, g.name as project
           from erp.time_entry t left join erp.engagement g on g.id = t.engagement_id
          where t.user_id = $1 and t.work_date >= $2::date and t.work_date <= $3::date`,
        [String(personId), week.start, week.days[6]],
      );
      const [sheet] = await select<{ status: string }>(tx, "select status from work.timesheet_week where user_id = $1 and week_start = $2::date", [String(personId), week.start]);
      return { lines, status: sheet?.status ?? null };
    }).catch(() => null),
  ]);
  if (!detail) return null;
  const m = detail.member;
  const isSelf = auth.profile.id === m.id;
  const allowed = role === "admin" || isManagerLikeRole(role) || isSelf;
  return {
    member: { id: m.id, name: m.full_name || m.email, email: m.email, role: m.role, floor: m.entity_code ? (floors[m.entity_code]?.code ?? null) : null, jobTitle: m.job_title, department: m.department, phone: m.phone, skills: m.skills, availability: m.availability_status, capacity: m.weekly_capacity_hours, avatarUrl: m.avatar_url },
    figures: { completed: detail.performancePreview.completedTickets, overdue: detail.performancePreview.overdueTickets, recentlyUpdated: detail.performancePreview.recentlyUpdatedTickets, utilization: detail.performancePreview.utilizationRate },
    load: workload?.load ?? null,
    projects: detail.assignedProjects.map((p) => ({ id: p.id, name: p.name, status: p.status, role: p.role, clientName: p.client_name })),
    tickets: detail.assignedTickets.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.due_date?.slice(0, 10) ?? null, projectName: t.project_name })),
    history: detail.recentActivity.map((a) => ({ id: a.id, at: a.created_at, action: a.action, detail: getActivityMetadataSummary(a) ?? "" })),
    current: tickets.filter((t) => t.assignee_id === m.id && ["in_progress", "review", "blocked"].includes(t.status)).map(asItem).sort(pressing),
    next: tickets.filter((t) => t.assignee_id === m.id && (t.status === "todo" || t.status === "backlog")).map(asItem).sort(pressing).slice(0, 40),
    week: time
      ? {
          days: week.days,
          byDay: week.days.map((d) => time.lines.filter((l) => l.work_date === d).reduce((sum, l) => sum + l.minutes, 0)),
          minutes: time.lines.reduce((sum, l) => sum + l.minutes, 0),
          status: time.status,
          missions: [...time.lines.reduce((map, l) => {
            const key = `${l.project ?? ""}\u0001${l.mission ?? ""}`;
            const seen = map.get(key) ?? { mission: l.mission || "—", project: l.project, minutes: 0 };
            seen.minutes += l.minutes;
            return map.set(key, seen);
          }, new Map<string, { mission: string; project: string | null; minutes: number }>()).values()].sort((a, b) => b.minutes - a.minutes),
        }
      : null,
    performance: allowed ? await getUserPerformance(m.id, role) : null,
    canEdit: allowed,
    isSelf,
  };
}
