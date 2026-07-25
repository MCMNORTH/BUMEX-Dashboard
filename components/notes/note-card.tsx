"use client";

import type { ReactNode } from "react";
import { Archive, PencilLine, Pin, PinOff } from "lucide-react";

import { archiveNoteAction, togglePinnedNoteAction } from "@/app/(app)/notes/actions";
import { NoteVisibilityBadge } from "@/components/notes/note-visibility-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/types/auth";
import { canManageNote, type InternalNoteRecord } from "@/types/note";

function getInitials(name: string | undefined) {
  if (!name) {
    return "NA";
  }

  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatRelativeDate(value: string) {
  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function NoteCard({
  note,
  role,
  currentUserId,
  returnPath,
  isEditing,
  onEdit,
  editor,
}: {
  note: InternalNoteRecord;
  role: AppRole;
  currentUserId: string;
  returnPath: string;
  isEditing?: boolean;
  onEdit?: () => void;
  editor?: ReactNode;
}) {
  const canManage = canManageNote(note, role, currentUserId);

  return (
    <div className="rounded-[24px] border border-border/65 bg-background/35 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarFallback>{getInitials(note.author?.full_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{note.author?.full_name ?? "Unknown author"}</p>
                <NoteVisibilityBadge visibility={note.visibility} />
                {note.pinned ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    Pinned
                  </Badge>
                ) : null}
              </div>
              <h4 className="text-base font-semibold tracking-tight">{note.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground">{formatRelativeDate(note.updated_at)}</p>
          </div>

          {isEditing && editor ? (
            editor
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-7 text-foreground/90 whitespace-pre-wrap">{note.body}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{note.author?.email ?? "No email"}</span>
                <span>&middot;</span>
                <span>{new Date(note.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>

              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {onEdit ? (
                    <Button type="button" variant="ghost" className="rounded-full px-4" onClick={onEdit}>
                      <PencilLine className="size-4" />
                      Edit
                    </Button>
                  ) : null}

                  <form action={togglePinnedNoteAction}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <input type="hidden" name="return_path" value={returnPath} />
                    <input type="hidden" name="pinned" value={note.pinned ? "false" : "true"} />
                    <Button type="submit" variant="ghost" className="rounded-full px-4">
                      {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      {note.pinned ? "Unpin" : "Pin"}
                    </Button>
                  </form>

                  <form action={archiveNoteAction}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <input type="hidden" name="return_path" value={returnPath} />
                    <Button type="submit" variant="ghost" className="rounded-full px-4 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
                      <Archive className="size-4" />
                      Archive
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
