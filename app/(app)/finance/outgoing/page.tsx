import Link from "next/link";
import { ArrowUpCircle, CircleCheckBig, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFinanceOperationsAccess } from "@/lib/auth/server";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { getTransferSummary, getTransfers, getTransfersFilterData } from "@/lib/finance/service";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { formatDate } from "@/lib/projects/helpers";

export default async function FinanceOutgoingPage() {
  const auth = await requireFinanceOperationsAccess();
  const locale = await getCurrentLocale();
  const dictionary = getDictionary(locale);
  const [filterData, transfers] = await Promise.all([
    getTransfersFilterData(),
    getTransfers(auth.role, {}),
  ]);

  const summary = getTransferSummary(transfers);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={getMessage(dictionary, "finance.outgoing.eyebrow", "Outgoing finance")}
          title={getMessage(dictionary, "finance.outgoing.title", "Everything related to money the company pays out.")}
          subtitle={getMessage(dictionary, "finance.outgoing.subtitle", "Track supplier payments, tools, services, salaries, and any other outgoing movement with a supporting proof file.")}
        />
        <TransferForm mode="create" filterData={filterData} triggerLabel={getMessage(dictionary, "finance.outgoing.actions.addOutgoingPayment", "Add outgoing payment")} returnPath="/finance/outgoing" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance">{getMessage(dictionary, "finance.outgoing.actions.backToFinance", "Back to finance")}</Link>
        </Button>
        <Button asChild variant="secondary" className="rounded-full px-4">
          <Link href="/finance/transfers">{getMessage(dictionary, "finance.outgoing.actions.fullOutgoingList", "Full outgoing list")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard icon={Wallet} label={getMessage(dictionary, "finance.outgoing.cards.plannedPending", "Planned + pending")} value={String(summary.plannedCount + summary.pendingCount)} detail={getMessage(dictionary, "finance.outgoing.cards.plannedPendingDetail", "Outgoing items not finalized yet")} />
        <SummaryCard icon={CircleCheckBig} label={getMessage(dictionary, "finance.outgoing.cards.confirmed", "Confirmed")} value={String(summary.confirmedCount)} detail={getMessage(dictionary, "finance.outgoing.cards.confirmedDetail", "Outgoing movements already confirmed")} />
        <SummaryCard icon={ArrowUpCircle} label={getMessage(dictionary, "finance.outgoing.cards.thisMonth", "This month")} value={formatFinanceCurrency(summary.totalOutgoingThisMonth, transfers[0]?.currency ?? "USD")} detail={getMessage(dictionary, "finance.outgoing.cards.thisMonthDetail", "Tracked outgoing amount for the month")} />
      </div>

      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="space-y-4 px-5 py-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{getMessage(dictionary, "finance.outgoing.sections.outgoingPayments", "Outgoing payments")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{getMessage(dictionary, "finance.outgoing.sections.latestExpenseMovements", "Latest expense movements")}</h2>
          </div>
          <div className="space-y-3">
            {transfers.slice(0, 8).map((transfer) => (
              <div key={transfer.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{transfer.transfer_reference}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {transfer.beneficiary_name} / {formatDate(transfer.transfer_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <TransferStatusBadge status={transfer.status} />
                      <TransferEntityBadge entity={transfer.entity} />
                    </div>
                    <p className="mt-2 text-sm font-semibold">{formatFinanceCurrency(transfer.amount, transfer.currency)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.05]">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
