"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PlanningTaskCard } from "@/components/planning/planning-task-card";
import type { PlanningWeekDay } from "@/types/planning";
import type { TicketRecord } from "@/types/ticket";

export function PlanningDayColumn({
  day,
  tickets,
  summaryMode = false,
  children,
}: {
  day: PlanningWeekDay;
  tickets: TicketRecord[];
  summaryMode?: boolean;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${day.date}`,
    disabled: summaryMode,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[22rem] flex-col rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-all",
        isOver && "border-sky-300/16 bg-sky-500/[0.05]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{day.shortLabel}</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">
            {day.label}
          </h3>
        </div>
        <Badge variant={day.isToday ? "default" : "secondary"} className="rounded-full px-3 py-1">
          {tickets.length}
        </Badge>
      </div>

      <div className="mt-4 flex-1 space-y-3">
        {summaryMode ? (
          <div className="rounded-[20px] border border-border/65 bg-background/38 p-4">
            <p className="text-sm font-medium">{tickets.length} scheduled items</p>
            <p className="mt-1 text-xs text-muted-foreground">High-level shareholder summary</p>
          </div>
        ) : children ? (
          children
        ) : tickets.length ? (
          tickets.map((ticket) => (
            <PlanningTaskCard key={ticket.id} ticket={ticket} />
          ))
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/30 px-4 text-center text-sm text-muted-foreground">
            No tasks planned for this day
          </div>
        )}
      </div>
    </div>
  );
}
