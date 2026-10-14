"use client";

import { useId, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, GripVertical, ListChecks, Plus, Trash2, UserRound } from "lucide-react";

import {
  createSubtaskAction,
  deleteSubtaskAction,
  renameSubtaskAction,
  reorderSubtasksAction,
  setSubtaskDueDateAction,
  setSubtaskOwnerAction,
  toggleSubtaskAction,
  type SubtaskActionState,
} from "@/app/(app)/tickets/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { getInitials, TicketDue } from "@/components/tickets/ticket-meta";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SubtaskOwner, TicketSubtask } from "@/types/ticket";

const TITLE_MAX_LENGTH = 200;
const PENDING_PREFIX = "pending-";
// Row controls that would clutter every line stay hidden until the row is
// hovered or focused; touch screens have no hover, so they always show there.
const REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

type OptimisticChange =
  | { type: "add"; subtask: TicketSubtask }
  | { type: "update"; id: string; patch: Partial<TicketSubtask> }
  | { type: "remove"; id: string }
  | { type: "reorder"; ids: string[] };

function applyChange(subtasks: TicketSubtask[], change: OptimisticChange) {
  switch (change.type) {
    case "add":
      return [...subtasks, change.subtask];
    case "update":
      return subtasks.map((item) => item.id === change.id ? { ...item, ...change.patch } : item);
    case "remove":
      return subtasks.filter((item) => item.id !== change.id);
    case "reorder": {
      const byId = new Map(subtasks.map((item) => [item.id, item]));
      const ordered = change.ids.flatMap((id) => byId.get(id) ?? []);
      return [...ordered, ...subtasks.filter((item) => !change.ids.includes(item.id))];
    }
  }
}

function isPending(subtask: TicketSubtask) {
  return subtask.id.startsWith(PENDING_PREFIX);
}

type TicketSubtasksProps = {
  ticketId: string;
  subtasks: TicketSubtask[];
  /** May add, rename, reorder and delete sub-tasks and set due dates (whoever may edit the ticket). */
  canEdit: boolean;
  /** May choose sub-task owners (admins and managers). */
  canAssign: boolean;
  currentUserId: string;
  /** People who can be picked as a sub-task owner. */
  people: SubtaskOwner[];
  /** Shareholders only see progress, never the sub-task titles. */
  summary?: { total: number; done: number };
};

