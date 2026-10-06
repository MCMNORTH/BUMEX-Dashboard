import { ArrowRight, CalendarClock, CircleAlert, FolderGit2 } from "lucide-react";

import { MilestoneMarker } from "@/components/roadmap/milestone-marker";
import { ProjectHealthBadge } from "@/components/projects/project-health-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Badge } from "@/components/ui/badge";
import { getLaneWindow, getRangePercent } from "@/lib/roadmap/helpers";
import type { RoadmapFilterData, RoadmapPeriod, RoadmapProjectRecord } from "@/types/milestone";

function getVisibleMilestones(project: RoadmapProjectRecord, rangeStart: Date, rangeEnd: Date) {
  return project.milestones.filter((milestone) => {
    const date = new Date(milestone.due_date);
    return date >= rangeStart && date <= rangeEnd;
  });
}

export function RoadmapLane({
  project,
  periods,
  canManage,
  filterData,
  returnTo,
  summaryMode,
  isFr = false,
}: {
  project: RoadmapProjectRecord;
  periods: RoadmapPeriod[];
  canManage: boolean;
  filterData: RoadmapFilterData;
  returnTo: string;
  summaryMode: boolean;
  isFr?: boolean;
}) {
  const rangeStart = new Date(periods[0].start);
  const rangeEnd = new Date(periods.at(-1)?.end ?? periods[0].end);
  const laneWindow = getLaneWindow(project, rangeStart, rangeEnd);
  const barStart = getRangePercent(laneWindow.start, rangeStart, rangeEnd);
  const barEnd = getRangePercent(laneWindow.end, rangeStart, rangeEnd);
  const visibleMilestones = getVisibleMilestones(project, rangeStart, rangeEnd);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <ProjectHealthBadge health={project.health} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border/65 bg-background/48">
                <FolderGit2 className="size-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.03em]">{project.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {project.client?.name ?? (isFr ? "Interne" : "Internal")} / {project.owner?.full_name ?? (isFr ? "Aucun responsable" : "No owner")}
                </p>
              </div>
            </div>
            {!summaryMode && project.description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{project.description}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Progression" : "Progress"}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.progress}%</p>
          </div>
          <div className="rounded-xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Jalons" : "Milestones"}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.totalMilestones}</p>
          </div>
          <div className="rounded-xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Ouverts" : "Open"}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.openMilestones}</p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-16 overflow-hidden rounded-lg border border-border bg-muted/30">
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
            {periods.map((period) => (
              <div key={period.key} className="border-r border-border/40 last:border-r-0" />
            ))}
          </div>

          {laneWindow.outside ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {laneWindow.outside === "before"
                ? (isFr ? "Ce projet s’est terminé avant la période affichée." : "This project ended before the period shown.")
                : (isFr ? "Ce projet commence après la période affichée." : "This project starts after the period shown.")}
            </p>
          ) : (
            /* Project duration, filled to its progress. */
            <div
              className="absolute top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full border border-primary/30 bg-primary/10"
              style={{
                left: `${barStart}%`,
                width: `${Math.max(barEnd - barStart, 2)}%`,
              }}
              title={`${project.progress}%`}
            >
              <div
                className={`h-full rounded-full ${
                  project.health === "delayed" ? "bg-danger" : project.progress >= 100 ? "bg-success" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
              />
            </div>
          )}

          {visibleMilestones.map((milestone) => (
            <div
              key={milestone.id}
              className="absolute inset-y-0"
              style={{ left: `${getRangePercent(new Date(milestone.due_date), rangeStart, rangeEnd)}%` }}
            >
              <MilestoneMarker
                milestone={milestone}
                canManage={canManage}
                filterData={filterData}
                returnTo={returnTo}
                compact
                summaryMode={summaryMode}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {project.start_date ?? (isFr ? "Début non défini" : "Open start")} <ArrowRight className="size-3.5" /> {project.end_date ?? (isFr ? "Fin non définie" : "Open end")}
        </span>
        <span className="flex items-center gap-1.5">
          <CircleAlert className="size-3.5" />
          {project.delayedMilestones} {isFr ? "jalon(s) en retard" : "delayed milestones"}
        </span>
        {project.nextMilestone ? (
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {isFr ? "Suivant :" : "Next:"} {project.nextMilestone.title}
          </Badge>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {visibleMilestones.length ? (
          visibleMilestones.slice(0, 4).map((milestone) => (
            <MilestoneMarker
              key={milestone.id}
              milestone={milestone}
              canManage={canManage}
              filterData={filterData}
              returnTo={returnTo}
              summaryMode={summaryMode}
            />
          ))
        ) : (
          <div className="xl:col-span-2 rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            {isFr ? "Aucun jalon dans l’horizon sélectionné." : "No milestones inside the selected roadmap horizon."}
          </div>
        )}
      </div>
    </div>
  );
}
