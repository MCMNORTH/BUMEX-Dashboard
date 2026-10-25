"use server";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { listErpAccessGrants } from "@/lib/erp/access";
import { requireErpAccess } from "@/lib/erp/server";
import { floors } from "@/lib/erp/vanguard/floors";
import { getTeamMemberById, getTeamMembers, getUserPerformance } from "@/lib/team/service";
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A person's page in the People tab (vanguard/one/Person.tsx), as BUMEX One's team member page had it: profile,
// load, missions, tickets, activity and, for the administrator, managers and the person, their delivery figures.
export type PersonView = {
  member: { id: string; name: string; email: string; role: string; floor: string | null; jobTitle: string | null; department: string | null; phone: string | null; skills: string[]; availability: AvailabilityStatus; capacity: number; avatarUrl: string | null };
  figures: { completed: number; overdue: number; recentlyUpdated: number; utilization: number };
  projects: { id: string; name: string; status: string; role: string; clientName: string | null }[];
  tickets: { id: string; title: string; status: string; priority: string; dueDate: string | null; projectName: string | null }[];
  history: { id: string; at: string; action: string; detail: string }[];
  performance: UserPerformance | null;
  canEdit: boolean;
  isSelf: boolean;
};

export async function personViewAction(personId: string): Promise<PersonView | null> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  if (role === "shareholder") return null;
  const detail = await getTeamMemberById(String(personId), role);
  if (!detail) return null;
  const m = detail.member;
  const isSelf = auth.profile.id === m.id;
  const allowed = role === "admin" || isManagerLikeRole(role) || isSelf;
  return {
    member: { id: m.id, name: m.full_name || m.email, email: m.email, role: m.role, floor: m.entity_code ? (floors[m.entity_code]?.code ?? null) : null, jobTitle: m.job_title, department: m.department, phone: m.phone, skills: m.skills, availability: m.availability_status, capacity: m.weekly_capacity_hours, avatarUrl: m.avatar_url },
    figures: { completed: detail.performancePreview.completedTickets, overdue: detail.performancePreview.overdueTickets, recentlyUpdated: detail.performancePreview.recentlyUpdatedTickets, utilization: detail.performancePreview.utilizationRate },
    projects: detail.assignedProjects.map((p) => ({ id: p.id, name: p.name, status: p.status, role: p.role, clientName: p.client_name })),
    tickets: detail.assignedTickets.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.due_date?.slice(0, 10) ?? null, projectName: t.project_name })),
    history: detail.recentActivity.map((a) => ({ id: a.id, at: a.created_at, action: a.action, detail: getActivityMetadataSummary(a) ?? "" })),
    performance: allowed ? await getUserPerformance(m.id, role) : null,
    canEdit: allowed,
    isSelf,
  };
}
