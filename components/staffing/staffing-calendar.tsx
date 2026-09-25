"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarCheck2, ChevronLeft, ChevronRight, FolderKanban, Gauge, UserRoundPlus, UsersRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getBumexEntity } from "@/lib/entities/config";
import { cn } from "@/lib/utils";
import type { StaffingAssignment, StaffingPerson, StaffingProject } from "@/types/staffing";

const DAY = 86_400_000;
function mondayOf(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value: string, fr: boolean) {
  return new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function tone(total: number) {
  if (total > 100) return "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-100";
  if (total >= 80) return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100";
  if (total > 0) return "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-100";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200";
}

export function StaffingCalendar({ people, projects, assignments, locale, search, entity, onAssign }: {
  people: StaffingPerson[];
  projects: StaffingProject[];
  assignments: StaffingAssignment[];
  locale: "fr" | "en";
  search: string;
  entity: string;
  onAssign: (personId: string) => void;
}) {
  const fr = locale === "fr";
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [axis, setAxis] = useState<"people" | "projects">("people");
  const [horizon, setHorizon] = useState<4 | 8 | 12>(8);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const weeks = useMemo(() => Array.from({ length: horizon }, (_, index) => {
    const start = new Date(anchor.getTime() + index * 7 * DAY);
    const end = new Date(start.getTime() + 6 * DAY);
    return { start, end, startIso: iso(start), endIso: iso(end) };
  }), [anchor, horizon]);
  const query = search.trim().toLowerCase();
  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? null;
  const selectedAssignments = assignments.filter((item) => item.user_id === selectedPersonId && !["cancelled", "completed"].includes(item.status));
  const currentIso = iso(new Date());
  const currentAllocation = selectedAssignments.filter((item) => item.start_date <= currentIso && item.end_date >= currentIso).reduce((sum, item) => sum + Number(item.allocation_percent), 0);
  const nextAvailability = selectedAssignments.filter((item) => item.end_date >= currentIso).sort((a, b) => b.end_date.localeCompare(a.end_date))[0]?.end_date ?? null;
  useEffect(() => {
    let saved: { axis?: "people" | "projects"; horizon?: 4 | 8 | 12 } = {};
    try {
      saved = JSON.parse(localStorage.getItem("bumex-staffing-calendar") ?? "{}") as typeof saved;
    } catch { /* Ignore an invalid local preference and keep safe defaults. */ }
    queueMicrotask(() => {
      if (saved.axis === "people" || saved.axis === "projects") setAxis(saved.axis);
      if (saved.horizon === 4 || saved.horizon === 8 || saved.horizon === 12) setHorizon(saved.horizon);
      setPreferencesReady(true);
    });
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem("bumex-staffing-calendar", JSON.stringify({ axis, horizon }));
  }, [preferencesReady, axis, horizon]);
  const visiblePeople = useMemo(() => people.filter((person) => {
    const personAssignments = assignments.filter((item) => item.user_id === person.id);
    const haystack = `${person.full_name} ${person.job_title ?? ""} ${person.department ?? ""} ${person.skills.join(" ")} ${personAssignments.map((item) => item.project?.name ?? "").join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!entity || person.entity_code === entity);
  }), [people, assignments, query, entity]);
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const projectAssignments = assignments.filter((item) => item.project_id === project.id);
    const haystack = `${project.name} ${projectAssignments.map((item) => `${item.person?.full_name ?? ""} ${item.project_role}`).join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!entity || project.entity_code === entity);
  }), [projects, assignments, query, entity]);

  const move = (amount: number) => setAnchor((current) => new Date(current.getTime() + amount * 7 * DAY));

  return (
    <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_30px_85px_-58px_rgba(15,23,42,.7)]">
      <header className="flex flex-col gap-3 border-b border-border/70 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-5 py-4 dark:from-blue-950/30 dark:via-background dark:to-violet-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">{fr ? "Calendrier de capacité" : "Capacity calendar"}</p><h2 className="mt-1 font-semibold">{axis === "people" ? (fr ? `${visiblePeople.length} collaborateurs · ${horizon} semaines` : `${visiblePeople.length} people · ${horizon} weeks`) : (fr ? `${visibleProjects.length} projets · ${horizon} semaines` : `${visibleProjects.length} projects · ${horizon} weeks`)}</h2></div>
        <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-border bg-card/75 p-1"><Button size="sm" variant={axis === "people" ? "primary" : "ghost"} onClick={() => setAxis("people")}><UsersRound className="size-4" />{fr ? "Collaborateurs" : "People"}</Button><Button size="sm" variant={axis === "projects" ? "primary" : "ghost"} onClick={() => setAxis("projects")}><FolderKanban className="size-4" />{fr ? "Projets" : "Projects"}</Button></div><div className="flex rounded-xl border border-border bg-card/75 p-1">{([4,8,12] as const).map(value => <Button key={value} size="sm" variant={horizon === value ? "primary" : "ghost"} onClick={() => setHorizon(value)}>{value === 4 ? (fr ? "1 mois" : "1 month") : value === 8 ? (fr ? "2 mois" : "2 months") : (fr ? "3 mois" : "3 months")}</Button>)}</div><Button variant="secondary" size="icon" onClick={() => move(-horizon)} aria-label={fr ? "Période précédente" : "Previous period"}><ChevronLeft className="size-4" /></Button><Button variant="secondary" onClick={() => setAnchor(mondayOf(new Date()))}>{fr ? "Aujourd’hui" : "Today"}</Button><Button variant="secondary" size="icon" onClick={() => move(horizon)} aria-label={fr ? "Période suivante" : "Next period"}><ChevronRight className="size-4" /></Button></div>
      </header>

      <div className="overflow-x-auto">
        <div style={{ minWidth: `${270 + horizon * 110}px` }}>
          <div className="grid border-b border-border/70 bg-muted/20" style={{ gridTemplateColumns: `270px repeat(${horizon}, minmax(110px, 1fr))` }}>
            <div className="sticky left-0 z-20 border-r border-border/70 bg-card px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{axis === "people" ? (fr ? "Collaborateur" : "Person") : (fr ? "Projet" : "Project")}</div>
            {weeks.map((week) => <div key={week.startIso} className="border-r border-border/60 px-3 py-3 text-center last:border-r-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { month: "short", timeZone: "UTC" }).format(week.start)}</p><p className="mt-1 text-sm font-bold">{new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", timeZone: "UTC" }).format(week.start)}–{new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", timeZone: "UTC" }).format(week.end)}</p></div>)}
          </div>

          {axis === "people" && visiblePeople.length ? visiblePeople.map((person) => (
            <div key={person.id} className="grid min-h-24 border-b border-border/60 last:border-b-0 hover:bg-primary/[.018]" style={{ gridTemplateColumns: `270px repeat(${horizon}, minmax(110px, 1fr))` }}>
              <button type="button" onClick={() => setSelectedPersonId(person.id)} className="sticky left-0 z-10 flex items-center gap-3 border-r border-border/70 bg-card px-4 py-3 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 dark:hover:bg-blue-950/20"><Avatar className="size-10"><AvatarFallback className="bg-gradient-to-br from-blue-500/15 to-violet-500/20 text-xs font-bold text-primary">{initials(person.full_name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.full_name}</p><p className="truncate text-xs text-muted-foreground">{person.job_title ?? (fr ? "Collaborateur" : "Employee")} · {getBumexEntity(person.entity_code)?.name ?? "—"}</p><p className="mt-1 text-[10px] font-medium text-primary">{person.weekly_capacity_hours}h / {fr ? "sem." : "week"} · {fr ? "Voir le profil" : "View profile"}</p></div></button>
              {weeks.map((week) => {
                const cellAssignments = assignments.filter((item) => item.user_id === person.id && !["cancelled", "completed"].includes(item.status) && item.start_date <= week.endIso && item.end_date >= week.startIso);
                const total = cellAssignments.reduce((sum, item) => sum + Number(item.allocation_percent), 0);
                return <div key={week.startIso} className="border-r border-border/50 p-2 last:border-r-0"><div className={cn("h-full min-h-16 rounded-xl border p-2 transition", tone(total))}><div className="flex items-center justify-between gap-1"><strong className="text-xs">{total ? `${total}%` : (fr ? "Libre" : "Free")}</strong>{total > 100 ? <span className="text-[9px] font-bold uppercase">{fr ? "Conflit" : "Conflict"}</span> : null}</div><div className="mt-1.5 space-y-1">{cellAssignments.slice(0, 2).map((item) => <p key={item.id} className="truncate text-[10px] font-medium" title={`${item.project?.name ?? "Project"} · ${item.allocation_percent}%`}>{item.project?.name ?? (fr ? "Projet" : "Project")} · {item.allocation_percent}%</p>)}{cellAssignments.length > 2 ? <p className="text-[10px] font-semibold">+{cellAssignments.length - 2}</p> : null}</div></div></div>;
              })}
            </div>
          )) : null}
          {axis === "projects" && visibleProjects.length ? visibleProjects.map((project) => (
            <div key={project.id} className="grid min-h-24 border-b border-border/60 last:border-b-0 hover:bg-primary/[.018]" style={{ gridTemplateColumns: `270px repeat(${horizon}, minmax(110px, 1fr))` }}>
              <div className="sticky left-0 z-10 flex items-center gap-3 border-r border-border/70 bg-card px-4 py-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-blue-500/15 text-violet-700 dark:text-violet-300"><FolderKanban className="size-5" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{project.name}</p><p className="truncate text-xs text-muted-foreground">{getBumexEntity(project.entity_code)?.name ?? "—"} · {project.status}</p><p className="mt-1 text-[10px] font-medium text-primary">{assignments.filter(item => item.project_id === project.id && !["cancelled", "completed"].includes(item.status)).length} {fr ? "affectation(s)" : "assignment(s)"}</p></div></div>
              {weeks.map((week) => {
                const cellAssignments = assignments.filter((item) => item.project_id === project.id && !["cancelled", "completed"].includes(item.status) && item.start_date <= week.endIso && item.end_date >= week.startIso);
                const total = cellAssignments.reduce((sum, item) => sum + Number(item.allocation_percent), 0);
                return <div key={week.startIso} className="border-r border-border/50 p-2 last:border-r-0"><div className={cn("h-full min-h-16 rounded-xl border p-2", cellAssignments.length ? "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100" : "border-dashed border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/[.06] dark:text-amber-200")}><div className="flex items-center justify-between gap-1"><strong className="text-xs">{cellAssignments.length ? `${cellAssignments.length} ${fr ? "pers." : "people"}` : (fr ? "À couvrir" : "Unstaffed")}</strong>{total ? <span className="text-[9px] font-bold">{total}%</span> : null}</div><div className="mt-1.5 space-y-1">{cellAssignments.slice(0, 2).map((item) => <p key={item.id} className="truncate text-[10px] font-medium" title={`${item.person?.full_name ?? "Person"} · ${item.allocation_percent}%`}>{item.person?.full_name ?? (fr ? "Collaborateur" : "Person")} · {item.allocation_percent}%</p>)}{cellAssignments.length > 2 ? <p className="text-[10px] font-semibold">+{cellAssignments.length - 2}</p> : null}</div></div></div>;
              })}
            </div>
          )) : null}
          {axis === "people" && !visiblePeople.length ? <div className="p-12 text-center text-sm text-muted-foreground">{fr ? "Aucun collaborateur ne correspond aux filtres." : "No person matches the filters."}</div> : null}
          {axis === "projects" && !visibleProjects.length ? <div className="p-12 text-center text-sm text-muted-foreground">{fr ? "Aucun projet ne correspond aux filtres." : "No project matches the filters."}</div> : null}
        </div>
      </div>

      <footer className="flex flex-wrap gap-4 border-t border-border/70 bg-muted/15 px-5 py-3 text-[11px] text-muted-foreground">{[["bg-emerald-400", fr ? "Disponible" : "Available"],["bg-blue-500", fr ? "Affecté" : "Allocated"],["bg-amber-500", fr ? "80–100 %" : "80–100%"],["bg-rose-500", fr ? "Surcharge" : "Over capacity"]].map(([color,label]) => <span key={label} className="flex items-center gap-2"><i className={cn("size-2.5 rounded-full", color)} />{label}</span>)}</footer>

      <Dialog open={Boolean(selectedPerson)} onOpenChange={(open) => !open && setSelectedPersonId(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {selectedPerson ? <><div className="bg-[linear-gradient(125deg,#071a37,#14538b_55%,#60258d)] px-7 py-6 text-white"><div className="flex items-center gap-4"><Avatar className="size-14 border border-white/25"><AvatarFallback className="bg-white/15 font-bold text-white">{initials(selectedPerson.full_name)}</AvatarFallback></Avatar><div><DialogTitle className="text-2xl">{selectedPerson.full_name}</DialogTitle><DialogDescription className="mt-1 text-blue-100/75">{selectedPerson.job_title ?? (fr ? "Collaborateur" : "Employee")} · {getBumexEntity(selectedPerson.entity_code)?.name ?? "—"}</DialogDescription></div></div></div>
          <div className="space-y-5 p-6"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-500/10"><Gauge className="size-4 text-blue-600" /><p className="mt-2 text-2xl font-bold">{currentAllocation}%</p><p className="text-xs text-muted-foreground">{fr ? "Charge actuelle" : "Current load"}</p></div><div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-400/20 dark:bg-violet-500/10"><BriefcaseBusiness className="size-4 text-violet-600" /><p className="mt-2 text-2xl font-bold">{selectedAssignments.length}</p><p className="text-xs text-muted-foreground">{fr ? "Affectations actives" : "Active assignments"}</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10"><CalendarCheck2 className="size-4 text-emerald-600" /><p className="mt-2 text-sm font-bold">{nextAvailability ? formatDate(nextAvailability, fr) : (fr ? "Disponible" : "Available")}</p><p className="mt-1 text-xs text-muted-foreground">{fr ? "Fin des missions connues" : "Known assignment end"}</p></div></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Compétences" : "Skills"}</p><div className="mt-2 flex flex-wrap gap-2">{selectedPerson.skills.length ? selectedPerson.skills.map((skill) => <span key={skill} className="rounded-full border border-primary/15 bg-primary/[.06] px-3 py-1.5 text-xs font-medium text-primary">{skill}</span>) : <span className="text-sm text-muted-foreground">{fr ? "Aucune compétence renseignée" : "No skills recorded"}</span>}</div></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Projets en cours ou à venir" : "Current and upcoming projects"}</p><div className="mt-2 space-y-2">{selectedAssignments.length ? selectedAssignments.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 px-4 py-3"><div><p className="text-sm font-semibold">{item.project?.name ?? (fr ? "Projet" : "Project")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.start_date, fr)} → {formatDate(item.end_date, fr)}</p></div><strong className="text-sm text-primary">{item.allocation_percent}%</strong></div>) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{fr ? "Cette personne n’a aucune affectation active." : "This person has no active assignment."}</p>}</div></div>
          <div className="flex justify-end"><Button onClick={() => { onAssign(selectedPerson.id); setSelectedPersonId(null); }}><UserRoundPlus className="size-4" />{fr ? "Affecter cette personne" : "Assign this person"}</Button></div></div></> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
