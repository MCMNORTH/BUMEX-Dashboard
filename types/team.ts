import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole, AvailabilityStatus, Profile } from "@/types/auth";

export type TeamReference = {
  id: string;
  name: string;
  role: string;
};

export type TeamWorkloadLevel = "light" | "balanced" | "high" | "critical";
export type WorkloadRisk = "low" | "moderate" | "high";
export type AssignmentState = "available" | "steady" | "loaded" | "attention";

export type TeamMemberRecord = Profile & {
  teams: TeamReference[];
  active_projects_count: number;
  active_tasks_count: number;
  overdue_tasks_count: number;
  blocked_tasks_count: number;
  completed_tasks_count: number;
  completion_rate: number;
  recent_activity_count: number;
  last_activity_at: string | null;
  workload_score: number;
  workload_level: TeamWorkloadLevel;
  assignment_state: AssignmentState;
  assigned_projects_preview: TeamMemberProjectPreview[];
  current_focus: TeamMemberTicketPreview[];
};

export type TeamMemberProjectPreview = {
  id: string;
  name: string;
  status: string;
  end_date: string | null;
  role: string;
  client_name: string | null;
};

export type TeamMemberTicketPreview = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_name: string | null;
  updated_at: string;
};

export type TeamFilters = {
  search?: string;
  role?: AppRole | "";
  teamId?: string;
  availability?: AvailabilityStatus | "";
  workload?: TeamWorkloadLevel | "";
};

export type TeamFiltersData = {
  teams: TeamReference[];
};

export type TeamMemberFormValues = {
  full_name: string;
  avatar_url: string;
  job_title: string;
  department: string;
  role: AppRole;
  skills: string;
  phone: string;
  availability_status: AvailabilityStatus;
  weekly_capacity_hours: string;
};

export type TeamCapacitySummary = {
  headcount: number;
  available: number;
  overloaded: number;
  activeProjects: number;
  activeTasks: number;
  weeklyCapacityHours: number;
};

export type TeamWorkloadRecord = {
  id: string;
  full_name: string;
  role: AppRole;
  job_title: string | null;
  department: string | null;
  availability_status: AvailabilityStatus;
  weekly_capacity_hours: number;
  active_work_items: number;
  overdue_items: number;
  estimated_hours_total: number;
  utilization: number;
  utilization_percentage: number;
  workload_level: TeamWorkloadLevel;
  workload_risk: WorkloadRisk;
};

export type AssignmentHelperRecord = {
  currentAssignee: TeamWorkloadRecord | null;
  suggestedMembers: TeamWorkloadRecord[];
};

export type VelocityPoint = {
  label: string;
  completed: number;
};

export type ContributionProjectPoint = {
  projectId: string;
  projectName: string;
  completed: number;
};

export type CompletedWorkTimelineItem = {
  id: string;
  title: string;
  projectName: string | null;
  completedAt: string;
  completedOnTime: boolean;
};

export type UserPerformance = {
  memberId: string;
  completedThisWeek: number;
  completedThisMonth: number;
  completedOnTime: number;
  onTimeCompletionRate: number;
  overdueTickets: number;
  averageCompletionDays: number;
  blockedTickets: number;
  activeWorkload: number;
  contributionByProject: ContributionProjectPoint[];
  upcomingDeadlines: TeamMemberTicketPreview[];
  recentDeliveredWork: CompletedWorkTimelineItem[];
  currentFocus: TeamMemberTicketPreview[];
};

export type TeamPerformance = {
  completedThisWeek: number;
  completedThisMonth: number;
  onTimeCompletionRate: number;
  overdueTickets: number;
  averageCompletionDays: number;
  blockedTickets: number;
  activeWorkload: number;
  velocityTrend: VelocityPoint[];
  completionDistribution: Array<{ label: string; value: number }>;
  workloadVsCompletion: Array<{ name: string; workload: number; completed: number }>;
  blockersSummary: Array<{ projectName: string; count: number }>;
  contributionByProject: ContributionProjectPoint[];
};

export type TeamMemberDetail = {
  member: TeamMemberRecord;
  assignedProjects: TeamMemberProjectPreview[];
  assignedTickets: TeamMemberTicketPreview[];
  weeklyPlanning: TeamMemberTicketPreview[];
  recentActivity: ActivityLogRecord[];
  performancePreview: {
    completedTickets: number;
    overdueTickets: number;
    recentlyUpdatedTickets: number;
    utilizationRate: number;
  };
};
