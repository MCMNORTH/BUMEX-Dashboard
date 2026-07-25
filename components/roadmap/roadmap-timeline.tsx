import { MilestoneForm } from "@/components/roadmap/milestone-form";
import { RoadmapLane } from "@/components/roadmap/roadmap-lane";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoadmapFilterData, RoadmapPeriod, RoadmapProjectRecord, RoadmapView } from "@/types/milestone";

function groupProjects(projects: RoadmapProjectRecord[], view: RoadmapView) {
  if (view !== "client") {
    return [{ label: "Portfolio lanes", projects }];
  }

  const groups = new Map<string, RoadmapProjectRecord[]>();

  for (const project of projects) {
    const key = project.client?.name ?? "Internal programs";
    const current = groups.get(key) ?? [];
    current.push(project);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([label, groupProjects]) => ({
    label,
    projects: groupProjects,
  }));
}

export function RoadmapTimeline({
  projects,
  periods,
  filterData,
  canManage,
  summaryMode,
  returnTo,
  view,
}: {
  projects: RoadmapProjectRecord[];
  periods: RoadmapPeriod[];
  filterData: RoadmapFilterData;
  canManage: boolean;
  summaryMode: boolean;
  returnTo: string;
  view: RoadmapView;
}) {
  const groups = groupProjects(projects, view);

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Roadmap timeline</p>
          <CardTitle className="mt-2 text-2xl tracking-[-0.04em]">Project horizon and milestone flow</CardTitle>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Delivery lanes surface project duration, checkpoint timing, and health signals in a single executive planning view.
          </p>
        </div>
        {canManage ? <MilestoneForm mode="create" filterData={filterData} returnTo={returnTo} /> : null}
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[52rem] space-y-5">
            <div
              className="grid gap-3 rounded-[24px] border border-border/65 bg-background/34 px-4 py-4"
              style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(8rem, 1fr))` }}
            >
              {periods.map((period) => (
                <div key={period.key} className="rounded-2xl border border-border/50 bg-background/38 px-3 py-3 text-center">
                  <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{period.label}</p>
                </div>
              ))}
            </div>

            {projects.length ? (
              groups.map((group) => (
                <div key={group.label} className="space-y-4">
                  {view === "client" ? (
                    <div className="rounded-[22px] border border-border/60 bg-background/34 px-4 py-3">
                      <p className="text-sm font-semibold tracking-[-0.02em]">{group.label}</p>
                    </div>
                  ) : null}
                  {group.projects.map((project) => (
                    <RoadmapLane
                      key={project.id}
                      project={project}
                      periods={periods}
                      filterData={filterData}
                      canManage={canManage}
                      returnTo={returnTo}
                      summaryMode={summaryMode}
                    />
                  ))}
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center">
                <p className="text-base font-medium">No roadmap items match the current filters.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adjust the view or filters to surface projects and milestones in this planning horizon.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
