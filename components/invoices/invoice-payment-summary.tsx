import { CreditCard, Receipt, Wallet } from "lucide-react";

import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatNumber } from "@/lib/formatters";
import type { InvoicePaymentSummary as InvoicePaymentSummaryType } from "@/types/finance";

export function InvoicePaymentSummary({
  summary,
  currency,
}: {
  summary: InvoicePaymentSummaryType;
  currency: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Metric icon={Wallet} label="Total paid" value={formatFinanceCurrency(summary.totalPaid, currency)} />
      <Metric icon={CreditCard} label="Remaining" value={formatFinanceCurrency(summary.remainingBalance, currency)} />
      <Metric icon={Receipt} label="Linked payments" value={formatNumber(summary.linkedPaymentsCount)} />
      <Card className="border-border/65 bg-background/38">
        <CardContent className="px-4 py-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Payment status</p>
          <div className="mt-3">
            <InvoiceStatusBadge status={summary.paymentStatus} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/65 bg-background/38">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <Icon className="size-3.5" />
          {label}
        </div>
        <p className="mt-3 text-lg font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
