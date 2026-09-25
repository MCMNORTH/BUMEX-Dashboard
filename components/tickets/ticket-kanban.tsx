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
import { CalendarClock, CheckCircle2, CircleDashed, Eye, FolderKanban, GripVertical, LoaderCircle, ShieldAlert, Sparkles, Timer } from "lucide-react";

import { updateTicketStatusAction } from "@/app/(app)/tickets/actions";
import {
  formatTicketDate,
  getTicketDueLabel,
  ticketKanbanStatuses,
} from "@/lib/tickets/helpers";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketTypeBadge } from "@/components/tickets/ticket-type-badge";
import type { TicketRecord, TicketStatus } from "@/types/ticket";

type TicketKanbanProps = {
  tickets: TicketRecord[];
  canDrag: boolean;
};

type TicketBoardState = Record<TicketStatus, TicketRecord[]>;

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

const statusStyle: Record<string, { icon: typeof CircleDashed; accent: string; tint: string }> = {
  backlog: { icon: CircleDashed, accent: "border-t-slate-400", tint: "bg-slate-50/80 dark:bg-slate-900/30" },
  todo: { icon: Timer, accent: "border-t-blue-500", tint: "bg-blue-50/45 dark:bg-blue-950/15" },
  in_progress: { icon: Sparkles, accent: "border-t-violet-500", tint: "bg-violet-50/45 dark:bg-violet-950/15" },
  review: { icon: Eye, accent: "border-t-amber-500", tint: "bg-amber-50/45 dark:bg-amber-950/15" },
  blocked: { icon: ShieldAlert, accent: "border-t-rose-500", tint: "bg-rose-50/45 dark:bg-rose-950/15" },
  done: { icon: CheckCircle2, accent: "border-t-emerald-500", tint: "bg-emerald-50/45 dark:bg-emerald-950/15" },
};

function TicketKanbanCard({
  ticket,
  dragging = false,
}: {
  ticket: TicketRecord;
  dragging?: boolean;
}) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={cn(
        "group relative block min-w-0 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg hover:border-primary/30 motion-reduce:transition-none dark:border-white/10 dark:bg-slate-950/70 dark:shadow-none dark:hover:border-white/20",
        dragging && "rotate-1 shadow-[var(--shadow-glow)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TicketTypeBadge type={ticket.type} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
          <h4 className="text-sm font-semibold tracking-[-0.02em] text-foreground">{ticket.title}</h4>
        </div>
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-primary" />
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {ticket.description || "No operational summary attached."}
      </p>

      <div className="mt-4 grid gap-2 rounded-2xl border border-border/60 bg-background/38 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="size-3.5" />
          <span className="truncate">{ticket.project?.name ?? "No project linked"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          <span>{formatTicketDate(ticket.due_date)} / {getTicketDueLabel(ticket.due_date)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(ticket.assignee?.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-medium">{ticket.assignee?.full_name ?? "Unassigned"}</p>
            <p className="text-[11px] text-muted-foreground">{ticket.assignee?.role ?? "No role"}</p>
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} />
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
        "flex min-h-[19rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-t-[3px] border-slate-200 bg-white/80 p-3 shadow-sm transition duration-200 dark:border-white/10 dark:bg-slate-950/40 sm:p-4",
        statusStyle[status]?.accent,
        statusStyle[status]?.tint,
        isOver && "scale-[1.01] border-primary/40 bg-primary/[0.06] shadow-md",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {(() => { const Icon = statusStyle[status]?.icon ?? CircleDashed; return <Icon className="size-3.5 text-primary" />; })()}
            {status.replace("_", " ")}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">{tickets.length}</h3>
        </div>
        <Badge variant="secondary" className="rounded-full px-3 py-1">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
        </Badge>
      </div>

      <div className="mt-4 flex-1 space-y-3">
        <SortableContext items={tickets.map((ticket) => ticket.id)} strategy={verticalListSortingStrategy}>
          {tickets.length ? (
            tickets.map((ticket) => <SortableTicketCard key={ticket.id} ticket={ticket} canDrag={canDrag} />)
          ) : (
            <div className="flex min-h-32 items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/30 px-4 text-center text-sm text-muted-foreground">
              {activeTicketId ? "Drop ticket here" : "No tickets in this column"}
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
        <div className="rounded-[22px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!canDrag ? (
        <div className="rounded-[22px] border border-border/70 bg-card/72 px-4 py-3 text-sm text-muted-foreground">
          Kanban is read-only for your current role.
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="min-w-0 pb-2">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
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
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/72 px-4 py-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Syncing board changes
        </div>
      ) : null}
    </div>
  );
}
