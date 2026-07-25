import type { Profile } from "@/types/auth";

export type ActivityEntityType =
  | "profile"
  | "user"
  | "team"
  | "finance"
  | "shareholder"
  | "client"
  | "project"
  | "milestone"
  | "task"
  | "ticket"
  | "contract"
  | "invoice"
  | "receipt"
  | "document"
  | "payment"
  | "transfer"
  | "settings"
  | "report"
  | "comment"
  | "note";

export type ActivityMetadata = {
  [key: string]: string | number | boolean | null | undefined;
  field?: string;
  from?: string | number | boolean | null;
  to?: string | number | boolean | null;
  kind?:
    | "create"
    | "update"
    | "delete"
    | "view"
    | "archive"
    | "pin"
    | "status_change"
    | "assignment_change"
    | "priority_change"
    | "due_date_change"
    | "completion_change";
  summary?: string;
  related_type?: string | null;
  related_id?: string | null;
  note_id?: string | null;
  note_title?: string | null;
  visibility?: string | null;
};

export type ActivityLogRecord = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  metadata: ActivityMetadata;
  metadata_hidden?: boolean;
  created_at: string;
  user: Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
};
