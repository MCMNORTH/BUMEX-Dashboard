"use client";

import { useMemo, useState } from "react";
import { Search, StickyNote } from "lucide-react";

import { NoteCard } from "@/components/notes/note-card";
import { NoteForm } from "@/components/notes/note-form";
import { PinnedNotesSection } from "@/components/notes/pinned-notes-section";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";
import { canCreateNoteByRole, type InternalNoteEntityType, type InternalNoteRecord, type NoteVisibility } from "@/types/note";

export function NotesPanel({
  notes,
  entityType,
  entityId,
  returnPath,
  role,
  currentUserId,
  title = "Internal notes",
  description = "Structured business notes, follow-up decisions, and executive context for this entity.",
}: {
  notes: InternalNoteRecord[];
  entityType: InternalNoteEntityType;
  entityId: string;
  returnPath: string;
  role: AppRole;
  currentUserId: string;
  title?: string;
  description?: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"all" | NoteVisibility>("all");
  const canCreate = canCreateNoteByRole(role, entityType);

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return notes.filter((note) => {
      const matchesVisibility = visibility === "all" ? true : note.visibility === visibility;
      const matchesQuery = normalizedQuery
        ? [note.title, note.body, note.author?.full_name ?? ""].some((value) => value.toLowerCase().includes(normalizedQuery))
        : true;

      return matchesVisibility && matchesQuery;
    });
  }, [notes, query, visibility]);

  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const regularNotes = filteredNotes.filter((note) => !note.pinned);

  function renderEditor(note: InternalNoteRecord) {
    return (
      <NoteForm
        mode="edit"
        entityType={entityType}
        entityId={entityId}
        returnPath={returnPath}
        role={role}
        note={note}
        onCancel={() => setEditingId(null)}
        onSuccess={() => setEditingId(null)}
      />
    );
  }

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <StickyNote className="size-4 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate ? (
          <NoteForm
            mode="create"
            entityType={entityType}
            entityId={entityId}
            returnPath={returnPath}
            role={role}
          />
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {role === "shareholder"
              ? "Shareholder access is limited to approved executive notes."
              : "Note creation is not enabled for this entity in your current role scope."}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder="Search notes, authors, or executive context"
              className="pl-10"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ModernSelect
            name="notes-visibility-filter"
            value={visibility}
            onValueChange={(value) => setVisibility(value as "all" | NoteVisibility)}
            options={[
              { value: "all", label: "All visibilities" },
              { value: "private", label: "Private" },
              { value: "team", label: "Team" },
              { value: "management", label: "Management" },
              { value: "shareholders", label: "Shareholders" },
            ]}
          />
        </div>

        {filteredNotes.length ? (
          <div className="space-y-4">
            <PinnedNotesSection
              notes={pinnedNotes}
              role={role}
              currentUserId={currentUserId}
              returnPath={returnPath}
              editingId={editingId}
              onEdit={setEditingId}
              renderEditor={renderEditor}
            />

            <div className="space-y-3">
              {regularNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  role={role}
                  currentUserId={currentUserId}
                  returnPath={returnPath}
                  isEditing={editingId === note.id}
                  onEdit={() => setEditingId(note.id)}
                  editor={renderEditor(note)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No active notes match the current filters for this entity.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
