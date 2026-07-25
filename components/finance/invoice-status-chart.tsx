"use client";

import { memo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartCard } from "@/components/dashboard/chart-card";
import type { InvoiceStatusPoint } from "@/types/finance";

const palette: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#38bdf8",
  partially_paid: "#f59e0b",
  paid: "#10b981",
  overdue: "#f43f5e",
  cancelled: "#71717a",
  archived: "#64748b",
};

function InvoiceStatusChartComponent({ data }: { data: InvoiceStatusPoint[] }) {
  return (
    <ChartCard
      title="Invoice status distribution"
      description="The current invoice portfolio split across draft, issued, overdue, and paid states."
      badge="Portfolio"
      contentClassName="h-[280px]"
    >
      {data.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius={70} outerRadius={108} paddingAngle={4}>
              {data.map((entry) => (
                <Cell key={entry.status} fill={palette[entry.status] ?? "#38bdf8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value) => [Number(value ?? 0), "Count"]}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
          No invoice distribution is available in the current scope.
        </div>
      )}
    </ChartCard>
  );
}

export const InvoiceStatusChart = memo(InvoiceStatusChartComponent);
