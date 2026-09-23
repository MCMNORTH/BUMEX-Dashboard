import type { AppRole } from "@/types/auth";
import type { CommentEntityType } from "@/types/comment";

export type MentionRecord = {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  mentioned_by: string;
  entity_type: CommentEntityType;
  entity_id: string;
  created_at: string;
};

export type NotificationType =
  | "mention"
  | "assignment"
  | "status_change"
  | "comment"
  | "deadline"
  | "overdue"
  | "payment_due"
  | "contract_due"
  | "system";

export type NotificationEntityType =
  | CommentEntityType
  | "transfer"
  | "milestone"
  | "timesheet"
  | "system";

export type MentionCandidate = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: AppRole;
};

export type NotificationRecord = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: NotificationEntityType;
  entity_id: string;
  is_read: boolean;
  created_at: string;
  archived_at?: string | null;
};

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationFilters = {
  search?: string;
  unreadOnly?: boolean;
  type?: NotificationType | "";
  date?: "all" | "today" | "week" | "month";
};
