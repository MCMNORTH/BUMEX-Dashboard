import "server-only";

import { logActivity } from "@/lib/activity/service";
import { asPerson, select, selectOne } from "@/lib/work/db";
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

// Notes: work.note (0008), seen by whoever may see their subject and their visibility (an archived note by nobody).
const NOTE_COLUMNS = "n.id, n.subject_type as entity_type, n.subject_id as entity_id, n.author_id, n.title, n.body, n.visibility, n.pinned, n.created_at, n.updated_at, n.archived_at";

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
  return asPerson((tx) =>
    select<InternalNoteRecord>(
      tx,
      `select ${NOTE_COLUMNS},
              (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
                 from work.person p where p.id = n.author_id) as author
         from work.note n
        where n.subject_type = $1 and n.subject_id = $2::uuid and n.archived_at is null
        order by n.pinned desc, n.updated_at desc`,
      [entityType, entityId],
    ),
  );
}

async function getNoteById(noteId: string) {
  return asPerson((tx) =>
    selectOne<Pick<InternalNoteRecord, "id" | "entity_type" | "entity_id" | "author_id" | "title" | "body" | "visibility" | "pinned" | "archived_at">>(
      tx,
      `select ${NOTE_COLUMNS} from work.note n where n.id = $1::uuid`,
      [noteId],
    ),
  );
}

// A note changed by the person; the rules skip a note they may not change, which is said so.
async function writeNote(noteId: string, set: string, params: unknown[], refusal: string) {
  const written = await asPerson((tx) => tx.run(`update work.note set ${set} where id = $1::uuid`, [noteId, ...params]));
  if (!written) throw new Error(refusal);
}

export async function createNote(values: InternalNoteFormValues, actor: { id: string; role: AppRole }) {
  if (!canCreateNoteByRole(actor.role, values.entity_type)) {
    throw new Error("You do not have permission to create notes on this entity.");
  }

  if (!getAllowedNoteVisibilities(actor.role).includes(values.visibility)) {
    throw new Error("You do not have permission to use this visibility level.");
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

  const data = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      "insert into work.note (subject_type, subject_id, author_id, title, body, visibility, pinned) values ($1, $2::uuid, $3, $4, $5, $6, $7) returning id",
      [payload.entity_type, payload.entity_id, payload.author_id, payload.title, payload.body, payload.visibility, payload.pinned],
    ),
  );

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

  await writeNote(noteId, "title = $2, body = $3, visibility = $4, pinned = $5", [values.title.trim(), values.body.trim(), values.visibility, values.pinned], "Unable to update this note.");

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

  await writeNote(noteId, "pinned = $2", [pinned], "Unable to pin this note.");

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

  await writeNote(noteId, "archived_at = now()", [], "Unable to archive this note.");

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
