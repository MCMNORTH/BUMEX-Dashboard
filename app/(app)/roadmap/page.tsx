import Link from "next/link";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Flag, FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { RoadmapFilters } from "@/components/roadmap/roadmap-filters";
import { RoadmapTimeline } from "@/components/roadmap/roadmap-timeline";
import { RoadmapToast } from "@/components/roadmap/roadmap-toast";
import { MilestoneStatusBadge } from "@/components/roadmap/milestone-status-badge";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { formatNumber } from "@/lib/formatters";
import { formatRoadmapDate, getRoadmapRange, getRoadmapSummary, shiftRoadmapStart } from "@/lib/roadmap/helpers";
import { getMilestoneActivity, getRoadmapFilterData, getRoadmapProjects } from "@/lib/roadmap/service";
import type { RoadmapFilters as RoadmapFiltersType, RoadmapView } from "@/types/milestone";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("roadmap");
  const isFr = (await getCurrentLocale()) === "fr";
  const params = (await searchParams) ?? {};
  const view = (getString(params.view) as RoadmapView) || "month";
  const period = getString(params.period) ?? new Date().toISOString().slice(0, 10);
  const filters: RoadmapFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as RoadmapFiltersType["status"]) ?? "",
    projectId: getString(params.project) ?? "",
    clientId: getString(params.client) ?? "",
    ownerId: getString(params.owner) ?? "",
  };

  const [{ periods }, projects, filterData] = await Promise.all([
    Promise.resolve(getRoadmapRange(view, period)),
    getRoadmapProjects(filters),
    getRoadmapFilterData(),
  ]);

  const summaryMode = auth.role === "shareholder";
  const canManage = auth.role === "admin" || isManagerLikeRole(auth.role);
  const summary = getRoadmapSummary(projects);
  const today = new Date().toISOString().slice(0, 10);
  const visibleMilestones = projects.flatMap((project) => project.milestones);
  const upcomingMilestones = projects
    .flatMap((project) => project.milestones.map((milestone) => ({ ...milestone, projectId: project.id, projectName: project.name })))
    .filter((milestone) => milestone.due_date >= today && milestone.status !== "completed" && milestone.status !== "cancelled" && milestone.status !== "delayed")
    .sort((left, right) => new Date(left.due_date).getTime() - new Date(right.due_date).getTime());
  const delayedMilestones = projects
    .flatMap((project) => project.milestones.map((milestone) => ({ ...milestone, projectId: project.id, projectName: project.name })))
    .filter((milestone) => milestone.status === "delayed" || (milestone.due_date < today && milestone.status !== "completed" && milestone.status !== "cancelled"))
    .sort((left, right) => left.due_date.localeCompare(right.due_date))
    .slice(0, 4);
  const milestoneActivity = summaryMode
    ? []
    : await getMilestoneActivity(visibleMilestones.map((milestone) => milestone.id), 12);
  const baseSearch = new URLSearchParams();

  if (filters.search) baseSearch.set("search", filters.search);
  if (filters.status) baseSearch.set("status", filters.status);
  if (filters.projectId) baseSearch.set("project", filters.projectId);
  if (filters.clientId) baseSearch.set("client", filters.clientId);
  if (filters.ownerId) baseSearch.set("owner", filters.ownerId);
  baseSearch.set("view", view);

  const previousHref = `/roadmap?${new URLSearchParams({ ...Object.fromEntries(baseSearch.entries()), period: shiftRoadmapStart(view, period, -1) }).toString()}`;
  const nextHref = `/roadmap?${new URLSearchParams({ ...Object.fromEntries(baseSearch.entries()), period: shiftRoadmapStart(view, period, 1) }).toString()}`;
  const todayHref = `/roadmap?${new URLSearchParams({ ...Object.fromEntries(baseSearch.entries()), period: new Date().toISOString().slice(0, 10) }).toString()}`;
  const returnTo = `/roadmap?${new URLSearchParams({ ...Object.fromEntries(baseSearch.entries()), period }).toString()}`;
  const summaryFilterHref = (status?: RoadmapFiltersType["status"]) => {
    const search = new URLSearchParams(baseSearch);
    search.set("period", period);
    if (status) search.set("status", status);
    else search.delete("status");
    return `/roadmap?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <RoadmapToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow="Roadmap"
          title={
            summaryMode
              ? (isFr ? "Une roadmap portefeuille pour la gouvernance et visibilité des actionnaires." : "High-level portfolio roadmap for governance and shareholder visibility.")
              : (isFr ? "Une roadmap de pilotage pour les phases à venir, jalons et risques calendrier." : "An executive roadmap surface for future delivery phases, milestones, and timing risk.")
          }
          subtitle={
            summaryMode
              ? (isFr ? "Le mode synthèse affiche l’horizon, la progression et santé des projets sans exposer les détails internes." : "Summary mode surfaces project horizon, progress, and health without exposing internal milestone detail.")
              : (isFr ? "Suivez les projets, jalons et risques grâce aux données connectées des projets tickets." : "Track project lanes, milestone timing, and emerging delivery risk using the same connected ticket data that powers execution.")
          }
        />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {summaryMode ? (isFr ? "Vue de synthèse" : "High-level view") : (isFr ? "Connecté aux projets et tickets" : "Connected to projects and tickets")}
        </Badge>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href={previousHref} className="flex size-11 items-center justify-center rounded-xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Horizon visible" : "Visible horizon"}</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">
              {periods[0].label} {isFr ? "à" : "to"} {periods.at(-1)?.label}
            </p>
          </div>
          <Link href={nextHref} className="flex size-11 items-center justify-center rounded-xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <Link href={todayHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/12 px-4 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/18">
          {isFr ? "Aujourd’hui" : "Today"}
        </Link>
      </div>

      <RoadmapFilters filters={filters} filterData={filterData} view={view} period={period} />

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: FolderKanban,
            label: isFr ? "Projets visibles" : "Visible projects",
            value: formatNumber(summary.visibleProjects),
            detail: isFr ? "Projets inclus dans le périmètre de la roadmap" : "Projects inside the current roadmap scope",
            href: summaryFilterHref(),
          },
          {
            icon: Flag,
            label: isFr ? "Jalons ouverts" : "Open milestones",
            value: formatNumber(summary.openMilestones),
            detail: isFr ? "Points de contrôle planifiés ou en cours" : "Planned and in-flight checkpoints",
            href: summaryFilterHref("open"),
          },
          {
            icon: AlertTriangle,
            label: isFr ? "Jalons en retard" : "Delayed milestones",
            value: formatNumber(summary.delayedMilestones),
            detail: isFr ? "Jalons déjà signalés en retard" : "Delivery points already marked as delayed",
            href: summaryFilterHref("delayed"),
          },
          {
            icon: CalendarRange,
            label: isFr ? "Terminés" : "Completed",
            value: formatNumber(summary.completedMilestones),
            detail: isFr ? "Jalons déjà livrés dans le périmètre" : "Milestones already delivered in scope",
            href: summaryFilterHref("completed"),
          },
        ].map(({ icon: Icon, label, value, detail, href }) => (
          <Link key={label} href={href} aria-label={`${label}: ${value}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="surface-highlight relative h-full overflow-hidden border-border/70 bg-card transition group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-lg dark:group-hover:border-primary/30">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          </Link>
        ))}
      </div>

      {!summaryMode && delayedMilestones.length ? <section className="bg-danger/10 overflow-hidden rounded-xl border border-danger/25 shadow-[var(--shadow-soft)] dark:border-danger/20" aria-labelledby="roadmap-delay-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-danger/25 px-5 py-4 dark:border-danger/15"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-danger"><AlertTriangle className="size-3.5" />{isFr ? "Action requise" : "Action required"}</p><h2 id="roadmap-delay-title" className="mt-1 text-lg font-semibold">{isFr ? "Jalons à rattraper" : "Milestones to recover"}</h2><p className="mt-1 text-xs text-muted-foreground">{isFr ? "Jalons déclarés en retard ou dépassés sans clôture." : "Milestones marked delayed or past due without completion."}</p></div><Badge variant="secondary" className="rounded-full px-3 py-1">{delayedMilestones.length} {isFr ? "priorité(s)" : "priority item(s)"}</Badge></div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">{delayedMilestones.map((milestone) => <Link key={milestone.id} href={`/projects/${milestone.projectId}`} className="group rounded-xl border border-danger/25 bg-card p-4 transition hover:-translate-y-0.5 hover:border-danger/35 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-danger/20"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">{formatRoadmapDate(milestone.due_date)}</span><ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-3 line-clamp-2 text-sm font-semibold">{milestone.title}</p><p className="mt-2 truncate text-xs text-muted-foreground">{milestone.projectName}{milestone.owner ? ` · ${milestone.owner.full_name}` : ` · ${isFr ? "Sans responsable" : "Unassigned"}`}</p></Link>)}</div>
      </section> : null}

      <RoadmapTimeline
        projects={projects}
        periods={periods}
        filterData={filterData}
        canManage={canManage}
        summaryMode={summaryMode}
        returnTo={returnTo}
        view={view}
        isFr={isFr}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/70 bg-card">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Jalons à venir" : "Upcoming milestones"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Points de contrôle proches" : "Near-term checkpoints"}</h3>
            </div>
            {upcomingMilestones.length ? (
              upcomingMilestones.slice(0, 6).map((milestone) => (
                <Link key={milestone.id} href={`/projects/${milestone.projectId}`} className="group block rounded-xl border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-primary/30 dark:hover:bg-primary/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium">{milestone.title}<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                      <p className="mt-1 text-xs text-muted-foreground">{milestone.projectName}</p>
                      {!summaryMode && milestone.owner ? (
                        <p className="mt-1 text-xs text-muted-foreground">{milestone.owner.full_name}</p>
                      ) : null}
                    </div>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{formatRoadmapDate(milestone.due_date)}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                {isFr ? "Aucun jalon n’est planifié dans la période affichée." : "No milestones are scheduled in the visible range."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Santé du portefeuille" : "Portfolio health"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Programmes prioritaires" : "Priority programs in focus"}</h3>
            </div>
            {projects.length ? (
              projects
                .slice()
                .sort((left, right) => right.delayedMilestones - left.delayedMilestones || right.openMilestones - left.openMilestones)
                .slice(0, 5)
                .map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="group block rounded-xl border border-border/65 bg-background/38 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-primary/30 dark:hover:bg-primary/5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">{project.name}<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.client?.name ?? (isFr ? "Interne" : "Internal")} / {project.nextMilestone ? `${isFr ? "Suivant :" : "Next:"} ${project.nextMilestone.title}` : (isFr ? "Aucun jalon en attente" : "No pending milestone")}
                        </p>
                      </div>
                      <ProjectHealthBadge health={project.health} />
                    </div>
                  </Link>
                ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                {isFr ? "Aucun projet disponible dans le périmètre sélectionné." : "No projects available in the selected roadmap scope."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!summaryMode ? (
        <ActivityFeed
          activities={milestoneActivity}
          title={isFr ? "Activité des jalons" : "Milestone activity"}
          description={isFr ? "Créations, échéances, responsables et changements de statut dans la roadmap affichée." : "Creation, deadline, ownership, and completion changes across the visible roadmap."}
        />
      ) : null}
    </div>
  );
}
