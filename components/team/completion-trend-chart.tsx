"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export function CompletionTrendChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5">
      <div>
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Completion mix</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Delivery distribution</h3>
      </div>
      <div className="mt-4 h-[280px]">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={66} outerRadius={104} paddingAngle={4}>
                {data.map((entry, index) => (
                  <Cell key={entry.label} fill={palette[index % palette.length]} />
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
            No completion distribution is available yet.
          </div>
        )}
      </div>
    </div>
  );
}
