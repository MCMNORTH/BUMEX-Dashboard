import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Flag, FolderKanban, Layers3 } from "lucide-react";

import { CalendarFilters } from "@/components/calendar/calendar-filters";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { OperationalCalendar } from "@/components/calendar/operational-calendar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCalendarEvents, getCalendarFilterData } from "@/lib/calendar/service";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { CalendarFilters as CalendarFiltersType, CalendarView } from "@/types/calendar";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function formatKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getViewDate(view: CalendarView, period: string) {
  const parsed = new Date(period);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getViewLabel(view: CalendarView, date: Date, locale: "fr" | "en") {
  const formatLocale = locale === "fr" ? "fr-FR" : "en-US";
  if (view === "week") {
    const end = addDays(date, 6);
    return `${new Intl.DateTimeFormat(formatLocale, { month: "short", day: "numeric" }).format(date)} - ${new Intl.DateTimeFormat(formatLocale, { month: "short", day: "numeric", year: "numeric" }).format(end)}`;
  }

  if (view === "agenda") {
    return new Intl.DateTimeFormat(formatLocale, { month: "long", year: "numeric" }).format(date);
  }

  return new Intl.DateTimeFormat(formatLocale, { month: "long", year: "numeric" }).format(date);
}

function shiftPeriod(view: CalendarView, period: string, direction: -1 | 1) {
  const current = getViewDate(view, period);

  if (view === "week") {
    return formatKey(addDays(current, direction * 7));
  }

  return formatKey(addMonths(current, direction));
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("calendar");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};
  const view = (getString(params.view) as CalendarView) ?? "month";
  const period = getString(params.period) ?? formatKey(new Date());
  const filters: CalendarFiltersType = {
    type: (getString(params.type) as CalendarFiltersType["type"]) ?? "",
    projectId: getString(params.project) ?? "",
    clientId: getString(params.client) ?? "",
    assigneeId: getString(params.assignee) ?? "",
    priority: (getString(params.priority) as CalendarFiltersType["priority"]) ?? "",
    status: (getString(params.status) as CalendarFiltersType["status"]) ?? "",
  };

  const [events, filterData] = await Promise.all([
    getCalendarEvents(auth.role, filters),
    getCalendarFilterData(),
  ]);

  const summaryMode = auth.role === "shareholder";
  const date = getViewDate(view, period);
  const label = getViewLabel(view, date, locale);
  const todayKey = formatKey(new Date());
  const sevenDaysKey = formatKey(addDays(new Date(), 7));
  const terminalStatuses = new Set(["done", "archived", "completed", "cancelled"]);
  const attentionEvents = events
    .filter((event) => event.href && event.date <= sevenDaysKey && !terminalStatuses.has(event.status ?? ""))
    .sort((left, right) => {
      const leftOverdue = left.date < todayKey ? 0 : 1;
      const rightOverdue = right.date < todayKey ? 0 : 1;
      if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
      const leftUrgent = left.priority === "urgent" || left.priority === "critical" ? 0 : 1;
      const rightUrgent = right.priority === "urgent" || right.priority === "critical" ? 0 : 1;
      return leftUrgent - rightUrgent || left.date.localeCompare(right.date);
    })
    .slice(0, 5);

  const buildHref = (nextView: CalendarView, nextPeriod = period) => {
    const search = new URLSearchParams();
    search.set("view", nextView);
    search.set("period", nextPeriod);
    if (filters.type) search.set("type", filters.type);
    if (filters.projectId) search.set("project", filters.projectId);
    if (filters.clientId) search.set("client", filters.clientId);
    if (filters.assigneeId) search.set("assignee", filters.assigneeId);
    if (filters.priority) search.set("priority", filters.priority);
    if (filters.status) search.set("status", filters.status);
    return `/calendar?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Calendrier" : "Calendar"}
          title={
            summaryMode
              ? (isFr ? "Un calendrier opérationnel de haut niveau pour la visibilité stratégique." : "A high-level operational calendar for strategic visibility.")
              : (isFr ? "Un calendrier opérationnel central pour les tickets, jalons, échéances et dates métier." : "A central operational calendar for tickets, milestones, deadlines, and business dates.")
          }
          subtitle={
            summaryMode
              ? (isFr ? "Le mode actionnaire se concentre sur la roadmap, les échéances projet et les signaux de gouvernance." : "Shareholder mode focuses on roadmap, project deadlines, and governance-facing date signals.")
              : (isFr ? "Visualisez toutes les dates importantes des projets, tickets, jalons et obligations métier depuis une seule surface calendrier premium." : "View all important dates across projects, tickets, milestones, and placeholder business obligations from one premium calendar surface.")
          }
        />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {summaryMode ? (isFr ? "Mode synthèse" : "Summary mode") : (isFr ? "Panneau d’événement interactif activé" : "Interactive event drawer enabled")}
        </Badge>
      </div>

      <CalendarToolbar
        view={view}
        label={label}
        previousHref={buildHref(view, shiftPeriod(view, period, -1))}
        nextHref={buildHref(view, shiftPeriod(view, period, 1))}
        todayHref={buildHref(view, formatKey(new Date()))}
        baseHref={(nextView) => buildHref(nextView)}
        isFr={isFr}
      />

      <CalendarFilters filters={filters} filterData={filterData} view={view} period={period} />

      {attentionEvents.length ? <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card/85 shadow-[0_24px_70px_-52px_rgba(15,23,42,.7)]" aria-labelledby="calendar-attention-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/65 bg-gradient-to-r from-rose-500/[.08] via-amber-400/[.05] to-transparent px-5 py-4"><div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-rose-700 dark:text-rose-300"><AlertTriangle className="size-3.5" />{isFr ? "À surveiller" : "Watch list"}</p><h2 id="calendar-attention-title" className="mt-1 text-lg font-semibold">{isFr ? "Dates qui demandent une action" : "Dates that need action"}</h2><p className="mt-1 text-xs text-muted-foreground">{isFr ? "Retards d’abord, puis urgences et échéances des sept prochains jours." : "Overdue items first, followed by urgent and seven-day deadlines."}</p></div><Badge variant="secondary" className="rounded-full px-3 py-1">{attentionEvents.length} {isFr ? "priorité(s)" : "priority item(s)"}</Badge></div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">{attentionEvents.map((event) => { const overdue = event.date < todayKey; const today = event.date === todayKey; return <Link key={`${event.type}-${event.id}`} href={event.href!} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${overdue ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/20 dark:to-orange-950/10" : today ? "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-yellow-950/10" : "border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 dark:border-blue-500/20 dark:from-blue-950/20 dark:to-cyan-950/10"}`}><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${overdue ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : today ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>{overdue ? (isFr ? "En retard" : "Overdue") : today ? (isFr ? "Aujourd’hui" : "Today") : new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`))}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-3 line-clamp-2 text-sm font-semibold">{event.title}</p><p className="mt-2 truncate text-xs text-muted-foreground">{event.projectName ?? event.clientName ?? (isFr ? "Événement opérationnel" : "Operational event")}</p></Link>; })}</div>
      </section> : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: CalendarClock,
            label: isFr ? "Événements visibles" : "Visible events",
            value: formatNumber(events.length),
            detail: isFr ? "Toutes les dates normalisées du périmètre actuel" : "All normalized dates in current scope",
          },
          {
            icon: FolderKanban,
            label: isFr ? "Liés aux projets" : "Project linked",
            value: formatNumber(events.filter((event) => event.projectId).length),
            detail: isFr ? "Événements liés au delivery" : "Events tied to delivery work",
          },
          {
            icon: Flag,
            label: isFr ? "Jalons" : "Milestones",
            value: formatNumber(events.filter((event) => event.type === "milestone").length),
            detail: isFr ? "Visibilité des checkpoints dans la période actuelle" : "Checkpoint visibility in current range",
          },
          {
            icon: Layers3,
            label: isFr ? "Placeholders métier" : "Business placeholders",
            value: formatNumber(events.filter((event) => event.entityType === "placeholder").length),
            detail: isFr ? "Finance, contrats et rituels internes" : "Finance, contracts, and internal rituals",
          },
        ].map(({ icon: Icon, label: itemLabel, value, detail }) => (
          <Card key={itemLabel} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{itemLabel}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OperationalCalendar events={events} view={view} date={date} />
    </div>
  );
}
