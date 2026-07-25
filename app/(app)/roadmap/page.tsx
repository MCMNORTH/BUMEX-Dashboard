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
  const visibleMilestones = projects
    .flatMap((project) => project.milestones)
    .sort((left, right) => new Date(left.due_date).getTime() - new Date(right.due_date).getTime());
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

  return (
    <div className="space-y-6">
      <RoadmapToast />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow="Roadmap"
          title={
            summaryMode
              ? "High-level portfolio roadmap for governance and shareholder visibility."
              : "An executive roadmap surface for future delivery phases, milestones, and timing risk."
          }
          subtitle={
            summaryMode
              ? "Summary mode surfaces project horizon, progress, and health without exposing internal milestone detail."
              : "Track project lanes, milestone timing, and emerging delivery risk using the same connected project and ticket data that powers execution."
          }
        />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {summaryMode ? "High-level view" : "Connected to projects and tickets"}
        </Badge>
      </div>

      <div className="flex flex-col gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href={previousHref} className="flex size-11 items-center justify-center rounded-2xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Visible horizon</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">
              {periods[0].label} to {periods.at(-1)?.label}
            </p>
          </div>
          <Link href={nextHref} className="flex size-11 items-center justify-center rounded-2xl border border-border/65 bg-background/45 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-white">
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <Link href={todayHref} className="inline-flex h-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/12 px-4 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/18">
          Today
        </Link>
      </div>

      <RoadmapFilters filters={filters} filterData={filterData} view={view} period={period} />

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: FolderKanban,
            label: "Visible projects",
            value: formatNumber(summary.visibleProjects),
            detail: "Projects inside the current roadmap scope",
          },
          {
            icon: Flag,
            label: "Open milestones",
            value: formatNumber(summary.openMilestones),
            detail: "Planned and in-flight checkpoints",
          },
          {
            icon: AlertTriangle,
            label: "Delayed milestones",
            value: formatNumber(summary.delayedMilestones),
            detail: "Delivery points already marked as delayed",
          },
          {
            icon: CalendarRange,
            label: "Completed",
            value: formatNumber(summary.completedMilestones),
            detail: "Milestones already delivered in scope",
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
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

      <RoadmapTimeline
        projects={projects}
        periods={periods}
        filterData={filterData}
        canManage={canManage}
        summaryMode={summaryMode}
        returnTo={returnTo}
        view={view}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Upcoming milestones</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">Near-term checkpoints</h3>
            </div>
            {visibleMilestones.length ? (
              visibleMilestones.slice(0, 6).map((milestone) => (
                <div key={milestone.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{milestone.title}</p>
                      {!summaryMode && milestone.owner ? (
                        <p className="mt-1 text-xs text-muted-foreground">{milestone.owner.full_name}</p>
                      ) : null}
                    </div>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{formatRoadmapDate(milestone.due_date)}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No milestones are scheduled in the visible range.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Portfolio health</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">Priority programs in focus</h3>
            </div>
            {projects.length ? (
              projects
                .slice()
                .sort((left, right) => right.delayedMilestones - left.delayedMilestones || right.openMilestones - left.openMilestones)
                .slice(0, 5)
                .map((project) => (
                  <div key={project.id} className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.client?.name ?? "Internal"} / {project.nextMilestone ? `Next: ${project.nextMilestone.title}` : "No pending milestone"}
                        </p>
                      </div>
                      <ProjectHealthBadge health={project.health} />
                    </div>
                  </div>
                ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                No projects available in the selected roadmap scope.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!summaryMode ? (
        <ActivityFeed
          activities={milestoneActivity}
          title="Milestone activity"
          description="Creation, deadline, ownership, and completion changes across the visible roadmap."
        />
      ) : null}
    </div>
  );
}
