"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { BankStatementForm } from "@/components/finance/bank-statement-form";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { useI18n } from "@/components/layout/i18n-provider";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentForm } from "@/components/payments/payment-form";
import { TransferForm } from "@/components/transfers/transfer-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatDate } from "@/lib/projects/helpers";
import type {
  BankStatementRecord,
  BankStatementSummary,
  InvoiceFiltersData,
  InvoiceRecord,
  InvoiceSummary,
  PaymentFiltersData,
  PaymentRecord,
  PaymentSummary,
  TransferFiltersData,
  TransferRecord,
  TransferSummary,
} from "@/types/finance";

type WorkspaceTab = "client" | "supplier" | "bank";
type Locale = "fr" | "en";

export function FinanceWorkspace({
  isAdmin,
  canManageIncomingFinance,
  canManageOutgoingFinance,
  canManageBankFinance,
  loadWarnings,
  invoices,
  invoiceSummary,
  invoiceFilterData,
  payments,
  paymentSummary,
  paymentFilterData,
  transfers,
  transferSummary,
  transferFilterData,
  bankStatements,
  bankSummary,
}: {
  isAdmin: boolean;
  canManageIncomingFinance: boolean;
  canManageOutgoingFinance: boolean;
  canManageBankFinance: boolean;
  loadWarnings: string[];
  invoices: InvoiceRecord[];
  invoiceSummary: InvoiceSummary;
  invoiceFilterData: InvoiceFiltersData | null;
  payments: PaymentRecord[];
  paymentSummary: PaymentSummary;
  paymentFilterData: PaymentFiltersData | null;
  transfers: TransferRecord[];
  transferSummary: TransferSummary;
  transferFilterData: TransferFiltersData | null;
  bankStatements: BankStatementRecord[];
  bankSummary: BankStatementSummary | null;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("client");
  const approvalCounts = useMemo(() => {
    const changesRequested = invoices.filter(hasActiveRevisionRequest).length;
    const pending = invoices.filter((invoice) => invoice.approval_status === "pending" && !hasActiveRevisionRequest(invoice)).length;
    const approved = invoices.filter((invoice) => invoice.approval_status === "approved" && invoice.approved_at);
    const now = new Date();
    const approvedThisMonth = approved.filter((invoice) => {
      const date = new Date(invoice.approved_at as string);
      return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
    }).length;
    const averageApprovalHours = approved.length
      ? approved.reduce((total, invoice) => total + Math.max(0, new Date(invoice.approved_at as string).getTime() - new Date(invoice.created_at).getTime()), 0) / approved.length / 3_600_000
      : 0;
    return { pending, changesRequested, approvedThisMonth, averageApprovalHours };
  }, [invoices]);

  const workspaceActions = useMemo(() => {
    if (activeTab === "client" && canManageIncomingFinance && invoiceFilterData) {
      return (
        <InvoiceForm
          mode="create"
          filterData={invoiceFilterData}
          triggerLabel={isFr ? "Nouvelle facture client" : "New client invoice"}
          returnPath="/finance"
        />
      );
    }

    if (activeTab === "supplier" && canManageOutgoingFinance && transferFilterData) {
      return (
        <TransferForm
          mode="create"
          filterData={transferFilterData}
          triggerLabel={isFr ? "Nouvelle facture fournisseur" : "New supplier invoice"}
          returnPath="/finance"
        />
      );
    }

    if (activeTab === "bank" && canManageBankFinance) {
      return <BankStatementForm />;
    }

    return null;
  }, [activeTab, canManageBankFinance, canManageIncomingFinance, canManageOutgoingFinance, invoiceFilterData, isFr, transferFilterData]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title={isFr ? "Finance structurée par espace métier." : "Finance organized by business area."}
        subtitle={
          isFr
            ? "Choisissez d'abord Clients, Fournisseurs ou Banques. Ensuite, l'interface ne montre que les actions utiles à cet espace."
            : "Choose Clients, Suppliers, or Banks first. The interface then shows only the actions relevant to that area."
        }
      />
      {workspaceActions ? <div className="flex justify-end">{workspaceActions}</div> : null}

      {loadWarnings.length ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-800 shadow-[0_12px_30px_rgba(217,119,6,0.08)] dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100 dark:shadow-none">
          {isFr
            ? "Certaines données finance n'ont pas pu être chargées. La page reste accessible et vous pouvez continuer, mais quelques blocs peuvent être incomplets."
            : "Some finance data could not be loaded. The page remains accessible and you can continue, but a few sections may be incomplete."}
        </div>
      ) : null}

      {isAdmin ? (
        <section className="relative overflow-hidden rounded-[32px] border border-indigo-200/80 bg-[linear-gradient(120deg,#172554,#312e81_52%,#6d28d9)] p-6 text-white shadow-[0_22px_60px_rgba(49,46,129,0.22)] dark:border-indigo-300/15">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 size-56 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20"><ShieldCheck className="size-6 text-cyan-200" /></div>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-cyan-200 uppercase">{isFr ? "Contrôle administratif" : "Administrative control"}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{isFr ? "Validations de factures" : "Invoice approvals"}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">{isFr ? "Traitez les factures avant leur téléchargement ou leur envoi au client." : "Review invoices before they can be downloaded or sent to clients."}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/finance/invoices?approval=pending" className="group flex min-w-52 items-center justify-between gap-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition hover:bg-white/16">
                <div><p className="text-xs text-indigo-100">{isFr ? "À valider" : "To approve"}</p><p className="mt-1 text-2xl font-semibold">{approvalCounts.pending}</p></div>
                <ShieldCheck className="size-5 text-cyan-200 transition group-hover:scale-110" />
              </Link>
              <Link href="/finance/invoices?approval=changes_requested" className="group flex min-w-52 items-center justify-between gap-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition hover:bg-white/16">
                <div><p className="text-xs text-indigo-100">{isFr ? "À corriger" : "Changes requested"}</p><p className="mt-1 text-2xl font-semibold">{approvalCounts.changesRequested}</p></div>
                <RotateCcw className="size-5 text-rose-200 transition group-hover:rotate-[-20deg]" />
              </Link>
              <Link href="/finance/invoices?approval=approved" className="group flex min-w-52 items-center justify-between gap-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition hover:bg-white/16">
                <div><p className="text-xs text-indigo-100">{isFr ? "Validées ce mois" : "Approved this month"}</p><p className="mt-1 text-2xl font-semibold">{approvalCounts.approvedThisMonth}</p></div>
                <CheckCircle2 className="size-5 text-emerald-200 transition group-hover:scale-110" />
              </Link>
              <Link href="/finance/invoices?approval=approved" className="group flex min-w-52 items-center justify-between gap-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur transition hover:bg-white/16">
                <div><p className="text-xs text-indigo-100">{isFr ? "Délai moyen" : "Average approval time"}</p><p className="mt-1 text-2xl font-semibold">{formatApprovalDuration(approvalCounts.averageApprovalHours, isFr)}</p></div>
                <Landmark className="size-5 text-violet-200 transition group-hover:scale-110" />
              </Link>
            </div>
          </div>
          <div className="relative mt-4 flex justify-end border-t border-white/10 pt-4">
            <Button asChild variant="secondary" className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <a href="/api/invoices/approval-report"><Download className="size-4" />{isFr ? "Exporter le rapport de validation" : "Export approval report"}</a>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[34px] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <TabButton active={activeTab === "client"} onClick={() => setActiveTab("client")} icon={ReceiptText} label={isFr ? "Clients" : "Clients"} />
            <TabButton active={activeTab === "supplier"} onClick={() => setActiveTab("supplier")} icon={WalletCards} label={isFr ? "Fournisseurs" : "Suppliers"} />
            <TabButton active={activeTab === "bank"} onClick={() => setActiveTab("bank")} icon={Building2} label={isFr ? "Banques" : "Banks"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <OverviewCard
              icon={ArrowDownCircle}
              title={isFr ? "Vue clients" : "Client view"}
              value={formatFinanceCurrency(paymentSummary.totalReceivedAmount, payments[0]?.currency ?? "USD")}
              detail={
                isFr
                  ? `${invoiceSummary.sentCount} facture(s) actives, ${payments.filter((payment) => payment.status === "reconciled").length} encaissement(s) validé(s)`
                  : `${invoiceSummary.sentCount} active invoice(s), ${payments.filter((payment) => payment.status === "reconciled").length} validated collection(s)`
              }
              tone="sky"
              active={activeTab === "client"}
              onClick={() => setActiveTab("client")}
              openLabel={isFr ? "Ouvrir l’espace clients" : "Open client area"}
            />
            <OverviewCard
              icon={ArrowUpCircle}
              title={isFr ? "Vue fournisseurs" : "Supplier view"}
              value={formatFinanceCurrency(transfers.reduce((sum, transfer) => sum + transfer.amount, 0), transfers[0]?.currency ?? "USD")}
              detail={
                isFr
                  ? `${transferSummary.confirmedCount} sortie(s) confirmée(s), ${transferSummary.plannedCount + transferSummary.pendingCount} à payer`
                  : `${transferSummary.confirmedCount} confirmed outflow(s), ${transferSummary.plannedCount + transferSummary.pendingCount} still to pay`
              }
              tone="amber"
              active={activeTab === "supplier"}
              onClick={() => setActiveTab("supplier")}
              openLabel={isFr ? "Ouvrir l’espace fournisseurs" : "Open supplier area"}
            />
            <OverviewCard
              icon={Landmark}
              title={isFr ? "Vue banques" : "Bank view"}
              value={String(bankSummary?.matchedLines ?? 0)}
              detail={
                isFr
                  ? `${bankSummary?.statementsCount ?? 0} relevé(s), ${bankSummary?.reviewLines ?? 0} ligne(s) à revoir`
                  : `${bankSummary?.statementsCount ?? 0} statement(s), ${bankSummary?.reviewLines ?? 0} line(s) to review`
              }
              tone="emerald"
              active={activeTab === "bank"}
              onClick={() => setActiveTab("bank")}
              openLabel={isFr ? "Ouvrir l’espace banques" : "Open bank area"}
            />
          </div>
        </div>
      </section>

      {activeTab === "client" ? (
        <ClientPanel
          locale={locale}
          canManageIncomingFinance={canManageIncomingFinance}
          invoices={invoices}
          invoiceSummary={invoiceSummary}
          invoiceFilterData={invoiceFilterData}
          payments={payments}
          paymentSummary={paymentSummary}
          paymentFilterData={paymentFilterData}
        />
      ) : null}

      {activeTab === "supplier" ? (
        <SupplierPanel
          locale={locale}
          canManageOutgoingFinance={canManageOutgoingFinance}
          transfers={transfers}
          transferSummary={transferSummary}
          transferFilterData={transferFilterData}
        />
      ) : null}

      {activeTab === "bank" ? (
        <BankPanel
          locale={locale}
          canManageBankFinance={canManageBankFinance}
          bankStatements={bankStatements}
          bankSummary={bankSummary}
        />
      ) : null}
    </div>
  );
}

function hasActiveRevisionRequest(invoice: Pick<InvoiceRecord, "updated_at" | "recentActivity">) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  return Boolean(request && new Date(request.created_at).getTime() > new Date(invoice.updated_at).getTime());
}

function formatApprovalDuration(hours: number, isFr: boolean) {
  if (!hours) return "—";
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days.toLocaleString(isFr ? "fr-FR" : "en-GB")} j`;
}

function ClientPanel({
  locale,
  canManageIncomingFinance,
  invoices,
  invoiceSummary,
  invoiceFilterData,
  payments,
  paymentSummary,
  paymentFilterData,
}: {
  locale: Locale;
  canManageIncomingFinance: boolean;
  invoices: InvoiceRecord[];
  invoiceSummary: InvoiceSummary;
  invoiceFilterData: InvoiceFiltersData | null;
  payments: PaymentRecord[];
  paymentSummary: PaymentSummary;
  paymentFilterData: PaymentFiltersData | null;
}) {
  const isFr = locale === "fr";

  return (
    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden rounded-[34px] border-0 bg-[linear-gradient(160deg,#fbfcff,#eef6ff_48%,#dff1ff)] shadow-[0_20px_60px_rgba(23,43,77,0.12)] dark:bg-[linear-gradient(160deg,#0f172a,#111827_48%,#0b1220)] dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-sky-700 uppercase dark:text-sky-300">{isFr ? "Clients" : "Clients"}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">
                {isFr ? "Factures envoyées aux clients" : "Invoices sent to clients"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {isFr
                  ? "Ici, vous créez les factures clients, vous suivez leur statut manuel et vous comparez ensuite avec les encaissements."
                  : "Create client invoices here, track their manual status, then compare them with collected payments."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" className="rounded-full px-4">
                <Link href="/finance/invoices">{isFr ? "Toutes les factures" : "All invoices"}</Link>
              </Button>
              {canManageIncomingFinance && invoiceFilterData ? (
                <InvoiceForm
                  mode="create"
                  filterData={invoiceFilterData}
                  triggerLabel={isFr ? "Ajouter une facture" : "Add invoice"}
                  returnPath="/finance"
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricTile
              label={isFr ? "En attente" : "Pending"}
              value={String(invoiceSummary.sentCount)}
              detail={isFr ? "Factures ouvertes ou partiellement réglées" : "Open or partially paid invoices"}
              tone="sky"
            />
            <MetricTile
              label={isFr ? "En retard" : "Overdue"}
              value={String(invoiceSummary.overdueCount)}
              detail={isFr ? "Factures à relancer" : "Invoices requiring follow-up"}
              tone="rose"
            />
            <MetricTile
              label={isFr ? "Validées banque" : "Bank validated"}
              value={String(payments.filter((payment) => payment.status === "reconciled").length)}
              detail={isFr ? "Encaissements confirmés" : "Confirmed collections"}
              tone="emerald"
            />
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/75 p-5 dark:border-white/10 dark:bg-white/[0.05]">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              {isFr ? "Différence entre facture et règlement" : "Difference between invoice and payment"}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <InfoLine
                title={isFr ? "Ajouter une facture" : "Add invoice"}
                text={
                  isFr
                    ? "Crée la facture commerciale envoyée au client : montant, échéance, PDF client et statut."
                    : "Creates the commercial invoice sent to the client: amount, due date, client PDF, and status."
                }
              />
              <InfoLine
                title={isFr ? "Ajouter un règlement" : "Add payment"}
                text={
                  isFr
                    ? "Ajoute un encaissement attendu ou reçu lié à une facture, pour suivre ce qui a réellement été payé."
                    : "Adds an expected or received collection linked to an invoice, so you can track what was actually paid."
                }
              />
            </div>
          </div>

          <div className="grid gap-3">
            {invoices.slice(0, 6).map((invoice, index) => (
              <Link
                key={invoice.id}
                href={`/finance/invoices/${invoice.id}/preview`}
                className="animate-fade-up rounded-[28px] border border-white/70 bg-white/88 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{invoice.invoice_number}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {invoice.client?.name ?? (isFr ? "Client non renseigné" : "Client not specified")} {" • "} {isFr ? "échéance" : "due"} {formatDate(invoice.due_date)}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
                      {invoice.project?.name ?? invoice.contract?.title ?? (isFr ? "Facture générale" : "General invoice")}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusChip label={getClientSettlementLabel(invoice, locale)} tone={getClientSettlementTone(invoice)} />
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50">
                      {formatFinanceCurrency(invoice.amount_ttc, invoice.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {isFr ? "Reste" : "Remaining"} {formatFinanceCurrency(invoice.remainingBalance, invoice.currency)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[34px] border-slate-200 bg-white shadow-[0_20px_60px_rgba(23,43,77,0.08)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-300">{isFr ? "Règlements" : "Payments"}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">
                {isFr ? "Lecture simple des encaissements" : "Simple collections view"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" className="rounded-full px-4">
                <Link href="/finance/payments">{isFr ? "Paiements clients" : "Client payments"}</Link>
              </Button>
              {canManageIncomingFinance && paymentFilterData ? (
                <PaymentForm
                  mode="create"
                  filterData={paymentFilterData}
                  triggerLabel={isFr ? "Ajouter un règlement" : "Add payment"}
                  returnPath="/finance"
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label={isFr ? "Attendus" : "Expected"} value={formatFinanceCurrency(paymentSummary.totalExpectedAmount, payments[0]?.currency ?? "USD")} />
            <MiniMetric label={isFr ? "Reçus" : "Received"} value={formatFinanceCurrency(paymentSummary.totalReceivedAmount, payments[0]?.currency ?? "USD")} />
          </div>

          <div className="space-y-3">
            {payments.slice(0, 6).map((payment, index) => (
              <Link
                key={payment.id}
                href="/finance/payments"
                className="animate-fade-up rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 dark:border-white/10 dark:bg-white/[0.04]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {payment.reference ?? payment.client?.name ?? (isFr ? "Encaissement" : "Collection")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {payment.invoice?.invoice_number ?? (isFr ? "Sans facture liée" : "No linked invoice")} {" • "}
                      {payment.payment_date ? formatDate(payment.payment_date) : isFr ? "Date non renseignée" : "No date set"}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusChip
                      label={getPaymentStatusLabel(payment.status, locale)}
                      tone={payment.status === "reconciled" ? "emerald" : payment.status === "received" ? "amber" : payment.status === "late" ? "rose" : "slate"}
                    />
                    <p className="mt-3 text-sm font-semibold text-slate-950">{formatFinanceCurrency(payment.amount, payment.currency)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SupplierPanel({
  locale,
  canManageOutgoingFinance,
  transfers,
  transferSummary,
  transferFilterData,
}: {
  locale: Locale;
  canManageOutgoingFinance: boolean;
  transfers: TransferRecord[];
  transferSummary: TransferSummary;
  transferFilterData: TransferFiltersData | null;
}) {
  const isFr = locale === "fr";
  const pendingCount = transferSummary.plannedCount + transferSummary.pendingCount;
  const manualPaidCount = transfers.filter((transfer) => transfer.status === "sent").length;

  return (
    <section className="grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
      <Card className="rounded-[34px] border-0 bg-[linear-gradient(160deg,#fffdf7,#fff5db_52%,#ffeccc)] shadow-[0_20px_60px_rgba(23,43,77,0.1)] dark:bg-[linear-gradient(160deg,#1f1a10,#221c10_52%,#23180c)] dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase dark:text-amber-300">{isFr ? "Fournisseurs" : "Suppliers"}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">
                {isFr ? "Factures fournisseurs et sorties" : "Supplier invoices and outgoing payments"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {isFr
                  ? "Cette section centralise ce que vous devez payer, ce que vous avez marqué comme payé, puis ce que la banque a réellement confirmé."
                  : "This section centralizes what you owe, what you marked as paid, and what the bank actually confirmed."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" className="rounded-full px-4">
                <Link href="/finance/transfers">{isFr ? "Toutes les sorties" : "All outgoing payments"}</Link>
              </Button>
              {canManageOutgoingFinance && transferFilterData ? (
                <TransferForm
                  mode="create"
                  filterData={transferFilterData}
                  triggerLabel={isFr ? "Ajouter une facture fournisseur" : "Add supplier invoice"}
                  returnPath="/finance"
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricTile label={isFr ? "À payer" : "To pay"} value={String(pendingCount)} detail={isFr ? "Planifié ou en attente" : "Planned or pending"} tone="amber" />
            <MetricTile label={isFr ? "(Payé)" : "(Paid)"} value={String(manualPaidCount)} detail={isFr ? "Marqué manuellement" : "Manually marked"} tone="slate" />
            <MetricTile label={isFr ? "Validées banque" : "Bank validated"} value={String(transferSummary.confirmedCount)} detail={isFr ? "Sorties confirmées" : "Confirmed outflows"} tone="emerald" />
          </div>

          <div className="space-y-3">
            {transfers.slice(0, 7).map((transfer, index) => (
              <Link
                key={transfer.id}
                href="/finance/transfers"
                className="animate-fade-up rounded-[28px] border border-white/70 bg-white/88 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{transfer.transfer_reference}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {transfer.beneficiary_name} {" • "} {formatDate(transfer.transfer_date)}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-300">
                      {transfer.notes ?? (isFr ? "Facture fournisseur sans note" : "Supplier invoice without note")}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusChip label={getSupplierSettlementLabel(transfer, locale)} tone={getSupplierSettlementTone(transfer)} />
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50">{formatFinanceCurrency(transfer.amount, transfer.currency)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[34px] border-slate-200 bg-white shadow-[0_20px_60px_rgba(23,43,77,0.08)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-300">{isFr ? "Lecture fournisseurs" : "Supplier reading"}</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Statut simple et lisible" : "Simple readable status"}</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label={isFr ? "Sorties du mois" : "This month's outflows"} value={formatFinanceCurrency(transferSummary.totalOutgoingThisMonth, transfers[0]?.currency ?? "USD")} />
            <MiniMetric label={isFr ? "Confirmées" : "Confirmed"} value={String(transferSummary.confirmedCount)} />
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{isFr ? "Logique de suivi" : "Tracking logic"}</p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <StatusLegend tone="amber" label={isFr ? "À payer" : "To pay"} detail={isFr ? "Facture fournisseur créée mais non réglée." : "Supplier invoice created but not yet paid."} />
              <StatusLegend tone="slate" label={isFr ? "(Payé)" : "(Paid)"} detail={isFr ? "Vous avez marqué la sortie comme faite, mais la banque ne l'a pas encore confirmée." : "You marked the outflow as done, but the bank has not confirmed it yet."} />
              <StatusLegend tone="emerald" label={isFr ? "Validé banque" : "Bank validated"} detail={isFr ? "Le relevé bancaire a retrouvé la ligne et a confirmé la sortie." : "The bank statement matched the line and confirmed the outflow."} />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function BankPanel({
  locale,
  canManageBankFinance,
  bankStatements,
  bankSummary,
}: {
  locale: Locale;
  canManageBankFinance: boolean;
  bankStatements: BankStatementRecord[];
  bankSummary: BankStatementSummary | null;
}) {
  const isFr = locale === "fr";

  return (
    <section className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
      <Card className="rounded-[34px] border-0 bg-[linear-gradient(160deg,#f7fcff,#e6f4ff_48%,#d6eeff)] shadow-[0_20px_60px_rgba(23,43,77,0.1)] dark:bg-[linear-gradient(160deg,#0d1820,#10202b_48%,#0b1721)] dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-cyan-700 uppercase dark:text-cyan-300">{isFr ? "Banques" : "Banks"}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">{isFr ? "Relevés et rapprochement" : "Statements and reconciliation"}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {isFr
                  ? "Cette section lit les crédits et les débits du compte, puis tente de valider les factures clients et fournisseurs."
                  : "This section reads account credits and debits, then tries to validate client and supplier invoices."}
              </p>
            </div>
            {canManageBankFinance ? <BankStatementForm /> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <MetricTile label={isFr ? "Relevés" : "Statements"} value={String(bankSummary?.statementsCount ?? 0)} detail={isFr ? "Imports disponibles" : "Available imports"} tone="sky" />
            <MetricTile label={isFr ? "Rapprochées" : "Matched"} value={String(bankSummary?.matchedLines ?? 0)} detail={isFr ? "Lignes validées automatiquement" : "Lines auto-validated"} tone="emerald" />
            <MetricTile label={isFr ? "À revoir" : "To review"} value={String(bankSummary?.reviewLines ?? 0)} detail={isFr ? "Suggestions détectées" : "Suggestions detected"} tone="amber" />
            <MetricTile label={isFr ? "Non reconnues" : "Unrecognized"} value={String(bankSummary?.unmatchedLines ?? 0)} detail={isFr ? "Lignes sans correspondance" : "Lines without a match"} tone="slate" />
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/88 p-5 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{isFr ? "Rapprochement automatique" : "Automatic reconciliation"}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {isFr
                ? "Crédits = encaissements clients. Débits = paiements fournisseurs. Si le montant et la référence correspondent, la ligne est validée automatiquement."
                : "Credits = client collections. Debits = supplier payments. If amount and reference match, the line is validated automatically."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[34px] border-slate-200 bg-white shadow-[0_20px_60px_rgba(23,43,77,0.08)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none">
        <CardContent className="space-y-5 px-6 py-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-300">{isFr ? "Derniers relevés" : "Latest statements"}</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Lignes lues et validation" : "Read lines and validation"}</h3>
          </div>

          {bankStatements.length ? (
            <div className="space-y-4">
              {bankStatements.slice(0, 4).map((statement, index) => (
                <div
                  key={statement.id}
                  className="animate-fade-up rounded-[28px] border border-slate-200 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-white/[0.04]"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{statement.statement_label}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {statement.account_label} {" • "} {formatDate(statement.statement_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusChip label={`${statement.lines.filter((line) => line.match_status === "matched").length} ${isFr ? "validées" : "validated"}`} tone="emerald" />
                      <StatusChip label={`${statement.lines.filter((line) => line.match_status === "review").length} ${isFr ? "à revoir" : "review"}`} tone="amber" />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {statement.lines.slice(0, 4).map((line) => (
                      <div key={line.id} className="rounded-[22px] border border-white bg-white p-4 dark:border-white/10 dark:bg-slate-900/70">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-950 dark:text-slate-50">{line.description}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                              {formatDate(line.line_date)}
                              {line.reference ? ` • ${line.reference}` : ""}
                            </p>
                            {canManageBankFinance && line.match_reason ? (
                              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">{line.match_reason}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <StatusChip
                              label={getBankMatchLabel(line.match_status, locale)}
                              tone={line.match_status === "matched" ? "emerald" : line.match_status === "review" ? "amber" : "slate"}
                            />
                            <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">{formatFinanceCurrency(line.amount, line.currency)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
              {isFr ? "Aucun relevé importé pour le moment." : "No statement imported yet."}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function getClientSettlementLabel(invoice: InvoiceRecord, locale: Locale) {
  const hasReconciledPayment = invoice.linkedPayments.some((payment) => payment.status === "reconciled");
  const hasManualPayment = invoice.linkedPayments.some((payment) => payment.status === "received");

  if (hasReconciledPayment && invoice.paymentStatus === "paid") {
    return locale === "fr" ? "Validée banque" : "Bank validated";
  }

  if ((hasManualPayment || invoice.paymentStatus === "paid") && !hasReconciledPayment) {
    return locale === "fr" ? "(Payée)" : "(Paid)";
  }

  if (invoice.paymentStatus === "partially_paid") {
    return locale === "fr" ? "Partiel" : "Partial";
  }

  if (invoice.paymentStatus === "overdue") {
    return locale === "fr" ? "En retard" : "Overdue";
  }

  return locale === "fr" ? "En attente" : "Pending";
}

function getClientSettlementTone(invoice: InvoiceRecord) {
  const hasReconciledPayment = invoice.linkedPayments.some((payment) => payment.status === "reconciled");
  const hasManualPayment = invoice.linkedPayments.some((payment) => payment.status === "received");

  if (hasReconciledPayment && invoice.paymentStatus === "paid") return "emerald";
  if ((hasManualPayment || invoice.paymentStatus === "paid") && !hasReconciledPayment) return "amber";
  if (invoice.paymentStatus === "overdue") return "rose";
  return "slate";
}

function getSupplierSettlementLabel(transfer: TransferRecord, locale: Locale) {
  if (transfer.status === "confirmed") return locale === "fr" ? "Validé banque" : "Bank validated";
  if (transfer.status === "sent") return locale === "fr" ? "(Payé)" : "(Paid)";
  if (transfer.status === "failed") return locale === "fr" ? "Échec" : "Failed";
  if (transfer.status === "cancelled") return locale === "fr" ? "Annulé" : "Cancelled";
  return locale === "fr" ? "À payer" : "To pay";
}

function getSupplierSettlementTone(transfer: TransferRecord) {
  if (transfer.status === "confirmed") return "emerald";
  if (transfer.status === "sent") return "slate";
  if (transfer.status === "planned" || transfer.status === "pending") return "amber";
  return "rose";
}

function getPaymentStatusLabel(status: PaymentRecord["status"], locale: Locale) {
  if (status === "reconciled") return locale === "fr" ? "Validé banque" : "Bank validated";
  if (status === "received") return locale === "fr" ? "(Payé)" : "(Paid)";
  if (status === "late") return locale === "fr" ? "En retard" : "Late";
  if (status === "cancelled") return locale === "fr" ? "Annulé" : "Cancelled";
  return locale === "fr" ? "En attente" : "Pending";
}

function getBankMatchLabel(status: "matched" | "review" | "unmatched", locale: Locale) {
  if (status === "matched") return locale === "fr" ? "Validée" : "Validated";
  if (status === "review") return locale === "fr" ? "À revoir" : "Review";
  return locale === "fr" ? "Non reconnue" : "Unrecognized";
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Landmark;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-[22px] px-4 py-3 text-sm font-medium transition-all duration-200",
        active
          ? "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] dark:bg-sky-500/16 dark:text-sky-100 dark:shadow-none"
          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
      ].join(" ")}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function OverviewCard({
  icon: Icon,
  title,
  value,
  detail,
  tone,
  active,
  onClick,
  openLabel,
}: {
  icon: typeof Landmark;
  title: string;
  value: string;
  detail: string;
  tone: "sky" | "amber" | "emerald";
  active: boolean;
  onClick: () => void;
  openLabel: string;
}) {
  const toneClass = {
    sky: "border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100",
    amber: "border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100",
    emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group w-full rounded-[28px] border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${toneClass} ${active ? "ring-2 ring-slate-950/15 ring-offset-2 dark:ring-white/25 dark:ring-offset-slate-950" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
          <p className="mt-2 text-sm opacity-80">{detail}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold">
            {openLabel}
            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl border border-current/10 bg-white/60 dark:bg-white/[0.08]">
          <Icon className="size-4" />
        </div>
      </div>
    </button>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "sky" | "amber" | "emerald" | "rose" | "slate";
}) {
  const toneClass = {
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/12 dark:text-rose-100",
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200",
  }[tone];

  return (
    <div className={`rounded-[24px] border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold tracking-[0.14em] uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
      <p className="mt-2 text-sm opacity-80">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">{value}</p>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/12 dark:text-rose-100",
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200",
  }[tone];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${toneClass}`}>
      <CheckCircle2 className="size-3.5" />
      {label}
    </div>
  );
}

function StatusLegend({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: string;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  return (
    <div className="flex items-start gap-3">
      <StatusChip label={label} tone={tone} />
      <p className="pt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</p>
    </div>
  );
}

function InfoLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}
