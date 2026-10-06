"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamWorkloadRecord } from "@/types/team";

function getColor(utilization: number) {
  if (utilization > 1) {
    return "var(--danger)";
  }

  if (utilization >= 0.75) {
    return "var(--warning)";
  }

  return "var(--chart-2)";
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
      <Card className="border-border/70 bg-card">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
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
    <Card className="border-border/70 bg-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data} dataKey="size" stroke="rgba(148,163,184,0.18)" fill="var(--chart-2)">
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              formatter={(value, _name, item) => [`${item.payload?.utilization ?? 0}% utilization`, item.payload?.name ?? "Member"]}
            />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
