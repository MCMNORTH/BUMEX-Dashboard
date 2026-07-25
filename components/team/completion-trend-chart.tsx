"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export function CompletionTrendChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const palette = ["#38bdf8", "#10b981", "#f59e0b", "#f43f5e"];

  return (
    <div className="rounded-[28px] border border-border/70 bg-card/72 p-5 backdrop-blur-xl">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Completion mix</p>
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
                contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
                formatter={(value) => [Number(value ?? 0), "Count"]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
            No completion distribution is available yet.
          </div>
        )}
      </div>
    </div>
  );
}
