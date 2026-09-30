"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, BriefcaseBusiness, CalendarClock, CalendarPlus, CalendarRange, ChevronDown, CheckCircle2, Eye, Filter, GripVertical, Layers3, LoaderCircle, Search, ShieldCheck, Sparkles, UsersRound, Zap } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TeamWorkloadRecord } from "@/types/team";
import type { PlanningActualTime } from "@/types/planning";
import type { TicketRecord } from "@/types/ticket";
import { getBumexEntity } from "@/lib/entities/config";
import { rebalanceTaskAction, rebalanceTasksAction, updateTaskDueDateAction } from "@/app/(app)/planning/actions";

type Zoom = "day" | "week" | "month";

const projectColors = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-fuchsia-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-700",
];

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function projectColor(projectId: string) {
  let total = 0;
  for (const character of projectId) total += character.charCodeAt(0);
  return projectColors[total % projectColors.length];
}

function getDates(anchor: string, zoom: Zoom) {
  const base = new Date(`${anchor}T00:00:00Z`);
  if (zoom === "day") return Array.from({ length: 7 }, (_, index) => addDays(base, index));
  if (zoom === "week") return Array.from({ length: 8 }, (_, index) => addDays(base, index * 7));
  return Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + index, 1)));
}

function rangeLabel(dates: Date[], zoom: Zoom, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { day: zoom === "month" ? undefined : "numeric", month: "short", year: "numeric" });
  return `${formatter.format(dates[0])} — ${formatter.format(dates.at(-1)!)}`;
}

function capacityPercent(hours: number, capacity: number) {
  if (capacity <= 0) return hours > 0 ? 101 : 0;
  return Math.round(hours / capacity * 100);
}

