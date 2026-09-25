"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Beaker, Check, CloudCheck, Download, Lightbulb, Layers3, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getBumexEntity } from "@/lib/entities/config";
import { cn } from "@/lib/utils";
import type { StaffingAssignment, StaffingPerson, StaffingProject } from "@/types/staffing";

export function StaffingScenarioLab({ projects, people, assignments, locale, onChoose }: {
  projects: StaffingProject[];
  people: StaffingPerson[];
  assignments: StaffingAssignment[];
  locale: "fr" | "en";
  onChoose: (projectId: string, personId: string, allocation: number, startDate: string, endDate: string) => void;
}) {
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [skills, setSkills] = useState("");
  const [allocation, setAllocation] = useState(50);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [scenario, setScenario] = useState<Array<{ id: string; projectId: string; projectName: string; personId: string; personName: string; allocation: number; projected: number; score: number; startDate: string; endDate: string }>>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("bumex-staffing-scenario-v1");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object" && "projectId" in item && "personId" in item && "allocation" in item && "startDate" in item && "endDate" in item);
      }
    } catch {
      window.localStorage.removeItem("bumex-staffing-scenario-v1");
    }
    return [];
  });

  useEffect(() => {
    if (scenario.length) window.localStorage.setItem("bumex-staffing-scenario-v1", JSON.stringify(scenario));
    else window.localStorage.removeItem("bumex-staffing-scenario-v1");
  }, [scenario]);
  const project = projects.find((item) => item.id === projectId);
  const datesOrdered = Boolean(startDate && endDate && startDate <= endDate);
  const periodWithinProject = Boolean(!project || ((!project.start_date || startDate >= project.start_date) && (!project.end_date || endDate <= project.end_date)));
  const validPeriod = datesOrdered && periodWithinProject;
  const requestedSkills = useMemo(() => skills.split(",").map((skill) => skill.trim().toLowerCase()).filter(Boolean), [skills]);
  const candidates = people.filter((person) => person.availability_status !== "inactive").map((person) => {
    const liveLoad = assignments.filter((item) => item.user_id === person.id && item.status === "confirmed" && item.start_date <= endDate && item.end_date >= startDate).reduce((sum, item) => sum + Number(item.allocation_percent), 0);
    const simulatedLoad = scenario.filter((item) => item.personId === person.id && item.id !== `${projectId}:${person.id}:${startDate}:${endDate}` && item.startDate <= endDate && item.endDate >= startDate).reduce((sum, item) => sum + item.allocation, 0);
    const currentLoad = liveLoad + simulatedLoad;
    const normalizedSkills = person.skills.map((skill) => skill.toLowerCase());
    const matched = requestedSkills.filter((skill) => normalizedSkills.some((known) => known.includes(skill) || skill.includes(known)));
    const skillRate = requestedSkills.length ? Math.round((matched.length / requestedSkills.length) * 100) : 100;
    const projected = currentLoad + allocation;
    const sameEntity = Boolean(project?.entity_code && project.entity_code === person.entity_code);
    const score = skillRate * .5 + Math.max(0, 100 - projected) * .3 + (sameEntity ? 20 : 0);
    return { person, currentLoad, projected, sameEntity, skillRate, matched, score };
  }).filter((item) => validPeriod && item.projected <= 100).sort((a, b) => b.score - a.score).slice(0, 6);
  const scenarioHours = scenario.reduce((sum, item) => sum + Math.round(40 * item.allocation / 100), 0);
  const scenarioPeople = new Set(scenario.map((item) => item.personId)).size;
  const scenarioLoads = Object.fromEntries([...new Set(scenario.map((item) => item.personId))].map((personId) => {
    const personScenarios = scenario.filter((item) => item.personId === personId);
    const peak = personScenarios.reduce((highest, period) => {
      const live = assignments.filter((item) => item.user_id === personId && item.status === "confirmed" && item.start_date <= period.endDate && item.end_date >= period.startDate).reduce((sum, item) => sum + Number(item.allocation_percent), 0);
      const simulated = personScenarios.filter((item) => item.startDate <= period.endDate && item.endDate >= period.startDate).reduce((sum, item) => sum + item.allocation, 0);
      return Math.max(highest, live + simulated);
    }, 0);
    return [personId, peak];
  }));
  const remainingCapacity = Object.values(scenarioLoads).reduce((sum, load) => sum + Math.max(0, 100 - load), 0);
  const scenarioAverageScore = scenario.length ? Math.round(scenario.reduce((sum, item) => sum + item.score, 0) / scenario.length) : 0;
  const tenseOptions = scenario.filter((item) => scenarioLoads[item.personId] >= 90).length;
  const scenarioHealth = Math.max(0, Math.min(100, Math.round(scenarioAverageScore * .7 + (scenarioPeople ? remainingCapacity / scenarioPeople : 0) * .3)));
  const healthLabel = scenarioHealth >= 80 ? (fr ? "Excellent équilibre" : "Excellent balance") : scenarioHealth >= 65 ? (fr ? "Scénario solide" : "Solid scenario") : (fr ? "À consolider" : "Needs review");
  const crossEntityOptions = scenario.filter((item) => {
    const scenarioProject = projects.find((projectItem) => projectItem.id === item.projectId);
    const scenarioPerson = people.find((personItem) => personItem.id === item.personId);
    return Boolean(scenarioProject?.entity_code && scenarioPerson?.entity_code && scenarioProject.entity_code !== scenarioPerson.entity_code);
  }).length;
  const advice = [
    tenseOptions
      ? { tone: "amber", title: fr ? "Alléger les zones sous tension" : "Ease pressure points", body: fr ? `${tenseOptions} collaborateur(s) atteignent au moins 90 %. Testez un taux inférieur ou répartissez la mission.` : `${tenseOptions} employee(s) reach at least 90%. Try a lower rate or split the assignment.` }
      : { tone: "emerald", title: fr ? "Capacité bien répartie" : "Capacity is well balanced", body: fr ? "Aucun collaborateur du scénario n'approche de la surcharge." : "No employee in this scenario is approaching overload." },
    scenarioAverageScore < 70
      ? { tone: "amber", title: fr ? "Renforcer l’adéquation" : "Improve the fit", body: fr ? "Précisez les compétences recherchées ou comparez d’autres profils avant validation." : "Refine the required skills or compare other people before approval." }
      : { tone: "blue", title: fr ? "Adéquation convaincante" : "Strong fit", body: fr ? `Le score moyen des profils retenus atteint ${scenarioAverageScore} points.` : `The average fit score reaches ${scenarioAverageScore} points.` },
    crossEntityOptions
      ? { tone: "violet", title: fr ? "Mobilité entre entités" : "Cross-entity mobility", body: fr ? `${crossEntityOptions} option(s) mobilisent une autre entité. Vérifiez l’accord du responsable concerné.` : `${crossEntityOptions} option(s) involve another entity. Check with the relevant manager.` }
      : { tone: "blue", title: fr ? "Équipe dans son périmètre" : "Team within its scope", body: fr ? "Toutes les propositions restent dans l’entité de leur projet." : "All proposals remain within their project's entity." },
  ];

  const addToScenario = (candidate: (typeof candidates)[number]) => {
    if (!project) return;
    const option = { id: `${project.id}:${candidate.person.id}:${startDate}:${endDate}`, projectId: project.id, projectName: project.name, personId: candidate.person.id, personName: candidate.person.full_name, allocation, projected: candidate.projected, score: Math.round(candidate.score), startDate, endDate };
    setScenario((current) => [...current.filter((item) => item.id !== option.id), option]);
  };

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    const nextProject = projects.find((item) => item.id === nextProjectId);
    if (nextProject?.start_date) setStartDate(nextProject.start_date);
    if (nextProject?.end_date) setEndDate(nextProject.end_date);
  };

  const exportScenario = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const headers = fr
      ? ["Projet", "Collaborateur", "Début", "Fin", "Taux proposé", "Heures par semaine", "Charge finale", "Score d'adéquation"]
      : ["Project", "Employee", "Start", "End", "Proposed allocation", "Hours per week", "Final load", "Fit score"];
    const rows = scenario.map((item) => [item.projectName, item.personName, item.startDate, item.endDate, `${item.allocation}%`, Math.round(40 * item.allocation / 100), `${scenarioLoads[item.personId]}%`, item.score]);
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `scenario-staffing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="secondary"><Beaker className="size-4" />{fr ? "Simuler" : "Simulate"}</Button></DialogTrigger>
    <DialogContent className="max-w-5xl overflow-hidden p-0"><div className="bg-[linear-gradient(125deg,#071a37,#164987_55%,#59278a)] px-7 py-6 text-white"><DialogTitle className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-cyan-200" />{fr ? "Laboratoire de staffing" : "Staffing scenario lab"}</DialogTitle><DialogDescription className="mt-2 text-blue-100/75">{fr ? "Comparez plusieurs options et construisez un scénario sans modifier le planning réel." : "Compare options and build a scenario without changing the live plan."}</DialogDescription></div>
      <div className="grid max-h-[75vh] gap-5 overflow-y-auto p-6"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="grid gap-1 text-xs font-semibold">{fr ? "Projet" : "Project"}<select value={projectId} onChange={(event) => selectProject(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal">{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Début" : "Start"}<input type="date" min={project?.start_date ?? undefined} max={project?.end_date ?? undefined} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Fin" : "End"}<input type="date" min={startDate || project?.start_date || undefined} max={project?.end_date ?? undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Compétences recherchées" : "Required skills"}<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder={fr ? "Audit, Excel, gestion de projet…" : "Audit, Excel, project management…"} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold">{fr ? "Taux à simuler" : "Allocation to simulate"}<div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3"><input type="range" min="10" max="100" step="10" value={allocation} onChange={(event) => setAllocation(Number(event.target.value))} className="flex-1 accent-violet-600" /><strong>{allocation}%</strong></div></label></div>
      <div><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-700 dark:text-violet-300">{fr ? "Comparaison" : "Comparison"}</p><h3 className="mt-1 font-semibold">{candidates.length} {fr ? "option(s) réalisable(s)" : "feasible option(s)"}</h3></div><p className="text-xs text-muted-foreground">{project ? getBumexEntity(project.entity_code)?.name : ""}</p></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{candidates.length ? candidates.map((item, index) => <article key={item.person.id} className={cn("rounded-2xl border p-4", index === 0 ? "border-violet-300 bg-gradient-to-br from-violet-50 to-blue-50 ring-2 ring-violet-500/10 dark:border-violet-400/30 dark:from-violet-950/20 dark:to-blue-950/20" : "border-border bg-card")}><div className="flex items-center justify-between"><span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">#{index + 1} · {Math.round(item.score)} pts</span>{index === 0 ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{fr ? "Meilleur équilibre" : "Best balance"}</span> : null}</div><p className="mt-3 font-semibold">{item.person.full_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.person.job_title ?? (fr ? "Collaborateur" : "Employee")} · {item.sameEntity ? (fr ? "Même entité" : "Same entity") : (fr ? "Autre entité" : "Other entity")}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-muted/45 p-2"><p className="text-muted-foreground">{fr ? "Compétences" : "Skills"}</p><strong>{item.skillRate}%</strong></div><div className={cn("rounded-xl p-2", item.projected >= 90 ? "bg-amber-500/10" : "bg-emerald-500/10")}><p className="text-muted-foreground">{fr ? "Charge future" : "Future load"}</p><strong>{item.projected}%</strong></div></div>{requestedSkills.length ? <p className="mt-2 truncate text-[10px] text-muted-foreground">{fr ? "Trouvées" : "Matched"} : {item.matched.join(", ") || "—"}</p> : null}<div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => addToScenario(item)}><Layers3 className="size-4" />{scenario.some((saved) => saved.id === `${projectId}:${item.person.id}:${startDate}:${endDate}`) ? (fr ? "Ajouté" : "Added") : (fr ? "Comparer" : "Compare")}</Button><Button type="button" size="sm" onClick={() => { onChoose(projectId, item.person.id, allocation, startDate, endDate); setOpen(false); }}><Check className="size-4" />{fr ? "Affecter" : "Assign"}</Button></div></article>) : <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 md:col-span-2 xl:col-span-3 dark:bg-amber-500/10 dark:text-amber-200">{validPeriod ? (fr ? "Aucun profil ne peut absorber ce taux sur cette période. Réduisez le taux simulé." : "No person can absorb this allocation during this period. Reduce the simulated rate.") : (fr ? "Corrigez la période pour afficher les profils disponibles." : "Correct the period to see available people.")}</div>}</div></div>
      {scenario.length ? <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-blue-50 to-violet-50 p-4 dark:border-cyan-500/20 dark:from-cyan-950/20 dark:via-blue-950/20 dark:to-violet-950/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold"><Layers3 className="size-4 text-cyan-700" />{fr ? "Scénario de travail" : "Working scenario"}</p><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{scenario.length} {fr ? "hypothèse(s) sécurisée(s)" : "secured option(s)"}</span><span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CloudCheck className="size-3.5" />{fr ? "Brouillon enregistré automatiquement" : "Draft saved automatically"}</span></div></div><div className="flex items-center gap-2"><Button type="button" variant="secondary" size="sm" onClick={exportScenario}><Download className="size-4" />{fr ? "Exporter le scénario" : "Export scenario"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setScenario([])}>{fr ? "Vider" : "Clear"}</Button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-white/70 p-3 dark:bg-background/50"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Collaborateurs" : "People"}</p><strong className="text-lg">{scenarioPeople}</strong></div><div className="rounded-xl bg-white/70 p-3 dark:bg-background/50"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Temps simulé" : "Simulated time"}</p><strong className="text-lg">{scenarioHours} h/{fr ? "sem." : "wk"}</strong></div><div className="rounded-xl bg-white/70 p-3 dark:bg-background/50"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{fr ? "Marge cumulée" : "Combined headroom"}</p><strong className="text-lg">{remainingCapacity}%</strong></div><div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200"><p className="text-[10px] font-semibold uppercase tracking-wider">{fr ? "Conflits" : "Conflicts"}</p><strong className="flex items-center gap-1 text-lg"><Check className="size-4" />0</strong></div></div><div className="mt-3 grid gap-3 rounded-xl border border-white/80 bg-white/65 p-3 dark:border-white/10 dark:bg-background/45 md:grid-cols-[auto_1fr_auto]"><div className={cn("grid size-14 place-items-center rounded-full text-lg font-bold ring-4", scenarioHealth >= 80 ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/10 dark:text-emerald-300" : scenarioHealth >= 65 ? "bg-blue-500/15 text-blue-700 ring-blue-500/10 dark:text-blue-300" : "bg-amber-500/15 text-amber-800 ring-amber-500/10 dark:text-amber-200")}>{scenarioHealth}</div><div><p className="font-semibold">{healthLabel}</p><p className="mt-1 text-xs text-muted-foreground">{fr ? "Indice combinant adéquation, charge future et marge disponible." : "Score combining fit, future load and remaining capacity."}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-600" style={{ width: `${scenarioHealth}%` }} /></div></div><div className={cn("rounded-lg px-3 py-2 text-center text-xs font-semibold", tenseOptions ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200")}><span className="block text-lg">{tenseOptions}</span>{fr ? "option(s) sous tension" : "option(s) under pressure"}</div></div><div className="mt-3 grid gap-2 md:grid-cols-3">{advice.map((item) => <div key={item.title} className={cn("rounded-xl border p-3", item.tone === "amber" ? "border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10" : item.tone === "emerald" ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/10" : item.tone === "violet" ? "border-violet-200 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/10" : "border-blue-200 bg-blue-50/80 dark:border-blue-500/20 dark:bg-blue-500/10")}><p className="flex items-center gap-1.5 text-xs font-semibold"><Lightbulb className="size-3.5" />{item.title}</p><p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{item.body}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">{fr ? "Chaque nouvelle option tient compte des affectations réelles et de toutes les hypothèses de ce scénario." : "Every new option includes live assignments and all options already in this scenario."}</p><div className="mt-3 grid gap-2">{scenario.map((item) => <div key={item.id} className="grid items-center gap-2 rounded-xl border border-white/80 bg-white/75 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-background/60 md:grid-cols-[1fr_1fr_auto_auto_auto]"><strong>{item.projectName}</strong><span><span className="block">{item.personName}</span><span className="text-[10px] text-muted-foreground">{item.startDate} → {item.endDate}</span></span><span className={cn("rounded-full px-2 py-1 text-xs font-semibold", scenarioLoads[item.personId] >= 90 ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-blue-500/10 text-blue-700 dark:text-blue-300")}>{item.allocation}% · {scenarioLoads[item.personId]}% {fr ? "après" : "after"}</span><Button type="button" size="sm" onClick={() => { onChoose(item.projectId, item.personId, item.allocation, item.startDate, item.endDate); setOpen(false); }}>{fr ? "Préparer" : "Prepare"}<ArrowRight className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={fr ? "Retirer" : "Remove"} onClick={() => setScenario((current) => current.filter((saved) => saved.id !== item.id))}><Trash2 className="size-4" /></Button></div>)}</div></section> : null}</div>
    </DialogContent>
  </Dialog>;
}
