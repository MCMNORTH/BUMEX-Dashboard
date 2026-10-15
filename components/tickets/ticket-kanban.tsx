"use client";

import { memo, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { LoaderCircle } from "lucide-react";

import { moveTicketStageAction } from "@/app/(app)/tickets/actions";
import { IntentPrefetchLink } from "@/components/shared/intent-prefetch-link";
import { useUser } from "@/hooks/use-user";
import { ticketKanbanStatuses } from "@/lib/tickets/helpers";
import {
  describeTransitionError,
  evaluateTransition,
  findStage,
  getActiveStages,
  getCompletionRule,
  getLegacyWorkflow,
  getStageCategoryLabel,
  MOVE_REASON_MAX_LENGTH,
  resolveCategoryTarget,
  stageStatus,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/layout/i18n-provider";
import { TicketAssignee, TicketDue, TicketSubtaskProgress, ticketStatusTone } from "@/components/tickets/ticket-meta";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketTypeIcon } from "@/components/tickets/ticket-type-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toneDot, type Tone } from "@/components/ui/tone";
import type { TicketRecord, TicketStatus } from "@/types/ticket";
import type { BoardWorkflow } from "@/types/workflow";

type TicketKanbanProps = {
  tickets: TicketRecord[];
  canDrag: boolean;
  /** The workflow of every project the tickets belong to. */
  workflows: Record<string, BoardWorkflow>;
  /**
   * Show this project's own stages as columns. Without it the tickets may come from
   * several boards, so the columns are the statuses all boards share.
   */
  boardProjectId?: string;
};

type KanbanColumnDef = {
  id: string;
  label: string;
  tone: Tone;
  /** A stage archived while a card was still in it: shown so the card is never hidden. */
  archived?: boolean;
};

type BoardState = Record<string, TicketRecord[]>;

type MoveCheck =
  | { ok: true; stageId: string; noop: boolean }
  | { ok: false; code: string; message: string; stageId?: string };

type PendingMove = { ticket: TicketRecord; stageId: string; message: string };

type OptimisticMove = { ticketId: string; stageId: string; status: TicketStatus; stageName: string | null };

/** Cards drawn per column until "Show more": long Done columns otherwise weigh on every drag. */
const COLUMN_PAGE_SIZE = 40;

// Only columns are drop targets: the one under the pointer, or the nearest one from a gap.
const detectColumn: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

/** The board as it will be once a move is saved. Tickets are listed by last update, so the card goes first. */
function applyMove(tickets: TicketRecord[], move: OptimisticMove) {
  const ticket = tickets.find((item) => item.id === move.ticketId);

  if (!ticket) {
    return tickets;
  }

  return [
    { ...ticket, stage_id: move.stageId, status: move.status, stage_name: move.stageName },
    ...tickets.filter((item) => item.id !== move.ticketId),
  ];
}

const TicketKanbanCard = memo(function TicketKanbanCard({
  ticket,
  stageLabel,
  dragging = false,
}: {
  ticket: TicketRecord;
  /** Shown on mixed boards when the card's stage is not simply the column's name. */
  stageLabel?: string | null;
  dragging?: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const showPriority = ticket.priority === "high" || ticket.priority === "urgent";

  return (
    <IntentPrefetchLink
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
        {stageLabel ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-foreground">{stageLabel}</span> : null}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          {showPriority ? <TicketPriorityBadge priority={ticket.priority} /> : null}
          <TicketDue ticket={ticket} locale={locale} />
          <TicketSubtaskProgress ticket={ticket} locale={locale} />
        </span>
        <TicketAssignee name={ticket.assignee?.full_name} locale={locale} showName={false} />
      </div>
    </IntentPrefetchLink>
  );
});

/**
 * The drag handle around a card. It re-renders when a drag starts, ends or changes
 * column; the card inside does not. The card stays put while a copy follows the pointer.
 */
function DraggableTicketCard({
  ticket,
  stageLabel,
  canDrag,
}: {
  ticket: TicketRecord;
  stageLabel?: string | null;
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, disabled: !canDrag });

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-opacity", isDragging && "opacity-40")}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <TicketKanbanCard ticket={ticket} stageLabel={stageLabel} />
    </div>
  );
}

function KanbanColumn({
  column,
  tickets,
  dragging,
  blocked,
  canDrag,
  stageLabelFor,
}: {
  column: KanbanColumnDef;
  tickets: TicketRecord[];
  dragging: boolean;
  /** The card being dragged may not move here. */
  blocked: boolean;
  canDrag: boolean;
  stageLabelFor: (ticket: TicketRecord, column: KanbanColumnDef) => string | null;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: {
      columnId: column.id,
    },
  });
  const visibleTickets = expanded ? tickets : tickets.slice(0, COLUMN_PAGE_SIZE);
  const hiddenCount = tickets.length - visibleTickets.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-48 min-w-0 flex-col rounded-xl border border-border bg-muted/40 p-2 transition-[background-color,border-color,opacity]",
        isOver && !blocked && "border-primary/40 bg-accent",
        blocked && "border-dashed opacity-55",
        column.archived && "border-dashed",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className={cn("size-2 shrink-0 rounded-full", toneDot[column.tone])} aria-hidden="true" />
          <span className="truncate" title={column.label}>{column.label}</span>
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">{tickets.length}</span>
      </div>

      {column.archived ? (
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          {isFr ? "Étape archivée : déplacez ces cartes." : "Archived stage: move these cards out."}
        </p>
      ) : null}

      <div className="flex-1 space-y-2">
        {visibleTickets.length ? (
          visibleTickets.map((ticket) => (
            <DraggableTicketCard
              key={ticket.id}
              ticket={ticket}
              stageLabel={stageLabelFor(ticket, column)}
              canDrag={canDrag}
            />
          ))
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
            {dragging
              ? blocked
                ? (isFr ? "Déplacement non autorisé" : "Move not allowed")
                : (isFr ? "Déposer le ticket ici" : "Drop ticket here")
              : (isFr ? "Aucun ticket" : "No tickets")}
          </div>
        )}
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="w-full rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            {isFr ? `Afficher ${hiddenCount} de plus` : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TicketKanban({ tickets, canDrag, workflows, boardProjectId }: TicketKanbanProps) {
  const { locale } = useI18n();
  const { profile } = useUser();
  const isFr = locale === "fr";
  const boardWorkflow = useMemo(
    () => (boardProjectId ? workflows[boardProjectId] ?? getLegacyWorkflow(boardProjectId, locale) : null),
    [boardProjectId, workflows, locale],
  );

  const workflowFor = (ticket: TicketRecord) =>
    workflows[ticket.project_id] ?? getLegacyWorkflow(ticket.project_id, locale);

  // On a project's board a card sits in its stage's column; on a mixed board, in its status's.
  const columnIdFor = (ticket: TicketRecord) => (boardWorkflow ? ticket.stage_id : ticket.status);

  const columns = useMemo<KanbanColumnDef[]>(() => {
    if (!boardWorkflow) {
      return ticketKanbanStatuses.map((status) => ({
        id: status,
        label: getStageCategoryLabel(status, locale),
        tone: ticketStatusTone[status],
      }));
    }

    const active = getActiveStages(boardWorkflow).map((stage) => ({
      id: stage.id,
      label: stage.name,
      tone: stage.is_completed ? ("success" as const) : ticketStatusTone[stage.category],
    }));
    const activeIds = new Set(active.map((column) => column.id));
    const stranded = [...new Set(tickets.map((ticket) => ticket.stage_id).filter((id) => !activeIds.has(id)))]
      .map((id) => findStage(boardWorkflow, id))
      .filter((stage) => stage !== undefined)
      .map((stage) => ({
        id: stage.id,
        label: `${stage.name} (${isFr ? "archivée" : "archived"})`,
        tone: "neutral" as const,
        archived: true,
      }));

    return [...active, ...stranded];
  }, [boardWorkflow, tickets, locale, isFr]);

  // Moves show at once and last until the server's fresh tickets arrive with them;
  // a refused move simply drops out, so nothing has to be rolled back by hand.
  const [optimisticTickets, addOptimisticMove] = useOptimistic(tickets, applyMove);

  const board = useMemo<BoardState>(() => {
    const next: BoardState = Object.fromEntries(columns.map((column) => [column.id, []]));

    for (const ticket of optimisticTickets) {
      next[boardWorkflow ? ticket.stage_id : ticket.status]?.push(ticket);
    }

    return next;
  }, [optimisticTickets, columns, boardWorkflow]);

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [reason, setReason] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  const ticketLookup = useMemo(
    () => new Map(optimisticTickets.map((ticket) => [ticket.id, ticket])),
    [optimisticTickets],
  );

  const activeTicket = activeTicketId ? ticketLookup.get(activeTicketId) ?? null : null;

  // The same rules the server applies, so a refused move is explained without a round trip.
  function checkMove(ticket: TicketRecord, columnId: string, moveReason?: string): MoveCheck {
    const workflow = workflowFor(ticket);
    const rules = getCompletionRule(ticket, profile?.id ?? "");

    if (boardWorkflow) {
      const check = evaluateTransition(workflow, ticket.stage_id, columnId, moveReason, rules);
      return check.ok
        ? { ok: true, stageId: columnId, noop: check.noop }
        : { ok: false, code: check.error.code, message: describeTransitionError(check.error, locale), stageId: columnId };
    }

    const target = resolveCategoryTarget(workflow, ticket.stage_id, columnId as TicketStatus, locale, moveReason, rules);
    return target.ok
      ? target
      : { ok: false, code: target.error.code, message: describeTransitionError(target.error, locale), stageId: target.stageId };
  }

  const blockedColumns = useMemo(() => {
    if (!activeTicket) {
      return new Set<string>();
    }

    return new Set(
      columns
        .filter((column) => column.id !== columnIdFor(activeTicket))
        .filter((column) => {
          const check = checkMove(activeTicket, column.id);
          // Moves that only lack a reason are allowed: the reason is asked for on drop.
          return !check.ok && check.code !== "reason_required";
        })
        .map((column) => column.id),
    );
    // checkMove and columnIdFor only read props already listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket, columns, workflows, boardWorkflow, locale, profile?.id]);

  function stageLabelFor(ticket: TicketRecord, column: KanbanColumnDef) {
    if (boardWorkflow || !ticket.stage_name) {
      return null;
    }

    return ticket.stage_name.toLocaleLowerCase() === column.label.toLocaleLowerCase() ? null : ticket.stage_name;
  }

  function commitMove(ticket: TicketRecord, stageId: string, moveReason?: string) {
    const workflow = workflowFor(ticket);
    const stage = findStage(workflow, stageId);

    if (!stage) {
      return;
    }

    startTransition(async () => {
      addOptimisticMove({
        ticketId: ticket.id,
        stageId: stage.id,
        status: stageStatus(stage),
        stageName: workflow.is_configured ? stage.name : null,
      });
      let result: Awaited<ReturnType<typeof moveTicketStageAction>>;

      try {
        result = await moveTicketStageAction(ticket.id, { stageId: stage.id }, moveReason);
      } catch {
        // The card returns to its column when the transition ends; say why.
        setError(isFr ? "Le déplacement n’a pas pu être enregistré. Vérifiez votre connexion et réessayez." : "The move could not be saved. Check your connection and try again.");
        return;
      }

      if (result.error) {
        if (result.code === "reason_required") {
          setReason("");
          setPendingMove({ ticket, stageId: stage.id, message: result.error });
        } else {
          setError(result.error);
        }
      }
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setError(null);
    setActiveTicketId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicketId(null);

    if (!canDrag) {
      return;
    }

    const ticket = ticketLookup.get(String(event.active.id));
    const overColumn = event.over?.data.current?.columnId;
    const columnId = overColumn ? String(overColumn) : null;

    // Dropping back into the card's own column changes nothing.
    if (!ticket || !columnId || columnId === columnIdFor(ticket)) {
      return;
    }

    const check = checkMove(ticket, columnId);

    if (!check.ok) {
      if (check.code === "reason_required" && check.stageId) {
        setReason("");
        setPendingMove({ ticket, stageId: check.stageId, message: check.message });
      } else {
        setError(check.message);
      }

      return;
    }

    if (!check.noop) {
      commitMove(ticket, check.stageId);
    }
  }

  const pendingFrom = pendingMove ? findStage(workflowFor(pendingMove.ticket), pendingMove.ticket.stage_id) : undefined;
  const pendingTo = pendingMove ? findStage(workflowFor(pendingMove.ticket), pendingMove.stageId) : undefined;

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" className="shrink-0 text-xs font-medium underline-offset-2 hover:underline" onClick={() => setError(null)}>
            {isFr ? "Fermer" : "Dismiss"}
          </button>
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
        collisionDetection={detectColumn}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTicketId(null)}
      >
        {/* One row of columns, left to right in workflow order; scrolls sideways on narrow screens. */}
        <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-2">
          <div className="grid min-w-0 auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-2">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tickets={board[column.id] ?? []}
                dragging={Boolean(activeTicketId)}
                blocked={blockedColumns.has(column.id)}
                canDrag={canDrag}
                stageLabelFor={stageLabelFor}
              />
            ))}
          </div>
        </div>

        {/* No drop animation: the card is already in its new column when the pointer lets go. */}
        <DragOverlay dropAnimation={null}>
          {activeTicket ? <TicketKanbanCard ticket={activeTicket} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {pending ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {isFr ? "Synchronisation du tableau..." : "Saving board changes..."}
        </div>
      ) : null}

      <Dialog open={Boolean(pendingMove)} onOpenChange={(open) => (open ? null : setPendingMove(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isFr ? "Raison requise" : "Reason required"}</DialogTitle>
            <DialogDescription>
              {pendingMove?.message}
              {pendingFrom && pendingTo ? ` ${pendingFrom.name} → ${pendingTo.name}` : null}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();

              if (!pendingMove || !reason.trim()) {
                return;
              }

              const move = pendingMove;
              setPendingMove(null);
              commitMove(move.ticket, move.stageId, reason.trim());
            }}
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MOVE_REASON_MAX_LENGTH}
              rows={3}
              required
              autoFocus
              aria-label={isFr ? "Raison du déplacement" : "Reason for the move"}
              placeholder={isFr ? "Pourquoi cette carte revient-elle en arrière ?" : "Why is this card going back?"}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setPendingMove(null)}>
                {isFr ? "Annuler" : "Cancel"}
              </Button>
              <Button type="submit" disabled={!reason.trim()}>
                {isFr ? "Déplacer la carte" : "Move card"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
