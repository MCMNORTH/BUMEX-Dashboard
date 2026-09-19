import type { AppRole, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

export type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "cancelled";
export type ProjectPriority = "low" | "medium" | "high" | "critical";
export type ProjectKind = "client_mission" | "institutional_partnership" | "internal_product" | "internal_tool";
export type ProjectHealth = "healthy" | "warning" | "at_risk" | "delayed";
export type DeadlineState = "on-track" | "due-soon" | "overdue" | "none";

export type ProjectClient = {
  id: string;
  name: string;
  contact_email: string | null;
};

export type ProjectOwner = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type ProjectMember = {
  id: string;
  role: AppRole;
  user: Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role"> | null;
};

export type ProjectTaskPreview = {
  id: string;
  title: string;
  status: string;
  priority: ProjectPriority;
  due_date: string | null;
  assignee_id: string | null;
  created_at?: string;
};
export type ProjectActivity = import("@/types/activity").ActivityLogRecord;

export type ProjectStatusBreakdown = {
  backlog: number;
  todo: number;
  in_progress: number;
  review: number;
  blocked: number;
  done: number;
  archived: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  // Internal BUMEX products and tools deliberately have no external client.
  client_id: string | null;
  status: ProjectStatus;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  budget_amount: number | null;
  priority: ProjectPriority | null;
  project_kind: ProjectKind;
  manual_progress: number | null;
  entity_code: BumexEntityCode | null;
  client: ProjectClient | null;
  owner: ProjectOwner | null;
  members: ProjectMember[];
  tasks: ProjectTaskPreview[];
  recentActivity: ProjectActivity[];
  progress: number;
  health: ProjectHealth;
  completedTasks: number;
  totalTasks: number;
  deadlineState: DeadlineState;
  overdueTasks: ProjectTaskPreview[];
  upcomingDeadlines: ProjectTaskPreview[];
  statusBreakdown: ProjectStatusBreakdown;
};

export type ProjectFilters = {
  search?: string;
  status?: ProjectStatus | "";
  clientId?: string;
  ownerId?: string;
  health?: ProjectHealth | "attention" | "";
  kind?: ProjectKind | "";
  deadline?: "all" | "overdue" | "this_week" | "this_month" | "none";
};

export type ProjectFormValues = {
  name: string;
  client_id: string;
  description: string;
  owner_id: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  budget_amount: string;
  priority: ProjectPriority | "";
  project_kind: ProjectKind;
  manual_progress: string;
};

export type ProjectFiltersData = {
  clients: ProjectClient[];
  owners: ProjectOwner[];
  activeEntity: {
    code: BumexEntityCode;
    name: string;
  };
};
