import "server-only";

import { logActivity } from "@/lib/activity/service";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import {
  canCreateNoteByRole,
  canManageNote,
  getAllowedNoteVisibilities,
  type InternalNoteActionState,
  type InternalNoteEntityType,
  type InternalNoteFormValues,
  type InternalNoteRecord,
} from "@/types/note";

type InternalNoteRow = Omit<InternalNoteRecord, "author"> & {
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
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapInternalNote(row: InternalNoteRow): InternalNoteRecord {
  return {
    ...row,
    author: single(row.author),
  };
}

function toActivityEntityType(entityType: InternalNoteEntityType) {
  return entityType;
}

export function validateNoteValues(title: string, body: string): InternalNoteActionState | null {
  if (!title.trim()) {
    return { error: "Note title is required." };
  }

  if (title.trim().length < 3) {
    return { error: "Note title is too short." };
  }

  if (!body.trim()) {
    return { error: "Note body is required." };
  }

  if (body.trim().length < 10) {
    return { error: "Note body is too short." };
  }

  return null;
}

export async function getNotesForEntity(entityType: InternalNoteEntityType, entityId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("internal_notes")
    .select(
      `
        id,
        entity_type,
        entity_id,
        author_id,
        title,
        body,
        visibility,
        pinned,
        created_at,
        updated_at,
        archived_at,
        author:profiles!internal_notes_author_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<InternalNoteRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapInternalNote);
}

async function getNoteById(noteId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("internal_notes")
    .select("id, entity_type, entity_id, author_id, title, body, visibility, pinned, archived_at")
    .eq("id", noteId)
    .maybeSingle<
      Pick<
        InternalNoteRecord,
        "id" | "entity_type" | "entity_id" | "author_id" | "title" | "body" | "visibility" | "pinned" | "archived_at"
      >
    >();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function createNote(values: InternalNoteFormValues, actor: { id: string; role: AppRole }) {
  if (!canCreateNoteByRole(actor.role, values.entity_type)) {
    throw new Error("You do not have permission to create notes on this entity.");
  }

  if (!getAllowedNoteVisibilities(actor.role).includes(values.visibility)) {
    throw new Error("You do not have permission to use this visibility level.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const payload = {
    entity_type: values.entity_type,
    entity_id: values.entity_id,
    author_id: actor.id,
    title: values.title.trim(),
    body: values.body.trim(),
    visibility: values.visibility,
    pinned: values.pinned,
  };

  const { data, error } = await supabase.from("internal_notes").insert(payload).select("id").maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actor.id,
    action: "Created note",
    entityType: toActivityEntityType(values.entity_type),
    entityId: values.entity_id,
    metadata: {
      kind: "create",
      summary: "Structured internal note created",
      note_id: data?.id,
      note_title: payload.title,
      visibility: payload.visibility,
      pinned: payload.pinned,
    },
  });
}

export async function updateNote(noteId: string, values: InternalNoteFormValues, actor: { id: string; role: AppRole }) {
  const existing = await getNoteById(noteId);

  if (!existing) {
    throw new Error("Note not found.");
  }

  if (existing.archived_at) {
    throw new Error("Archived notes cannot be edited.");
  }

  if (!canManageNote(existing, actor.role, actor.id)) {
    throw new Error("You do not have permission to update this note.");
  }

  if (!getAllowedNoteVisibilities(actor.role).includes(values.visibility)) {
    throw new Error("You do not have permission to use this visibility level.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("internal_notes")
    .update({
      title: values.title.trim(),
      body: values.body.trim(),
      visibility: values.visibility,
      pinned: values.pinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to update this note.");
  }

  await logActivity({
    userId: actor.id,
    action: "Updated note",
    entityType: toActivityEntityType(existing.entity_type),
    entityId: existing.entity_id,
    metadata: {
      kind: "update",
      summary: "Structured internal note updated",
      note_id: noteId,
      note_title: values.title.trim(),
      visibility: values.visibility,
      pinned: values.pinned,
    },
  });
}

export async function togglePinnedNote(noteId: string, pinned: boolean, actor: { id: string; role: AppRole }) {
  const existing = await getNoteById(noteId);

  if (!existing) {
    throw new Error("Note not found.");
  }

  if (existing.archived_at) {
    throw new Error("Archived notes cannot be pinned.");
  }

  if (!canManageNote(existing, actor.role, actor.id)) {
    throw new Error("You do not have permission to pin this note.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("internal_notes")
    .update({
      pinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to pin this note.");
  }

  await logActivity({
    userId: actor.id,
    action: pinned ? "Pinned note" : "Unpinned note",
    entityType: toActivityEntityType(existing.entity_type),
    entityId: existing.entity_id,
    metadata: {
      kind: "update",
      summary: pinned ? "Structured note pinned" : "Structured note unpinned",
      note_id: noteId,
      pinned,
    },
  });
}

export async function archiveNote(noteId: string, actor: { id: string; role: AppRole }) {
  const existing = await getNoteById(noteId);

  if (!existing) {
    throw new Error("Note not found.");
  }

  if (!canManageNote(existing, actor.role, actor.id)) {
    throw new Error("You do not have permission to archive this note.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("internal_notes")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to archive this note.");
  }

  await logActivity({
    userId: actor.id,
    action: "Archived note",
    entityType: toActivityEntityType(existing.entity_type),
    entityId: existing.entity_id,
    metadata: {
      kind: "delete",
      summary: "Structured note archived",
      note_id: noteId,
    },
  });
}
