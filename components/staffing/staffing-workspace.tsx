"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarDays, CalendarRange, CheckCircle2, Clock3, Download, Filter, List, Plus, Search, UserRoundPlus, UsersRound, Zap } from "lucide-react";

import { createStaffingAssignmentAction } from "@/app/(app)/staffing/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StaffingCalendar } from "@/components/staffing/staffing-calendar";
import { StaffingInsights } from "@/components/staffing/staffing-insights";
import { StaffingScenarioLab } from "@/components/staffing/staffing-scenario-lab";
import { StaffingStatusActions } from "@/components/staffing/staffing-status-actions";
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { getBumexEntity } from "@/lib/entities/config";
import { cn } from "@/lib/utils";
import type { StaffingActivity, StaffingAssignment, StaffingPerson, StaffingProject } from "@/types/staffing";
import type { TicketRecord } from "@/types/ticket";
import type { BumexEntityCode } from "@/types/entity";

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }
function formatDate(value: string, fr: boolean) { return new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`)); }
function assignmentWeeks(item: StaffingAssignment) { return Math.max(1, Math.ceil((new Date(`${item.end_date}T00:00:00Z`).getTime() - new Date(`${item.start_date}T00:00:00Z`).getTime() + 86_400_000) / (7 * 86_400_000))); }

export function StaffingWorkspace({ projects, people, assignments, activities, tickets, companyWide, locale, created, updated, error, initialProjectId, initialPersonId }: {
  projects: StaffingProject[];
  people: StaffingPerson[];
  assignments: StaffingAssignment[];
  activities: StaffingActivity[];
  tickets: TicketRecord[];
  companyWide: boolean;
  locale: "fr" | "en";
  created: boolean;
  updated: boolean;
  error: string;
  initialProjectId: string;
  initialPersonId: string;
}) {
  const fr = locale === "fr";
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(Boolean(initialProjectId || initialPersonId));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [entity, setEntity] = useState("");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [personId, setPersonId] = useState(people.some(item => item.id === initialPersonId) ? initialPersonId : people[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects.some(item => item.id === initialProjectId) ? initialProjectId : "");
  const [allocation, setAllocation] = useState(50);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const person = people.find(item => item.id === personId);
  const calculatedHours = Number((((person?.weekly_capacity_hours ?? 40) * allocation) / 100).toFixed(1));
  const active = assignments.filter(item => item.status === "confirmed" && item.end_date >= today);
  const overlappingLoad = assignments.filter(item => item.user_id === personId && item.status === "confirmed" && item.start_date <= endDate && item.end_date >= startDate).reduce((sum, item) => sum + Number(item.allocation_percent), 0);
  const projectedLoad = overlappingLoad + allocation;
  const projectedHours = Number((((person?.weekly_capacity_hours ?? 40) * projectedLoad) / 100).toFixed(1));
  const remainingHours = Math.max(0, Number((Number(person?.weekly_capacity_hours ?? 40) - projectedHours).toFixed(1)));
  useEffect(() => {
    let saved: { view?: "calendar" | "list"; status?: string; entity?: string } = {};
    try {
      saved = JSON.parse(localStorage.getItem("bumex-staffing-workspace") ?? "{}") as typeof saved;
    } catch { /* Ignore an invalid local preference and keep safe defaults. */ }
    queueMicrotask(() => {
      if (saved.view === "calendar" || saved.view === "list") setView(saved.view);
      if (typeof saved.status === "string") setStatus(saved.status);
      if (typeof saved.entity === "string") setEntity(saved.entity);
      setPreferencesReady(true);
    });
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem("bumex-staffing-workspace", JSON.stringify({ view, status, entity }));
  }, [preferencesReady, view, status, entity]);
  const allocatedHours = active.reduce((sum, item) => sum + Number(item.weekly_hours), 0);
  const staffedProjects = new Set(active.map(item => item.project_id)).size;
  const unstaffedProjects = projects.filter(item => !active.some(assignment => assignment.project_id === item.id)).length;
  const uncoveredProjects = projects.filter(item => item.status === "active" && !active.some(assignment => assignment.project_id === item.id));
  const overloads = people.map(item => ({ person: item, allocation: active.filter(assignment => assignment.user_id === item.id && assignment.start_date <= today).reduce((sum, assignment) => sum + Number(assignment.allocation_percent), 0) })).filter(item => item.allocation > 100);
  const soon = new Date();
  soon.setUTCDate(soon.getUTCDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);
  const endingSoon = active.filter(item => item.end_date >= today && item.end_date <= soonIso).sort((left, right) => left.end_date.localeCompare(right.end_date));
  const selectedProject = projects.find(item => item.id === projectId);
  const recommendations = people
    .filter(item => item.availability_status !== "inactive")
    .map(item => {
      const currentLoad = active.filter(assignment => assignment.user_id === item.id && assignment.start_date <= today).reduce((sum, assignment) => sum + Number(assignment.allocation_percent), 0);
      const sameEntity = Boolean(selectedProject?.entity_code && item.entity_code === selectedProject.entity_code);
      const availableCapacity = Math.max(0, 100 - currentLoad);
      return { person: item, currentLoad, availableCapacity, sameEntity, score: availableCapacity + (sameEntity ? 20 : 0) + (item.availability_status === "available" ? 10 : 0) };
    })
    .filter(item => item.availableCapacity > 0)
    .sort((left, right) => right.score - left.score || left.person.full_name.localeCompare(right.person.full_name))
    .slice(0, 3);
  const entityOptions = [...new Set([...assignments.map(item => item.entity_code), ...projects.map(item => item.entity_code)].filter((code): code is BumexEntityCode => Boolean(code)))].sort();
  const visible = useMemo(() => assignments.filter(item => {
    const haystack = `${item.project?.name ?? ""} ${item.person?.full_name ?? ""} ${item.project_role}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (!status || item.status === status) && (!entity || item.entity_code === entity);
  }), [assignments, search, status, entity]);
  const activeTickets = tickets.filter(ticket => ticket.assignee_id && !["done", "archived"].includes(ticket.status));
  const exportVisibleAssignments = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = fr
      ? ["Collaborateur", "Entité", "Projet", "Rôle projet", "Début", "Fin", "Taux", "Heures/semaine", "Heures prévues", "Heures réelles", "Statut", "Note"]
      : ["Person", "Entity", "Project", "Project role", "Start", "End", "Rate", "Hours/week", "Planned hours", "Actual hours", "Status", "Note"];
    const rows = visible.map(item => [
      item.person?.full_name ?? "", getBumexEntity(item.person?.entity_code)?.name ?? item.entity_code,
      item.project?.name ?? "", item.project_role, item.start_date, item.end_date, `${item.allocation_percent}%`,
      item.weekly_hours, Number(item.weekly_hours) * assignmentWeeks(item), Number((item.actual_minutes / 60).toFixed(2)), item.status, item.note ?? "",
    ]);
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(escape).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `staffing-${today}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[linear-gradient(125deg,#061b35_0%,#123f73_48%,#5b2185_100%)] px-7 py-7 text-white shadow-[0_32px_90px_-42px_rgba(37,99,235,.85)]">
      <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-fuchsia-400/25 blur-3xl" /><div className="pointer-events-none absolute -bottom-36 left-1/3 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-2xl"><h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{fr ? "Staffer la bonne personne, au bon moment." : "Staff the right person, at the right time."}</h1><p className="mt-3 text-sm leading-6 text-blue-100/75">{fr ? "Reliez projets, compétences, disponibilité et capacité dans une seule décision traçable." : "Connect projects, skills, availability and capacity in one traceable decision."}</p></div><Button variant="secondary" size="lg" onClick={() => setOpen(true)}><UserRoundPlus className="size-5" />{fr ? "Nouvelle affectation" : "New assignment"}</Button></div>
    </section>

    {created ? <p className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-4" />{fr ? "L’affectation a été créée et le planning a été actualisé." : "The assignment was created and planning was refreshed."}</p> : null}
    {updated ? <p className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-4" />{fr ? "Le statut a été actualisé dans Staffing, Planning et le projet." : "Status was updated across Staffing, Planning and the project."}</p> : null}
    {error ? <p className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">{error === "invalid" ? (fr ? "Vérifiez les informations du formulaire." : "Check the form details.") : error === "capacity" ? (fr ? "Cette affectation dépasserait 100 % de la capacité de la personne sur la période." : "This assignment would exceed the person’s capacity during the period.") : (fr ? "L’affectation n’a pas pu être enregistrée." : "The assignment could not be saved.")}</p> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { icon: UsersRound, value: active.length, label: fr ? "Affectations actives" : "Active assignments", tone: "from-blue-500/15" },
      { icon: Zap, value: `${allocatedHours}h`, label: fr ? "Capacité réservée / sem." : "Reserved weekly capacity", tone: "from-violet-500/15" },
      { icon: BriefcaseBusiness, value: staffedProjects, label: fr ? "Projets staffés" : "Staffed projects", tone: "from-emerald-500/15" },
      { icon: CalendarRange, value: unstaffedProjects, label: fr ? "Projets à couvrir" : "Projects to cover", tone: "from-amber-500/15" },
    ].map(({ icon: Icon, value, label, tone }) => <article key={label} className={cn("rounded-2xl border border-border/70 bg-gradient-to-br to-transparent p-4", tone)}><Icon className="size-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p></article>)}</section>

    <section className="overflow-hidden rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 shadow-[0_28px_80px_-55px_rgba(245,158,11,.65)] dark:border-amber-400/20 dark:from-amber-950/20 dark:via-background dark:to-rose-950/20">
      <header className="flex items-center justify-between border-b border-amber-200/70 px-5 py-4 dark:border-amber-400/15"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-700 dark:text-amber-300">{fr ? "À traiter" : "Needs attention"}</p><h2 className="mt-1 font-semibold">{fr ? "Décisions de staffing prioritaires" : "Priority staffing decisions"}</h2></div><div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300"><AlertTriangle className="size-5" /></div></header>
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-card/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{uncoveredProjects.length}</p><p className="mt-1 text-sm font-semibold">{fr ? "Projets actifs sans équipe" : "Active projects without a team"}</p></div><BriefcaseBusiness className="size-5 text-amber-600" /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{uncoveredProjects[0] ? uncoveredProjects.slice(0, 2).map(item => item.name).join(" · ") : (fr ? "Tous les projets actifs sont couverts." : "Every active project is covered.")}</p>{uncoveredProjects[0] ? <Button size="sm" variant="ghost" className="mt-3 px-0 text-amber-800 hover:bg-transparent dark:text-amber-200" onClick={() => { setProjectId(uncoveredProjects[0].id); setOpen(true); }}>{fr ? "Staffer le premier projet" : "Staff first project"}<ArrowRight className="size-4" /></Button> : null}</article>
        <article className="rounded-2xl border border-border/70 bg-card/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className={cn("text-2xl font-bold", overloads.length ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300")}>{overloads.length}</p><p className="mt-1 text-sm font-semibold">{fr ? "Collaborateurs en surcharge" : "People over capacity"}</p></div><Zap className="size-5 text-rose-600" /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{overloads[0] ? overloads.slice(0, 2).map(item => `${item.person.full_name} · ${item.allocation}%`).join(" · ") : (fr ? "Aucune charge actuelle ne dépasse 100 %." : "No current load exceeds 100%.")}</p>{overloads[0] ? <Button size="sm" variant="ghost" className="mt-3 px-0 text-rose-800 hover:bg-transparent dark:text-rose-200" onClick={() => setSearch(overloads[0].person.full_name)}>{fr ? "Afficher le collaborateur" : "Show person"}<ArrowRight className="size-4" /></Button> : null}</article>
        <article className="rounded-2xl border border-border/70 bg-card/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{endingSoon.length}</p><p className="mt-1 text-sm font-semibold">{fr ? "Missions finissant sous 30 jours" : "Assignments ending in 30 days"}</p></div><CalendarRange className="size-5 text-violet-600" /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{endingSoon[0] ? `${endingSoon[0].person?.full_name ?? (fr ? "Collaborateur" : "Person")} · ${formatDate(endingSoon[0].end_date, fr)}` : (fr ? "Aucune fin de mission proche." : "No assignment ending soon.")}</p>{endingSoon[0] ? <Button size="sm" variant="ghost" className="mt-3 px-0 text-violet-800 hover:bg-transparent dark:text-violet-200" onClick={() => setSearch(endingSoon[0].person?.full_name ?? "")}>{fr ? "Préparer la suite" : "Plan next assignment"}<ArrowRight className="size-4" /></Button> : null}</article>
      </div>
    </section>

    <StaffingInsights people={people} assignments={assignments} locale={locale} />

    <section className="overflow-hidden rounded-[28px] border border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-card to-violet-50/50 shadow-[0_24px_70px_-55px_rgba(59,130,246,.6)] dark:border-blue-400/15 dark:from-blue-950/20 dark:via-card dark:to-violet-950/15">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200/70 px-5 py-4 dark:border-blue-400/15">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700 dark:text-blue-300">{fr ? "Travail attribué" : "Assigned work"}</p><h2 className="mt-1 font-semibold">{fr ? "Tickets ouverts par collaborateur" : "Open tickets by team member"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "Les tickets ouverts sont inclus pour rendre visible le travail déjà confié à chaque personne." : "Open tickets are included to make each person’s assigned work visible."}</p></div>
        <span className="rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-blue-800 dark:border-blue-400/20 dark:bg-blue-950/40 dark:text-blue-200">{activeTickets.length} {fr ? "tickets ouverts" : "open tickets"}</span>
      </header>
      {activeTickets.length ? <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">{activeTickets.map(ticket => <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group min-w-0 rounded-2xl border border-border/70 bg-card/90 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><div className="flex flex-wrap items-center gap-2"><TicketStatusBadge status={ticket.status} /><TicketPriorityBadge priority={ticket.priority} /></div><p className="mt-3 break-words text-sm font-semibold group-hover:text-primary">{ticket.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.project?.name ?? (fr ? "Sans projet" : "No project")}</p><div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Responsable" : "Assignee"}</p><p className="mt-0.5 truncate text-xs font-medium">{ticket.assignee?.full_name ?? (fr ? "Profil" : "Profile")}</p></div><ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></div></Link>)}</div> : <p className="px-5 py-8 text-center text-sm text-muted-foreground">{fr ? "Aucun ticket ouvert n’est attribué aux membres visibles de l’équipe." : "No open tickets are assigned to the visible team members."}</p>}
    </section>

    <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_70px_-55px_rgba(15,23,42,.65)]">
      <header className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">{fr ? "Traçabilité" : "Audit trail"}</p><h2 className="mt-1 font-semibold">{fr ? "Dernières décisions de staffing" : "Latest staffing decisions"}</h2></div><Clock3 className="size-5 text-primary" /></header>
      <div className="grid divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0">{activities.length ? activities.slice(0, 8).map((activity) => {
        const statusValue = typeof activity.metadata.status === "string" ? activity.metadata.status : "";
        const label = fr ? activity.action.startsWith("Created") ? "Affectation créée" : activity.action.startsWith("Updated") ? "Affectation modifiée" : statusValue ? `Statut modifié : ${statusValue}` : "Décision de staffing" : activity.action;
        return <article key={activity.id} className="flex gap-3 px-5 py-4"><div className="mt-1 size-2.5 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 shadow-[0_0_0_4px_rgba(59,130,246,.1)]" /><div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{activity.user?.full_name ?? (fr ? "Utilisateur" : "User")} · {new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.created_at))}</p></div></article>;
      }) : <div className="p-6 text-sm text-muted-foreground md:col-span-2">{fr ? "Les prochaines décisions de staffing apparaîtront ici automatiquement." : "New staffing decisions will appear here automatically."}</div>}</div>
    </section>

    <section className="rounded-[26px] border border-border/70 bg-card p-3 shadow-[0_24px_70px_-50px_rgba(15,23,42,.65)]"><div className="flex flex-col gap-3 xl:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={fr ? "Rechercher un projet, une personne ou un rôle…" : "Search a project, person or role…"} className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:ring-4 focus:ring-primary/10" /></div><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{fr ? "Tous les statuts" : "All statuses"}</option><option value="draft">{fr ? "Brouillon" : "Draft"}</option><option value="requested">{fr ? "Demandée" : "Requested"}</option><option value="confirmed">{fr ? "Confirmée" : "Confirmed"}</option></select>{companyWide ? <select value={entity} onChange={event => setEntity(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">{fr ? "Toutes les entités" : "All entities"}</option>{entityOptions.map(code => <option key={code} value={code}>{getBumexEntity(code)?.name ?? code}</option>)}</select> : null}<div className="flex rounded-xl border border-border bg-muted/35 p-1"><Button type="button" size="sm" variant={view === "calendar" ? "primary" : "ghost"} onClick={() => setView("calendar")}><CalendarDays className="size-4" />{fr ? "Calendrier" : "Calendar"}</Button><Button type="button" size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => setView("list")}><List className="size-4" />{fr ? "Liste" : "List"}</Button></div><StaffingScenarioLab projects={projects} people={people} assignments={assignments} locale={locale} onChoose={(selectedProjectId, selectedPersonId, selectedAllocation, selectedStartDate, selectedEndDate) => { setProjectId(selectedProjectId); setPersonId(selectedPersonId); setAllocation(selectedAllocation); setStartDate(selectedStartDate); setEndDate(selectedEndDate); setOpen(true); }} /><Button type="button" variant="secondary" onClick={exportVisibleAssignments} disabled={!visible.length}><Download className="size-4" />{fr ? "Exporter" : "Export"}</Button><Button onClick={() => setOpen(true)}><Plus className="size-4" />{fr ? "Affecter" : "Assign"}</Button></div></section>

    {view === "calendar" ? <StaffingCalendar people={people} projects={projects} assignments={visible} locale={locale} search={search} entity={entity} onAssign={(selectedId) => { setPersonId(selectedId); setOpen(true); }} /> : null}

    {view === "list" ? <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_30px_85px_-58px_rgba(15,23,42,.7)]"><header className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">{fr ? "Portefeuille d’affectations" : "Assignment portfolio"}</p><h2 className="mt-1 font-semibold">{visible.length} {fr ? "affectation(s) visible(s)" : "visible assignment(s)"}</h2></div><Filter className="size-4 text-muted-foreground" /></header><div className="divide-y divide-border/60">{visible.length ? visible.map(item => <article key={item.id} className="grid gap-4 px-5 py-4 transition hover:bg-primary/[.025] lg:grid-cols-[1.3fr_1fr_.8fr_.7fr]"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-gradient-to-br from-blue-500/15 to-violet-500/15 text-xs font-bold text-primary">{initials(item.person?.full_name ?? "?")}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.person?.full_name ?? (fr ? "Profil" : "Profile")}</p><p className="truncate text-xs text-muted-foreground">{item.person?.job_title ?? item.project_role} · {getBumexEntity(item.person?.entity_code)?.name ?? item.entity_code}</p></div></div><div><p className="text-sm font-semibold">{item.project?.name ?? (fr ? "Projet" : "Project")}</p><p className="mt-1 text-xs text-muted-foreground">{item.project_role}</p></div><div><p className="text-sm font-semibold">{formatDate(item.start_date, fr)} → {formatDate(item.end_date, fr)}</p><p className="mt-1 text-xs text-muted-foreground">{item.weekly_hours}h / {fr ? "semaine" : "week"}</p><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold"><span className="rounded-full bg-blue-500/10 px-2 py-1 text-blue-700 dark:text-blue-300">{fr ? "Prévu" : "Planned"} · {Number(item.weekly_hours) * assignmentWeeks(item)}h</span><span className={cn("rounded-full px-2 py-1", item.actual_minutes / 60 > Number(item.weekly_hours) * assignmentWeeks(item) ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>{fr ? "Réel" : "Actual"} · {Number((item.actual_minutes / 60).toFixed(1))}h</span></div></div><div className="flex items-center justify-between gap-3"><div><p className="text-xl font-bold text-primary">{item.allocation_percent}%</p><span className={cn("mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase", item.status === "confirmed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : item.status === "requested" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-muted text-muted-foreground")}>{item.status}</span></div><StaffingStatusActions assignment={item} locale={locale} weeklyCapacity={people.find(personItem => personItem.id === item.user_id)?.weekly_capacity_hours ?? 40} /></div></article>) : <div className="p-12 text-center text-sm text-muted-foreground">{fr ? "Aucune affectation ne correspond à cette vue." : "No assignment matches this view."}</div>}</div></section> : null}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl overflow-hidden p-0"><div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-7 py-6 text-white"><DialogTitle className="text-2xl">{fr ? "Créer une affectation" : "Create an assignment"}</DialogTitle><DialogDescription className="mt-1 text-blue-100/70">{fr ? "Réservez une part mesurable de la capacité d’un collaborateur." : "Reserve a measurable share of a person’s capacity."}</DialogDescription></div><form action={createStaffingAssignmentAction} className="grid max-h-[70vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold">{fr ? "Projet" : "Project"}<select name="project_id" required value={projectId} onChange={event => setProjectId(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal"><option value="">{fr ? "Choisir un projet" : "Choose a project"}</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}{companyWide ? ` · ${getBumexEntity(item.entity_code)?.name ?? item.entity_code}` : ""}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Collaborateur" : "Person"}<select name="user_id" value={personId} onChange={event => setPersonId(event.target.value)} required className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal"><option value="">{fr ? "Choisir un profil" : "Choose a person"}</option>{people.map(item => <option key={item.id} value={item.id} disabled={item.availability_status === "inactive"}>{item.full_name} · {item.weekly_capacity_hours}h · {item.availability_status}</option>)}</select></label>{projectId ? <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-violet-50 p-4 sm:col-span-2 dark:border-cyan-400/20 dark:from-cyan-950/20 dark:to-violet-950/20"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-700 dark:text-cyan-300">{fr ? "Profils recommandés" : "Recommended people"}</p><p className="mt-1 text-xs text-muted-foreground">{fr ? "Classés selon la capacité actuelle et l’entité du projet." : "Ranked by current capacity and project entity."}</p></div><Zap className="size-5 text-violet-600" /></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{recommendations.length ? recommendations.map((item, index) => <button key={item.person.id} type="button" onClick={() => setPersonId(item.person.id)} className={cn("rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md", personId === item.person.id ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/15" : "border-border bg-card/80")}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-primary">#{index + 1}</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">{item.availableCapacity}% {fr ? "libre" : "free"}</span></div><p className="mt-2 truncate text-xs font-semibold">{item.person.full_name}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.sameEntity ? (fr ? "Même entité" : "Same entity") : (fr ? "Inter-entité" : "Cross-entity")} · {item.currentLoad}% {fr ? "chargé" : "loaded"}</p></button>) : <p className="text-xs text-muted-foreground sm:col-span-3">{fr ? "Aucun profil ne dispose de capacité actuellement." : "No person currently has available capacity."}</p>}</div></section> : null}<label className="grid gap-1 text-xs font-semibold sm:col-span-2">{fr ? "Rôle dans le projet" : "Project role"}<input name="project_role" required maxLength={100} placeholder={fr ? "Ex. Consultant fonctionnel senior" : "e.g. Senior functional consultant"} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Date de début" : "Start date"}<input name="start_date" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Date de fin" : "End date"}<input name="end_date" type="date" required value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Taux d’affectation" : "Allocation rate"}<div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3"><input name="allocation_percent" type="range" min="10" max="100" step="10" value={allocation} onChange={event => setAllocation(Number(event.target.value))} className="flex-1 accent-blue-600" /><strong className="w-11 text-right text-sm">{allocation}%</strong></div></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Heures par semaine" : "Weekly hours"}<input name="weekly_hours" type="number" min="0.5" max="168" step="0.5" value={calculatedHours} readOnly className="h-11 rounded-xl border border-border bg-muted/50 px-3 text-sm font-semibold" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Statut" : "Status"}<select name="status" defaultValue="confirmed" className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal"><option value="draft">{fr ? "Brouillon" : "Draft"}</option><option value="requested">{fr ? "Demandée" : "Requested"}</option><option value="confirmed">{fr ? "Confirmée" : "Confirmed"}</option></select></label><div className={cn("rounded-xl border p-3 text-xs", projectedLoad > 100 ? "border-rose-300 bg-rose-500/[.08]" : projectedLoad >= 80 ? "border-amber-300 bg-amber-500/[.08]" : "border-emerald-300 bg-emerald-500/[.07]")}><div className="flex items-center justify-between gap-2"><p className={cn("font-semibold", projectedLoad > 100 ? "text-rose-700 dark:text-rose-300" : projectedLoad >= 80 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>{fr ? "Impact simulé" : "Simulated impact"}</p><strong className="text-sm">{overlappingLoad}% → {projectedLoad}%</strong></div><p className="mt-1 text-muted-foreground">{person?.full_name ?? "—"} · +{calculatedHours}h / {fr ? "semaine" : "week"}</p><p className="mt-1 font-medium">{projectedLoad > 100 ? (fr ? `Dépassement de ${projectedLoad - 100} %. Ajustez le taux ou la période.` : `${projectedLoad - 100}% over capacity. Adjust rate or dates.`) : (fr ? `${remainingHours}h resteront disponibles chaque semaine.` : `${remainingHours}h will remain available each week.`)}</p></div><label className="grid gap-1 text-xs font-semibold sm:col-span-2">{fr ? "Note de staffing" : "Staffing note"}<textarea name="note" maxLength={500} rows={3} placeholder={fr ? "Contexte, responsabilités ou conditions particulières…" : "Context, responsibilities or special conditions…"} className="rounded-xl border border-border bg-background p-3 text-sm font-normal" /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button><Button type="submit" disabled={projectedLoad > 100 || endDate < startDate}><UserRoundPlus className="size-4" />{projectedLoad > 100 ? (fr ? "Capacité dépassée" : "Over capacity") : (fr ? "Créer l’affectation" : "Create assignment")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
