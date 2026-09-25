import "server-only";

import { logActivity } from "@/lib/activity/service";
import { getCurrentEntityCode, getEntityScopedCacheKey, isEntityScopingEnabled } from "@/lib/entities/scope";
import { getProjects } from "@/lib/projects/service";
import { getCached } from "@/lib/server-cache";
import { createClient } from "@/lib/supabase/server";
import { getTickets, getTicketsAcrossEntities } from "@/lib/tickets/service";
import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole, Profile } from "@/types/auth";
import type {
  AssignmentState,
  AssignmentHelperRecord,
  CompletedWorkTimelineItem,
  ContributionProjectPoint,
  TeamCapacitySummary,
  TeamFilters,
  TeamFiltersData,
  TeamMemberDetail,
  TeamMemberFormValues,
  TeamMemberProjectPreview,
  TeamMemberRecord,
  TeamMemberTicketPreview,
  TeamPerformance,
  TeamReference,
  TeamWorkloadRecord,
  TeamWorkloadLevel,
  UserPerformance,
  VelocityPoint,
  WorkloadRisk,
} from "@/types/team";

type TeamMembershipRow = {
  id: string;
  role: string;
  team:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
};

type TeamProfileRow = Profile & {
  team_members: TeamMembershipRow[] | null;
};

type ActivityAggregateRow = {
  entity_id: string;
  created_at: string;
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeSkills(raw: string) {
  return raw
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek() {
  const value = startOfToday();
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function startOfMonth() {
  const value = startOfToday();
  value.setDate(1);
  return value;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

function isCompleted(ticket: Awaited<ReturnType<typeof getTickets>>[number]) {
  return ticket.status === "done";
}

function completedOnTime(ticket: Awaited<ReturnType<typeof getTickets>>[number]) {
  if (!isCompleted(ticket)) {
    return false;
  }

  if (!ticket.due_date) {
    return true;
  }

  return new Date(ticket.updated_at).getTime() <= new Date(ticket.due_date).setHours(23, 59, 59, 999);
}

function buildContributionByProject(tickets: Awaited<ReturnType<typeof getTickets>>): ContributionProjectPoint[] {
  const map = new Map<string, ContributionProjectPoint>();

  for (const ticket of tickets.filter(isCompleted)) {
    const projectId = ticket.project?.id ?? "unassigned";
    const projectName = ticket.project?.name ?? "Unassigned";
    const current = map.get(projectId) ?? { projectId, projectName, completed: 0 };
    current.completed += 1;
    map.set(projectId, current);
  }

  return Array.from(map.values())
    .sort((left, right) => right.completed - left.completed)
    .slice(0, 6);
}

export function calculateOnTimeCompletionRate(tickets: Awaited<ReturnType<typeof getTickets>>) {
  const completedTickets = tickets.filter(isCompleted);

  if (!completedTickets.length) {
    return 0;
  }

  const onTime = completedTickets.filter(completedOnTime).length;
  return Math.round((onTime / completedTickets.length) * 100);
}

export function calculateAverageCompletionTime(tickets: Awaited<ReturnType<typeof getTickets>>) {
  const completedTickets = tickets.filter(isCompleted);

  if (!completedTickets.length) {
    return 0;
  }

  const totalDays = completedTickets.reduce((sum, ticket) => sum + daysBetween(ticket.created_at, ticket.updated_at), 0);
  return Number((totalDays / completedTickets.length).toFixed(1));
}

export function getCompletedWorkTimeline(tickets: Awaited<ReturnType<typeof getTickets>>): CompletedWorkTimelineItem[] {
  return tickets
    .filter(isCompleted)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 10)
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      projectName: ticket.project?.name ?? null,
      completedAt: ticket.updated_at,
      completedOnTime: completedOnTime(ticket),
    }));
}

