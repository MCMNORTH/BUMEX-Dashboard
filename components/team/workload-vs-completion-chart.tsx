"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/dashboard/chart-card";

export function WorkloadVsCompletionChart({
  data,
}: {
  data: Array<{ name: string; workload: number; completed: number }>;
}) {
  return (
    <ChartCard
      title="Workload vs completion"
      description="Visible active workload compared with recent completed items by person."
      badge="Team"
      contentClassName="h-[320px]"
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="name" stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value) => [Number(value ?? 0), "Count"]}
            />
            <Bar dataKey="workload" fill="rgba(251,146,60,0.72)" radius={[10, 10, 0, 0]} />
            <Bar dataKey="completed" fill="rgba(16,185,129,0.76)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
          No workload-to-completion comparison is available yet.
        </div>
      )}
    </ChartCard>
  );
}
