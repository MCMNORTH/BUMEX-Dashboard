import Link from "next/link";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { FinanceRiskItem } from "@/types/finance";

const severityMeta = {
  info: { icon: Info, tone: "text-primary bg-primary/10 border-primary/25 dark:bg-primary/12 dark:border-primary/20" },
  warning: { icon: AlertTriangle, tone: "text-warning bg-warning/10 border-warning/25 dark:bg-warning/12 dark:border-warning/20" },
  critical: { icon: TriangleAlert, tone: "text-danger bg-danger/10 border-danger/25 dark:bg-danger/12 dark:border-danger/20" },
} as const;

export function FinanceRiskPanel({ items }: { items: FinanceRiskItem[] }) {
  return (
    <Card className="border-border bg-card shadow-[var(--shadow-soft)]">
      <CardContent className="space-y-4 px-5 py-5">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Finance risks</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">Signals needing attention</h3>
        </div>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => {
              const meta = severityMeta[item.severity];
              const Icon = meta.icon;
              const content = (
                <div className="rounded-xl border border-danger/25 bg-danger/50 p-3 transition-colors hover:bg-danger/10 dark:border-danger/20 dark:bg-danger/10 dark:hover:bg-danger/12">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex size-10 items-center justify-center rounded-xl border ${meta.tone}`}>
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
          <div className="rounded-xl border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
            No material finance risks are visible in the current scope.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
