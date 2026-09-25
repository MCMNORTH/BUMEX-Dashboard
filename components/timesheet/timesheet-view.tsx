"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Copy, Layers, LoaderCircle, Pencil, Plus, Save, Send, ShieldCheck, Sparkles, Star, TimerReset } from "lucide-react";
import { copyPreviousWeekAction, saveTimeAction, setMissionFavoriteAction, submitTimesheetWeekAction } from "@/app/(app)/timesheet/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { addDays, formatDuration } from "@/lib/timesheet/validation";
import { groupWeeklyEntries, missionKey } from "@/lib/timesheet/weekly";
import { cn } from "@/lib/utils";
import type { TimeEntry, TimeError, TimeInput, TimeProject, TimeMission, TimeMissionFavorite, TimesheetWeekEvent, TimesheetWeekStatus } from "@/types/timesheet";

const selectClass = "h-9 w-full rounded-[9px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-50";
const errorMessages: Record<TimeError, [string, string]> = {
  invalid: ["Vérifiez les informations saisies.", "Please check the entry details."],
  duration: ["Saisissez une durée de 1 minute à 24 heures (minutes : 0 à 59).", "Enter a duration from 1 minute to 24 hours (minutes: 0–59)."],
  date: ["Choisissez un jour passé ou aujourd’hui.", "Choose today or a past day."],
  note: ["La note ne doit pas dépasser 1 000 caractères.", "Keep the note under 1,000 characters."],
  mission: ["Indiquez le nom de la mission ou de la tâche (200 caractères maximum).", "Enter a mission or task name (up to 200 characters)."],
  project: ["Ce projet n’est pas autorisé pour votre feuille de temps.", "This project is not allowed in your timesheet."],
  unavailable: ["Enregistrement impossible. Votre saisie est conservée dans le formulaire ; réessayez.", "Could not save. Your input is still in the form; please try again."],
  conflict: ["Cette saisie a été enregistrée ou modifiée ailleurs. Actualisez la page avant de réessayer.", "This entry was saved or changed elsewhere. Refresh the page before trying again."],
  daily_limit: ["Le total de vos saisies ne peut pas dépasser 24 heures sur une journée.", "Your total recorded time cannot exceed 24 hours in one day."],
};
type Selection = { date: string; projectId?: string; mission?: string; entries: TimeEntry[]; entry?: TimeEntry };

