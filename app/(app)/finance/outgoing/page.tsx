import Link from "next/link";
import { ArrowUpCircle, BellRing, CircleCheckBig, Repeat2, Wallet } from "lucide-react";

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
  const upcomingRenewals = transfers
    .filter((transfer) => transfer.renewal.enabled && transfer.renewal.next_due_date && transfer.status !== "cancelled")
    .sort((left, right) => left.renewal.next_due_date!.localeCompare(right.renewal.next_due_date!));

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

      <Card className="overflow-hidden border-indigo-200 bg-[linear-gradient(135deg,#eff6ff_0%,#f8f7ff_56%,#eef2ff_100%)] shadow-[var(--shadow-soft)] dark:border-indigo-400/20 dark:bg-[linear-gradient(135deg,#142843_0%,#171d2b_60%,#292044_100%)] dark:shadow-none">
        <CardContent className="px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-indigo-700 uppercase dark:text-indigo-200"><Repeat2 className="size-4" /> Engagements et renouvellements</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Vos paiements à anticiper</h2><p className="mt-1 text-sm text-muted-foreground">Les alertes apparaissent automatiquement à partir du délai choisi sur chaque paiement.</p></div>
            <div className="rounded-2xl border border-indigo-200 bg-white/70 px-4 py-3 text-center dark:border-indigo-400/20 dark:bg-white/[0.06]"><p className="text-2xl font-semibold text-indigo-700 dark:text-indigo-200">{upcomingRenewals.length}</p><p className="text-xs text-muted-foreground">renouvellement(s) suivi(s)</p></div>
          </div>
          {upcomingRenewals.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{upcomingRenewals.slice(0, 6).map((transfer) => <div key={transfer.id} className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-white/75 p-4 shadow-sm dark:border-indigo-400/15 dark:bg-white/[0.05]"><div><p className="font-semibold">{transfer.beneficiary_name}</p><p className="mt-1 text-xs text-muted-foreground">{transfer.transfer_reference} · alerte {transfer.renewal.reminder_days} jours avant</p></div><div className="text-right"><p className="text-sm font-semibold">{formatFinanceCurrency(transfer.amount, transfer.currency)}</p><p className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-200"><BellRing className="size-3" /> {formatDate(transfer.renewal.next_due_date!)}</p></div></div>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-indigo-200 bg-white/50 px-4 py-5 text-sm text-muted-foreground dark:border-indigo-400/20 dark:bg-white/[0.04]">Aucun renouvellement n’est encore enregistré. Modifiez un paiement existant ou créez-en un, puis activez « Paiement récurrent ou renouvellement ».</div>}
        </CardContent>
      </Card>

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
