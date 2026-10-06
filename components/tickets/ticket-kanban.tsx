"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LoaderCircle } from "lucide-react";

import { updateTicketStatusAction } from "@/app/(app)/tickets/actions";
import { ticketKanbanStatuses } from "@/lib/tickets/helpers";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/layout/i18n-provider";
import { TicketAssignee, TicketDue, ticketStatusTone } from "@/components/tickets/ticket-meta";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketTypeIcon } from "@/components/tickets/ticket-type-badge";
import { toneDot } from "@/components/ui/tone";
import type { TicketRecord, TicketStatus } from "@/types/ticket";

type TicketKanbanProps = {
  tickets: TicketRecord[];
  canDrag: boolean;
};

type TicketBoardState = Record<TicketStatus, TicketRecord[]>;

function buildBoard(tickets: TicketRecord[]): TicketBoardState {
  return {
    backlog: tickets.filter((ticket) => ticket.status === "backlog"),
    todo: tickets.filter((ticket) => ticket.status === "todo"),
    in_progress: tickets.filter((ticket) => ticket.status === "in_progress"),
    review: tickets.filter((ticket) => ticket.status === "review"),
    blocked: tickets.filter((ticket) => ticket.status === "blocked"),
    done: tickets.filter((ticket) => ticket.status === "done"),
    archived: tickets.filter((ticket) => ticket.status === "archived"),
  };
}

function moveTicket(board: TicketBoardState, ticketId: string, nextStatus: TicketStatus) {
  let movingTicket: TicketRecord | null = null;

  const nextBoard = Object.fromEntries(
    Object.entries(board).map(([status, items]) => [
      status,
      items.filter((item) => {
        if (item.id === ticketId) {
          movingTicket = item;
          return false;
        }

        return true;
      }),
    ]),
  ) as TicketBoardState;

  if (!movingTicket) {
    return board;
  }

  const movedTicket: TicketRecord = movingTicket;
  nextBoard[nextStatus] = [{ ...movedTicket, status: nextStatus }, ...nextBoard[nextStatus]];
  return nextBoard;
}

function TicketKanbanCard({
  ticket,
  dragging = false,
}: {
  ticket: TicketRecord;
  dragging?: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const showPriority = ticket.priority === "high" || ticket.priority === "urgent";

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={cn(
        "block min-w-0 rounded-lg border border-border bg-card p-2.5 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40",
        dragging && "rotate-1 shadow-[var(--shadow-elevated)]",
      )}
    >
      <p className="line-clamp-2 break-words text-sm font-medium text-foreground">{ticket.title}</p>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <TicketTypeIcon type={ticket.type} className="shrink-0 [&_svg]:size-3.5" />
        <span className="truncate">{ticket.project?.name ?? (isFr ? "Sans projet" : "No project")}</span>
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          {showPriority ? <TicketPriorityBadge priority={ticket.priority} /> : null}
          <TicketDue ticket={ticket} locale={locale} />
        </span>
        <TicketAssignee name={ticket.assignee?.full_name} locale={locale} showName={false} />
      </div>
    </Link>
  );
}

function SortableTicketCard({ ticket, canDrag }: { ticket: TicketRecord; canDrag: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    disabled: !canDrag,
    data: {
      type: "ticket",
      status: ticket.status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <TicketKanbanCard ticket={ticket} dragging={isDragging} />
    </div>
  );
}

function KanbanColumn({
  status,
  tickets,
  activeTicketId,
  canDrag,
}: {
  status: TicketStatus;
  tickets: TicketRecord[];
  activeTicketId?: string | null;
  canDrag: boolean;
}) {
  const { locale, t } = useI18n();
  const isFr = locale === "fr";
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: "column",
      status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-48 min-w-0 flex-col rounded-xl border border-border bg-muted/40 p-2 transition-colors",
        isOver && "border-primary/40 bg-accent",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className={cn("size-2 shrink-0 rounded-full", toneDot[ticketStatusTone[status]])} aria-hidden="true" />
          <span className="truncate">{t(`tickets.form.select.statuses.${status}`, status.replace("_", " "))}</span>
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">{tickets.length}</span>
      </div>

      <div className="flex-1 space-y-2">
        <SortableContext items={tickets.map((ticket) => ticket.id)} strategy={verticalListSortingStrategy}>
          {tickets.length ? (
            tickets.map((ticket) => <SortableTicketCard key={ticket.id} ticket={ticket} canDrag={canDrag} />)
          ) : (
            <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
              {activeTicketId ? (isFr ? "Déposer le ticket ici" : "Drop ticket here") : (isFr ? "Aucun ticket" : "No tickets")}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function TicketKanban({ tickets, canDrag }: TicketKanbanProps) {
  const [board, setBoard] = useState<TicketBoardState>(() => buildBoard(tickets));
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { locale } = useI18n();
  const isFr = locale === "fr";

  useEffect(() => {
    setBoard(buildBoard(tickets));
  }, [tickets]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  const ticketLookup = useMemo(
    () =>
      Object.values(board).flat().reduce<Record<string, TicketRecord>>((acc, ticket) => {
        acc[ticket.id] = ticket;
        return acc;
      }, {}),
    [board],
  );

  const activeTicket = activeTicketId ? ticketLookup[activeTicketId] : null;

  function handleDragStart(event: DragStartEvent) {
    setError(null);
    setActiveTicketId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicketId(null);

    if (!canDrag) {
      return;
    }

    const activeId = String(event.active.id);
    const currentTicket = ticketLookup[activeId];

    if (!currentTicket) {
      return;
    }

    const nextStatus = (() => {
      const overData = event.over?.data.current;

      if (!overData) {
        return null;
      }

      if (overData.type === "column") {
        return overData.status as TicketStatus;
      }

      if (overData.type === "ticket") {
        return overData.status as TicketStatus;
      }

      return null;
    })();

    if (!nextStatus || nextStatus === currentTicket.status) {
      return;
    }

    const previousBoard = board;
    setBoard(moveTicket(board, activeId, nextStatus));

    startTransition(async () => {
      const result = await updateTicketStatusAction(activeId, nextStatus);

      if (result.error) {
        setBoard(previousBoard);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {!canDrag ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {isFr ? "Le tableau est en lecture seule pour votre rôle." : "The board is read-only for your role."}
        </div>
      ) : null}

      <DndContext
        id="ticket-kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* One row of columns, left to right in workflow order; scrolls sideways on narrow screens. */}
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-2">
          <div className="grid min-w-0 auto-cols-[minmax(12rem,1fr)] grid-flow-col gap-2">
            {ticketKanbanStatuses.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tickets={board[status]}
                activeTicketId={activeTicketId}
                canDrag={canDrag}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTicket ? <TicketKanbanCard ticket={activeTicket} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {pending ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {isFr ? "Synchronisation du tableau..." : "Saving board changes..."}
        </div>
      ) : null}
    </div>
  );
}
