import "server-only";

import { logActivity } from "@/lib/activity/service";
import { createMentionNotifications } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import type { CommentActionState, CommentAttachmentRecord, CommentEntityType, CommentFormValues, CommentRecord } from "@/types/comment";

type CommentAttachmentRow = CommentAttachmentRecord;

type CommentRow = Omit<CommentRecord, "author" | "attachments"> & {
  author:
    | {
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
        role: AppRole;
      }
    | Array<{
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
        role: AppRole;
      }>
    | null;
  attachments: CommentAttachmentRow[] | null;
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapComment(row: CommentRow): CommentRecord {
  return {
    ...row,
    author: single(row.author),
    attachments: row.attachments ?? [],
  };
}

function toActivityEntityType(entityType: CommentEntityType) {
  if (entityType === "ticket") {
    return "task" as const;
  }

  return entityType;
}

function canCommentByRole(role: AppRole, entityType: CommentEntityType) {
  if (role === "admin" || role === "manager" || role === "supervisor") {
    return true;
  }

  if (role === "employee") {
    return entityType === "project" || entityType === "ticket";
  }

  return false;
}

export async function getCommentsForEntity(entityType: CommentEntityType, entityId: string) {
  const commentsByEntityId = await getCommentsForEntities(entityType, [entityId]);
  return commentsByEntityId[entityId] ?? [];
}

export async function getCommentsForEntities(entityType: CommentEntityType, entityIds: string[]) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!entityIds.length) {
    return {} as Record<string, CommentRecord[]>;
  }

  const { data, error } = await supabase
    .from("comments")
    .select(
      `
        id,
        entity_type,
        entity_id,
        author_id,
        body,
        is_internal,
        created_at,
        updated_at,
        deleted_at,
        author:profiles!comments_author_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        attachments:comment_attachments (
          id,
          comment_id,
          document_id,
          file_url,
          file_name,
          file_size,
          created_at
        )
      `,
    )
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .order("created_at", { ascending: true })
    .returns<CommentRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapComment).reduce<Record<string, CommentRecord[]>>((acc, comment) => {
    const current = acc[comment.entity_id] ?? [];
    current.push(comment);
    acc[comment.entity_id] = current;
    return acc;
  }, {});
}

export async function createComment(values: CommentFormValues, actor: { id: string; role: AppRole }) {
  if (!canCommentByRole(actor.role, values.entity_type)) {
    throw new Error("You do not have permission to comment on this entity.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const payload = {
    entity_type: values.entity_type,
    entity_id: values.entity_id,
    author_id: actor.id,
    body: values.body.trim(),
    is_internal: values.is_internal,
  };

  const { data, error } = await supabase
    .from("comments")
    .insert(payload)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.id) {
    await createMentionNotifications({
      comment: {
        id: data.id,
        body: payload.body,
        is_internal: payload.is_internal,
      },
      entityType: values.entity_type,
      entityId: values.entity_id,
      authorId: actor.id,
    });
  }

  await logActivity({
    userId: actor.id,
    action: "Added comment",
    entityType: toActivityEntityType(values.entity_type),
    entityId: values.entity_id,
    metadata: {
      kind: "create",
      summary: "Comment added",
      comment_id: data?.id,
      is_internal: values.is_internal,
    },
  });
}

async function getCommentById(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("comments")
    .select("id, entity_type, entity_id, author_id, body, is_internal, deleted_at")
    .eq("id", id)
    .maybeSingle<Pick<CommentRecord, "id" | "entity_type" | "entity_id" | "author_id" | "body" | "is_internal" | "deleted_at">>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function updateComment(commentId: string, body: string, actor: { id: string; role: AppRole }) {
  const existing = await getCommentById(commentId);

  if (!existing) {
    throw new Error("Comment not found.");
  }

  if (actor.role !== "admin" && existing.author_id !== actor.id) {
    throw new Error("You do not have permission to edit this comment.");
  }

  if (existing.deleted_at) {
    throw new Error("Deleted comments cannot be edited.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("comments")
    .update({
      body: body.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actor.id,
    action: "Edited comment",
    entityType: toActivityEntityType(existing.entity_type),
    entityId: existing.entity_id,
    metadata: {
      kind: "update",
      summary: "Comment edited",
      comment_id: commentId,
    },
  });
}

export async function deleteComment(commentId: string, actor: { id: string; role: AppRole }) {
  const existing = await getCommentById(commentId);

  if (!existing) {
    throw new Error("Comment not found.");
  }

  if (actor.role !== "admin" && existing.author_id !== actor.id) {
    throw new Error("You do not have permission to delete this comment.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("comments")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId);

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actor.id,
    action: "Deleted comment",
    entityType: toActivityEntityType(existing.entity_type),
    entityId: existing.entity_id,
    metadata: {
      kind: "delete",
      summary: "Comment deleted",
      comment_id: commentId,
    },
  });
}

export function validateCommentBody(body: string): CommentActionState | null {
  if (!body.trim()) {
    return { error: "Comment body is required." };
  }

  if (body.trim().length < 3) {
    return { error: "Comment body is too short." };
  }

  return null;
}