export function TicketSubtasks({ ticketId, subtasks, canEdit, canAssign, currentUserId, people, summary }: TicketSubtasksProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [items, applyOptimistic] = useOptimistic(subtasks, applyChange);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const dndId = useId();
  const sensors = useSensors(
    // A short travel distance keeps clicks on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const total = summary?.total ?? items.length;
  const done = summary?.done ?? items.filter((item) => item.is_done).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  // Reordering waits until every new sub-task has its server id.
  const canReorder = canEdit && items.length > 1 && !items.some(isPending);

  function run(change: OptimisticChange, action: () => Promise<SubtaskActionState>) {
    setError(null);
    startTransition(async () => {
      applyOptimistic(change);

      try {
        const result = await action();

        if (result.error) {
          setError(result.error);
        }
      } catch {
        setError(isFr ? "La sous-tâche n’a pas pu être enregistrée. Réessayez." : "The sub-task could not be saved. Please try again.");
      }
    });
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.trim();

    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    setDraft("");
    addInputRef.current?.focus();
    run(
      {
        type: "add",
        subtask: {
          id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
          task_id: ticketId,
          title,
          is_done: false,
          assignee_id: null,
          due_date: null,
          position: Number.MAX_SAFE_INTEGER,
          completed_at: null,
          created_by: currentUserId,
          created_at: now,
          updated_at: now,
          assignee: null,
        },
      },
      () => createSubtaskAction(ticketId, title),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }

    const ids = items.map((item) => item.id);
    const nextIds = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    run({ type: "reorder", ids: nextIds }, () => reorderSubtasksAction(ticketId, nextIds));
  }

  const rowHandlers: SubtaskRowHandlers = {
    toggle: (subtask) => run(
      { type: "update", id: subtask.id, patch: { is_done: !subtask.is_done } },
      () => toggleSubtaskAction(subtask.id, !subtask.is_done),
    ),
    rename: (subtask, title) => {
      setEditingId(null);

      if (title && title !== subtask.title) {
        run({ type: "update", id: subtask.id, patch: { title } }, () => renameSubtaskAction(subtask.id, title));
      }
    },
    setOwner: (subtask, ownerId) => {
      const owner = people.find((person) => person.id === ownerId) ?? null;
      run(
        { type: "update", id: subtask.id, patch: { assignee_id: owner?.id ?? null, assignee: owner } },
        () => setSubtaskOwnerAction(subtask.id, owner?.id ?? null),
      );
    },
    setDueDate: (subtask, dueDate) => {
      if (dueDate !== subtask.due_date) {
        run({ type: "update", id: subtask.id, patch: { due_date: dueDate } }, () => setSubtaskDueDateAction(subtask.id, dueDate));
      }
    },
    remove: (subtask) => run({ type: "remove", id: subtask.id }, () => deleteSubtaskAction(subtask.id)),
    startEditing: (subtask) => setEditingId(subtask.id),
    cancelEditing: () => setEditingId(null),
    toggleDetails: (subtask) => setDetailsId((current) => current === subtask.id ? null : subtask.id),
  };

  return (
    <Card className="border-border/70 bg-card">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" />
              {isFr ? "Sous-tâches" : "Sub-tasks"}
            </CardTitle>
            <CardDescription>
              {isFr ? "Découpez ce ticket en étapes, confiez-les et suivez leur avancement." : "Break this ticket into steps, hand them out, and track them to completion."}
            </CardDescription>
          </div>
          {total ? (
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              <span className={cn(done === total && "text-success")}>{done}</span> / {total}
            </p>
          ) : null}
        </div>
        {total ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={isFr ? "Avancement des sous-tâches" : "Sub-task progress"}
          >
            <div
              className={cn("h-full rounded-full transition-all", done === total ? "bg-success" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {summary ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            {isFr ? "Le détail des sous-tâches est masqué en mode synthèse." : "Sub-task details are hidden in summary mode."}
          </p>
        ) : items.length ? (
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {items.map((subtask) => (
                  <SubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    canEdit={canEdit}
                    canAssign={canAssign}
                    canToggle={canEdit || subtask.assignee_id === currentUserId}
                    canReorder={canReorder}
                    editing={editingId === subtask.id}
                    detailsOpen={detailsId === subtask.id}
                    people={people}
                    handlers={rowHandlers}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : !canEdit ? (
          <p className="text-sm text-muted-foreground">{isFr ? "Aucune sous-tâche pour ce ticket." : "No sub-tasks for this ticket."}</p>
        ) : null}

        {canEdit && !summary ? (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              ref={addInputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={TITLE_MAX_LENGTH}
              placeholder={isFr ? "Ajouter une sous-tâche…" : "Add a sub-task…"}
              aria-label={isFr ? "Nouvelle sous-tâche" : "New sub-task"}
            />
            <Button type="submit" variant="secondary" disabled={!draft.trim()}>
              <Plus />
              {isFr ? "Ajouter" : "Add"}
            </Button>
          </form>
        ) : null}

        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

type SubtaskRowHandlers = {
  toggle: (subtask: TicketSubtask) => void;
  rename: (subtask: TicketSubtask, title: string) => void;
  setOwner: (subtask: TicketSubtask, ownerId: string | null) => void;
  setDueDate: (subtask: TicketSubtask, dueDate: string | null) => void;
  remove: (subtask: TicketSubtask) => void;
  startEditing: (subtask: TicketSubtask) => void;
  cancelEditing: () => void;
  toggleDetails: (subtask: TicketSubtask) => void;
};

function SubtaskRow({
  subtask,
  canEdit,
  canAssign,
  canToggle,
  canReorder,
  editing,
  detailsOpen,
  people,
  handlers,
}: {
  subtask: TicketSubtask;
  canEdit: boolean;
  canAssign: boolean;
  canToggle: boolean;
  canReorder: boolean;
  editing: boolean;
  detailsOpen: boolean;
  people: SubtaskOwner[];
  handlers: SubtaskRowHandlers;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const pending = isPending(subtask);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
    disabled: !canReorder,
  });
  // Escape unmounts the rename field; this stops that from also saving it.
  const cancelRenameRef = useRef(false);
  const canOpenDetails = (canEdit || canAssign) && !pending;
  const hasMeta = Boolean(subtask.due_date || subtask.assignee);
  // Keep a current owner selectable even when they are not in the picker list.
  const ownerOptions = subtask.assignee && !people.some((person) => person.id === subtask.assignee?.id)
    ? [subtask.assignee, ...people]
    : people;

  const meta = (
    <>
      {subtask.due_date ? (
        <span className="inline-flex items-center gap-1 text-xs">
          <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <TicketDue ticket={{ due_date: subtask.due_date, status: subtask.is_done ? "done" : "todo" }} locale={locale} />
        </span>
      ) : null}
      {subtask.assignee ? (
        <Avatar className="size-6" title={subtask.assignee.full_name}>
          <AvatarFallback className="text-[11px]">{getInitials(subtask.assignee.full_name)}</AvatarFallback>
        </Avatar>
      ) : null}
    </>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-lg",
        isDragging ? "relative z-10 bg-card shadow-[var(--shadow-elevated)]" : "hover:bg-muted/60",
        detailsOpen && "bg-muted/60",
        pending && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-1.5 py-1.5">
        {canReorder ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={isFr ? `Déplacer « ${subtask.title} »` : `Move “${subtask.title}”`}
            className={cn("grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60 active:cursor-grabbing", REVEAL)}
          >
            <GripVertical className="size-4" />
          </button>
        ) : canEdit ? (
          <span className="size-6 shrink-0" aria-hidden="true" />
        ) : null}

        <button
          type="button"
          role="checkbox"
          aria-checked={subtask.is_done}
          aria-label={subtask.title}
          disabled={!canToggle || pending}
          onClick={() => handlers.toggle(subtask)}
          className={cn(
            "grid size-4.5 shrink-0 place-items-center rounded-[5px] border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-default",
            subtask.is_done ? "border-success bg-success text-background" : "border-input bg-background hover:border-primary",
          )}
        >
          {subtask.is_done ? <Check className="size-3" strokeWidth={3} /> : null}
        </button>

        {editing ? (
          <Input
            autoFocus
            defaultValue={subtask.title}
            maxLength={TITLE_MAX_LENGTH}
            aria-label={isFr ? "Titre de la sous-tâche" : "Sub-task title"}
            className="h-7 flex-1"
            onBlur={(event) => {
              if (cancelRenameRef.current) {
                cancelRenameRef.current = false;
                handlers.cancelEditing();
                return;
              }

              handlers.rename(subtask, event.currentTarget.value.trim());
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }

              if (event.key === "Escape") {
                cancelRenameRef.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : canEdit && !pending ? (
          <button
            type="button"
            onClick={() => handlers.startEditing(subtask)}
            title={isFr ? "Cliquez pour renommer" : "Click to rename"}
            className={cn(
              "min-w-0 flex-1 cursor-text rounded-md text-left text-sm break-words outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
              subtask.is_done ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {subtask.title}
          </button>
        ) : (
          <span className={cn("min-w-0 flex-1 text-sm break-words", subtask.is_done ? "text-muted-foreground line-through" : "text-foreground")}>
            {subtask.title}
          </span>
        )}

        {canOpenDetails && !editing ? (
          <button
            type="button"
            onClick={() => handlers.toggleDetails(subtask)}
            aria-expanded={detailsOpen}
            aria-label={isFr ? `Assigné et échéance de « ${subtask.title} »` : `Assignee and due date of “${subtask.title}”`}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-1.5 py-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60",
              !hasMeta && !detailsOpen && REVEAL,
            )}
          >
            {hasMeta ? meta : (
              <>
                <CalendarDays className="size-4" />
                <UserRound className="size-4" />
              </>
            )}
          </button>
        ) : hasMeta ? (
          <span className="flex shrink-0 items-center gap-2">{meta}</span>
        ) : null}

        {canEdit && !pending && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-7 text-muted-foreground hover:text-danger", REVEAL)}
            aria-label={isFr ? `Supprimer « ${subtask.title} »` : `Delete “${subtask.title}”`}
            onClick={() => handlers.remove(subtask)}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>

      {detailsOpen && canOpenDetails ? (
        <div
          className="flex flex-wrap items-end gap-3 px-2 pb-2.5 sm:pl-[4.25rem]"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              handlers.toggleDetails(subtask);
            }
          }}
        >
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {isFr ? "Assigné" : "Assignee"}
            {canAssign ? (
              <ModernSelect
                name={`subtask-owner-${subtask.id}`}
                searchable
                value={subtask.assignee_id ?? ""}
                onValueChange={(value) => handlers.setOwner(subtask, value || null)}
                className="h-8 min-w-48"
                options={[
                  { value: "", label: isFr ? "Non assigné" : "Unassigned" },
                  ...ownerOptions.map((person) => ({ value: person.id, label: person.full_name })),
                ]}
              />
            ) : (
              <span className="flex h-8 items-center text-sm text-foreground">
                {subtask.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}
              </span>
            )}
          </label>

          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {isFr ? "Échéance" : "Due date"}
            {/* Saved on blur or Enter, so typing a year digit by digit does not save every step. */}
            <Input
              key={subtask.due_date ?? "none"}
              type="date"
              defaultValue={subtask.due_date ?? ""}
              disabled={!canEdit}
              className="h-8 w-40"
              onBlur={(event) => handlers.setDueDate(subtask, event.currentTarget.value || null)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
        </div>
      ) : null}
    </li>
  );
}
