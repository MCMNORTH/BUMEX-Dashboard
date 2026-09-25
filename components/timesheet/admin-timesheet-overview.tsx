"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, BellRing, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Download, Eye, History, Search, Send, ShieldCheck, TriangleAlert, UserRoundCheck, X } from "lucide-react";

import { approveTimesheetWeekAction, approveTimesheetWeeksAction, remindTimesheetWeekAction, returnTimesheetWeekAction } from "@/app/(app)/timesheet/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getBumexEntity } from "@/lib/entities/config";
import { groupWeeklyEntries } from "@/lib/timesheet/weekly";
import { addDays, formatDuration } from "@/lib/timesheet/validation";
import { cn } from "@/lib/utils";
import type { TimeEntry, TimesheetProfile, TimesheetWeekEvent, TimesheetWeekStatus } from "@/types/timesheet";

const entityTones = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];

function entityTone(entityCode: string | null) {
  if (!entityCode) return "bg-slate-400";
  let score = 0;
  for (const character of entityCode) score += character.charCodeAt(0);
  return entityTones[score % entityTones.length];
}

function activityTone(minutes: number) {
  if (!minutes) return "text-muted-foreground/35";
  if (minutes >= 480) return "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md";
  if (minutes >= 300) return "bg-gradient-to-br from-blue-500/90 to-indigo-500/90 text-white shadow-sm";
  if (minutes >= 120) return "bg-blue-500/15 font-semibold text-blue-700 dark:text-blue-300";
  return "bg-cyan-500/10 font-semibold text-cyan-700 dark:text-cyan-300";
}