function buildVelocityTrend(tickets: Awaited<ReturnType<typeof getTickets>>): VelocityPoint[] {
  const points: VelocityPoint[] = [];
  const today = startOfToday();

  for (let index = 5; index >= 0; index -= 1) {
    const start = new Date(today);
    start.setDate(today.getDate() - index * 7);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start);
    const completed = tickets.filter((ticket) => {
      if (!isCompleted(ticket)) {
        return false;
      }

      const completedAt = new Date(ticket.updated_at);
      return completedAt >= start && completedAt <= end;
    }).length;

    points.push({ label, completed });
  }

  return points;
}

function buildCompletionDistribution(tickets: Awaited<ReturnType<typeof getTickets>>) {
  const completed = tickets.filter(isCompleted).length;
  const active = tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "archived").length;
  const blocked = tickets.filter((ticket) => ticket.status === "blocked").length;

  return [
    { label: "Completed", value: completed },
    { label: "Active", value: active },
    { label: "Blocked", value: blocked },
  ];
}

function buildWorkloadVsCompletion(workload: TeamWorkloadRecord[], tickets: Awaited<ReturnType<typeof getTickets>>) {
  const completedByUser = new Map<string, number>();

  for (const ticket of tickets.filter(isCompleted)) {
    if (!ticket.assignee?.id) {
      continue;
    }

    completedByUser.set(ticket.assignee.id, (completedByUser.get(ticket.assignee.id) ?? 0) + 1);
  }

  return workload.slice(0, 8).map((member) => ({
    name: member.full_name,
    workload: member.active_work_items,
    completed: completedByUser.get(member.id) ?? 0,
  }));
}

