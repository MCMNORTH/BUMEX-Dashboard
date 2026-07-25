"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamWorkloadRecord } from "@/types/team";

function getColor(utilization: number) {
  if (utilization > 1) {
    return "rgba(244,63,94,0.78)";
  }

  if (utilization >= 0.75) {
    return "rgba(245,158,11,0.76)";
  }

  return "rgba(56,189,248,0.75)";
}

export function WorkloadHeatmap({
  workload,
  title = "Workload heatmap",
  description = "Relative capacity usage across the visible team.",
}: {
  workload: TeamWorkloadRecord[];
  title?: string;
  description?: string;
}) {
  if (!workload.length) {
    return (
      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No workload distribution is visible in the current scope.
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = workload.map((member) => ({
    name: member.full_name,
    size: Math.max(member.estimated_hours_total, 2),
    utilization: member.utilization_percentage,
    fill: getColor(member.utilization),
  }));

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data} dataKey="size" stroke="rgba(148,163,184,0.18)" fill="rgba(56,189,248,0.6)">
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value, _name, item) => [`${item.payload?.utilization ?? 0}% utilization`, item.payload?.name ?? "Member"]}
            />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
