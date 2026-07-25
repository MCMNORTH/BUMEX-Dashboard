"use client";

import { CalendarRange, CircleAlert, Flag, FolderKanban } from "lucide-react";

import { MilestoneStatusBadge } from "@/components/roadmap/milestone-status-badge";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { Badge } from "@/components/ui/badge";
import type { CalendarEvent } from "@/types/calendar";

function getTypeLabel(type: CalendarEvent["type"]) {
  return type.replaceAll("_", " ");
}

export function CalendarEventCard({
  event,
  onSelect,
  compact = false,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`w-full rounded-[20px] border border-border/65 bg-background/40 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:bg-background/56 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium tracking-[-0.02em]">{event.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarRange className="size-3.5" />
              {event.date}
            </span>
            {event.projectName ? (
              <span className="flex items-center gap-1.5">
                <FolderKanban className="size-3.5" />
                {event.projectName}
              </span>
            ) : null}
          </div>
        </div>
        <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[10px] uppercase">
          {getTypeLabel(event.type)}
        </Badge>
      </div>

      {!compact ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {event.type === "milestone" && event.status ? (
            <MilestoneStatusBadge status={event.status as never} />
          ) : null}
          {event.priority ? <TicketPriorityBadge priority={event.priority as never} /> : null}
          {event.health ? <ProjectHealthBadge health={event.health} /> : null}
          {event.status && event.type !== "milestone" ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] uppercase">
              <CircleAlert className="mr-1 size-3" />
              {event.status.replaceAll("_", " ")}
            </Badge>
          ) : null}
          {event.clientName ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] uppercase">
              <Flag className="mr-1 size-3" />
              {event.clientName}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

