"use client";

import { memo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/dashboard/chart-card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { MonthlyFinancePoint } from "@/types/finance";

function CashFlowChartComponent({
  data,
  variant,
}: {
  data: MonthlyFinancePoint[];
  variant: "flow" | "expected-vs-received";
}) {
  if (!data.length) {
    return (
      <ChartCard
        title={variant === "flow" ? "Cash flow by month" : "Expected vs received"}
        description="Financial movement will appear here once invoice, payment, and transfer records accumulate."
        badge="Finance"
      >
        <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-8 text-sm text-muted-foreground">
          No finance chart data is available in the current scope.
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={variant === "flow" ? "Cash flow by month" : "Expected vs received"}
      description={
        variant === "flow"
          ? "Monthly operational inflow versus outgoing transfer activity."
          : "Collection expectations compared with actual receipts over time."
      }
      badge="Finance"
      contentClassName="h-[280px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        {variant === "flow" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="month" stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value) => formatFinanceCurrency(Number(value ?? 0), "USD")}
            />
            <Bar dataKey="inflow" name="Inflow" fill="rgba(56,189,248,0.78)" radius={[10, 10, 0, 0]} />
            <Bar dataKey="outflow" name="Outflow" fill="rgba(251,146,60,0.74)" radius={[10, 10, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="expectedGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="rgba(56,189,248,0.8)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="rgba(56,189,248,0.05)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="receivedGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="rgba(16,185,129,0.82)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="rgba(16,185,129,0.05)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="month" stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(148,163,184,0.55)" tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
            <Tooltip
              contentStyle={{ borderRadius: 20, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
              formatter={(value) => formatFinanceCurrency(Number(value ?? 0), "USD")}
            />
            <Area type="monotone" dataKey="expected" stroke="rgba(56,189,248,1)" fill="url(#expectedGradient)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="received" stroke="rgba(16,185,129,1)" fill="url(#receivedGradient)" strokeWidth={2.5} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}

export const CashFlowChart = memo(CashFlowChartComponent);