export function TimesheetView({ entries, projects, missions, favorites, weekStatus, events, week, days, today, locale, weeklyCapacityHours, initialProjectId, initialMission, initialDate }: {
  entries: TimeEntry[]; projects: TimeProject[]; missions: TimeMission[]; favorites: TimeMissionFavorite[]; weekStatus: TimesheetWeekStatus | null; events: TimesheetWeekEvent[]; week: string; days: string[]; today: string; locale: "fr" | "en"; weeklyCapacityHours: number; initialProjectId?: string; initialMission?: string; initialDate?: string;
}) {
  const fr = locale === "fr";
  const router = useRouter();
  const initialProjectAllowed = Boolean(initialProjectId && projects.some(project => project.id === initialProjectId));
  const initialWorkDate = initialDate && initialDate >= week && initialDate <= days[6] && initialDate <= today
    ? initialDate
    : today >= week && today <= days[6] ? today : week;
  const canOpenInitialEntry = initialProjectAllowed && week <= today && (!weekStatus || weekStatus.status === "returned");
  const [filter, setFilter] = useState(initialProjectAllowed ? initialProjectId ?? "" : "");
  const [selection, setSelection] = useState<Selection | null>(() => canOpenInitialEntry ? {
    date: initialWorkDate,
    projectId: initialProjectId,
    mission: initialMission?.slice(0, 200),
    entries: [],
  } : null);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const visible = filter ? entries.filter(entry => entry.project_id === filter) : entries;
  const groups = groupWeeklyEntries(visible);
  const dailyTotals = days.map(date => visible.filter(entry => entry.work_date === date).reduce((sum, entry) => sum + entry.duration_minutes, 0));
  const total = dailyTotals.reduce((sum, minutes) => sum + minutes, 0);
  const capacityMinutes = Math.max(weeklyCapacityHours, 1) * 60;
  const completion = Math.min(Math.round((total / capacityMinutes) * 100), 100);
  const workedDays = dailyTotals.filter(minutes => minutes > 0).length;
  const locked = Boolean(weekStatus && weekStatus.status !== "returned");
  const allowedProjects = new Set(projects.map(project => project.id));
  const filterProjects = new Map(projects.map(project => [project.id, project.name]));
  for (const entry of entries) if (!filterProjects.has(entry.project_id)) filterProjects.set(entry.project_id, entry.project?.name ?? (fr ? "Projet non accessible" : "Unavailable project"));
  const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { ...options, timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  const weekTitle = `${dateLabel(week, { day: "numeric", month: "short" })} – ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
  const defaultDate = today >= week && today <= days[6] ? today : week;

  function open(value: Selection) {
    setSelection(value); setFormVersion(version => version + 1); setNotice(""); setNoticeError(false);
  }

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-[30px] border border-blue-400/20 bg-[linear-gradient(125deg,#071a37_0%,#153b72_52%,#5b218c_100%)] px-6 py-7 text-white shadow-[0_32px_90px_-42px_rgba(37,99,235,.9)] sm:px-8">
      <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-200"><Sparkles className="size-4" />{fr ? "Mon rythme · cette semaine" : "My rhythm · this week"}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{fr ? "Feuille de temps" : "Timesheet"}</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100/80">{fr ? "Répartissez simplement votre temps entre vos missions et gardez le fil de votre semaine." : "Split your time across missions and keep your week on track."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative grid size-24 place-items-center rounded-full bg-[conic-gradient(#67e8f9_var(--progress),rgba(255,255,255,.14)_0)] p-[7px]" style={{ "--progress": `${completion}%` } as React.CSSProperties}>
            <div className="grid size-full place-items-center rounded-full bg-[#132c59]/95 text-center"><span><strong className="block text-xl">{completion}%</strong><small className="text-[10px] uppercase tracking-wider text-blue-100/65">{fr ? "rempli" : "complete"}</small></span></div>
          </div>
          <div><p className="text-3xl font-semibold tabular-nums">{formatDuration(total)}</p><p className="mt-1 text-xs text-blue-100/65">{fr ? `sur ${weeklyCapacityHours} h de capacité` : `of ${weeklyCapacityHours}h capacity`}</p></div>
          {weekStatus ? <span className={cn("inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold backdrop-blur", weekStatus.status === "approved" ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100" : weekStatus.status === "returned" ? "border-amber-300/30 bg-amber-300/15 text-amber-100" : "border-cyan-300/30 bg-cyan-300/15 text-cyan-100")}>{weekStatus.status === "approved" ? <ShieldCheck className="size-4" /> : <Send className="size-4" />}{weekStatus.status === "approved" ? (fr ? "Validée" : "Approved") : weekStatus.status === "returned" ? (fr ? "À corriger" : "Needs changes") : (fr ? "Envoyée" : "Submitted")}</span> : null}
          <Button className="h-11 rounded-xl bg-white text-blue-800 shadow-lg hover:bg-cyan-50" disabled={!projects.length || week > today || locked} onClick={() => open({ date: defaultDate, entries: [] })}><Plus aria-hidden="true" />{fr ? "Ajouter une mission" : "Add a mission"}</Button>
        </div>
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-[0_18px_50px_-42px_rgba(15,23,42,.65)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="icon"><Link href={`/timesheet?week=${addDays(week, -7)}`} aria-label={fr ? "Semaine précédente" : "Previous week"}><ArrowLeft aria-hidden="true" /></Link></Button>
        <h2 className="px-2 text-base font-semibold" aria-live="polite">{weekTitle}</h2>
        <Button asChild variant="secondary" size="icon"><Link href={`/timesheet?week=${addDays(week, 7)}`} aria-label={fr ? "Semaine suivante" : "Next week"}><ArrowRight aria-hidden="true" /></Link></Button>
        <Button asChild variant="ghost"><Link href="/timesheet">{fr ? "Cette semaine" : "This week"}</Link></Button>
      </div>
      {weekStatus?.status === "returned" ? <div className="mb-3 rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"><p className="font-semibold">{fr ? "Cette feuille vous a été retournée pour correction." : "This timesheet was returned for changes."}</p><p className="mt-1 text-amber-800/80 dark:text-amber-100/75">{weekStatus.review_note}</p></div> : null}
      <div className="flex flex-wrap items-end gap-2">{total > 0 && (!weekStatus || weekStatus.status === "returned") ? <Button type="button" onClick={() => setSubmitOpen(true)}><Send aria-hidden="true" />{weekStatus?.status === "returned" ? (fr ? "Renvoyer la semaine" : "Resubmit week") : (fr ? "Envoyer la semaine" : "Submit week")}</Button> : null}{!entries.length && week <= today && !locked ? <Button type="button" variant="secondary" onClick={() => setCopyOpen(true)}><Copy aria-hidden="true" />{fr ? "Reprendre la semaine précédente" : "Copy previous week"}</Button> : null}<form action="/timesheet" className="flex items-end gap-2">
        <label htmlFor="timesheet-week" className="grid gap-1 text-xs text-muted-foreground">{fr ? "Aller à la semaine du" : "Go to week of"}<Input id="timesheet-week" type="date" name="week" min="2000-01-03" defaultValue={week} required /></label>
        <Button type="submit" variant="secondary">{fr ? "Afficher" : "Show"}</Button>
      </form></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: fr ? "Temps déclaré" : "Time logged", value: formatDuration(total), Icon: Clock3, tone: "from-blue-500/15 to-cyan-400/5", icon: "bg-blue-500 text-white" },
        { label: fr ? "Missions actives" : "Active missions", value: groups.length, Icon: Layers, tone: "from-violet-500/15 to-fuchsia-400/5", icon: "bg-violet-500 text-white" },
        { label: fr ? "Jours renseignés" : "Days logged", value: `${workedDays} / 7`, Icon: CalendarDays, tone: "from-emerald-500/15 to-teal-400/5", icon: "bg-emerald-500 text-white" },
      ].map(({ label, value, Icon, tone, icon }) => <div key={label} className={cn("group relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,.7)]", tone)}><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div><span className={cn("grid size-10 place-items-center rounded-xl shadow-lg transition-transform group-hover:-translate-y-0.5", icon)}><Icon className="size-5" aria-hidden="true" /></span></div></div>)}
    </div>
    {events.length ? <section className="rounded-2xl border border-border/70 bg-card/90 px-5 py-4 shadow-[0_18px_50px_-44px_rgba(15,23,42,.65)]" aria-labelledby="personal-history-title"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="personal-history-title" className="flex items-center gap-2 text-sm font-semibold"><TimerReset className="size-4 text-primary" />{fr ? "Suivi de ma feuille" : "My timesheet progress"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "Toutes les étapes de validation de cette semaine." : "Every approval step for this week."}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{events.length} {fr ? "étape(s)" : "step(s)"}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-3">{events.map(event => <article key={event.id} className={cn("rounded-2xl border p-4", event.status === "approved" ? "border-emerald-300/40 bg-emerald-500/[.07]" : event.status === "returned" ? "border-amber-300/40 bg-amber-500/[.08]" : "border-blue-300/40 bg-blue-500/[.06]")}><div className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", event.status === "approved" ? "bg-emerald-500" : event.status === "returned" ? "bg-amber-500" : "bg-blue-500")} /><h3 className="text-sm font-semibold">{event.status === "approved" ? (fr ? "Feuille validée" : "Timesheet approved") : event.status === "returned" ? (fr ? "Correction demandée" : "Changes requested") : (fr ? "Feuille envoyée" : "Timesheet submitted")}</h3></div><p className="mt-2 text-xs text-muted-foreground">{new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}{event.actor_name ? ` · ${event.actor_name}` : ""}</p>{event.note ? <p className="mt-3 text-xs leading-5 text-amber-900 dark:text-amber-100">{event.note}</p> : null}</article>)}</div></section> : null}
    <section className="rounded-2xl border border-border/70 bg-card/90 px-5 py-4 shadow-[0_18px_50px_-44px_rgba(15,23,42,.65)]" aria-labelledby="weekly-rhythm-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="weekly-rhythm-title" className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" />{fr ? "Rythme de la semaine" : "Weekly rhythm"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "La hauteur indique le temps déclaré chaque jour." : "Bar height shows time logged each day."}</p></div><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", completion >= 100 ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-blue-500/10 text-blue-700 dark:text-blue-300")}>{completion >= 100 ? (fr ? "Semaine complétée" : "Week complete") : (fr ? `${100 - completion}% restant` : `${100 - completion}% remaining`)}</span></div>
      <div className="mt-4 grid grid-cols-7 gap-2">{dailyTotals.map((minutes, index) => { const height = minutes ? Math.max(18, Math.min(100, Math.round(minutes / 480 * 100))) : 6; return <div key={days[index]} className="group grid gap-2 text-center"><div className="flex h-20 items-end justify-center overflow-hidden rounded-xl bg-muted/55 p-1"><div className={cn("w-full rounded-lg bg-gradient-to-t transition-all duration-300 group-hover:brightness-110", minutes ? "from-blue-600 via-indigo-500 to-violet-400 shadow-[0_8px_18px_-8px_rgba(79,70,229,.8)]" : "from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600")} style={{ height: `${height}%` }} title={minutes ? formatDuration(minutes) : "0 h"} /></div><span className="text-[11px] font-medium capitalize text-muted-foreground">{dateLabel(days[index], { weekday: "short" })}</span></div>; })}</div>
    </section>
    {favorites.length ? <section className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/[.10] via-orange-400/[.06] to-transparent px-5 py-4" aria-labelledby="favorite-missions-title"><div className="flex flex-wrap items-center gap-3"><div className="mr-2"><h2 id="favorite-missions-title" className="flex items-center gap-2 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-500" />{fr ? "Missions favorites" : "Favorite missions"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "Ajoutez du temps sans rechercher la mission." : "Log time without searching for the mission."}</p></div>{favorites.map(favorite => <button key={missionKey(favorite.project_id, favorite.mission)} type="button" disabled={week > today || locked} onClick={() => open({ date: defaultDate, projectId: favorite.project_id, mission: favorite.mission, entries: [] })} className="rounded-xl border border-amber-400/25 bg-card px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400/50 hover:shadow-md disabled:opacity-50"><span className="block max-w-48 truncate font-semibold">{favorite.mission}</span><span className="mt-0.5 block max-w-48 truncate text-[10px] text-muted-foreground">{filterProjects.get(favorite.project_id)}</span></button>)}</div></section> : null}
    <p role="status" className={notice ? cn("rounded-lg p-3 text-sm", noticeError ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300") : "sr-only"}>{notice}</p>

    <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card shadow-[0_30px_90px_-58px_rgba(15,23,42,.65)]" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-[linear-gradient(90deg,rgba(37,99,235,.07),rgba(124,58,237,.05),transparent)] px-5 py-4">
        <div><h2 id="calendar-title" className="font-semibold">{fr ? "Mes missions de la semaine" : "My missions this week"}</h2><p className="mt-1 text-xs text-muted-foreground">{fr ? "Cliquez sur une case pour saisir ou modifier une durée." : "Click a cell to add or edit a duration."}</p></div>
        <label className="flex items-center gap-2 text-sm" htmlFor="project-filter"><span className="sr-only">{fr ? "Filtrer par projet" : "Filter by project"}</span><select id="project-filter" className={selectClass} value={filter} onChange={event => setFilter(event.target.value)}><option value="">{fr ? "Tous les projets" : "All projects"}</option>{[...filterProjects].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={fr ? "Calendrier hebdomadaire, défilement horizontal" : "Weekly calendar, scroll horizontally"}>
        <table className="w-full min-w-[1000px] table-fixed border-collapse text-sm">
          <caption className="sr-only">{weekTitle} — {fr ? "durées par mission et par jour" : "duration by mission and day"}</caption>
          <thead><tr className="border-b border-border bg-slate-50/80 dark:bg-slate-900/50">
            <th scope="col" className="sticky left-0 z-10 w-56 bg-card p-4 text-left">{fr ? "Mission / tâche" : "Mission / task"}</th>
            {days.map((date, index) => <th scope="col" key={date} className={cn("border-l border-border px-1 py-4 text-center font-medium", index >= 5 && "bg-muted/40", date === today && "bg-primary/10 text-primary")}><span className="block text-xs capitalize">{dateLabel(date, { weekday: "short" })}</span><span className={cn("mx-auto mt-1 flex size-8 items-center justify-center rounded-full text-base", date === today && "bg-primary text-primary-foreground")}>{dateLabel(date, { day: "numeric" })}</span></th>)}
            <th scope="col" className="w-24 border-l border-border bg-primary/5 px-2 py-4 text-center">Total</th><th scope="col" className="w-16 px-1 py-4 text-center">{fr ? "Jours" : "Days"}</th>
          </tr></thead>
          <tbody>
            {groups.map((group, groupIndex) => <tr key={group.key} className="group/row border-b border-border transition-colors hover:bg-blue-500/[.025]">
              <th scope="row" className="sticky left-0 z-10 bg-card p-4 text-left font-normal group-hover/row:bg-[color-mix(in_oklab,var(--card),#3b82f6_3%)]"><div className="flex gap-3"><span className={cn("mt-0.5 h-10 w-1 shrink-0 rounded-full", ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"][groupIndex % 5])} /><div><p className="break-words font-semibold">{group.mission || (fr ? "Mission à préciser" : "Unspecified mission")}</p><p className="mt-1 break-words text-xs text-muted-foreground">{group.projectName ?? (fr ? "Projet non accessible" : "Unavailable project")}</p></div></div></th>
              {days.map((date, index) => {
                const cell = group.days.get(date) ?? [];
                const minutes = cell.reduce((sum, entry) => sum + entry.duration_minutes, 0);
                return <td key={date} className={cn("border-l border-border p-1.5 text-center", index >= 5 && "bg-muted/20", date === today && "bg-primary/5")}>
                  <button className={cn("flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-60", minutes ? "bg-gradient-to-br from-blue-500/15 to-violet-500/10 font-semibold text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,.12)] hover:-translate-y-0.5 hover:from-blue-500/20 hover:to-violet-500/15 dark:text-blue-300" : "text-muted-foreground hover:bg-blue-500/[.06] hover:text-primary")}
                    disabled={date > today || !allowedProjects.has(group.projectId) || locked}
                    aria-label={`${group.mission || (fr ? "Mission à préciser" : "Unspecified mission")} — ${dateLabel(date, { weekday: "long", day: "numeric", month: "long" })} — ${minutes ? formatDuration(minutes) : (fr ? "Ajouter du temps" : "Add time")}`}
                    onClick={() => open({ date, projectId: group.projectId, mission: group.mission, entries: cell, entry: cell.length === 1 ? cell[0] : undefined })}>
                    {minutes ? <><span className="whitespace-nowrap tabular-nums">{formatDuration(minutes)}</span>{cell.length > 1 ? <span className="text-[10px] font-normal">{cell.length} {fr ? "saisies" : "entries"}</span> : null}</> : date > today ? <span>—</span> : <Plus className="size-4" aria-hidden="true" />}
                  </button>
                </td>;
              })}
              <td className="border-l border-border bg-primary/5 px-2 text-center font-semibold tabular-nums">{formatDuration(group.minutes)}</td><td className="text-center font-semibold tabular-nums">{group.days.size}</td>
            </tr>)}
            {!groups.length ? <tr><td colSpan={10} className="px-6 py-14 text-center"><span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/15 text-primary"><CalendarDays className="size-7" aria-hidden="true" /></span><p className="font-semibold">{fr ? "Votre semaine est prête" : "Your week is ready"}</p><p className="mt-2 text-sm text-muted-foreground">{fr ? "Ajoutez votre première mission et indiquez le temps consacré chaque jour." : "Add your first mission and record the time spent each day."}</p></td></tr> : null}
            <tr className="border-b border-border"><td className="sticky left-0 z-10 bg-card px-4 py-3 text-xs text-muted-foreground">{locked ? (fr ? "Semaine verrouillée" : "Week locked") : (fr ? "Ajouter du temps ce jour" : "Log time on this day")}</td>{days.map(date => <td key={date} className="border-l border-border p-2 text-center"><Button size="icon" variant="ghost" disabled={date > today || !projects.length || locked} aria-label={`${fr ? "Ajouter du temps le" : "Log time on"} ${date}`} onClick={() => open({ date, projectId: filter || undefined, entries: [] })}><Plus aria-hidden="true" /></Button></td>)}<td colSpan={2} /></tr>
          </tbody>
          <tfoot><tr className="bg-gradient-to-r from-blue-500/[.07] via-violet-500/[.05] to-transparent"><th scope="row" className="sticky left-0 z-10 bg-card p-4 text-left"><span className="flex items-center gap-2"><Activity className="size-4 text-primary" />{fr ? "Total par jour" : "Daily total"}</span></th>{dailyTotals.map((minutes, index) => <td key={days[index]} className="border-l border-border px-1 py-4 text-center font-semibold tabular-nums">{minutes ? formatDuration(minutes) : "—"}</td>)}<td className="border-l border-border bg-primary/10 px-2 text-center font-semibold text-primary tabular-nums">{formatDuration(total)}</td><td className="text-center font-semibold"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4 text-emerald-500" />{workedDays}</span></td></tr></tfoot>
        </table>
      </div>
    </section>
    <p className="text-xs text-muted-foreground">{fr ? "Les totaux portent sur la semaine affichée. Un jour est compté une seule fois par mission, même avec plusieurs saisies." : "Totals cover the displayed week. A day is counted once per mission, even with multiple entries."}</p>

    <Dialog open={selection !== null} onOpenChange={value => { if (!value && !saving) setSelection(null); }}>
      {selection ? <DialogContent onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
        <DialogTitle>{selection.entry ? (fr ? "Modifier le temps passé" : "Edit time spent") : (fr ? "Ajouter du temps" : "Log time")}</DialogTitle>
        <DialogDescription className="capitalize">{dateLabel(selection.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</DialogDescription>
        {selection.entries.length > 1 ? <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-xs font-medium">{fr ? "Saisies déjà enregistrées ce jour :" : "Entries already logged on this day:"}</p>{selection.entries.map(entry => <Button key={entry.id} type="button" variant="secondary" className="mr-2" disabled={saving} onClick={() => { setSelection({ ...selection, entry }); setFormVersion(version => version + 1); }}><Pencil aria-hidden="true" />{formatDuration(entry.duration_minutes)}</Button>)}</div> : null}
        <TimeEntryForm key={formVersion} selection={selection} projects={projects} missions={missions} favorites={favorites} fr={fr} onPending={setSaving} onCancel={() => setSelection(null)} onSaved={() => {
          setSelection(null); setNoticeError(false); setNotice(fr ? "Temps enregistré. Le calendrier et les totaux sont à jour." : "Time saved. Calendar and totals are updated."); router.refresh();
        }} />
      </DialogContent> : null}
    </Dialog>
    <Dialog open={copyOpen} onOpenChange={value => { if (!copying) setCopyOpen(value); }}>
      <DialogContent>
        <DialogTitle>{fr ? "Reprendre la semaine précédente ?" : "Copy the previous week?"}</DialogTitle>
        <DialogDescription>{fr ? "Les missions, durées et notes de la semaine précédente seront copiées sur les mêmes jours de cette semaine. Vous pourrez ensuite tout modifier." : "Missions, durations, and notes from the previous week will be copied to the same days this week. You can edit everything afterward."}</DialogDescription>
        <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[.08] to-violet-500/[.06] p-4 text-sm"><p className="font-semibold">{weekTitle}</p><p className="mt-1 text-muted-foreground">{fr ? "Cette action est disponible uniquement parce que cette semaine est encore vide." : "This is available because the displayed week is still empty."}</p></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={copying} onClick={() => setCopyOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button><Button type="button" disabled={copying} onClick={async () => { setCopying(true); const result = await copyPreviousWeekAction(week); setCopying(false); if ("error" in result) { const message = result.error === "no_source" ? (fr ? "La semaine précédente ne contient aucune saisie réutilisable." : "The previous week has no reusable entries.") : result.error === "not_empty" ? (fr ? "Cette semaine contient déjà des saisies." : "This week already has entries.") : (fr ? "La copie n’a pas pu être effectuée." : "The week could not be copied."); setNoticeError(true); setNotice(message); setCopyOpen(false); return; } setNoticeError(false); setNotice(fr ? `${result.count} saisie${result.count > 1 ? "s" : ""} copiée${result.count > 1 ? "s" : ""}.` : `${result.count} ${result.count > 1 ? "entries" : "entry"} copied.`); setCopyOpen(false); router.refresh(); }}><span className="inline-flex items-center gap-2">{copying ? <LoaderCircle className="size-4 animate-spin" /> : <Copy className="size-4" />}{copying ? (fr ? "Copie…" : "Copying…") : (fr ? "Copier la semaine" : "Copy week")}</span></Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={submitOpen} onOpenChange={value => { if (!submitting) setSubmitOpen(value); }}>
      <DialogContent>
        <DialogTitle>{fr ? "Envoyer cette semaine ?" : "Submit this week?"}</DialogTitle>
        <DialogDescription>{fr ? "Après l’envoi, la feuille sera verrouillée et prête à être contrôlée par un responsable." : "After submission, the timesheet will be locked and ready for review."}</DialogDescription>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-4 text-center"><div><strong className="block text-lg">{formatDuration(total)}</strong><span className="text-xs text-muted-foreground">{fr ? "déclaré" : "logged"}</span></div><div><strong className="block text-lg">{groups.length}</strong><span className="text-xs text-muted-foreground">{fr ? "missions" : "missions"}</span></div><div><strong className="block text-lg">{workedDays}</strong><span className="text-xs text-muted-foreground">{fr ? "jours" : "days"}</span></div></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={submitting} onClick={() => setSubmitOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button><Button type="button" disabled={submitting} onClick={async () => { setSubmitting(true); const result = await submitTimesheetWeekAction(week); setSubmitting(false); if ("error" in result) { setNoticeError(true); setNotice(result.error === "empty" ? (fr ? "Ajoutez au moins une saisie avant l’envoi." : "Add at least one entry before submitting.") : (fr ? "La semaine n’a pas pu être envoyée." : "The week could not be submitted.")); setSubmitOpen(false); return; } setNoticeError(false); setNotice(fr ? "Semaine envoyée pour validation." : "Week submitted for approval."); setSubmitOpen(false); router.refresh(); }}><span className="inline-flex items-center gap-2">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{submitting ? (fr ? "Envoi…" : "Submitting…") : (fr ? "Confirmer l’envoi" : "Confirm submission")}</span></Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}

function TimeEntryForm({ selection, projects, missions, favorites, fr, onSaved, onCancel, onPending }: {
  selection: Selection; projects: TimeProject[]; missions: TimeMission[]; favorites: TimeMissionFavorite[]; fr: boolean; onSaved: () => void; onCancel: () => void; onPending: (pending: boolean) => void;
}) {
  const entry = selection.entry;
  const [projectId, setProjectId] = useState(entry?.project_id ?? selection.projectId ?? "");
  const [mission, setMission] = useState(entry?.mission ?? selection.mission ?? "");
  const [hours, setHours] = useState(entry ? Math.floor(entry.duration_minutes / 60) : 0);
  const [minutes, setMinutes] = useState(entry ? entry.duration_minutes % 60 : 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<TimeError | null>(null);
  const [favorite, setFavorite] = useState(() => favorites.some(item => item.project_id === (entry?.project_id ?? selection.projectId) && item.mission === (entry?.mission ?? selection.mission)));
  const [favoritePending, setFavoritePending] = useState(false);
  const submissionId = useRef<string | null>(null);
  const suggestions = [...new Map(missions.filter(item => item.project_id === projectId).map(item => [missionKey(item.project_id, item.mission), item.mission])).values()];
  const presets = [30, 60, 120, 240, 480];
  function selectDuration(duration: number) {
    setHours(Math.floor(duration / 60));
    setMinutes(duration % 60);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    submissionId.current ??= crypto.randomUUID();
    const input: TimeInput = { id: entry?.id ?? submissionId.current, project_id: projectId, mission,
      work_date: selection.date, hours: String(form.get("hours") ?? "0"), minutes: String(form.get("minutes") ?? "0"), note: String(form.get("note") ?? ""),
      ...(entry ? { updated_at: entry.updated_at } : {}) };
    setError(null); onPending(true);
    startTransition(async () => {
      try { const result = await saveTimeAction(input); if ("error" in result) setError(result.error); else onSaved(); }
      catch { setError("unavailable"); } finally { onPending(false); }
    });
  }
  return <form onSubmit={submit} className="space-y-4">
    {!projects.length ? <p role="status" className="rounded-lg bg-muted p-3 text-sm">{fr ? "Aucun projet accessible pour saisir du temps." : "No accessible projects to log time on."}</p> : null}
    <fieldset disabled={pending || !projects.length} className="space-y-4">
      <label htmlFor="time-project" className="grid gap-2 text-sm font-medium">{fr ? "Projet" : "Project"}<select className={selectClass} id="time-project" name="project_id" value={projectId} required onChange={event => { setProjectId(event.target.value); setMission(""); setFavorite(false); }}><option value="" disabled>{fr ? "Choisir un projet" : "Choose a project"}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <div className="grid gap-2"><label htmlFor="time-mission" className="text-sm font-medium">{fr ? "Mission / tâche" : "Mission / task"}</label><div className="flex gap-2"><Input id="time-mission" name="mission" value={mission} onChange={event => { setMission(event.target.value); setFavorite(favorites.some(item => item.project_id === projectId && item.mission === event.target.value)); }} maxLength={200} required placeholder={fr ? "Ex. Mission A — audit du dossier" : "E.g. Mission A — file review"} list="time-missions" autoComplete="off" /><Button type="button" size="icon" variant="secondary" disabled={!projectId || !mission.trim() || favoritePending} aria-label={favorite ? (fr ? "Retirer des favoris" : "Remove from favorites") : (fr ? "Ajouter aux favoris" : "Add to favorites")} title={favorite ? (fr ? "Retirer des favoris" : "Remove from favorites") : (fr ? "Ajouter aux favoris" : "Add to favorites")} onClick={async () => { const next = !favorite; setFavoritePending(true); const result = await setMissionFavoriteAction({ projectId, mission, favorite: next }); setFavoritePending(false); if ("error" in result) { setError("unavailable"); return; } setFavorite(next); }}><Star className={cn("size-4", favorite && "fill-amber-400 text-amber-500")} /></Button></div></div>
      <datalist id="time-missions">{suggestions.map(name => <option key={name} value={name} />)}</datalist>
      {suggestions.length ? <label htmlFor="existing-mission" className="grid gap-1 text-xs text-muted-foreground">{fr ? "Ou reprendre une mission existante" : "Or reuse an existing mission"}<select id="existing-mission" className={selectClass} value={suggestions.includes(mission) ? mission : ""} onChange={event => { if (event.target.value) { setMission(event.target.value); setFavorite(favorites.some(item => item.project_id === projectId && item.mission === event.target.value)); } }}><option value="">{fr ? "Choisir une mission" : "Choose a mission"}</option>{suggestions.map(name => <option key={name} value={name}>{name}</option>)}</select></label> : null}
      <div className="rounded-2xl border border-blue-500/10 bg-gradient-to-br from-blue-500/[.08] to-violet-500/[.05] p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-medium"><TimerReset className="size-4 text-primary" />{fr ? "Temps consacré ce jour" : "Time spent that day"}</p><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{formatDuration(hours * 60 + minutes)}</span></div><div className="mb-4 flex flex-wrap gap-2">{presets.map(duration => <button key={duration} type="button" onClick={() => selectDuration(duration)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5", hours * 60 + minutes === duration ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border bg-card hover:border-primary/40 hover:text-primary")}>{formatDuration(duration)}</button>)}</div><div className="grid grid-cols-2 gap-3">
        <label htmlFor="time-hours" className="grid gap-2 text-sm">{fr ? "Heures" : "Hours"}<Input id="time-hours" name="hours" type="number" min="0" max="24" step="1" value={hours} onChange={event => setHours(Number(event.target.value))} required /></label>
        <label htmlFor="time-minutes" className="grid gap-2 text-sm">Minutes<Input id="time-minutes" name="minutes" type="number" min="0" max="59" step="1" value={minutes} onChange={event => setMinutes(Number(event.target.value))} required /></label>
      </div></div>
      <label htmlFor="time-note" className="grid gap-2 text-sm font-medium">{fr ? "Détail du travail (facultatif)" : "Work details (optional)"}<Textarea id="time-note" name="note" maxLength={1000} defaultValue={entry?.note ?? ""} placeholder={fr ? "Ce qui a été réalisé ce jour…" : "What you worked on that day…"} className="min-h-20" /></label>
    </fieldset>
    {error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{errorMessages[error][fr ? 0 : 1]}</p> : null}
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>{fr ? "Annuler" : "Cancel"}</Button><Button type="submit" disabled={pending || !projects.length}><Save aria-hidden="true" />{pending ? (fr ? "Enregistrement…" : "Saving…") : (fr ? "Enregistrer" : "Save time")}</Button></div>
  </form>;
}
