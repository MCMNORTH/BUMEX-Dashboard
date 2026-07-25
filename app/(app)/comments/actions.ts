"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { createComment, deleteComment, updateComment, validateCommentBody } from "@/lib/comments/service";
import type { CommentActionState, CommentEntityType } from "@/types/comment";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function createCommentAction(
  _prevState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const auth = await requireAuthenticatedUser();
  const body = getString(formData, "body");
  const entityType = getString(formData, "entity_type") as CommentEntityType;
  const entityId = getString(formData, "entity_id");
  const returnPath = getString(formData, "return_path");

  const validation = validateCommentBody(body);
  if (validation) {
    return validation;
  }

  try {
    await createComment(
      {
        entity_type: entityType,
        entity_id: entityId,
        body,
        is_internal: getBoolean(formData, "is_internal"),
      },
      { id: auth.profile.id, role: auth.role },
    );
    if (returnPath) {
      revalidatePath(returnPath);
    }
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to add comment." };
  }
}

export async function updateCommentAction(
  _prevState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const auth = await requireAuthenticatedUser();
  const body = getString(formData, "body");
  const commentId = getString(formData, "comment_id");
  const returnPath = getString(formData, "return_path");

  const validation = validateCommentBody(body);
  if (validation) {
    return validation;
  }

  try {
    await updateComment(commentId, body, { id: auth.profile.id, role: auth.role });
    if (returnPath) {
      revalidatePath(returnPath);
    }
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update comment." };
  }
}

export async function deleteCommentAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  const commentId = getString(formData, "comment_id");
  const returnPath = getString(formData, "return_path");

  try {
    await deleteComment(commentId, { id: auth.profile.id, role: auth.role });
    if (returnPath) {
      revalidatePath(returnPath);
    }
  } catch {
    if (returnPath) {
      revalidatePath(returnPath);
    }
  }
}
