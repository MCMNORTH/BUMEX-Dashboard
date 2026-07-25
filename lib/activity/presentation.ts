import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BanknoteArrowUp,
  CalendarClock,
  FileCog,
  FileText,
  FolderKanban,
  Landmark,
  MessageSquareText,
  PanelsTopLeft,
  ReceiptText,
  UserRound,
  UsersRound,
} from "lucide-react";

import { sanitizeActivityMetadata } from "@/lib/activity/security";
import type { AppRole } from "@/types/auth";
import type { ActivityEntityType, ActivityLogRecord, ActivityMetadata } from "@/types/activity";

export function getActivityIcon(entityType: ActivityEntityType): LucideIcon {
  switch (entityType) {
    case "project":
      return FolderKanban;
    case "milestone":
      return CalendarClock;
    case "task":
    case "ticket":
      return PanelsTopLeft;
    case "profile":
    case "user":
      return UserRound;
    case "client":
      return UsersRound;
    case "contract":
    case "invoice":
    case "receipt":
      return ReceiptText;
    case "payment":
    case "transfer":
    case "finance":
      return BanknoteArrowUp;
    case "document":
    case "report":
      return FileText;
    case "settings":
      return FileCog;
    case "note":
    case "comment":
      return MessageSquareText;
    case "team":
      return UsersRound;
    case "shareholder":
      return Landmark;
    default:
      return Activity;
  }
}

export function getActivityLabel(entityType: ActivityEntityType) {
  const labels: Record<ActivityEntityType, string> = {
    profile: "Profile",
    user: "User",
    team: "Team",
    finance: "Finance",
    shareholder: "Shareholder",
    client: "Client",
    project: "Project",
    milestone: "Milestone",
    task: "Ticket",
    ticket: "Ticket",
    contract: "Contract",
    invoice: "Invoice",
    receipt: "Receipt",
    document: "Document",
    payment: "Payment",
    transfer: "Transfer",
    settings: "Settings",
    report: "Report",
    comment: "Comment",
    note: "Note",
  };

  return labels[entityType] ?? "Activity";
}

export function getActivityEntityUrl(activity: ActivityLogRecord) {
  const metadataRelatedType = activity.metadata.related_type;
  const metadataRelatedId = activity.metadata.related_id;

  switch (activity.entity_type) {
    case "project":
      return `/projects/${activity.entity_id}`;
    case "milestone":
      return "/roadmap";
    case "task":
    case "ticket":
      return `/tickets/${activity.entity_id}`;
    case "client":
      return `/clients/${activity.entity_id}`;
    case "contract":
      return `/contracts/${activity.entity_id}`;
    case "invoice":
      return "/finance/invoices";
    case "payment":
      return "/finance/payments";
    case "transfer":
      return "/finance/transfers";
    case "document":
      return `/documents?document=${activity.entity_id}`;
    case "profile":
    case "user":
      return `/team/${activity.entity_id}`;
    case "team":
      return "/team";
    case "finance":
      return "/finance";
    case "shareholder":
      return "/activity";
    case "settings":
      return "/settings";
    case "report":
      return "/reports";
    case "note":
      if (metadataRelatedType === "project" && metadataRelatedId) return `/projects/${metadataRelatedId}`;
      if (metadataRelatedType === "client" && metadataRelatedId) return `/clients/${metadataRelatedId}`;
      if (metadataRelatedType === "contract" && metadataRelatedId) return `/contracts/${metadataRelatedId}`;
      if (metadataRelatedType === "finance") return "/finance";
      return "/activity";
    case "comment":
      if (metadataRelatedType === "project" && metadataRelatedId) return `/projects/${metadataRelatedId}`;
      if ((metadataRelatedType === "task" || metadataRelatedType === "ticket") && metadataRelatedId) return `/tickets/${metadataRelatedId}`;
      return null;
    default:
      return null;
  }
}

export function getActivityMetadataSummary(activity: ActivityLogRecord) {
  if (activity.metadata.summary) {
    return activity.metadata.summary;
  }

  if (activity.metadata.field) {
    const from = activity.metadata.from ?? "empty";
    const to = activity.metadata.to ?? "empty";
    return `${activity.metadata.field.replaceAll("_", " ")} changed from ${from} to ${to}.`;
  }

  return null;
}

export const formatActivityMetadataSummary = getActivityMetadataSummary;

export function getActivityKindLabel(activity: ActivityLogRecord) {
  const kind = activity.metadata.kind;

  if (!kind) {
    return "Event";
  }

  return kind.replaceAll("_", " ");
}

export function groupActivitiesByDate(activities: ActivityLogRecord[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  return {
    Today: activities.filter((activity) => {
      const date = new Date(activity.created_at);
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    }),
    Yesterday: activities.filter((activity) => {
      const date = new Date(activity.created_at);
      date.setHours(0, 0, 0, 0);
      return date.getTime() === yesterday.getTime();
    }),
    Earlier: activities.filter((activity) => {
      const date = new Date(activity.created_at);
      date.setHours(0, 0, 0, 0);
      return date.getTime() < yesterday.getTime();
    }),
  };
}

export function sanitizeActivityMetadataForRole(
  role: AppRole,
  metadata: ActivityMetadata,
  entityType?: ActivityEntityType,
): ActivityMetadata {
  const safeMetadata = sanitizeActivityMetadata(metadata, role);

  if (role === "shareholder" && entityType === "note" && metadata.note_title) {
    safeMetadata.note_title = metadata.note_title;
  }

  return safeMetadata;
}

export function sanitizeShareholderMetadata(activity: ActivityLogRecord): ActivityLogRecord {
  return {
    ...activity,
    metadata: sanitizeActivityMetadataForRole("shareholder", activity.metadata, activity.entity_type),
  };
}

export function searchActivityLogs(activities: ActivityLogRecord[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return activities;
  }

  return activities.filter((activity) => {
    const haystack = [
      activity.action,
      activity.entity_type,
      activity.user?.full_name ?? "",
      getActivityMetadataSummary(activity) ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function filterActivityLogs(
  activities: ActivityLogRecord[],
  filters: {
    entityType?: string;
    actionType?: string;
    userId?: string;
    dateRange?: string;
    scope?: string;
  },
) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return activities.filter((activity) => {
    if (filters.entityType && filters.entityType !== "all" && activity.entity_type !== filters.entityType) {
      return false;
    }

    const kind = activity.metadata.kind ?? "event";
    if (filters.actionType && filters.actionType !== "all" && kind !== filters.actionType) {
      return false;
    }

    if (filters.userId && filters.userId !== "all" && activity.user_id !== filters.userId) {
      return false;
    }

    if (filters.scope && filters.scope !== "all") {
      const relatedType = activity.metadata.related_type ?? activity.entity_type;
      if (relatedType !== filters.scope) {
        return false;
      }
    }

    if (filters.dateRange && filters.dateRange !== "all") {
      const createdAt = new Date(activity.created_at);
      createdAt.setHours(0, 0, 0, 0);

      if (filters.dateRange === "today" && createdAt.getTime() !== today.getTime()) {
        return false;
      }

      if (filters.dateRange === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (createdAt.getTime() !== yesterday.getTime()) {
          return false;
        }
      }

      if (filters.dateRange === "last_7_days") {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        if (createdAt.getTime() < sevenDaysAgo.getTime()) {
          return false;
        }
      }

      if (filters.dateRange === "last_30_days") {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 29);
        if (createdAt.getTime() < thirtyDaysAgo.getTime()) {
          return false;
        }
      }
    }

    return true;
  });
}
