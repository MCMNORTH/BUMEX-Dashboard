"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningTaskCard } from "@/components/planning/planning-task-card";
import type { TicketRecord } from "@/types/ticket";

export function UnscheduledTasksPanel({
  tickets,
  summaryMode = false,
  children,
}: {
  tickets: TicketRecord[];
  summaryMode?: boolean;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "unscheduled",
    disabled: summaryMode,
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "border-border/70 bg-card/72 backdrop-blur-xl transition-all",
        isOver && "border-sky-300/16 bg-sky-500/[0.05]",
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary" />
          <CardTitle>Unscheduled</CardTitle>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">Tasks without a due date assigned yet.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {tickets.length ? (
          summaryMode ? (
            <div className="rounded-[22px] border border-border/65 bg-background/38 p-4">
              <p className="text-sm font-medium">{tickets.length} unscheduled items</p>
              <p className="mt-1 text-xs text-muted-foreground">Detailed task visibility is hidden in summary mode.</p>
            </div>
          ) : children ? (
            children
          ) : (
            tickets.map((ticket) => <PlanningTaskCard key={ticket.id} ticket={ticket} />)
          )
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No unscheduled tasks in the current planning scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
