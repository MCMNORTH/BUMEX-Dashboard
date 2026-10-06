import { CircleCheckBig, Clock3, Landmark, TriangleAlert, Wallet, WalletCards } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { FinanceOverview } from "@/types/finance";

const icons = [WalletCards, Landmark, TriangleAlert, Wallet, Clock3, CircleCheckBig] as const;

export function FinanceOverviewCards({ overview }: { overview: FinanceOverview }) {
  return (
    <div className="grid gap-4 xl:grid-cols-6">
      {overview.kpiCards.map((card, index) => {
        const Icon = icons[index] ?? WalletCards;
        const critical =
          card.label.toLowerCase().includes("overdue") ||
          card.label.toLowerCase().includes("unpaid") ||
          card.label.toLowerCase().includes("risk");
        const value = card.currency
          ? formatFinanceCurrency(card.value, card.currency)
          : new Intl.NumberFormat("en-US").format(card.value);

        return (
          <Card
            key={card.label}
            className={`relative overflow-hidden border-border bg-card shadow-[var(--shadow-soft)] border-t-2 ${
              critical ? "border-t-danger" : "border-t-primary"
            }`}
          >
            <CardContent className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.025em] dark:text-white">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
                </div>
                <div className={`flex size-9 items-center justify-center rounded-xl border ${critical ? "border-danger/25 bg-danger/10 dark:border-danger/20 dark:bg-danger/12" : "border-primary/25 bg-primary/10 dark:border-primary/20 dark:bg-primary/12"}`}>
                  <Icon className={`size-4.5 ${critical ? "text-danger" : "text-primary"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
