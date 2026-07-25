import type { AppRole } from "@/types/auth";
import type { ProjectHealth, ProjectPriority, ProjectStatus } from "@/types/project";
import type { MilestoneStatus } from "@/types/milestone";
import type { TicketPriority, TicketStatus } from "@/types/ticket";

export type CalendarView = "month" | "week" | "agenda";

export type CalendarEventType =
  | "ticket_due"
  | "project_deadline"
  | "milestone"
  | "payment_due"
  | "contract_renewal"
  | "internal_event";

export type CalendarEventStatus =
  | TicketStatus
  | ProjectStatus
  | MilestoneStatus
  | "upcoming"
  | "scheduled";

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  endDate?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  priority?: TicketPriority | ProjectPriority | null;
  status?: CalendarEventStatus | null;
  health?: ProjectHealth | null;
  href?: string | null;
  entityId?: string | null;
  entityType?: "task" | "project" | "milestone" | "placeholder";
  description?: string | null;
  summaryMode?: boolean;
};

export type CalendarFilters = {
  type?: CalendarEventType | "";
  projectId?: string;
  clientId?: string;
  assigneeId?: string;
  priority?: TicketPriority | ProjectPriority | "";
  status?: CalendarEventStatus | "";
};

export type CalendarFilterData = {
  projects: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; full_name: string }>;
};

export type CalendarPermissions = {
  role: AppRole;
  summaryMode: boolean;
};

