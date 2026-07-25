import Link from "next/link";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { FinanceRiskItem } from "@/types/finance";

const severityMeta = {
  info: { icon: Info, tone: "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-100 dark:bg-sky-500/12 dark:border-sky-500/20" },
  warning: { icon: AlertTriangle, tone: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-100 dark:bg-amber-500/12 dark:border-amber-500/20" },
  critical: { icon: TriangleAlert, tone: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-100 dark:bg-rose-500/12 dark:border-rose-500/20" },
} as const;

export function FinanceRiskPanel({ items }: { items: FinanceRiskItem[] }) {
  return (
    <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
      <CardContent className="space-y-4 px-5 py-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Finance risks</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">Signals needing attention</h3>
        </div>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => {
              const meta = severityMeta[item.severity];
              const Icon = meta.icon;
              const content = (
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 transition-colors hover:bg-red-50 dark:border-red-400/20 dark:bg-red-500/10 dark:hover:bg-red-500/12">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex size-10 items-center justify-center rounded-2xl border ${meta.tone}`}>
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.amount ? (
                          <p className="text-sm font-semibold">{formatFinanceCurrency(item.amount, item.currency ?? "USD")}</p>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );

              return item.href ? (
                <Link key={item.id} href={item.href} className="block">
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No material finance risks are visible in the current scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
