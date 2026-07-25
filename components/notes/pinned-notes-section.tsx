"use client";

import type { ReactNode } from "react";
import { Pin } from "lucide-react";

import { NoteCard } from "@/components/notes/note-card";
import { Separator } from "@/components/ui/separator";
import type { AppRole } from "@/types/auth";
import type { InternalNoteRecord } from "@/types/note";

export function PinnedNotesSection({
  notes,
  role,
  currentUserId,
  returnPath,
  editingId,
  onEdit,
  renderEditor,
}: {
  notes: InternalNoteRecord[];
  role: AppRole;
  currentUserId: string;
  returnPath: string;
  editingId: string | null;
  onEdit: (noteId: string | null) => void;
  renderEditor: (note: InternalNoteRecord) => ReactNode;
}) {
  if (!notes.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Pin className="size-4 text-primary" />
        <p className="text-sm font-semibold tracking-[0.16em] text-muted-foreground uppercase">Pinned notes</p>
      </div>
      <div className="space-y-3">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            role={role}
            currentUserId={currentUserId}
            returnPath={returnPath}
            isEditing={editingId === note.id}
            onEdit={() => onEdit(note.id)}
            editor={renderEditor(note)}
          />
        ))}
      </div>
      <Separator className="bg-border/60" />
    </div>
  );
}