export function AdminTimesheetOverview({ profiles, entries, statuses, events, week, days, today, locale, companyWide }: {
  profiles: TimesheetProfile[];
  entries: TimeEntry[];
  statuses: TimesheetWeekStatus[];
  events: TimesheetWeekEvent[];
  week: string;
  days: string[];
  today: string;
  locale: "fr" | "en";
  companyWide: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("attention");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const fr = locale === "fr";
  const formatter = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const totalsByUser = new Map<string, number>();
  const dailyByUser = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    if (!entry.user_id) continue;
    totalsByUser.set(entry.user_id, (totalsByUser.get(entry.user_id) ?? 0) + entry.duration_minutes);
    const daily = dailyByUser.get(entry.user_id) ?? new Map<string, number>();
    daily.set(entry.work_date, (daily.get(entry.work_date) ?? 0) + entry.duration_minutes);
    dailyByUser.set(entry.user_id, daily);
  }
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const activeProfiles = profiles.filter((profile) => (totalsByUser.get(profile.id) ?? 0) > 0).length;
  const statusByUser = new Map(statuses.map(status => [status.user_id, status]));
  const submittedCount = statuses.filter(status => status.status === "submitted").length;
  const incompleteCount = profiles.filter(profile => (totalsByUser.get(profile.id) ?? 0) < Math.max(profile.weekly_capacity_hours, 1) * 60).length;
  const entityOptions = [...new Set(profiles.map(profile => profile.entity_code).filter((code): code is NonNullable<typeof code> => Boolean(code)))].sort();
  const normalizedSearch = search.trim().toLocaleLowerCase(fr ? "fr" : "en");
  const visibleProfiles = profiles.filter(profile => {
    const status = statusByUser.get(profile.id)?.status ?? "draft";
    const incomplete = (totalsByUser.get(profile.id) ?? 0) < Math.max(profile.weekly_capacity_hours, 1) * 60;
    const matchesSearch = !normalizedSearch || `${profile.full_name} ${profile.role} ${getBumexEntity(profile.entity_code)?.name ?? ""}`.toLocaleLowerCase(fr ? "fr" : "en").includes(normalizedSearch);
    const matchesEntity = entityFilter === "all" || profile.entity_code === entityFilter;
    const matchesStatus = statusFilter === "all" || statusFilter === status || (statusFilter === "incomplete" && incomplete);
    return matchesSearch && matchesEntity && matchesStatus;
  }).sort((a, b) => {
    const totalA = totalsByUser.get(a.id) ?? 0;
    const totalB = totalsByUser.get(b.id) ?? 0;
    const statusA = statusByUser.get(a.id)?.status ?? "draft";
    const statusB = statusByUser.get(b.id)?.status ?? "draft";
    if (sortBy === "name") return a.full_name.localeCompare(b.full_name, fr ? "fr" : "en");
    if (sortBy === "time-desc") return totalB - totalA || a.full_name.localeCompare(b.full_name);
    if (sortBy === "time-asc") return totalA - totalB || a.full_name.localeCompare(b.full_name);
    const priority = (status: string, total: number, capacity: number) => status === "submitted" ? 0 : total < capacity ? 1 : status === "draft" ? 2 : 3;
    return priority(statusA, totalA, Math.max(a.weekly_capacity_hours, 1) * 60) - priority(statusB, totalB, Math.max(b.weekly_capacity_hours, 1) * 60) || a.full_name.localeCompare(b.full_name);
  });
  const filtersActive = Boolean(search || entityFilter !== "all" || statusFilter !== "all");
  const submittedVisibleIds = visibleProfiles.filter(profile => statusByUser.get(profile.id)?.status === "submitted").map(profile => profile.id);
  const allSubmittedVisibleSelected = submittedVisibleIds.length > 0 && submittedVisibleIds.every(id => selectedIds.includes(id));
  const selectedProfiles = profiles.filter(profile => selectedIds.includes(profile.id) && statusByUser.get(profile.id)?.status === "submitted");
  const visibleIds = new Set(visibleProfiles.map(profile => profile.id));
  const visibleEntries = entries.filter(entry => entry.user_id && visibleIds.has(entry.user_id));
  const visibleMinutes = visibleEntries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const projectTotals = [...visibleEntries.reduce((map, entry) => {
    const name = entry.project?.name ?? (fr ? "Projet non accessible" : "Unavailable project");
    map.set(name, (map.get(name) ?? 0) + entry.duration_minutes);
    return map;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const entityTotals = [...visibleProfiles.reduce((map, profile) => {
    const name = getBumexEntity(profile.entity_code)?.name ?? (fr ? "Sans entité" : "No entity");
    map.set(name, (map.get(name) ?? 0) + (totalsByUser.get(profile.id) ?? 0));
    return map;
  }, new Map<string, number>())].filter(([, minutes]) => minutes > 0).sort((a, b) => b[1] - a[1]);
  const topProjectShare = visibleMinutes && projectTotals.length ? Math.round(projectTotals[0][1] / visibleMinutes * 100) : 0;
  const weekTitle = `${formatter(week, { day: "numeric", month: "short" })} – ${formatter(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
  const selectedProfile = profiles.find(profile => profile.id === selectedId) ?? null;
  const selectedEntries = selectedId ? entries.filter(entry => entry.user_id === selectedId) : [];
  const selectedGroups = groupWeeklyEntries(selectedEntries);
  const selectedTotal = selectedEntries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const selectedStatus = selectedId ? statusByUser.get(selectedId) : null;
  const selectedEvents = selectedId ? events.filter(event => event.user_id === selectedId) : [];
  const exportCsv = () => {
    const separator = ";";
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const headers = [fr ? "Collaborateur" : "Employee", fr ? "Rôle" : "Role", fr ? "Entité" : "Entity", fr ? "Statut" : "Status", ...days.map(day => formatter(day, { weekday: "short", day: "numeric", month: "short" })), fr ? "Total (heures)" : "Total (hours)"];
    const rows = visibleProfiles.map(profile => {
      const daily = dailyByUser.get(profile.id) ?? new Map<string, number>();
      const status = statusByUser.get(profile.id)?.status ?? "draft";
      return [profile.full_name, profile.role, getBumexEntity(profile.entity_code)?.name ?? "", status, ...days.map(day => ((daily.get(day) ?? 0) / 60).toFixed(2)), ((totalsByUser.get(profile.id) ?? 0) / 60).toFixed(2)];
    });
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(escape).join(separator)).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timesheet-${week}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-[30px] border border-blue-400/20 bg-[linear-gradient(125deg,#071a37_0%,#14386b_55%,#51208a_100%)] px-6 py-7 text-white shadow-[0_30px_80px_-38px_rgba(37,99,235,.75)]">
      <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-[-.04em]">{companyWide ? (fr ? "Temps de toute l’entreprise" : "Company-wide time") : (fr ? "Temps de mon équipe" : "My team’s time")}</h1><p className="mt-2 max-w-2xl text-sm text-blue-100/75">{companyWide ? (fr ? "Tous les profils, toutes les entités et les temps déclarés pour la semaine." : "Every profile, every entity, and all reported time for the week.") : (fr ? "Tous les profils de votre entité et leurs temps déclarés pour la semaine." : "Every profile in your entity and their reported time for the week.")}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[{ value: profiles.length, label: fr ? "Profils" : "Profiles", icon: UserRoundCheck }, { value: activeProfiles, label: fr ? "Actifs" : "Active", icon: CalendarDays }, { value: submittedCount, label: fr ? "À valider" : "To approve", icon: Send }, { value: formatDuration(totalMinutes), label: fr ? "Déclaré" : "Logged", icon: Clock3 }].map(({ value, label, icon: Icon }) => <div key={label} className="min-w-28 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-blue-100/65"><Icon className="size-3.5" />{label}</div><p className="mt-2 text-xl font-semibold">{value}</p></div>)}
        </div>
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-[0_18px_50px_-42px_rgba(15,23,42,.65)]">
      <div className="flex items-center gap-2"><Button asChild variant="secondary" size="icon"><Link href={`/timesheet?week=${addDays(week, -7)}`} aria-label={fr ? "Semaine précédente" : "Previous week"}><ArrowLeft /></Link></Button><h2 className="px-2 font-semibold">{weekTitle}</h2><Button asChild variant="secondary" size="icon"><Link href={`/timesheet?week=${addDays(week, 7)}`} aria-label={fr ? "Semaine suivante" : "Next week"}><ArrowRight /></Link></Button><Button asChild variant="ghost"><Link href="/timesheet">{fr ? "Cette semaine" : "This week"}</Link></Button></div>
      <Button asChild><Link href={`/timesheet?week=${week}&mode=mine`}>{fr ? "Ma feuille" : "My timesheet"}</Link></Button>
    </div>

    <section className="rounded-[24px] border border-border/70 bg-card/90 p-3 shadow-[0_22px_60px_-50px_rgba(15,23,42,.7)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={fr ? "Rechercher une personne, un rôle ou une entité…" : "Search a person, role, or entity…"} className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></label>
        {companyWide ? <select aria-label={fr ? "Filtrer par entité" : "Filter by entity"} value={entityFilter} onChange={event => setEntityFilter(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"><option value="all">{fr ? "Toutes les entités" : "All entities"}</option>{entityOptions.map(code => <option key={code} value={code}>{getBumexEntity(code)?.name ?? code}</option>)}</select> : null}
        <select aria-label={fr ? "Filtrer par statut" : "Filter by status"} value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"><option value="all">{fr ? "Tous les statuts" : "All statuses"}</option><option value="submitted">{fr ? "À valider" : "To approve"}</option><option value="approved">{fr ? "Validées" : "Approved"}</option><option value="returned">{fr ? "À corriger" : "Needs changes"}</option><option value="draft">{fr ? "Brouillons" : "Drafts"}</option><option value="incomplete">{fr ? "Incomplètes" : "Incomplete"}</option></select>
        <select aria-label={fr ? "Trier les profils" : "Sort profiles"} value={sortBy} onChange={event => setSortBy(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"><option value="attention">{fr ? "Priorité de contrôle" : "Review priority"}</option><option value="name">{fr ? "Nom A–Z" : "Name A–Z"}</option><option value="time-desc">{fr ? "Temps décroissant" : "Most time"}</option><option value="time-asc">{fr ? "Temps croissant" : "Least time"}</option></select>
        <Button variant="secondary" onClick={exportCsv} disabled={visibleProfiles.length === 0}><Download className="size-4" />{fr ? "Exporter" : "Export"}</Button>
        {filtersActive ? <Button variant="ghost" onClick={() => { setSearch(""); setEntityFilter("all"); setStatusFilter("all"); }}><X className="size-4" />{fr ? "Effacer" : "Clear"}</Button> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><button type="button" onClick={() => setStatusFilter("submitted")} className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 font-semibold text-blue-700 transition hover:bg-blue-500/15 dark:text-blue-300"><Send className="size-3.5" />{submittedCount} {fr ? "à valider" : "to approve"}</button><button type="button" onClick={() => setStatusFilter("incomplete")} className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-700 transition hover:bg-amber-500/15 dark:text-amber-300"><TriangleAlert className="size-3.5" />{incompleteCount} {fr ? "incomplètes" : "incomplete"}</button><span className="ml-auto self-center text-muted-foreground">{visibleProfiles.length} / {profiles.length} {fr ? "profils affichés" : "profiles shown"}</span></div>
    </section>

    {selectedProfiles.length ? <div className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-400/30 bg-[linear-gradient(110deg,#0d2d59,#2859a8_60%,#6d28a8)] px-4 py-3 text-white shadow-xl"><div className="flex items-center gap-3"><CheckCircle2 className="size-5" /><div><p className="text-sm font-semibold">{selectedProfiles.length} {fr ? "feuille(s) sélectionnée(s)" : "timesheet(s) selected"}</p><p className="text-[11px] text-blue-100/70">{fr ? "Seules les feuilles envoyées peuvent être validées." : "Only submitted timesheets can be approved."}</p></div></div><div className="flex gap-2"><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSelectedIds([])}>{fr ? "Annuler" : "Cancel"}</Button><Button variant="secondary" onClick={() => setBulkDialogOpen(true)}><ShieldCheck className="size-4" />{fr ? "Valider la sélection" : "Approve selection"}</Button></div></div> : null}

    {visibleMinutes > 0 ? <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <article className="overflow-hidden rounded-[24px] border border-border/70 bg-card shadow-[0_24px_70px_-52px_rgba(37,99,235,.7)]"><div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-blue-500/[.09] via-violet-500/[.06] to-transparent px-5 py-4"><div><h2 className="flex items-center gap-2 font-semibold"><BriefcaseBusiness className="size-4 text-blue-600" />{fr ? "Temps par projet" : "Time by project"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "Les cinq projets les plus actifs du périmètre affiché." : "The five most active projects in the current view."}</p></div><span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">{projectTotals.length} {fr ? "projets" : "projects"}</span></div><div className="space-y-4 p-5">{projectTotals.map(([name, minutes], index) => { const percent = Math.round(minutes / visibleMinutes * 100); return <div key={name}><div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium"><span className="mr-2 text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{name}</span><span className="shrink-0 font-semibold tabular-nums">{formatDuration(minutes)} · {percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" style={{ width: `${percent}%` }} /></div></div>; })}</div></article>
      <article className="relative overflow-hidden rounded-[24px] border border-violet-400/20 bg-[linear-gradient(145deg,#101d3c,#263c78_58%,#59278a)] p-5 text-white shadow-[0_28px_75px_-46px_rgba(109,40,217,.75)]"><div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-fuchsia-400/20 blur-3xl" /><div className="relative"><h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4 text-cyan-300" />{fr ? "Lecture du portefeuille" : "Portfolio insight"}</h2><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-3xl font-semibold">{topProjectShare}%</p><p className="mt-1 text-xs text-blue-100/65">{fr ? "sur le premier projet" : "on the top project"}</p></div><div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-3xl font-semibold">{formatDuration(visibleMinutes)}</p><p className="mt-1 text-xs text-blue-100/65">{fr ? "dans la sélection" : "in the selection"}</p></div></div><div className="mt-5 space-y-3">{entityTotals.map(([name, minutes], index) => <div key={name} className="flex items-center gap-3"><span className={cn("size-2.5 rounded-full", entityTones[index % entityTones.length])} /><span className="min-w-0 flex-1 truncate text-sm text-blue-50/85">{name}</span><strong className="text-sm tabular-nums">{formatDuration(minutes)}</strong></div>)}</div></div></article>
    </section> : null}

    <section className="overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_26px_80px_-55px_rgba(15,23,42,.5)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] border-collapse text-sm">
        <thead><tr className="border-b border-border bg-[linear-gradient(90deg,rgba(37,99,235,.07),rgba(124,58,237,.05),transparent)]"><th className="sticky left-0 z-10 w-72 bg-card px-5 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground"><span className="flex items-center gap-3"><input type="checkbox" aria-label={fr ? "Sélectionner toutes les feuilles envoyées affichées" : "Select all visible submitted timesheets"} checked={allSubmittedVisibleSelected} disabled={!submittedVisibleIds.length} onChange={() => setSelectedIds(current => allSubmittedVisibleSelected ? current.filter(id => !submittedVisibleIds.includes(id)) : [...new Set([...current, ...submittedVisibleIds])])} className="size-4 accent-blue-600" />{visibleProfiles.length} {fr ? "profils" : "profiles"}</span></th>{days.map((day) => <th key={day} className={cn("border-l border-border px-3 py-3 text-center", day === today && "bg-primary/10 text-primary")}><span className="block text-[10px] uppercase">{formatter(day, { weekday: "short" })}</span><span className={cn("mx-auto mt-1 grid size-8 place-items-center rounded-full text-base", day === today && "bg-primary text-white shadow-lg")}>{formatter(day, { day: "numeric" })}</span></th>)}<th className="border-l border-border bg-primary/5 px-4 text-center">Total</th></tr></thead>
        <tbody>{visibleProfiles.map((profile) => {
          const daily = dailyByUser.get(profile.id) ?? new Map();
          const total = totalsByUser.get(profile.id) ?? 0;
          const capacity = Math.max(profile.weekly_capacity_hours, 1) * 60;
          const completion = Math.min(Math.round(total / capacity * 100), 100);
          const status = statusByUser.get(profile.id);
          return <tr key={profile.id} className="group border-b border-border last:border-0 transition-colors hover:bg-blue-500/[.025]">
            <th className="sticky left-0 z-10 bg-card px-5 py-4 text-left group-hover:bg-[color-mix(in_oklab,var(--card),#3b82f6_3%)]"><div className="flex items-center gap-3">{status?.status === "submitted" ? <input type="checkbox" aria-label={`${fr ? "Sélectionner" : "Select"} ${profile.full_name}`} checked={selectedIds.includes(profile.id)} onChange={() => setSelectedIds(current => current.includes(profile.id) ? current.filter(id => id !== profile.id) : [...current, profile.id])} className="size-4 shrink-0 accent-blue-600" /> : <span className={cn("h-10 w-1 rounded-full", entityTone(profile.entity_code))} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold">{profile.full_name}</p>{status?.status === "approved" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-3" />{fr ? "Validée" : "Approved"}</span> : status?.status === "submitted" ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300"><Send className="size-3" />{fr ? "Envoyée" : "Submitted"}</span> : null}</div><p className="mt-1 truncate text-[11px] font-normal text-muted-foreground"><span className="capitalize">{profile.role}</span> · <span className="font-semibold text-primary/75">{getBumexEntity(profile.entity_code)?.name ?? (fr ? "Entité non définie" : "No entity")}</span></p><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" style={{ width: `${completion}%` }} /></div><span className="text-[10px] font-bold text-muted-foreground">{completion}%</span><button type="button" onClick={() => setSelectedId(profile.id)} className="ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"><Eye className="size-3" />{fr ? "Voir" : "View"}</button></div></div></div></th>
            {days.map((day) => { const minutes = daily.get(day) ?? 0; return <td key={day} className={cn("border-l border-border p-2 text-center tabular-nums", day === today && "bg-primary/[.04]")}><div className={cn("rounded-xl px-2 py-3 transition-transform group-hover:-translate-y-px", activityTone(minutes))}>{minutes ? formatDuration(minutes) : "—"}</div></td>; })}
            <td className="border-l border-border bg-gradient-to-br from-blue-500/[.08] to-violet-500/[.07] px-2 text-center font-semibold tabular-nums"><span className="block">{formatDuration(total)}</span>{status?.status === "submitted" ? <form className="mt-2" action={approveTimesheetWeekAction.bind(null, profile.id, week)}><Button type="submit" size="sm" className="h-7 rounded-lg px-2 text-[10px]"><CheckCircle2 className="size-3" />{fr ? "Valider" : "Approve"}</Button></form> : status?.status !== "approved" ? <form className="mt-2" action={remindTimesheetWeekAction.bind(null, profile.id, week)}><Button type="submit" size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[10px] text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-300"><BellRing className="size-3" />{fr ? "Relancer" : "Remind"}</Button></form> : null}</td>
          </tr>;
        })}{visibleProfiles.length === 0 ? <tr><td colSpan={9} className="px-6 py-14 text-center"><Search className="mx-auto size-7 text-muted-foreground/45" /><p className="mt-3 font-semibold">{fr ? "Aucun profil ne correspond à ces filtres" : "No profile matches these filters"}</p><button type="button" onClick={() => { setSearch(""); setEntityFilter("all"); setStatusFilter("all"); }} className="mt-2 text-sm font-semibold text-primary hover:underline">{fr ? "Afficher tous les profils" : "Show all profiles"}</button></td></tr> : null}</tbody>
      </table></div>
    </section>
    <Dialog open={Boolean(selectedProfile)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        {selectedProfile ? <>
          <div className="bg-[linear-gradient(125deg,#0b2347,#18519a_58%,#6d28a8)] px-7 py-6 text-white">
            <DialogTitle className="text-2xl">{selectedProfile.full_name}</DialogTitle>
            <DialogDescription className="mt-1 text-blue-100/75"><span className="capitalize">{selectedProfile.role}</span> · {getBumexEntity(selectedProfile.entity_code)?.name ?? (fr ? "Entité non définie" : "No entity")}</DialogDescription>
            <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-xl bg-white/12 px-3 py-2 text-sm font-semibold">{weekTitle}</span><span className="rounded-xl bg-white/12 px-3 py-2 text-sm font-semibold">{formatDuration(selectedTotal)}</span><span className="rounded-xl bg-white/12 px-3 py-2 text-sm font-semibold">{selectedStatus?.status === "approved" ? (fr ? "Validée" : "Approved") : selectedStatus?.status === "submitted" ? (fr ? "À valider" : "To approve") : selectedStatus?.status === "returned" ? (fr ? "À corriger" : "Needs changes") : (fr ? "Brouillon" : "Draft")}</span></div>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-6">
            {selectedStatus?.status === "submitted" ? <form action={returnTimesheetWeekAction.bind(null, selectedProfile.id, week)} className="rounded-2xl border border-amber-300/40 bg-amber-500/[.07] p-4"><label className="text-sm font-semibold" htmlFor="return-reason">{fr ? "Demander une correction" : "Request changes"}</label><textarea id="return-reason" name="reason" required minLength={3} maxLength={500} placeholder={fr ? "Expliquez clairement ce qui doit être corrigé…" : "Explain clearly what needs to be corrected…"} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" /><div className="mt-2 flex justify-end"><Button type="submit" variant="secondary"><TriangleAlert className="size-4" />{fr ? "Renvoyer pour correction" : "Return for changes"}</Button></div></form> : selectedStatus?.status === "returned" && selectedStatus.review_note ? <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 text-sm"><p className="font-semibold">{fr ? "Correction demandée" : "Changes requested"}</p><p className="mt-1 text-muted-foreground">{selectedStatus.review_note}</p></div> : null}
            {selectedEvents.length ? <section className="rounded-2xl border border-border/70 p-4"><h3 className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" />{fr ? "Historique de validation" : "Approval history"}</h3><div className="mt-4 space-y-0">{selectedEvents.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">{index < selectedEvents.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-border" /> : null}<span className={cn("relative mt-1 size-4 shrink-0 rounded-full border-4 border-card", event.status === "approved" ? "bg-emerald-500" : event.status === "returned" ? "bg-amber-500" : "bg-blue-500")} /><div className="min-w-0"><p className="text-sm font-semibold">{event.status === "approved" ? (fr ? "Feuille validée" : "Timesheet approved") : event.status === "returned" ? (fr ? "Correction demandée" : "Changes requested") : (fr ? "Feuille envoyée" : "Timesheet submitted")}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.actor_name ?? (fr ? "Utilisateur" : "User")} · {new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</p>{event.note ? <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">{event.note}</p> : null}</div></div>)}</div></section> : null}
            {selectedGroups.length ? selectedGroups.map(group => <article key={group.key} className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-blue-500/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{group.mission}</h3><p className="mt-1 text-xs text-muted-foreground">{group.projectName ?? (fr ? "Projet" : "Project")}</p></div><span className="rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">{formatDuration(group.minutes)}</span></div><div className="mt-4 grid grid-cols-7 gap-1">{days.map(day => { const minutes = (group.days.get(day) ?? []).reduce((sum, entry) => sum + entry.duration_minutes, 0); return <div key={day} className={cn("rounded-lg px-1 py-2 text-center text-[10px]", minutes ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-muted/50 text-muted-foreground")}><span className="block uppercase">{formatter(day, { weekday: "narrow" })}</span><strong className="mt-1 block text-[11px]">{minutes ? formatDuration(minutes) : "—"}</strong></div>; })}</div></article>) : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{fr ? "Aucun temps déclaré pour cette semaine." : "No time logged for this week."}</div>}
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
      <DialogContent>
        <div><DialogTitle>{fr ? "Valider les feuilles sélectionnées ?" : "Approve selected timesheets?"}</DialogTitle><DialogDescription className="mt-2">{fr ? "Cette action verrouille les feuilles suivantes comme validées." : "This action locks the following timesheets as approved."}</DialogDescription></div>
        <div className="max-h-56 space-y-2 overflow-y-auto">{selectedProfiles.map(profile => <div key={profile.id} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">{profile.full_name}</span><span className="text-xs text-muted-foreground">{getBumexEntity(profile.entity_code)?.name ?? ""}</span></div>)}</div>
        <form action={approveTimesheetWeeksAction.bind(null, selectedProfiles.map(profile => profile.id), week)} onSubmit={() => { setBulkDialogOpen(false); setSelectedIds([]); }} className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setBulkDialogOpen(false)}>{fr ? "Retour" : "Back"}</Button><Button type="submit"><ShieldCheck className="size-4" />{fr ? `Valider ${selectedProfiles.length} feuille(s)` : `Approve ${selectedProfiles.length} timesheet(s)`}</Button></form>
      </DialogContent>
    </Dialog>
  </div>;
}
