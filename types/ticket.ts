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
export type TicketProject = Pick<ProjectRecord, "id" | "name" | "status" | "client" | "end_date" | "entity_code">;

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
  /** Sub-task progress, cached on the ticket so lists can show it without extra reads. */
  subtasks_total?: number;
  subtasks_done?: number;
};

export type SubtaskOwner = Pick<Profile, "id" | "full_name">;

/** A checklist step that belongs to exactly one ticket (`task_id`). */
export type TicketSubtask = {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  /** The sub-task's owner; they may tick it off even without edit rights on the ticket. */
  assignee_id: string | null;
  due_date: string | null;
  /** Order within the ticket, lowest first. */
  position: number;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee: SubtaskOwner | null;
};

/** A sub-task listed on My Work, with the ticket it belongs to. */
export type MySubtask = TicketSubtask & {
  task: { id: string; title: string; entity_code: string | null } | null;
};

export type TicketFilters = {
  search?: string;
  status?: TicketStatus | "";
  priority?: TicketPriority | "";
  assigneeId?: string;
  projectId?: string;
  dueDate?: "all" | "overdue" | "this_week" | "this_month" | "none";
  type?: TicketType | "";
  /** Open tickets that are blocked, overdue, urgent, or unassigned. */
  attention?: boolean;
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
