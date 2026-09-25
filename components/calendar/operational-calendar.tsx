"use client";

import { useMemo, useState } from "react";

import { AgendaList } from "@/components/calendar/agenda-list";
import { CalendarEventCard } from "@/components/calendar/calendar-event-card";
import { CalendarEventDrawer } from "@/components/calendar/calendar-event-drawer";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/layout/i18n-provider";
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
  isFr,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  isFr: boolean;
}) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const grouped = groupEvents(events);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[62rem] gap-3 grid-cols-7">
        {(isFr ? ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((label) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-background/35 px-3 py-2 text-center text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = formatKey(day);
          const inMonth = day.getMonth() === date.getMonth();
          const dayEvents = grouped[key] ?? [];
          const isToday = key === formatKey(new Date());
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const isBusy = dayEvents.length >= 4;

          return (
            <div key={key} className={`relative min-h-36 rounded-[24px] border p-3 transition ${isToday ? "border-blue-400 bg-gradient-to-br from-blue-50 via-cyan-50/70 to-violet-50 ring-4 ring-blue-500/10 dark:border-blue-400/45 dark:from-blue-950/30 dark:via-cyan-950/15 dark:to-violet-950/20" : inMonth ? isWeekend ? "border-border/55 bg-muted/30" : "border-border/65 bg-background/40" : "border-border/45 bg-background/20 text-muted-foreground"} ${isBusy ? "shadow-[inset_0_-3px_0_rgba(139,92,246,.45)]" : ""}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><p className={`grid size-7 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-blue-600 text-white shadow-md shadow-blue-500/25" : ""}`}>{day.getDate()}</p>{isToday ? <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{isFr ? "Aujourd’hui" : "Today"}</span> : null}</div>
                {dayEvents.length ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isBusy ? "border-violet-300 bg-violet-500/10 text-violet-700 dark:border-violet-500/30 dark:text-violet-300" : "border-primary/20 bg-primary/10 text-primary"}`}>
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
                    +{dayEvents.length - 3} {isFr ? "événements supplémentaires" : "more events"}
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
  isFr,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  isFr: boolean;
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
          const isToday = key === formatKey(new Date());
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const isBusy = dayEvents.length >= 4;

          return (
            <div key={key} className={`rounded-[24px] border p-4 transition ${isToday ? "border-blue-400 bg-gradient-to-b from-blue-50 to-cyan-50/60 ring-4 ring-blue-500/10 dark:border-blue-400/45 dark:from-blue-950/30 dark:to-cyan-950/15" : isWeekend ? "border-border/55 bg-muted/30" : "border-border/65 bg-background/40"} ${isBusy ? "shadow-[inset_0_-3px_0_rgba(139,92,246,.45)]" : ""}`}>
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2"><p className={`text-xs font-semibold tracking-[0.16em] uppercase ${isToday ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                  {new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", { weekday: "short" }).format(day)}
                </p>{isToday ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">{isFr ? "Aujourd’hui" : "Today"}</span> : null}</div>
                <p className={`mt-1 text-lg font-semibold ${isToday ? "text-blue-700 dark:text-blue-200" : ""}`}>{day.getDate()}</p>
              </div>
              <div className="space-y-2">
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <CalendarEventCard key={event.id} event={event} onSelect={onSelect} compact />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                    {isFr ? "Aucun événement" : "No events"}
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
  const { locale } = useI18n();
  const isFr = locale === "fr";
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
            <WeekGrid date={date} events={sortedEvents} onSelect={setSelectedEvent} isFr={isFr} />
          ) : (
            <MonthGrid date={date} events={sortedEvents} onSelect={setSelectedEvent} isFr={isFr} />
          )}
        </CardContent>
      </Card>

      <CalendarEventDrawer event={selectedEvent} open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)} />
    </>
  );
}
