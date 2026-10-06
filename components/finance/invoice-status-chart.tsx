"use client";

import { memo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartCard } from "@/components/dashboard/chart-card";
import type { InvoiceStatusPoint } from "@/types/finance";

const palette: Record<string, string> = {
  draft: "var(--chart-5)",
  sent: "var(--chart-2)",
  partially_paid: "var(--warning)",
  paid: "var(--success)",
  overdue: "var(--danger)",
  cancelled: "var(--chart-5)",
  archived: "var(--chart-5)",
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
                <Cell key={entry.status} fill={palette[entry.status] ?? "var(--chart-2)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              formatter={(value) => [Number(value ?? 0), "Count"]}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
          No invoice distribution is available in the current scope.
        </div>
      )}
    </ChartCard>
  );
}

export const InvoiceStatusChart = memo(InvoiceStatusChartComponent);
