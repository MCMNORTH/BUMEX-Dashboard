import { BanknoteArrowUp, Landmark, ReceiptText, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import type { ShareholderFinanceSummary as ShareholderFinanceSummaryData } from "@/types/finance";

export function ShareholderFinanceSummary({
  summary,
}: {
  summary: ShareholderFinanceSummaryData;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { icon: BanknoteArrowUp, label: "High-level revenue", value: summary.revenue, detail: "Visible received collections" },
        { icon: Landmark, label: "High-level expenses", value: summary.expenses, detail: "Visible outgoing transfers" },
        { icon: ReceiptText, label: "Unpaid invoices", value: summary.unpaidInvoices, detail: "Invoices awaiting full collection", integer: true },
        { icon: TrendingUp, label: "Net estimate", value: summary.netEstimate, detail: summary.projectProfitabilityPlaceholder },
      ].map(({ icon: Icon, label, value, detail, integer }) => {
        const critical = label.toLowerCase().includes("unpaid");

        return (
        <Card
          key={label}
          className={`relative overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] border-t-2 ${
            critical ? "border-t-red-500" : "border-t-blue-500"
          }`}
        >
          <CardContent className="min-h-32 px-5 py-4">
            <div className="flex h-full items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">{label}</p>
                <p className="mt-2 whitespace-nowrap text-2xl font-bold tracking-[-0.025em]">
                  {integer ? new Intl.NumberFormat("en-US").format(Number(value)) : formatFinanceCurrency(Number(value), "USD")}
                </p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</p>
              </div>
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${critical ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
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
