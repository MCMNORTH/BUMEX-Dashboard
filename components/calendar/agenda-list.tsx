"use client";

import { CalendarEventCard } from "@/components/calendar/calendar-event-card";
import type { CalendarEvent } from "@/types/calendar";

export function AgendaList({
  events,
  onSelect,
}: {
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  if (!events.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
        No events in the current agenda scope.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {events.map((event) => (
        <CalendarEventCard key={event.id} event={event} onSelect={onSelect} />
      ))}
    </div>
  );
}

