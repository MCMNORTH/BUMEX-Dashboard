import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, ClipboardList, FolderKanban, ShieldCheck, TrendingUp, UserRoundPlus, UserRoundX } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getProjects, getProjectsFilterData } from "@/lib/projects/service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectEmptyState } from "@/components/projects/project-empty-state";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectToast } from "@/components/projects/project-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/formatters";
import type { ProjectFilters as ProjectFiltersType } from "@/types/project";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  return (
    <div className="space-y-5">
      <ProjectToast />
      <Suspense fallback={<ProjectsPageFallback />}> 
        <ProjectsContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function ProjectsContent({
  searchParams,
  locale,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  locale: "fr" | "en";
}) {
  const auth = await requireRouteAccess("projects");
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};

  const filters: ProjectFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as ProjectFiltersType["status"]) ?? "",
    clientId: getString(params.client) ?? "",
    ownerId: getString(params.owner) ?? "",
    health: (getString(params.health) as ProjectFiltersType["health"]) ?? "",
    kind: (getString(params.kind) as ProjectFiltersType["kind"]) ?? "",
    deadline: (getString(params.deadline) as ProjectFiltersType["deadline"]) ?? "all",
  };

  const [projects, filterData] = await Promise.all([
    getProjects(filters),
    getProjectsFilterData(),
  ]);

  const canCreate = auth.role === "admin" || isManagerLikeRole(auth.role);
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const avgProgress = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
    : 0;
  const atRisk = projects.filter((project) => project.health === "at_risk" || project.health === "delayed").length;
  const dueSoon = projects.filter((project) => project.deadlineState === "due-soon").length;
  const attentionProjects = projects
    .map((project) => {
      const blockedTicket = project.tasks.find((task) => task.status === "blocked");
      if (project.health === "delayed") return { project, priority: 5, tone: "rose", Icon: AlertTriangle, label: isFr ? "Projet en retard" : "Project delayed", detail: isFr ? "L’échéance est dépassée et du travail reste ouvert." : "The deadline has passed while delivery work remains open.", href: `/projects/${project.id}` };
      if (blockedTicket) return { project, priority: 4, tone: "rose", Icon: AlertTriangle, label: isFr ? "Travail bloqué" : "Blocked work", detail: blockedTicket.title, href: `/tickets/${blockedTicket.id}` };
      if (project.health === "at_risk") return { project, priority: 3, tone: "amber", Icon: ShieldCheck, label: isFr ? "Santé à risque" : "Health at risk", detail: isFr ? "Des signaux opérationnels menacent la livraison." : "Operational signals are threatening delivery.", href: `/projects/${project.id}` };
      if (!project.owner_id) return { project, priority: 2, tone: "violet", Icon: UserRoundX, label: isFr ? "Responsable manquant" : "Missing owner", detail: isFr ? "Aucun pilote n’est désigné pour ce projet." : "No owner is assigned to this project.", href: `/projects/${project.id}` };
      if (project.deadlineState === "due-soon") return { project, priority: 1, tone: "blue", Icon: Clock3, label: isFr ? "Échéance proche" : "Due soon", detail: isFr ? "La date de livraison approche dans les sept jours." : "The delivery date is within the next seven days.", href: `/projects/${project.id}` };
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[linear-gradient(125deg,#071a37_0%,#144d88_52%,#63248f_100%)] px-7 py-7 text-white shadow-[0_32px_90px_-42px_rgba(37,99,235,.8)]">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl"><h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{isFr ? "Créez, équipez et pilotez chaque projet." : "Create, staff and steer every project."}</h1><p className="mt-3 text-sm leading-6 text-blue-100/80">{isFr ? "Une lecture immédiate des priorités, des responsables, de l’équipe et des échéances, du lancement jusqu’à la livraison." : "See priorities, ownership, team and deadlines at a glance, from launch to delivery."}</p></div>
          <div className="flex flex-wrap gap-2">{canCreate ? <Button asChild variant="secondary"><Link href="/staffing"><UserRoundPlus className="size-4" />{isFr ? "Ouvrir le Staffing" : "Open Staffing"}</Link></Button> : null}{canCreate ? <ProjectForm mode="create" filterData={filterData} /> : null}</div>
        </div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">{[(isFr ? "1 · Créer le cadre" : "1 · Define"),(isFr ? "2 · Staffer l’équipe" : "2 · Staff the team"),(isFr ? "3 · Suivre la livraison" : "3 · Track delivery")].map((step, index) => <div key={step} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[.08] px-4 py-3 text-xs font-semibold backdrop-blur"><span>{step}</span>{index < 2 ? <ArrowRight className="size-4 text-cyan-200" /> : <ShieldCheck className="size-4 text-emerald-300" />}</div>)}</div>
      </section>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[13px] text-muted-foreground">
            {auth.role === "shareholder"
              ? (isFr ? "Visibilité stratégique en lecture seule sur les programmes actifs, les tendances de santé et les initiatives liées aux clients." : "Read-only strategic visibility for active programs, health trends, and client-linked initiatives.")
              : auth.role === "employee"
                ? (isFr ? "Projets liés à vos tickets actuels, à vos échéances et à vos responsabilités d’exécution." : "Projects tied to your current tickets, deadlines, and execution responsibilities.")
                : (isFr ? "Vue opérationnelle en direct des projets actifs et de leur exécution." : "Live operational visibility across active projects and delivery execution.")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {[
          {
            icon: FolderKanban,
            label: isFr ? "Projets actifs" : "Active projects",
            value: formatNumber(activeProjects),
            detail: isFr ? "Initiatives de delivery en cours" : "Live delivery initiatives",
            href: "/projects?status=active",
          },
          {
            icon: TrendingUp,
            label: isFr ? "Progression moyenne" : "Average progress",
            value: `${avgProgress}%`,
            detail: isFr ? "Signal de complétion du portefeuille" : "Portfolio completion signal",
            href: "/projects",
          },
          {
            icon: ShieldCheck,
            label: isFr ? "À risque" : "At risk",
            value: formatNumber(atRisk),
            detail: isFr ? "Programmes nécessitant de l’attention" : "Programs needing attention",
            href: "/projects?health=attention",
          },
          {
            icon: ClipboardList,
            label: isFr ? "Échéance proche" : "Due soon",
            value: formatNumber(dueSoon),
            detail: isFr ? "Échéances dans les 7 jours" : "Deadlines inside 7 days",
            href: "/projects?deadline=this_week",
          },
        ].map(({ icon: Icon, label, value, detail, href }) => {
          const critical = label === "At risk" || label === "À risque";

          return (
          <Link key={label} href={href} aria-label={`${label}: ${value}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card
            className={`relative h-full overflow-hidden border shadow-[var(--shadow-soft)] transition group-hover:-translate-y-0.5 group-hover:shadow-lg dark:border-slate-700 dark:shadow-none ${critical ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/65 dark:to-orange-950/45" : "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/70"}`}
          >
            <CardContent className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase dark:text-slate-300/80">{label}</p>
                  <p className="mt-1.5 text-[1.45rem] font-bold tracking-[-0.025em] dark:text-white">{value}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{detail}</p>
                </div>
                <div className={`flex size-8 items-center justify-center rounded-[14px] border ${critical ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-500/12" : "border-blue-200 bg-blue-50 dark:border-sky-400/20 dark:bg-sky-500/12"}`}>
                  <Icon className={`size-4 ${critical ? "text-red-600" : "text-primary"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          </Link>
          );
        })}
      </div>

      {attentionProjects.length ? <section className="overflow-hidden rounded-[26px] border border-border/70 bg-card/85 shadow-[0_24px_70px_-52px_rgba(15,23,42,.7)]" aria-labelledby="project-attention-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/65 bg-gradient-to-r from-rose-500/[.08] via-amber-400/[.05] to-transparent px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-rose-700 dark:text-rose-300">{isFr ? "À traiter maintenant" : "Needs attention"}</p><h2 id="project-attention-title" className="mt-1 text-lg font-semibold">{isFr ? "Priorités du portefeuille" : "Portfolio priorities"}</h2><p className="mt-1 text-xs text-muted-foreground">{isFr ? "Les signaux les plus importants, classés par urgence." : "The most important signals, ranked by urgency."}</p></div><Badge variant="secondary" className="rounded-full px-3 py-1">{attentionProjects.length} {isFr ? "signal(s)" : "signal(s)"}</Badge></div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">{attentionProjects.map(({ project, tone, Icon, label, detail, href }) => <Link key={project.id} href={href} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${tone === "rose" ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/20 dark:to-orange-950/10" : tone === "amber" ? "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-yellow-950/10" : tone === "violet" ? "border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:border-violet-500/20 dark:from-violet-950/20 dark:to-fuchsia-950/10" : "border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 dark:border-blue-500/20 dark:from-blue-950/20 dark:to-cyan-950/10"}`}><div className="flex items-start justify-between gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background/80 shadow-sm"><Icon className={`size-4 ${tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : tone === "violet" ? "text-violet-600" : "text-blue-600"}`} /></span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-4 truncate text-sm font-semibold">{project.name}</p><p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p></Link>)}</div>
      </section> : null}

      <ProjectFilters filters={filters} filterData={filterData} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Portefeuille" : "Portfolio"}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{isFr ? "Liste des projets" : "Project list"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {formatNumber(projects.length)} {isFr ? "résultats" : "results"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4">
        {projects.length ? projects.map((project) => <ProjectCard key={project.id} project={project} />) : <ProjectEmptyState />}
      </div>
    </>
  );
}

function ProjectsPageFallback() {
  return (
    <div className="space-y-6" aria-label="Loading projects">
      <div className="flex justify-end">
        <Skeleton className="h-12 w-40 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/48">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="size-11 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="flex flex-wrap gap-3 px-5 py-5">
          <Skeleton className="h-12 min-w-64 flex-1 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-32 rounded-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
            <CardContent className="space-y-5 px-5 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <Skeleton className="h-7 w-52" />
                  <Skeleton className="h-4 w-96 max-w-full" />
                </div>
                <Skeleton className="size-12 rounded-2xl" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-28 rounded-[22px]" />
                <Skeleton className="h-28 rounded-[22px]" />
                <Skeleton className="h-28 rounded-[22px]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


