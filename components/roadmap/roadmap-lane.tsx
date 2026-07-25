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
}: {
  project: RoadmapProjectRecord;
  periods: RoadmapPeriod[];
  canManage: boolean;
  filterData: RoadmapFilterData;
  returnTo: string;
  summaryMode: boolean;
}) {
  const rangeStart = new Date(periods[0].start);
  const rangeEnd = new Date(periods.at(-1)?.end ?? periods[0].end);
  const laneWindow = getLaneWindow(project, rangeStart, rangeEnd);
  const barStart = getRangePercent(laneWindow.start, rangeStart, rangeEnd);
  const barEnd = getRangePercent(laneWindow.end, rangeStart, rangeEnd);
  const visibleMilestones = getVisibleMilestones(project, rangeStart, rangeEnd);

  return (
    <div className="rounded-[30px] border border-border/65 bg-background/36 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <ProjectHealthBadge health={project.health} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-border/65 bg-background/48">
                <FolderGit2 className="size-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.03em]">{project.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {project.client?.name ?? "Internal"} / {project.owner?.full_name ?? "No owner"}
                </p>
              </div>
            </div>
            {!summaryMode && project.description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{project.description}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Progress</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.progress}%</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Milestones</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.totalMilestones}</p>
          </div>
          <div className="rounded-2xl border border-border/65 bg-background/42 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Open</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{project.openMilestones}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-border/65 bg-card/64 p-4">
        <div className="relative h-20 overflow-hidden rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.03))]">
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
            {periods.map((period) => (
              <div key={period.key} className="border-r border-border/40 last:border-r-0" />
            ))}
          </div>

          <div
            className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.16),rgba(99,102,241,0.26),rgba(59,130,246,0.16))] shadow-[0_0_24px_rgba(59,130,246,0.18)]"
            style={{
              left: `${barStart}%`,
              width: `${Math.max(barEnd - barStart, 8)}%`,
            }}
          />

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
          {project.start_date ?? "Open start"} <ArrowRight className="size-3.5" /> {project.end_date ?? "Open end"}
        </span>
        <span className="flex items-center gap-1.5">
          <CircleAlert className="size-3.5" />
          {project.delayedMilestones} delayed milestones
        </span>
        {project.nextMilestone ? (
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Next: {project.nextMilestone.title}
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
          <div className="xl:col-span-2 rounded-[24px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No milestones inside the selected roadmap horizon.
          </div>
        )}
      </div>
    </div>
  );
}