function buildBlockersSummary(tickets: Awaited<ReturnType<typeof getTickets>>) {
  const blockers = new Map<string, { projectName: string; count: number }>();

  for (const ticket of tickets.filter((entry) => entry.status === "blocked")) {
    const projectName = ticket.project?.name ?? "Unassigned";
    const current = blockers.get(projectName) ?? { projectName, count: 0 };
    current.count += 1;
    blockers.set(projectName, current);
  }

  return Array.from(blockers.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

function getWorkloadLevel(activeTasks: number, capacityHours: number): TeamWorkloadLevel {
  const effectiveCapacity = Math.max(capacityHours, 1);
  const ratio = (activeTasks * 6) / effectiveCapacity;

  if (activeTasks >= 8 || ratio >= 0.9) {
    return "critical";
  }

  if (activeTasks >= 5 || ratio >= 0.65) {
    return "high";
  }

  if (activeTasks >= 2 || ratio >= 0.35) {
    return "balanced";
  }

  return "light";
}

export function calculateUtilization(estimatedHoursTotal: number, weeklyCapacityHours: number) {
  const effectiveCapacity = Math.max(weeklyCapacityHours, 1);
  return estimatedHoursTotal / effectiveCapacity;
}

function getWorkloadRisk(utilization: number, overdueItems: number): WorkloadRisk {
  if (utilization > 1 || overdueItems >= 2) {
    return "high";
  }

  if (utilization >= 0.75 || overdueItems === 1) {
    return "moderate";
  }

  return "low";
}

function getWorkloadScore(activeTasks: number, capacityHours: number) {
  const effectiveCapacity = Math.max(capacityHours, 1);
  return Math.min(100, Math.round(((activeTasks * 6) / effectiveCapacity) * 100));
}

function getDerivedAvailability(utilization: number): Profile["availability_status"] {
  if (utilization > 1) {
    return "overloaded";
  }

  if (utilization >= 0.75) {
    return "busy";
  }

  return "available";
}

function mapTeams(memberships: TeamMembershipRow[] | null): TeamReference[] {
  return (memberships ?? [])
    .map((membership) => {
      const team = single(membership.team);

      if (!team) {
        return null;
      }

      return {
        id: team.id,
        name: team.name,
        role: membership.role,
      } satisfies TeamReference;
    })
    .filter((team): team is TeamReference => Boolean(team));
}

async function getTeamProfiles() {
  const entityCode = await getCurrentEntityCode();
  return getCached(getEntityScopedCacheKey("team-profiles", entityCode), 30_000, () =>
    getFreshTeamProfiles(entityCode),
  );
}

async function getFreshTeamProfiles(entityCode?: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const shouldScopeByEntity = isEntityScopingEnabled() && Boolean(entityCode);
  const { data, error } = shouldScopeByEntity
    ? await supabase
        .from("profiles")
        .select(
          `
            id,
            email,
            full_name,
            role,
            is_super_admin,
            entity_code,
            avatar_url,
            job_title,
            department,
            skills,
            phone,
            availability_status,
            weekly_capacity_hours,
            created_at,
            updated_at,
            team_members (
              id,
              role,
              team:teams (
                id,
                name
              )
            )
          `,
        )
        .eq("entity_code", entityCode ?? "")
        .order("full_name", { ascending: true })
        .returns<TeamProfileRow[]>()
    : await supabase
        .from("profiles")
        .select(
          `
            id,
            email,
            full_name,
            role,
            is_super_admin,
            entity_code,
            avatar_url,
            job_title,
            department,
            skills,
            phone,
            availability_status,
            weekly_capacity_hours,
            created_at,
            updated_at,
            team_members (
              id,
              role,
              team:teams (
                id,
                name
              )
            )
          `,
        )
        .order("full_name", { ascending: true })
        .returns<TeamProfileRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function getProfileActivitySummary(profileIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !profileIds.length) {
    return new Map<string, { count: number; lastActivityAt: string | null }>();
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select("entity_id, created_at")
    .eq("entity_type", "profile")
    .in("entity_id", profileIds)
    .returns<ActivityAggregateRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const summary = new Map<string, { count: number; lastActivityAt: string | null }>();

  for (const row of data ?? []) {
    const current = summary.get(row.entity_id) ?? { count: 0, lastActivityAt: null };
    current.count += 1;

    if (!current.lastActivityAt || new Date(row.created_at).getTime() > new Date(current.lastActivityAt).getTime()) {
      current.lastActivityAt = row.created_at;
    }

    summary.set(row.entity_id, current);
  }

  return summary;
}

function mapTicketPreview(ticket: Awaited<ReturnType<typeof getTickets>>[number]): TeamMemberTicketPreview {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    due_date: ticket.due_date,
    project_name: ticket.project?.name ?? null,
    updated_at: ticket.updated_at,
  };
}

function getAssignmentState(activeTasks: number, overdueTasks: number, blockedTasks: number): AssignmentState {
  if (overdueTasks >= 2 || blockedTasks >= 2) {
    return "attention";
  }

  if (activeTasks >= 6 || overdueTasks >= 1 || blockedTasks >= 1) {
    return "loaded";
  }

  if (activeTasks >= 2) {
    return "steady";
  }

  return "available";
}

function assignmentStateRank(state: AssignmentState) {
  return {
    attention: 0,
    loaded: 1,
    steady: 2,
    available: 3,
  }[state];
}

function mapProjectPreview(
  project: Awaited<ReturnType<typeof getProjects>>[number],
  userId: string,
): TeamMemberProjectPreview {
  const membershipRole =
    project.owner?.id === userId
      ? "owner"
      : project.members.find((member) => member.user?.id === userId)?.role ?? "member";

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    end_date: project.end_date,
    role: membershipRole,
    client_name: project.client?.name ?? null,
  };
}

function applyMemberFilters(member: TeamMemberRecord, filters: TeamFilters) {
  const normalizedSearch = filters.search?.trim().toLowerCase();

  if (normalizedSearch) {
    const haystack = [
      member.full_name,
      member.email,
      member.job_title ?? "",
      member.department ?? "",
      member.skills.join(" "),
      member.teams.map((team) => team.name).join(" "),
      member.assigned_projects_preview.map((project) => `${project.name} ${project.client_name ?? ""}`).join(" "),
      member.current_focus.map((ticket) => `${ticket.title} ${ticket.project_name ?? ""}`).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(normalizedSearch)) {
      return false;
    }
  }

  if (filters.role && member.role !== filters.role) {
    return false;
  }

  if (filters.teamId && !member.teams.some((team) => team.id === filters.teamId)) {
    return false;
  }

  if (filters.availability && member.availability_status !== filters.availability) {
    return false;
  }

  if (filters.workload && member.workload_level !== filters.workload) {
    return false;
  }

  if (filters.assignment === "engaged" && member.active_projects_count === 0 && member.active_tasks_count === 0) {
    return false;
  }

  if (filters.assignment && filters.assignment !== "engaged" && member.assignment_state !== filters.assignment) {
    return false;
  }

  return true;
}

export async function getTeamMembers(role: AppRole, filters: TeamFilters = {}): Promise<TeamMemberRecord[]> {
  if (role === "shareholder") {
    return [];
  }

  const [profiles, projects, tickets] = await Promise.all([getTeamProfiles(), getProjects(), getTickets(role)]);
  const activitySummary = await getProfileActivitySummary(profiles.map((profile) => profile.id));

  const projectCounts = new Map<string, number>();
  const projectPreviewMap = new Map<string, TeamMemberProjectPreview[]>();
  for (const project of projects) {
    if (project.status === "completed" || project.status === "cancelled") {
      continue;
    }

    const uniqueIds = new Set<string>();

    if (project.owner?.id) {
      uniqueIds.add(project.owner.id);
    }

    for (const member of project.members) {
      if (member.user?.id) {
        uniqueIds.add(member.user.id);
      }
    }

    for (const id of uniqueIds) {
      projectCounts.set(id, (projectCounts.get(id) ?? 0) + 1);
      const previews = projectPreviewMap.get(id) ?? [];
      previews.push(mapProjectPreview(project, id));
      projectPreviewMap.set(id, previews);
    }
  }

  const taskCounts = new Map<string, number>();
  const overdueTaskCounts = new Map<string, number>();
  const blockedTaskCounts = new Map<string, number>();
  const completedTaskCounts = new Map<string, number>();
  const focusMap = new Map<string, TeamMemberTicketPreview[]>();
  const today = startOfToday().getTime();
  for (const ticket of tickets) {
    if (!ticket.assignee?.id) {
      continue;
    }

    if (ticket.status === "done") {
      completedTaskCounts.set(ticket.assignee.id, (completedTaskCounts.get(ticket.assignee.id) ?? 0) + 1);
      continue;
    }

    if (ticket.status === "archived") {
      continue;
    }

    taskCounts.set(ticket.assignee.id, (taskCounts.get(ticket.assignee.id) ?? 0) + 1);

    if (ticket.status === "blocked") {
      blockedTaskCounts.set(ticket.assignee.id, (blockedTaskCounts.get(ticket.assignee.id) ?? 0) + 1);
    }

    if (ticket.due_date && new Date(ticket.due_date).getTime() < today) {
      overdueTaskCounts.set(ticket.assignee.id, (overdueTaskCounts.get(ticket.assignee.id) ?? 0) + 1);
    }

    const focus = focusMap.get(ticket.assignee.id) ?? [];
    focus.push(mapTicketPreview(ticket));
    focusMap.set(ticket.assignee.id, focus);
  }

  const members = profiles.map((profile) => {
    const activeTasksCount = taskCounts.get(profile.id) ?? 0;
    const overdueTasksCount = overdueTaskCounts.get(profile.id) ?? 0;
    const blockedTasksCount = blockedTaskCounts.get(profile.id) ?? 0;
    const completedTasksCount = completedTaskCounts.get(profile.id) ?? 0;
    const assignedProjects = (projectPreviewMap.get(profile.id) ?? [])
      .sort((left, right) => {
        const leftTime = left.end_date ? new Date(left.end_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.end_date ? new Date(right.end_date).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 3);
    const currentFocus = (focusMap.get(profile.id) ?? [])
      .sort((left, right) => {
        const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;

        if (leftDue !== rightDue) {
          return leftDue - rightDue;
        }

        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      })
      .slice(0, 4);
    const visibleTicketTotal = activeTasksCount + completedTasksCount;
    const summary = activitySummary.get(profile.id);

    return {
      ...profile,
      skills: profile.skills ?? [],
      teams: mapTeams(profile.team_members),
      active_projects_count: projectCounts.get(profile.id) ?? 0,
      active_tasks_count: activeTasksCount,
      overdue_tasks_count: overdueTasksCount,
      blocked_tasks_count: blockedTasksCount,
      completed_tasks_count: completedTasksCount,
      completion_rate: visibleTicketTotal ? Math.round((completedTasksCount / visibleTicketTotal) * 100) : 0,
      recent_activity_count: summary?.count ?? 0,
      last_activity_at: summary?.lastActivityAt ?? null,
      workload_score: getWorkloadScore(activeTasksCount, profile.weekly_capacity_hours),
      workload_level: getWorkloadLevel(activeTasksCount, profile.weekly_capacity_hours),
      assignment_state: getAssignmentState(activeTasksCount, overdueTasksCount, blockedTasksCount),
      assigned_projects_preview: assignedProjects,
      current_focus: currentFocus,
    } satisfies TeamMemberRecord;
  });

  return members
    .filter((member) => applyMemberFilters(member, filters))
    .sort((left, right) => {
      const stateDiff = assignmentStateRank(left.assignment_state) - assignmentStateRank(right.assignment_state);
      if (stateDiff !== 0) {
        return stateDiff;
      }

      if (left.active_tasks_count !== right.active_tasks_count) {
        return right.active_tasks_count - left.active_tasks_count;
      }

      return left.full_name.localeCompare(right.full_name);
    });
}

export async function getTeamWorkload(role: AppRole, currentUserId?: string, acrossEntities = false): Promise<TeamWorkloadRecord[]> {
  if (role === "shareholder") {
    return [];
  }

  const [profiles, tickets] = await Promise.all([
    acrossEntities ? getFreshTeamProfiles() : getTeamProfiles(),
    acrossEntities ? getTicketsAcrossEntities(role) : getTickets(role),
  ]);
  const workloadMap = new Map<string, TeamWorkloadRecord>();

  for (const profile of profiles) {
    workloadMap.set(profile.id, {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      entity_code: profile.entity_code,
      job_title: profile.job_title,
      department: profile.department,
      availability_status: profile.availability_status,
      weekly_capacity_hours: profile.weekly_capacity_hours,
      active_work_items: 0,
      overdue_items: 0,
      estimated_hours_total: 0,
      utilization: 0,
      utilization_percentage: 0,
      workload_level: "light",
      workload_risk: "low",
    });
  }

  const today = new Date().setHours(0, 0, 0, 0);

  for (const ticket of tickets) {
    if (!ticket.assignee?.id || ticket.status === "done" || ticket.status === "archived") {
      continue;
    }

    const current = workloadMap.get(ticket.assignee.id);
    if (!current) {
      continue;
    }

    current.active_work_items += 1;
    current.estimated_hours_total += ticket.estimated_hours ?? 0;

    if (ticket.due_date && new Date(ticket.due_date).getTime() < today) {
      current.overdue_items += 1;
    }
  }

  const records = Array.from(workloadMap.values()).map((record) => {
    const utilization = calculateUtilization(record.estimated_hours_total, record.weekly_capacity_hours);
    const workloadLevel = getWorkloadLevel(record.active_work_items, record.weekly_capacity_hours);
    const derivedAvailability = getDerivedAvailability(utilization);

    return {
      ...record,
      availability_status:
        record.availability_status === "away" || record.availability_status === "inactive"
          ? record.availability_status
          : derivedAvailability,
      utilization,
      utilization_percentage: Math.round(utilization * 100),
      workload_level: workloadLevel,
      workload_risk: getWorkloadRisk(utilization, record.overdue_items),
    } satisfies TeamWorkloadRecord;
  });

  const sorted = records.sort((left, right) => {
    if (right.utilization_percentage !== left.utilization_percentage) {
      return right.utilization_percentage - left.utilization_percentage;
    }

    return left.full_name.localeCompare(right.full_name);
  });

  if (role === "employee" && currentUserId) {
    const self = sorted.find((record) => record.id === currentUserId);
    const peers = sorted.filter((record) => record.id !== currentUserId).slice(0, 5);
    return self ? [self, ...peers] : peers;
  }

  return sorted;
}

export async function getUserWorkload(userId: string, role: AppRole) {
  const workload = await getTeamWorkload(role, userId);
  return workload.find((record) => record.id === userId) ?? null;
}

export async function getAvailableTeamMembers(role: AppRole, excludeUserId?: string): Promise<TeamWorkloadRecord[]> {
  const workload = await getTeamWorkload(role);

  return workload
    .filter((member) => member.id !== excludeUserId)
    .filter((member) => member.availability_status === "available" || member.availability_status === "busy")
    .filter((member) => member.workload_risk !== "high")
    .sort((left, right) => {
      if (left.utilization_percentage !== right.utilization_percentage) {
        return left.utilization_percentage - right.utilization_percentage;
      }

      return left.full_name.localeCompare(right.full_name);
    })
    .slice(0, 6);
}

export async function getOverloadedTeamMembers(role: AppRole, currentUserId?: string): Promise<TeamWorkloadRecord[]> {
  const workload = await getTeamWorkload(role, currentUserId);

  return workload
    .filter((member) => member.availability_status === "overloaded" || member.workload_risk === "high")
    .slice(0, 6);
}

export async function getAssignmentHelperData(
  role: AppRole,
  assigneeId?: string,
): Promise<AssignmentHelperRecord> {
  if (role === "shareholder") {
    return { currentAssignee: null, suggestedMembers: [] };
  }

  const [currentAssignee, suggestedMembers] = await Promise.all([
    assigneeId ? getUserWorkload(assigneeId, role) : Promise.resolve(null),
    getAvailableTeamMembers(role, assigneeId),
  ]);

  return {
    currentAssignee,
    suggestedMembers,
  };
}

export async function getTeamFiltersData(): Promise<TeamFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("teams")
    .select("id, name")
    .order("name", { ascending: true })
    .returns<Array<{ id: string; name: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    teams: (data ?? []).map((team) => ({ ...team, role: "member" })),
  };
}

export async function getTeamMemberProjects(userId: string): Promise<TeamMemberProjectPreview[]> {
  const projects = await getProjects();

  return projects
    .filter((project) => project.owner?.id === userId || project.members.some((member) => member.user?.id === userId))
    .map((project) => mapProjectPreview(project, userId));
}

export async function getTeamMemberTickets(userId: string, role: AppRole): Promise<TeamMemberTicketPreview[]> {
  const tickets = await getTickets(role, { assigneeId: userId });
  return tickets.map(mapTicketPreview);
}

export async function getTeamMemberActivity(userId: string): Promise<ActivityLogRecord[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .or(`and(entity_type.eq.profile,entity_id.eq.${userId}),user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<ActivityLogRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getTeamMemberById(id: string, role: AppRole): Promise<TeamMemberDetail | null> {
  if (role === "shareholder") {
    return null;
  }

  const members = await getTeamMembers(role);
  const member = members.find((entry) => entry.id === id);

  if (!member) {
    return null;
  }

  const [assignedProjects, assignedTickets, recentActivity, workload] = await Promise.all([
    getTeamMemberProjects(id),
    getTeamMemberTickets(id, role),
    getTeamMemberActivity(id),
    getUserWorkload(id, role),
  ]);

  const weeklyPlanning = assignedTickets
    .filter((ticket) => {
      if (!ticket.due_date || ticket.status === "done" || ticket.status === "archived") {
        return false;
      }

      const dueDate = new Date(ticket.due_date);
      const today = new Date();
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + 7);
      return dueDate >= today && dueDate <= endOfWeek;
    })
    .sort((left, right) => {
      if (!left.due_date || !right.due_date) {
        return 0;
      }

      return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
    });

  const completedTickets = assignedTickets.filter((ticket) => ticket.status === "done").length;
  const overdueTickets = assignedTickets.filter((ticket) => {
    if (!ticket.due_date || ticket.status === "done" || ticket.status === "archived") {
      return false;
    }

    return new Date(ticket.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
  }).length;
  const recentlyUpdatedTickets = assignedTickets.filter((ticket) => {
    const updatedAt = new Date(ticket.updated_at);
    const limit = new Date();
    limit.setDate(limit.getDate() - 7);
    return updatedAt >= limit;
  }).length;

  return {
    member,
    assignedProjects,
    assignedTickets,
    weeklyPlanning,
    recentActivity,
    performancePreview: {
      completedTickets,
      overdueTickets,
      recentlyUpdatedTickets,
      utilizationRate: workload?.utilization_percentage ?? member.workload_score,
    },
  };
}

export async function getUserPerformance(userId: string, role: AppRole): Promise<UserPerformance | null> {
  if (role === "shareholder") {
    return null;
  }

  const tickets = await getTickets(role, { assigneeId: userId });
  const today = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

  const completedTickets = tickets.filter(isCompleted);
  const completedThisWeek = completedTickets.filter((ticket) => new Date(ticket.updated_at) >= weekStart).length;
  const completedThisMonth = completedTickets.filter((ticket) => new Date(ticket.updated_at) >= monthStart).length;
  const upcomingDeadlines = tickets
    .filter((ticket) => ticket.due_date && ticket.status !== "done" && ticket.status !== "archived" && new Date(ticket.due_date) >= today)
    .sort((left, right) => new Date(left.due_date ?? left.updated_at).getTime() - new Date(right.due_date ?? right.updated_at).getTime())
    .slice(0, 6)
    .map(mapTicketPreview);
  const currentFocus = tickets
    .filter((ticket) => ticket.status !== "done" && ticket.status !== "archived")
    .sort((left, right) => {
      const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })
    .slice(0, 5)
    .map(mapTicketPreview);

  return {
    memberId: userId,
    completedThisWeek,
    completedThisMonth,
    completedOnTime: completedTickets.filter(completedOnTime).length,
    onTimeCompletionRate: calculateOnTimeCompletionRate(tickets),
    overdueTickets: tickets.filter((ticket) => ticket.due_date && ticket.status !== "done" && ticket.status !== "archived" && new Date(ticket.due_date) < today).length,
    averageCompletionDays: calculateAverageCompletionTime(tickets),
    blockedTickets: tickets.filter((ticket) => ticket.status === "blocked").length,
    activeWorkload: tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "archived").length,
    contributionByProject: buildContributionByProject(tickets),
    upcomingDeadlines,
    recentDeliveredWork: getCompletedWorkTimeline(tickets),
    currentFocus,
  };
}

export async function getTeamPerformance(role: AppRole, currentUserId?: string): Promise<TeamPerformance> {
  const scopedRole = role === "shareholder" ? "manager" : role;
  const [tickets, workload] = await Promise.all([
    getTickets(scopedRole),
    role === "shareholder" ? Promise.resolve([]) : getTeamWorkload(scopedRole, currentUserId),
  ]);
  const today = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();
  const visibleTickets =
    role === "employee" && currentUserId
      ? tickets.filter((ticket) => ticket.assignee?.id === currentUserId)
      : tickets;

  const completedTickets = visibleTickets.filter(isCompleted);

  return {
    completedThisWeek: completedTickets.filter((ticket) => new Date(ticket.updated_at) >= weekStart).length,
    completedThisMonth: completedTickets.filter((ticket) => new Date(ticket.updated_at) >= monthStart).length,
    onTimeCompletionRate: calculateOnTimeCompletionRate(visibleTickets),
    overdueTickets: visibleTickets.filter((ticket) => ticket.due_date && ticket.status !== "done" && ticket.status !== "archived" && new Date(ticket.due_date) < today).length,
    averageCompletionDays: calculateAverageCompletionTime(visibleTickets),
    blockedTickets: visibleTickets.filter((ticket) => ticket.status === "blocked").length,
    activeWorkload: visibleTickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "archived").length,
    velocityTrend: buildVelocityTrend(visibleTickets),
    completionDistribution: buildCompletionDistribution(visibleTickets),
    workloadVsCompletion: buildWorkloadVsCompletion(workload, visibleTickets),
    blockersSummary: buildBlockersSummary(visibleTickets),
    contributionByProject: buildContributionByProject(visibleTickets),
  };
}

export async function updateTeamMember(
  memberId: string,
  values: TeamMemberFormValues,
  actor: { id: string; role: AppRole },
) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, job_title, department, skills, phone, availability_status, weekly_capacity_hours")
    .eq("id", memberId)
    .maybeSingle<Pick<Profile, "id" | "full_name" | "role" | "avatar_url" | "job_title" | "department" | "skills" | "phone" | "availability_status" | "weekly_capacity_hours">>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error("Team member not found.");
  }

  const payload = {
    full_name: values.full_name.trim(),
    avatar_url: values.avatar_url.trim() || null,
    job_title: values.job_title.trim() || null,
    department: values.department.trim() || null,
    role: values.role,
    skills: normalizeSkills(values.skills),
    phone: values.phone.trim() || null,
    availability_status: values.availability_status,
    weekly_capacity_hours: Number(values.weekly_capacity_hours),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").update(payload).eq("id", memberId);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actor.id,
    action: `Updated profile ${payload.full_name}`,
    entityType: "profile",
    entityId: memberId,
    metadata: {
      kind: "update",
      summary: "Profile updated",
    },
  });

  if (existing.availability_status !== payload.availability_status) {
    await logActivity({
      userId: actor.id,
      action: "Availability changed",
      entityType: "profile",
      entityId: memberId,
      metadata: {
        kind: "status_change",
        field: "availability_status",
        from: existing.availability_status,
        to: payload.availability_status,
        summary: "Availability updated",
      },
    });
  }

  if (existing.weekly_capacity_hours !== payload.weekly_capacity_hours) {
    await logActivity({
      userId: actor.id,
      action: "Capacity changed",
      entityType: "profile",
      entityId: memberId,
      metadata: {
        kind: "update",
        field: "weekly_capacity_hours",
        from: existing.weekly_capacity_hours,
        to: payload.weekly_capacity_hours,
        summary: "Weekly capacity updated",
      },
    });
  }
}

export async function getTeamCapacitySummary(role: AppRole): Promise<TeamCapacitySummary> {
  if (role === "shareholder") {
    const tickets = await getTickets(role);
    const workload = await getTeamWorkload("manager");

    return {
      headcount: workload.length,
      available: workload.filter((entry) => entry.availability_status === "available").length,
      overloaded: workload.filter((entry) => entry.availability_status === "overloaded").length,
      activeProjects: (await getProjects()).length,
      activeTasks: tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "archived").length,
      weeklyCapacityHours: workload.reduce((sum, member) => sum + member.weekly_capacity_hours, 0),
    };
  }

  const [members, workload] = await Promise.all([getTeamMembers(role), getTeamWorkload(role)]);

  return {
    headcount: members.length,
    available: workload.filter((member) => member.availability_status === "available").length,
    overloaded: workload.filter((member) => member.availability_status === "overloaded" || member.workload_risk === "high").length,
    activeProjects: members.reduce((sum, member) => sum + member.active_projects_count, 0),
    activeTasks: workload.reduce((sum, member) => sum + member.active_work_items, 0),
    weeklyCapacityHours: workload.reduce((sum, member) => sum + member.weekly_capacity_hours, 0),
  };
}
