import type { AppRole, Profile } from "@/types/auth";

export type CommentEntityType =
  | "project"
  | "ticket"
  | "client"
  | "contract"
  | "document"
  | "invoice"
  | "payment"
  | "transfer";

export type CommentAuthor = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type CommentAttachmentRecord = {
  id: string;
  comment_id: string;
  document_id: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
};

export type CommentRecord = {
  id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  author: CommentAuthor | null;
  attachments: CommentAttachmentRecord[];
};

export type CommentActionState = {
  error?: string;
  success?: boolean;
};

export type CommentFormValues = {
  entity_type: CommentEntityType;
  entity_id: string;
  body: string;
  is_internal: boolean;
};

export function canViewComment(comment: Pick<CommentRecord, "is_internal">, role: AppRole) {
  if (role === "shareholder" && comment.is_internal) {
    return false;
  }

  return true;
}
