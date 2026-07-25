"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/dashboard/chart-card";
import type { VelocityPoint } from "@/types/team";

export function VelocityChart({ data }: { data: VelocityPoint[] }) {
  return (
    <ChartCard
      title="Team velocity trend"
      description="Completed delivery over recent weekly windows."
      badge="Performance"
      contentClassName="h-[320px]"
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value) => [Number(value ?? 0), "Completed"]}
            />
            <Bar dataKey="completed" fill="rgba(56,189,248,0.78)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
          No delivery trend data is available yet.
        </div>
      )}
    </ChartCard>
  );
}
