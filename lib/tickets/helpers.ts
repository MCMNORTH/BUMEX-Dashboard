import type { AppRole } from "@/types/auth";
import type {
  TicketPriority,
  TicketSavedViewKey,
  TicketStatus,
  TicketTableColumnKey,
  TicketType,
} from "@/types/ticket";

export const ticketKanbanStatuses: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
];

export const defaultTicketTableColumns: TicketTableColumnKey[] = [
  "title",
  "project",
  "status",
  "priority",
  "assignee",
  "due_date",
  "updated_at",
  "actions",
];

export function normalizeTicketStatus(status: string): TicketStatus {
  if (status === "in_review") {
    return "review";
  }

  if (status === "cancelled") {
    return "archived";
  }

  return status as TicketStatus;
}

export function normalizeTicketPriority(priority: string | null): TicketPriority {
  if (!priority || priority === "critical") {
    return "urgent";
  }

  return priority as TicketPriority;
}

export function formatHours(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return `${value.toFixed(1)}h`;
}

export function getTicketStatusLabel(status: TicketStatus) {
  return {
    backlog: "Backlog",
    todo: "To do",
    in_progress: "In progress",
    review: "Review",
    blocked: "Blocked",
    done: "Done",
    archived: "Archived",
  }[status];
}

export function getTicketPriorityLabel(priority: TicketPriority) {
  return {
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "Urgent",
  }[priority];
}

export function getTicketTypeLabel(type: TicketType) {
  return {
    task: "Task",
    bug: "Bug",
    feature: "Feature",
    support: "Support",
    client_request: "Client request",
    internal: "Internal",
  }[type];
}

export function formatTicketDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function getTicketDueState(dueDate: string | null) {
  if (!dueDate) {
    return "none" as const;
  }

  const today = new Date();
  const target = new Date(dueDate);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  if (diff < 0) {
    return "overdue" as const;
  }

  if (diff <= 7) {
    return "soon" as const;
  }

  return "planned" as const;
}

export function getTicketDueLabel(dueDate: string | null) {
  const state = getTicketDueState(dueDate);

  if (state === "none") {
    return "No deadline";
  }

  if (state === "overdue") {
    return "Overdue";
  }

  if (state === "soon") {
    return "Due soon";
  }

  return "Planned";
}

export function redactTicketDescription(description: string | null, role: AppRole) {
  if (role !== "shareholder") {
    return description;
  }

  return description
    ? "Detailed operational content is restricted in the shareholder view."
    : "Detailed operational content is restricted in the shareholder view.";
}

export function getTicketSavedViewLabel(view: TicketSavedViewKey) {
  return {
    my_open: "My open tickets",
    overdue: "Overdue",
    high_priority: "High priority",
    waiting_review: "Waiting review",
  }[view];
}
