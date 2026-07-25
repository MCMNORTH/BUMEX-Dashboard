"use client";

import { useMemo, useState } from "react";

import { AgendaList } from "@/components/calendar/agenda-list";
import { CalendarEventCard } from "@/components/calendar/calendar-event-card";
import { CalendarEventDrawer } from "@/components/calendar/calendar-event-drawer";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEvent, CalendarView } from "@/types/calendar";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);
  return current;
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function formatKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupEvents(events: CalendarEvent[]) {
  return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const current = acc[event.date] ?? [];
    current.push(event);
    acc[event.date] = current;
    return acc;
  }, {});
}

function MonthGrid({
  date,
  events,
  onSelect,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const grouped = groupEvents(events);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[62rem] gap-3 grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-background/35 px-3 py-2 text-center text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = formatKey(day);
          const inMonth = day.getMonth() === date.getMonth();
          const dayEvents = grouped[key] ?? [];

          return (
            <div key={key} className={`min-h-36 rounded-[24px] border p-3 ${inMonth ? "border-border/65 bg-background/40" : "border-border/45 bg-background/20 text-muted-foreground"}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">{day.getDate()}</p>
                {dayEvents.length ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {dayEvents.length}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventCard key={event.id} event={event} onSelect={onSelect} compact />
                ))}
                {dayEvents.length > 3 ? (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    +{dayEvents.length - 3} more events
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  date,
  events,
  onSelect,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const weekStart = startOfWeek(date);
  const grouped = groupEvents(events);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[56rem] gap-3 xl:min-w-0 xl:grid-cols-7">
        {days.map((day) => {
          const key = formatKey(day);
          const dayEvents = grouped[key] ?? [];

          return (
            <div key={key} className="rounded-[24px] border border-border/65 bg-background/40 p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}
                </p>
                <p className="mt-1 text-lg font-semibold">{day.getDate()}</p>
              </div>
              <div className="space-y-2">
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <CalendarEventCard key={event.id} event={event} onSelect={onSelect} compact />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                    No events
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OperationalCalendar({
  events,
  view,
  date,
}: {
  events: CalendarEvent[];
  view: CalendarView;
  date: Date;
}) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()),
    [events],
  );

  return (
    <>
      <Card className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <CardContent className="px-5 py-5">
          {view === "agenda" ? (
            <AgendaList events={sortedEvents} onSelect={setSelectedEvent} />
          ) : view === "week" ? (
            <WeekGrid date={date} events={sortedEvents} onSelect={setSelectedEvent} />
          ) : (
            <MonthGrid date={date} events={sortedEvents} onSelect={setSelectedEvent} />
          )}
        </CardContent>
      </Card>

      <CalendarEventDrawer event={selectedEvent} open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)} />
    </>
  );
}
