"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { archiveNote, createNote, togglePinnedNote, updateNote, validateNoteValues } from "@/lib/notes/service";
import type { InternalNoteActionState, InternalNoteEntityType, NoteVisibility } from "@/types/note";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export async function createNoteAction(
  _prevState: InternalNoteActionState,
  formData: FormData,
): Promise<InternalNoteActionState> {
  const auth = await requireAuthenticatedUser();
  const title = getString(formData, "title");
  const body = getString(formData, "body");
  const validation = validateNoteValues(title, body);
  const returnPath = getString(formData, "return_path");

  if (validation) {
    return validation;
  }

  try {
    await createNote(
      {
        entity_type: getString(formData, "entity_type") as InternalNoteEntityType,
        entity_id: getString(formData, "entity_id"),
        title,
        body,
        visibility: getString(formData, "visibility") as NoteVisibility,
        pinned: getBoolean(formData, "pinned"),
      },
      { id: auth.profile.id, role: auth.role },
    );

    if (returnPath) {
      revalidatePath(returnPath);
    }

    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create note." };
  }
}

export async function updateNoteAction(
  _prevState: InternalNoteActionState,
  formData: FormData,
): Promise<InternalNoteActionState> {
  const auth = await requireAuthenticatedUser();
  const title = getString(formData, "title");
  const body = getString(formData, "body");
  const validation = validateNoteValues(title, body);
  const returnPath = getString(formData, "return_path");

  if (validation) {
    return validation;
  }

  try {
    await updateNote(
      getString(formData, "note_id"),
      {
        entity_type: getString(formData, "entity_type") as InternalNoteEntityType,
        entity_id: getString(formData, "entity_id"),
        title,
        body,
        visibility: getString(formData, "visibility") as NoteVisibility,
        pinned: getBoolean(formData, "pinned"),
      },
      { id: auth.profile.id, role: auth.role },
    );

    if (returnPath) {
      revalidatePath(returnPath);
    }

    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update note." };
  }
}

export async function togglePinnedNoteAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  const returnPath = getString(formData, "return_path");

  try {
    await togglePinnedNote(getString(formData, "note_id"), getBoolean(formData, "pinned"), {
      id: auth.profile.id,
      role: auth.role,
    });
  } finally {
    if (returnPath) {
      revalidatePath(returnPath);
    }
  }
}

export async function archiveNoteAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  const returnPath = getString(formData, "return_path");

  try {
    await archiveNote(getString(formData, "note_id"), { id: auth.profile.id, role: auth.role });
  } finally {
    if (returnPath) {
      revalidatePath(returnPath);
    }
  }
}
