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
            className={`relative overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] border-t-2 dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none ${
              critical ? "border-t-red-500" : "border-t-blue-500"
            }`}
          >
            <CardContent className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase dark:text-slate-300/80">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.025em] dark:text-white">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
                </div>
                <div className={`flex size-9 items-center justify-center rounded-xl border ${critical ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-500/12" : "border-blue-200 bg-blue-50 dark:border-sky-400/20 dark:bg-sky-500/12"}`}>
                  <Icon className={`size-4.5 ${critical ? "text-red-600" : "text-primary"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
