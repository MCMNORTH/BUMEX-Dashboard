"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
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
import { useRouter } from "next/navigation";

import { updateTaskDueDateAction } from "@/app/(app)/planning/actions";
import { PlanningDayColumn } from "@/components/planning/planning-day-column";
import { PlanningTaskCard } from "@/components/planning/planning-task-card";
import { UnscheduledTasksPanel } from "@/components/planning/unscheduled-tasks-panel";
import type { PlanningWeekDay } from "@/types/planning";
import type { TicketRecord } from "@/types/ticket";

type PlanningBoardState = {
  byDay: Record<string, TicketRecord[]>;
  unscheduled: TicketRecord[];
};

function removeTicket(state: PlanningBoardState, ticketId: string) {
  let movingTicket: TicketRecord | null = null;

  const byDay = Object.fromEntries(
    Object.entries(state.byDay).map(([date, tickets]) => [
      date,
      tickets.filter((ticket) => {
        if (ticket.id === ticketId) {
          movingTicket = ticket;
          return false;
        }

        return true;
      }),
    ]),
  ) as PlanningBoardState["byDay"];

  const unscheduled = state.unscheduled.filter((ticket) => {
    if (ticket.id === ticketId) {
      movingTicket = ticket;
      return false;
    }

    return true;
  });

  return {
    nextState: { byDay, unscheduled },
    movingTicket,
  };
}

function buildInitialState(
  ticketsByDay: Record<string, TicketRecord[]>,
  unscheduledTasks: TicketRecord[],
): PlanningBoardState {
  return {
    byDay: ticketsByDay,
    unscheduled: unscheduledTasks,
  };
}

function SortablePlanningCard({ ticket, summaryMode }: { ticket: TicketRecord; summaryMode: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: {
      type: "ticket",
    },
    disabled: summaryMode,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <PlanningTaskCard ticket={ticket} summaryMode={summaryMode || isDragging} />
    </div>
  );
}

export function WeeklyPlanningBoard({
  weekDays,
  ticketsByDay,
  unscheduledTasks,
  canDrag,
  summaryMode = false,
}: {
  weekDays: PlanningWeekDay[];
  ticketsByDay: Record<string, TicketRecord[]>;
  unscheduledTasks: TicketRecord[];
  canDrag: boolean;
  summaryMode?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(() => buildInitialState(ticketsByDay, unscheduledTasks));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  const ticketLookup = useMemo(
    () =>
      [...Object.values(state.byDay).flat(), ...state.unscheduled].reduce<Record<string, TicketRecord>>(
        (acc, ticket) => {
          acc[ticket.id] = ticket;
          return acc;
        },
        {},
      ),
    [state],
  );

  const activeTicket = activeTicketId ? ticketLookup[activeTicketId] : null;

  function handleDragStart(event: DragStartEvent) {
    setError(null);
    setActiveTicketId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicketId(null);

    if (!canDrag || summaryMode) {
      return;
    }

    const ticketId = String(event.active.id);
    const ticket = ticketLookup[ticketId];

    if (!ticket) {
      return;
    }

    const overId = typeof event.over?.id === "string" ? event.over.id : null;

    if (!overId) {
      return;
    }

    const nextDueDate = overId === "unscheduled" ? null : overId.replace("day:", "");

    if ((ticket.due_date ?? null) === nextDueDate) {
      return;
    }

    const previousState = state;
    const { nextState, movingTicket } = removeTicket(state, ticketId);

    if (!movingTicket) {
      return;
    }

    const movedTicket: TicketRecord = movingTicket;

    if (nextDueDate) {
      nextState.byDay[nextDueDate] = [
        { ...movedTicket, due_date: nextDueDate },
        ...(nextState.byDay[nextDueDate] ?? []),
      ];
    } else {
      nextState.unscheduled = [{ ...movedTicket, due_date: null }, ...nextState.unscheduled];
    }

    setState(nextState);

    startTransition(async () => {
      const result = await updateTaskDueDateAction(ticketId, nextDueDate);

      if (result.error) {
        setState(previousState);
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  if (summaryMode) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-7">
          {weekDays.map((day) => (
            <PlanningDayColumn key={day.date} day={day} tickets={state.byDay[day.date] ?? []} summaryMode />
          ))}
        </div>
        <UnscheduledTasksPanel tickets={state.unscheduled} summaryMode />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-[22px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 xl:grid-cols-7">
          {weekDays.map((day) => (
            <SortableContext
              key={day.date}
              items={(state.byDay[day.date] ?? []).map((ticket) => ticket.id)}
              strategy={verticalListSortingStrategy}
            >
              <PlanningDayColumn day={day} tickets={state.byDay[day.date] ?? []}>
                {(state.byDay[day.date] ?? []).length ? (
                  (state.byDay[day.date] ?? []).map((ticket) => (
                    <SortablePlanningCard key={ticket.id} ticket={ticket} summaryMode={summaryMode} />
                  ))
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/30 px-4 text-center text-sm text-muted-foreground">
                    No tasks planned for this day
                  </div>
                )}
              </PlanningDayColumn>
            </SortableContext>
          ))}
        </div>

        <SortableContext
          items={state.unscheduled.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          <UnscheduledTasksPanel tickets={state.unscheduled}>
            {state.unscheduled.length ? (
              state.unscheduled.map((ticket) => (
                <SortablePlanningCard key={ticket.id} ticket={ticket} summaryMode={summaryMode} />
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No unscheduled tasks in the current planning scope.
              </div>
            )}
          </UnscheduledTasksPanel>
        </SortableContext>

        <DragOverlay>
          {activeTicket ? <PlanningTaskCard ticket={activeTicket} /> : null}
        </DragOverlay>
      </DndContext>

      {pending ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/72 px-4 py-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Updating planning
        </div>
      ) : null}
    </div>
  );
}
