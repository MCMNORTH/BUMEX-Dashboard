import type { AppRole, Profile } from "@/types/auth";

export type InternalNoteEntityType =
  | "project"
  | "client"
  | "contract"
  | "finance"
  | "shareholder";

export type NoteVisibility = "private" | "team" | "management" | "shareholders";

export type InternalNoteAuthor = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type InternalNoteRecord = {
  id: string;
  entity_type: InternalNoteEntityType;
  entity_id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: NoteVisibility;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  author: InternalNoteAuthor | null;
};

export type InternalNoteFormValues = {
  entity_type: InternalNoteEntityType;
  entity_id: string;
  title: string;
  body: string;
  visibility: NoteVisibility;
  pinned: boolean;
};

export type InternalNoteActionState = {
  error?: string;
  success?: boolean;
};

export const NOTE_VISIBILITY_OPTIONS: NoteVisibility[] = ["private", "team", "management", "shareholders"];

export function getAllowedNoteVisibilities(role: AppRole): NoteVisibility[] {
  if (role === "admin" || role === "manager" || role === "supervisor") {
    return NOTE_VISIBILITY_OPTIONS;
  }

  if (role === "employee") {
    return ["private", "team"];
  }

  return [];
}

export function canCreateNoteByRole(role: AppRole, entityType: InternalNoteEntityType) {
  if (role === "admin" || role === "manager" || role === "supervisor") {
    return true;
  }

  if (role === "employee") {
    return entityType === "project" || entityType === "client" || entityType === "contract";
  }

  return false;
}

export function canManageNote(note: Pick<InternalNoteRecord, "author_id" | "entity_type">, role: AppRole, currentUserId: string) {
  if (role === "admin") {
    return true;
  }

  if (role === "manager" || role === "supervisor") {
    return true;
  }

  if (role === "employee") {
    return note.author_id === currentUserId;
  }

  return false;
}
