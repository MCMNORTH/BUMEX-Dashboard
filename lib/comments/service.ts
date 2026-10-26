import "server-only";

import { logActivity } from "@/lib/activity/service";
import { createMentionNotifications } from "@/lib/notifications/service";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { CommentActionState, CommentEntityType, CommentFormValues, CommentRecord } from "@/types/comment";

// Comments: work.comment (0008), seen by whoever may see their subject (a shareholder never an internal one). They have
// no attachments (BUMEX One never wrote any).
const COMMENT_SQL = `
  select c.id, c.subject_type as entity_type, c.subject_id as entity_id, c.author_id, c.body, c.is_internal, c.created_at, c.updated_at, c.deleted_at,
         (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
            from work.person p where p.id = c.author_id) as author,
         '[]'::jsonb as attachments
    from work.comment c`;

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
  if (!entityIds.length) {
    return {} as Record<string, CommentRecord[]>;
  }

  const rows = await asPerson((tx) =>
    select<CommentRecord>(tx, `${COMMENT_SQL} where c.subject_type = $1 and c.subject_id = any($2::uuid[]) order by c.created_at`, [entityType, entityIds]),
  );

  return rows.reduce<Record<string, CommentRecord[]>>((acc, comment) => {
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

  const payload = {
    entity_type: values.entity_type,
    entity_id: values.entity_id,
    author_id: actor.id,
    body: values.body.trim(),
    is_internal: values.is_internal,
  };

  const data = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      "insert into work.comment (subject_type, subject_id, author_id, body, is_internal) values ($1, $2::uuid, $3, $4, $5) returning id",
      [payload.entity_type, payload.entity_id, payload.author_id, payload.body, payload.is_internal],
    ),
  );

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
  return asPerson((tx) =>
    selectOne<Pick<CommentRecord, "id" | "entity_type" | "entity_id" | "author_id" | "body" | "is_internal" | "deleted_at">>(
      tx,
      "select id, subject_type as entity_type, subject_id as entity_id, author_id, body, is_internal, deleted_at from work.comment where id = $1::uuid",
      [id],
    ),
  );
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

  await asPerson((tx) => tx.run("update work.comment set body = $2 where id = $1::uuid", [commentId, body.trim()]));

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

  await asPerson((tx) => tx.run("update work.comment set deleted_at = now() where id = $1::uuid", [commentId]));

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