export function TeamCapacityPlanner({
  members,
  tickets,
  projects,
  anchor,
  locale,
  companyWide,
  initialZoom,
  actualTime,
  teamMode,
}: {
  members: TeamWorkloadRecord[];
  tickets: TicketRecord[];
  projects: Array<{ id: string; name: string }>;
  anchor: string;
  locale: "fr" | "en";
  companyWide: boolean;
  initialZoom: Zoom;
  actualTime: PlanningActualTime[];
  teamMode: boolean;
}) {
  const isFr = locale === "fr";
  const router = useRouter();
  const [zoom, setZoom] = useState<Zoom>(initialZoom);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [entity, setEntity] = useState("");
  const [availability, setAvailability] = useState("");
  const [sortBy, setSortBy] = useState("risk");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [movePreview, setMovePreview] = useState<{ ticket: TicketRecord; date: Date; member: TeamWorkloadRecord } | null>(null);
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioNotice, setScenarioNotice] = useState("");
  const [scenarioPending, startScenarioTransition] = useTransition();
  const [schedulePending, startScheduleTransition] = useTransition();
  const dates = useMemo(() => getDates(anchor, zoom), [anchor, zoom]);
  const today = dateKey(new Date());
  const visibleMembers = members.filter((member) => {
    const matchesSearch = `${member.full_name} ${member.job_title ?? ""} ${member.department ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const hasProject = !project || tickets.some((ticket) => ticket.assignee_id === member.id && ticket.project_id === project);
    const needsAttention = !attentionOnly || member.workload_risk === "high" || member.overdue_items > 0;
    const matchesEntity = !entity || member.entity_code === entity;
    const matchesAvailability = !availability || member.availability_status === availability;
    return matchesSearch && hasProject && needsAttention && matchesEntity && matchesAvailability;
  }).sort((a, b) => sortBy === "name" ? a.full_name.localeCompare(b.full_name, isFr ? "fr" : "en") : sortBy === "load-asc" ? a.utilization_percentage - b.utilization_percentage : sortBy === "load-desc" ? b.utilization_percentage - a.utilization_percentage : (b.overdue_items - a.overdue_items || b.utilization_percentage - a.utilization_percentage));
  const entityOptions = [...new Set(members.map(member => member.entity_code).filter((code): code is NonNullable<typeof code> => Boolean(code)))].sort();
  const selectedMember = members.find(member => member.id === selectedId) ?? null;
  const selectedTickets = selectedMember ? tickets.filter(ticket => ticket.assignee_id === selectedMember.id).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")) : [];
  const totalCapacity = members.reduce((sum, member) => sum + (member.availability_status === "away" ? 0 : member.weekly_capacity_hours), 0);
  const averageUtilization = members.length ? Math.round(members.reduce((sum, member) => sum + member.utilization_percentage, 0) / members.length) : 0;
  const overloaded = members.filter((member) => member.workload_risk === "high" || member.utilization_percentage > 100).length;
  const available = members.filter((member) => member.utilization_percentage < 70 && member.availability_status !== "away").length;

  const cellTickets = (memberId: string, columnDate: Date) => {
    const start = dateKey(columnDate);
    const end = zoom === "day" ? start : dateKey(zoom === "week" ? addDays(columnDate, 7) : new Date(Date.UTC(columnDate.getUTCFullYear(), columnDate.getUTCMonth() + 1, 1)));
    return tickets.filter((ticket) => ticket.assignee_id === memberId && ticket.due_date && ticket.due_date >= start && ticket.due_date < end && (!project || ticket.project_id === project));
  };
  const periodCapacity = (member: TeamWorkloadRecord) => member.availability_status === "away" ? 0 : zoom === "day" ? member.weekly_capacity_hours / 5 : zoom === "week" ? member.weekly_capacity_hours : member.weekly_capacity_hours * 4.33;
  const actualHours = (memberId: string, columnDate: Date) => {
    const start = dateKey(columnDate);
    const end = zoom === "day" ? dateKey(addDays(columnDate, 1)) : dateKey(zoom === "week" ? addDays(columnDate, 7) : new Date(Date.UTC(columnDate.getUTCFullYear(), columnDate.getUTCMonth() + 1, 1)));
    return actualTime.filter(entry => entry.user_id === memberId && entry.work_date >= start && entry.work_date < end).reduce((sum, entry) => sum + entry.duration_minutes, 0) / 60;
  };
  const horizonCells = visibleMembers.flatMap(member => dates.map(date => {
    const items = cellTickets(member.id, date);
    const hours = items.reduce((sum, ticket) => sum + (ticket.estimated_hours ?? 0), 0);
    const capacity = periodCapacity(member);
    return { items, hours, actual: actualHours(member.id, date), utilization: capacityPercent(hours, capacity), missing: items.filter(ticket => ticket.estimated_hours == null).length };
  }));
  const horizonConflicts = horizonCells.filter(cell => cell.utilization > 100).length;
  const horizonPressure = horizonCells.filter(cell => cell.utilization >= 75 && cell.utilization <= 100).length;
  const missingEstimates = horizonCells.reduce((sum, cell) => sum + cell.missing, 0);
  const plannedHours = horizonCells.reduce((sum, cell) => sum + cell.hours, 0);
  const recordedHours = horizonCells.reduce((sum, cell) => sum + cell.actual, 0);
  const planActualGap = recordedHours - plannedHours;
  const visibleMemberIds = new Set(visibleMembers.map(member => member.id));
  const unscheduled = tickets.filter(ticket => !ticket.due_date && (!project || ticket.project_id === project) && (ticket.assignee_id ? visibleMemberIds.has(ticket.assignee_id) : teamMode));
  const scheduleTicket = (ticketId: string, dueDate: string) => {
    if (!dueDate) return;
    setSchedulingId(ticketId); setScheduleNotice("");
    startScheduleTransition(async () => {
      const result = await updateTaskDueDateAction(ticketId, dueDate);
      setSchedulingId(null);
      if (result.error) { setScheduleNotice(result.error); return; }
      setScheduleNotice(isFr ? "Le travail a été ajouté au calendrier." : "Work added to the calendar.");
      router.refresh();
    });
  };
  const confirmMove = () => {
    if (!movePreview) return;
    const target = dateKey(movePreview.date);
    setSchedulingId(movePreview.ticket.id); setScheduleNotice("");
    startScheduleTransition(async () => {
      const result = movePreview.ticket.assignee_id !== movePreview.member.id
        ? await rebalanceTaskAction(movePreview.ticket.id, target, movePreview.member.id)
        : await updateTaskDueDateAction(movePreview.ticket.id, target);
      setSchedulingId(null);
      if (result.error) { setScheduleNotice(result.error); return; }
      setMovePreview(null);
      setScheduleNotice(isFr ? "La planification a été rééquilibrée." : "The plan has been rebalanced.");
      router.refresh();
    });
  };
  const moveImpact = movePreview ? (() => {
    const existing = cellTickets(movePreview.member.id, movePreview.date).filter(item => item.id !== movePreview.ticket.id);
    const hours = existing.reduce((sum, item) => sum + (item.estimated_hours ?? 0), 0) + (movePreview.ticket.estimated_hours ?? 0);
    const capacity = periodCapacity(movePreview.member);
    return { hours, capacity, utilization: capacityPercent(hours, capacity) };
  })() : null;
  const recommendations = teamMode ? tickets.flatMap(ticket => {
    if (!ticket.due_date || !ticket.assignee_id || (project && ticket.project_id !== project)) return [];
    const source = visibleMembers.find(member => member.id === ticket.assignee_id);
    if (!source || (source.availability_status !== "away" && source.utilization_percentage <= 100)) return [];
    const target = visibleMembers
      .filter(member => member.id !== source.id && member.availability_status !== "away" && member.availability_status !== "inactive" && member.utilization_percentage < 90)
      .sort((left, right) => left.utilization_percentage - right.utilization_percentage)[0];
    if (!target) return [];
    return [{ ticket, source, target, gain: Math.max(0, source.utilization_percentage - target.utilization_percentage) }];
  }).sort((left, right) => right.gain - left.gain).slice(0, 4) : [];
  const selectedRecommendations = recommendations.filter(item => scenarioIds.includes(item.ticket.id));
  const scenarioHours = selectedRecommendations.reduce((sum, item) => sum + (item.ticket.estimated_hours ?? 0), 0);
  const applyScenario = () => {
    if (!selectedRecommendations.length) return;
    setScenarioNotice("");
    startScenarioTransition(async () => {
      const result = await rebalanceTasksAction(selectedRecommendations.map(item => ({ ticketId: item.ticket.id, nextDueDate: item.ticket.due_date!, assigneeId: item.target.id })));
      if (result.error) { setScenarioNotice(result.error); return; }
      setScenarioOpen(false); setScenarioIds([]);
      router.refresh();
    });
  };

  const move = zoom === "day" ? 7 : zoom === "week" ? 56 : 183;
  const previous = dateKey(addDays(new Date(`${anchor}T00:00:00Z`), -move));
  const next = dateKey(addDays(new Date(`${anchor}T00:00:00Z`), move));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-blue-400/20 bg-[linear-gradient(125deg,#071a37_0%,#102b5c_52%,#3b1c72_100%)] px-6 py-7 text-white shadow-[0_30px_80px_-38px_rgba(37,99,235,.75)] sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{isFr ? "La capacité de l’équipe, en un seul regard." : "Your team capacity, at a glance."}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/80">{isFr ? "Anticipez les échéances, repérez les zones de pression et trouvez la bonne personne avant qu’un conflit n’apparaisse." : "Anticipate deadlines, spot pressure zones, and find the right person before a conflict appears."}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { icon: UsersRound, value: members.length, label: isFr ? "Personnes" : "People" },
              { icon: Zap, value: `${averageUtilization}%`, label: isFr ? "Charge moy." : "Avg. load" },
              { icon: AlertTriangle, value: overloaded, label: isFr ? "À surveiller" : "At risk" },
              { icon: CalendarRange, value: `${totalCapacity}h`, label: isFr ? "Capacité / sem." : "Weekly capacity" },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="min-w-[116px] rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-blue-100/70"><Icon className="size-3.5" /><span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span></div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card/90 p-3 shadow-[0_22px_65px_-45px_rgba(15,23,42,.5)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isFr ? "Rechercher une personne, un métier…" : "Search a person or role…"} className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" /></div>
          <select value={project} onChange={(event) => setProject(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{isFr ? "Tous les projets" : "All projects"}</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {companyWide ? <select value={entity} onChange={(event) => setEntity(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" aria-label={isFr ? "Filtrer par entité" : "Filter by entity"}><option value="">{isFr ? "Toutes les entités" : "All entities"}</option>{entityOptions.map(code => <option key={code} value={code}>{getBumexEntity(code)?.name ?? code}</option>)}</select> : null}
          <select value={availability} onChange={(event) => setAvailability(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" aria-label={isFr ? "Filtrer par disponibilité" : "Filter by availability"}><option value="">{isFr ? "Toutes disponibilités" : "All availability"}</option><option value="available">{isFr ? "Disponible" : "Available"}</option><option value="busy">{isFr ? "Occupé" : "Busy"}</option><option value="overloaded">{isFr ? "Surchargé" : "Overloaded"}</option><option value="away">{isFr ? "Absent" : "Away"}</option></select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" aria-label={isFr ? "Trier les collaborateurs" : "Sort people"}><option value="risk">{isFr ? "Priorité de charge" : "Workload priority"}</option><option value="name">{isFr ? "Nom A–Z" : "Name A–Z"}</option><option value="load-desc">{isFr ? "Charge décroissante" : "Highest load"}</option><option value="load-asc">{isFr ? "Charge croissante" : "Lowest load"}</option></select>
          <button type="button" onClick={() => setAttentionOnly((value) => !value)} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium", attentionOnly ? "border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300" : "border-border bg-background")}><Filter className="size-4" />{isFr ? "À surveiller" : "Attention"}</button>
          <div className="flex rounded-xl border border-border bg-muted/60 p-1">{(["day", "week", "month"] as Zoom[]).map((value) => <button key={value} type="button" onClick={() => { setZoom(value); window.history.replaceState(null, "", `/planning?week=${anchor}&view=${value}`); }} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", zoom === value && "bg-card text-primary shadow-sm")}>{value === "day" ? (isFr ? "Jour" : "Day") : value === "week" ? (isFr ? "Semaine" : "Week") : (isFr ? "Mois" : "Month")}</button>)}</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ value: horizonConflicts, label: isFr ? "Conflits de capacité" : "Capacity conflicts", detail: isFr ? "Périodes au-dessus de 100 %" : "Periods above 100%", tone: "from-rose-500/15 to-orange-500/[.04]", dot: "bg-rose-500" }, { value: horizonPressure, label: isFr ? "Zones de pression" : "Pressure zones", detail: isFr ? "Entre 75 % et 100 %" : "Between 75% and 100%", tone: "from-amber-500/15 to-yellow-500/[.04]", dot: "bg-amber-500" }, { value: missingEstimates, label: isFr ? "Travaux à estimer" : "Work to estimate", detail: isFr ? "Tickets sans durée estimée" : "Tickets without an estimate", tone: "from-violet-500/15 to-blue-500/[.04]", dot: "bg-violet-500" }, { value: `${planActualGap >= 0 ? "+" : ""}${Number(planActualGap.toFixed(1))}h`, label: isFr ? "Écart réel / prévu" : "Actual / plan gap", detail: `${Number(recordedHours.toFixed(1))}h ${isFr ? "réelles" : "actual"} · ${Number(plannedHours.toFixed(1))}h ${isFr ? "prévues" : "planned"}`, tone: "from-cyan-500/15 to-blue-500/[.04]", dot: planActualGap > 0 ? "bg-rose-500" : "bg-cyan-500" }].map(item => <article key={item.label} className={cn("rounded-2xl border border-border/70 bg-gradient-to-br p-4", item.tone)}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p><p className="mt-2 text-3xl font-semibold">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div><span className={cn("mt-1 size-3 rounded-full shadow-[0_0_18px_currentColor]", item.dot)} /></div></article>)}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border/70 bg-card shadow-[0_22px_65px_-48px_rgba(15,23,42,.6)]"><button type="button" onClick={() => setUnscheduledOpen(value => !value)} className="flex w-full items-center justify-between gap-4 bg-gradient-to-r from-violet-500/[.09] via-blue-500/[.05] to-transparent px-5 py-4 text-left"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-500 text-white shadow-lg"><CalendarPlus className="size-5" /></span><div><h2 className="font-semibold">{isFr ? "Travail à planifier" : "Work to schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{unscheduled.length} {isFr ? "ticket(s) sans échéance dans le périmètre affiché" : "ticket(s) without a due date in the current view"}</p></div></div><ChevronDown className={cn("size-5 text-muted-foreground transition-transform", unscheduledOpen && "rotate-180")} /></button>{unscheduledOpen ? <div className="border-t border-border/60 p-4"><p role="status" className={scheduleNotice ? "mb-3 rounded-xl bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-300" : "sr-only"}>{scheduleNotice}</p><div className="grid gap-3 xl:grid-cols-2">{unscheduled.length ? unscheduled.map(ticket => <article key={ticket.id} className="rounded-2xl border border-border/70 bg-background/55 p-4"><div className="flex items-start gap-3"><span className={cn("h-11 w-1 shrink-0 rounded-full bg-gradient-to-b", projectColor(ticket.project_id))} /><div className="min-w-0 flex-1"><Link href={`/tickets/${ticket.id}`} className="block truncate text-sm font-semibold hover:text-primary">{ticket.title}</Link><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Projet" : "Project")} · {ticket.assignee?.full_name ?? (isFr ? "Non assigné" : "Unassigned")}</p></div>{ticket.estimated_hours ? <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{ticket.estimated_hours}h</span> : null}</div><div className="mt-4 flex items-end gap-2"><label className="grid flex-1 gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor={`schedule-${ticket.id}`}>{isFr ? "Date cible" : "Target date"}<input id={`schedule-${ticket.id}`} type="date" min="2000-01-01" defaultValue={today} className="h-9 rounded-xl border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></label><Button size="sm" disabled={schedulePending && schedulingId === ticket.id} onClick={() => { const input = document.getElementById(`schedule-${ticket.id}`) as HTMLInputElement | null; scheduleTicket(ticket.id, input?.value ?? ""); }}>{schedulePending && schedulingId === ticket.id ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{isFr ? "Planifier" : "Schedule"}</Button></div></article>) : <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{isFr ? "Tout le travail visible possède déjà une échéance." : "All visible work already has a due date."}</div>}</div></div> : null}</section>

      {teamMode ? <section className="overflow-hidden rounded-[26px] border border-cyan-400/20 bg-[linear-gradient(115deg,rgba(8,47,73,.98),rgba(30,64,175,.96)_58%,rgba(91,33,182,.94))] text-white shadow-[0_24px_70px_-42px_rgba(37,99,235,.9)]"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/12"><Sparkles className="size-5 text-cyan-200" /></span><div><h2 className="font-semibold">{isFr ? "Assistant de rééquilibrage" : "Rebalancing assistant"}</h2><p className="mt-1 text-xs text-blue-100/65">{isFr ? "Suggestions calculées à partir des absences et de la charge actuelle." : "Suggestions based on absences and current workload."}</p></div></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{recommendations.length} {isFr ? "suggestion(s)" : "suggestion(s)"}</span>{scenarioIds.length ? <Button size="sm" variant="secondary" onClick={() => setScenarioOpen(true)}><ShieldCheck className="size-4" />{isFr ? `Simuler (${scenarioIds.length})` : `Simulate (${scenarioIds.length})`}</Button> : null}</div></header><div className="grid gap-3 p-4 xl:grid-cols-2">{recommendations.length ? recommendations.map(({ ticket, source, target }) => { const selected = scenarioIds.includes(ticket.id); return <article key={ticket.id} className={cn("rounded-2xl border p-4 backdrop-blur transition", selected ? "border-cyan-200/60 bg-cyan-200/15 ring-2 ring-cyan-200/20" : "border-white/10 bg-white/[.075]")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{ticket.title}</p><p className="mt-1 truncate text-xs text-blue-100/60">{ticket.project?.name ?? (isFr ? "Projet" : "Project")} · {ticket.estimated_hours ?? "—"}h</p></div><span className="rounded-lg bg-cyan-300/15 px-2 py-1 text-[10px] font-bold text-cyan-100">{source.availability_status === "away" ? (isFr ? "ABSENCE" : "AWAY") : `${source.utilization_percentage}%`}</span></div><div className="mt-4 flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate rounded-xl bg-white/[.07] px-3 py-2">{source.full_name}</span><ArrowRightLeft className="size-4 shrink-0 text-cyan-200" /><span className="min-w-0 flex-1 truncate rounded-xl bg-emerald-300/10 px-3 py-2 text-emerald-100">{target.full_name} · {target.utilization_percentage}%</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Button variant={selected ? "primary" : "secondary"} size="sm" onClick={() => setScenarioIds(current => selected ? current.filter(id => id !== ticket.id) : [...current, ticket.id])}><CheckCircle2 className="size-4" />{selected ? (isFr ? "Sélectionnée" : "Selected") : (isFr ? "Ajouter au scénario" : "Add to scenario")}</Button><Button variant="secondary" size="sm" onClick={() => setMovePreview({ ticket, member: target, date: new Date(`${ticket.due_date}T00:00:00Z`) })}><Sparkles className="size-4" />{isFr ? "Examiner" : "Review"}</Button></div></article> }) : <div className="col-span-full rounded-2xl border border-dashed border-white/15 px-5 py-7 text-center text-sm text-blue-100/65">{isFr ? "Aucun rééquilibrage prioritaire n’est nécessaire dans la vue actuelle." : "No priority rebalancing is needed in the current view."}</div>}</div></section> : null}

      <section className="overflow-hidden rounded-[30px] border border-border/70 bg-card shadow-[0_30px_90px_-55px_rgba(15,23,42,.55)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">{isFr ? "Calendrier d’équipe" : "Team calendar"}</p><p className="mt-1 text-sm font-semibold">{rangeLabel(dates, zoom, isFr ? "fr-FR" : "en-US")}</p></div>
          <div className="flex items-center gap-2"><Button asChild variant="secondary" size="icon"><Link href={`/planning?week=${previous}&view=${zoom}`} aria-label={isFr ? "Période précédente" : "Previous period"}><ArrowLeft /></Link></Button><Button asChild variant="secondary"><Link href={`/planning?view=${zoom}`}>{isFr ? "Aujourd’hui" : "Today"}</Link></Button><Button asChild variant="secondary" size="icon"><Link href={`/planning?week=${next}&view=${zoom}`} aria-label={isFr ? "Période suivante" : "Next period"}><ArrowRight /></Link></Button></div>
        </header>
        <div className="overflow-x-auto">
          <div className="min-w-[1050px]" style={{ gridTemplateColumns: `280px repeat(${dates.length}, minmax(105px, 1fr))` }}>
            <div className="grid border-b border-border/70 bg-muted/20" style={{ gridTemplateColumns: `280px repeat(${dates.length}, minmax(105px, 1fr))` }}>
              <div className="sticky left-0 z-20 flex items-end border-r border-border/70 bg-card px-5 py-4"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{visibleMembers.length} {isFr ? "collaborateurs" : "people"}</span></div>
              {dates.map((date) => { const key = dateKey(date); const current = zoom === "day" && key === today; return <div key={key} className={cn("border-r border-border/60 px-3 py-3 text-center", current && "bg-blue-500/8")}><p className={cn("text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", current && "text-blue-600")}>{new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", { weekday: zoom === "day" ? "short" : undefined, month: zoom === "month" ? "long" : "short" }).format(date)}</p><p className={cn("mt-1 text-lg font-semibold", current && "text-blue-600")}>{zoom === "month" ? date.getUTCFullYear() : date.getUTCDate()}</p></div>; })}
            </div>
            {visibleMembers.map((member) => (
              <div key={member.id} className="group grid min-h-[92px] border-b border-border/60 last:border-0 hover:bg-blue-500/[.025]" style={{ gridTemplateColumns: `280px repeat(${dates.length}, minmax(105px, 1fr))` }}>
                <div className="sticky left-0 z-10 flex items-center gap-3 border-r border-border/70 bg-card px-4 py-3 group-hover:bg-[color-mix(in_oklab,var(--card),#3b82f6_3%)]">
                  <Avatar className="size-10 ring-2 ring-background shadow"><AvatarFallback className="bg-gradient-to-br from-blue-500/15 to-violet-500/15 text-xs font-bold text-primary">{initials(member.full_name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.full_name}</p><p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"><span className="capitalize">{member.role}</span><span aria-hidden>·</span><span className="truncate font-semibold text-primary/75">{getBumexEntity(member.entity_code)?.name ?? (isFr ? "Entité non définie" : "No entity")}</span></p><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", member.utilization_percentage > 100 ? "bg-red-500" : member.utilization_percentage >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(member.utilization_percentage, 100)}%` }} /></div><span className={cn("text-[10px] font-bold", member.utilization_percentage > 100 ? "text-red-500" : "text-muted-foreground")}>{member.utilization_percentage}%</span><button type="button" onClick={() => setSelectedId(member.id)} className="rounded-lg p-1 text-primary transition hover:bg-primary/10" aria-label={`${isFr ? "Voir le détail de" : "View details for"} ${member.full_name}`}><Eye className="size-3.5" /></button></div></div>
                </div>
                {dates.map((date) => { const items = cellTickets(member.id, date); const current = zoom === "day" && dateKey(date) === today; const hours = items.reduce((sum, ticket) => sum + (ticket.estimated_hours ?? 0), 0); const real = actualHours(member.id, date); const capacity = periodCapacity(member); const utilization = capacityPercent(hours, capacity); const missing = items.filter(ticket => ticket.estimated_hours == null).length; const away = member.availability_status === "away"; return <div key={dateKey(date)} onDragOver={(event) => { if (!away && event.dataTransfer.types.includes("application/x-bumex-ticket")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); if (away) { setScheduleNotice(isFr ? `${member.full_name} est absent et ne peut pas recevoir de nouvelle charge.` : `${member.full_name} is away and cannot receive new work.`); return; } const ticket = tickets.find(item => item.id === event.dataTransfer.getData("application/x-bumex-ticket")); if (ticket && (ticket.assignee_id === member.id || teamMode) && (ticket.due_date !== dateKey(date) || ticket.assignee_id !== member.id)) setMovePreview({ ticket, date, member }); }} className={cn("relative flex min-w-0 flex-col justify-center gap-1 border-r border-border/50 p-1.5 transition-colors", current && "bg-blue-500/[.045]", utilization > 100 && "bg-rose-500/[.08]", utilization >= 75 && utilization <= 100 && "bg-amber-500/[.07]", away && "bg-[repeating-linear-gradient(135deg,rgba(148,163,184,.08)_0,rgba(148,163,184,.08)_8px,transparent_8px,transparent_16px)]")}>{current && <span className="absolute inset-y-0 left-0 w-px bg-blue-500" />}{away ? <span className="absolute right-2 top-2 rounded-full bg-slate-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{isFr ? "Absent" : "Away"}</span> : null}{items.length ? <div className="mb-0.5 flex items-center justify-between gap-1 px-1 text-[9px] font-semibold"><span className={cn(utilization > 100 ? "text-rose-600 dark:text-rose-300" : utilization >= 75 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{hours}h / {Number(capacity.toFixed(1))}h</span>{hours > 0 ? <span className={cn("rounded-full px-1.5 py-0.5", utilization > 100 ? "bg-rose-500 text-white" : utilization >= 75 ? "bg-amber-500 text-white" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>{away ? "!" : `${utilization}%`}</span> : null}</div> : null}{items.slice(0, 2).map((ticket) => <div key={ticket.id} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-bumex-ticket", ticket.id); event.dataTransfer.effectAllowed = "move"; }} title={teamMode ? (isFr ? "Glisser vers une personne ou une période" : "Drag to a person or period") : (isFr ? "Glisser vers une autre période" : "Drag to another period")} className={cn("flex cursor-grab items-center rounded-lg bg-gradient-to-r text-[10px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing", projectColor(ticket.project_id))}><GripVertical className="ml-1 size-3 shrink-0 opacity-45" /><Link href={`/tickets/${ticket.id}`} className="min-w-0 flex-1 px-1.5 py-2"><span className="block truncate opacity-75">{ticket.project?.name ?? (isFr ? "Projet" : "Project")}</span><span className="block truncate">{ticket.title}</span></Link></div>)}{items.length > 2 && <span className="px-2 text-[10px] font-semibold text-muted-foreground">+{items.length - 2} {isFr ? "autres" : "more"}</span>}{missing ? <span className="px-1 text-[9px] font-semibold text-violet-700 dark:text-violet-300">{missing} {isFr ? "à estimer" : "to estimate"}</span> : null}{real > 0 ? <span className="mx-1 mt-0.5 rounded-md bg-cyan-500/10 px-1.5 py-1 text-[9px] font-bold text-cyan-700 dark:text-cyan-300">{isFr ? "Réel" : "Actual"} {Number(real.toFixed(1))}h</span> : null}</div>; })}
              </div>
            ))}
            {!visibleMembers.length && <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">{isFr ? "Aucun collaborateur ne correspond aux filtres." : "No people match these filters."}</div>}
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/25 px-5 py-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><Layers3 className="size-3.5" />{isFr ? "Projection basée sur les échéances et les estimations actuelles des tickets." : "Projection based on current ticket deadlines and estimates."}</span><span className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" />&lt; 75%</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-500" />75–100%</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-rose-500" />&gt; 100%</span><span>{available} {isFr ? "personnes disposent encore de capacité" : "people still have capacity"}</span></span></footer>
      </section>
      <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {selectedMember ? <><div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-7 py-6 text-white"><DialogTitle className="text-2xl">{selectedMember.full_name}</DialogTitle><DialogDescription className="mt-1 text-blue-100/75">{selectedMember.job_title ?? selectedMember.role} · {getBumexEntity(selectedMember.entity_code)?.name ?? (isFr ? "Entité non définie" : "No entity")}</DialogDescription><div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white/10 p-3"><strong className="block text-xl">{selectedMember.utilization_percentage}%</strong><span className="text-[10px] text-blue-100/65">{isFr ? "charge" : "load"}</span></div><div className="rounded-xl bg-white/10 p-3"><strong className="block text-xl">{selectedMember.estimated_hours_total}h</strong><span className="text-[10px] text-blue-100/65">{isFr ? "estimées" : "estimated"}</span></div><div className="rounded-xl bg-white/10 p-3"><strong className="block text-xl">{selectedMember.overdue_items}</strong><span className="text-[10px] text-blue-100/65">{isFr ? "en retard" : "overdue"}</span></div></div></div><div className="max-h-[58vh] overflow-y-auto p-6"><h3 className="flex items-center gap-2 font-semibold"><BriefcaseBusiness className="size-4 text-primary" />{isFr ? "Travail planifié" : "Scheduled work"}</h3><div className="mt-4 space-y-2">{selectedTickets.length ? selectedTickets.slice(0, 12).map(ticket => <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 transition hover:border-primary/30 hover:bg-primary/[.035]"><span className={cn("h-10 w-1 shrink-0 rounded-full bg-gradient-to-b", projectColor(ticket.project_id))} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{ticket.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.project?.name ?? (isFr ? "Projet" : "Project")}</p></div><div className="text-right"><p className="text-xs font-semibold">{ticket.due_date ? new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${ticket.due_date}T00:00:00Z`)) : "—"}</p><p className="mt-1 text-[10px] uppercase text-muted-foreground">{ticket.status.replaceAll("_", " ")}</p></div></Link>) : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{isFr ? "Aucun travail planifié pour ce profil." : "No scheduled work for this profile."}</div>}</div></div></> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(movePreview)} onOpenChange={(open) => { if (!open && !schedulePending) setMovePreview(null); }}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          {movePreview && moveImpact ? <><div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-6 py-5 text-white"><span className="mb-3 grid size-10 place-items-center rounded-xl bg-white/15"><CalendarClock className="size-5" /></span><DialogTitle>{movePreview.ticket.assignee_id !== movePreview.member.id ? (isFr ? "Confirmer la réaffectation" : "Confirm reassignment") : (isFr ? "Confirmer le déplacement" : "Confirm reschedule")}</DialogTitle><DialogDescription className="mt-1 text-blue-100/70">{movePreview.ticket.title}</DialogDescription></div><div className="space-y-4 p-6">{movePreview.ticket.assignee_id !== movePreview.member.id ? <div className="flex items-center gap-3 rounded-2xl border border-blue-300/30 bg-blue-500/[.06] p-3"><Avatar className="size-9"><AvatarFallback className="bg-blue-500/15 text-xs font-bold text-primary">{initials(movePreview.member.full_name)}</AvatarFallback></Avatar><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isFr ? "Nouveau responsable" : "New assignee"}</p><p className="text-sm font-semibold">{movePreview.member.full_name}</p></div></div> : null}<div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-muted/60 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isFr ? "Nouvelle période" : "New period"}</p><p className="mt-1 text-sm font-semibold">{new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(movePreview.date)}</p></div><div className={cn("rounded-2xl p-3", moveImpact.utilization > 100 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : moveImpact.utilization >= 75 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}><p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{isFr ? "Impact capacité" : "Capacity impact"}</p><p className="mt-1 text-sm font-bold">{moveImpact.hours}h / {Number(moveImpact.capacity.toFixed(1))}h · {moveImpact.utilization}%</p></div></div>{moveImpact.utilization > 100 ? <p className="flex gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[.06] p-3 text-xs text-rose-700 dark:text-rose-300"><AlertTriangle className="size-4 shrink-0" />{isFr ? "Ce déplacement créera un conflit de capacité. Vous pouvez néanmoins le confirmer." : "This move will create a capacity conflict. You can still confirm it."}</p> : null}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={schedulePending} onClick={() => setMovePreview(null)}>{isFr ? "Annuler" : "Cancel"}</Button><Button disabled={schedulePending} onClick={confirmMove}>{schedulePending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{isFr ? "Confirmer" : "Confirm"}</Button></div></div></> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={scenarioOpen} onOpenChange={(open) => { if (!scenarioPending) setScenarioOpen(open); }}>
        <DialogContent className="max-w-xl overflow-hidden p-0">
          <div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-7 py-6 text-white"><span className="mb-3 grid size-11 place-items-center rounded-2xl bg-white/15"><ShieldCheck className="size-5" /></span><DialogTitle className="text-xl">{isFr ? "Valider le scénario de rééquilibrage" : "Approve rebalancing scenario"}</DialogTitle><DialogDescription className="mt-1 text-blue-100/70">{isFr ? "Vérifiez l’impact global avant d’appliquer les réaffectations." : "Review the overall impact before applying reassignments."}</DialogDescription></div>
          <div className="space-y-5 p-6"><div className="grid grid-cols-3 gap-3"><div className="rounded-2xl bg-blue-500/[.07] p-4"><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{selectedRecommendations.length}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isFr ? "Réaffectations" : "Reassignments"}</p></div><div className="rounded-2xl bg-violet-500/[.07] p-4"><p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{scenarioHours}h</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isFr ? "Charge déplacée" : "Hours moved"}</p></div><div className="rounded-2xl bg-emerald-500/[.07] p-4"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{new Set(selectedRecommendations.map(item => item.source.id)).size}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isFr ? "Profils soulagés" : "People relieved"}</p></div></div><div className="max-h-56 space-y-2 overflow-y-auto">{selectedRecommendations.map(({ ticket, source, target }) => <div key={ticket.id} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate font-semibold">{ticket.title}</span><span className="max-w-28 truncate text-muted-foreground">{source.full_name}</span><ArrowRight className="size-3 shrink-0 text-primary" /><span className="max-w-28 truncate font-semibold text-emerald-700 dark:text-emerald-300">{target.full_name}</span></div>)}</div>{scenarioNotice ? <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{scenarioNotice}</p> : null}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={scenarioPending} onClick={() => setScenarioOpen(false)}>{isFr ? "Retour" : "Back"}</Button><Button disabled={scenarioPending || !selectedRecommendations.length} onClick={applyScenario}>{scenarioPending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{isFr ? "Appliquer le scénario" : "Apply scenario"}</Button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

