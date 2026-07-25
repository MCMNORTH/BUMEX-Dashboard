import type { Profile } from "@/types/auth";
import type { ProjectRecord } from "@/types/project";

export type TicketStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "blocked"
  | "done"
  | "archived";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketType =
  | "task"
  | "bug"
  | "feature"
  | "support"
  | "client_request"
  | "internal";

export type TicketViewMode = "full" | "summary";
export type TicketWorkspaceView = "table" | "kanban";
export type TicketSavedViewKey = "my_open" | "overdue" | "high_priority" | "waiting_review";
export type TicketTableColumnKey =
  | "title"
  | "type"
  | "project"
  | "status"
  | "priority"
  | "assignee"
  | "due_date"
  | "updated_at"
  | "actions";

export type TicketAssignee = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;
export type TicketReporter = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;
export type TicketProject = Pick<ProjectRecord, "id" | "name" | "status" | "client" | "end_date">;

export type TicketActivity = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: import("@/types/activity").ActivityEntityType;
  entity_id: string;
  metadata: import("@/types/activity").ActivityMetadata;
  created_at: string;
  user: Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
};

export type TicketRecord = {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
  project: TicketProject | null;
  assignee: TicketAssignee | null;
  reporter: TicketReporter | null;
  activity: TicketActivity[];
  viewMode: TicketViewMode;
};

export type TicketFilters = {
  search?: string;
  status?: TicketStatus | "";
  priority?: TicketPriority | "";
  assigneeId?: string;
  projectId?: string;
  dueDate?: "all" | "overdue" | "this_week" | "this_month" | "none";
  type?: TicketType | "";
};

export type TicketFormValues = {
  title: string;
  description: string;
  project_id: string;
  assignee_id: string;
  reporter_id: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  due_date: string;
  estimated_hours: string;
  actual_hours: string;
  github_issue_url: string;
};

export type TicketFiltersData = {
  assignees: TicketAssignee[];
  reporters: TicketReporter[];
  projects: TicketProject[];
};

export type TicketStats = {
  total: number;
  mine: number;
  urgent: number;
  blocked: number;
};

export type TicketWorkloadRecord = {
  id: string;
  full_name: string;
  role: Profile["role"];
  assignedTickets: number;
  overdueTickets: number;
  activeTickets: number;
};
