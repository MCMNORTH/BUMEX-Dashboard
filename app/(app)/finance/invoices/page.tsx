import Link from "next/link";
import { ArrowRight, CalendarClock, Download, FilePenLine, FileText, Landmark, ShieldCheck, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { InvoiceCard } from "@/components/invoices/invoice-card";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { InvoiceToast } from "@/components/invoices/invoice-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getCommentsForEntities } from "@/lib/comments/service";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { formatNumber } from "@/lib/formatters";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getInvoiceFiltersData, getInvoices, getInvoiceSummary } from "@/lib/finance/service";
import type { CommentRecord } from "@/types/comment";
import type { InvoiceFilters as InvoiceFiltersType } from "@/types/finance";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinanceInvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireIncomingFinanceOperationsAccess();
  const isFr = (await getCurrentLocale()) === "fr";
  const params = (await searchParams) ?? {};
  const filters: InvoiceFiltersType = {
    search: getString(params.search) ?? "",
    clientId: getString(params.client) ?? "",
    projectId: getString(params.project) ?? "",
    contractId: getString(params.contract) ?? "",
    status: (getString(params.status) as InvoiceFiltersType["status"]) ?? "",
    approvalStatus: (getString(params.approval) as InvoiceFiltersType["approvalStatus"]) ?? "",
    dueWindow: (getString(params.due) as InvoiceFiltersType["dueWindow"]) ?? "all",
  };

  const [loadedInvoices, filterData, mentionCandidates] = await Promise.all([
    getInvoices(auth.role, filters),
    getInvoiceFiltersData(),
    getMentionCandidates(),
  ]);
  const invoices = filters.approvalStatus === "changes_requested"
    ? loadedInvoices.filter(hasActiveRevisionRequest)
    : filters.approvalStatus === "pending"
      ? loadedInvoices.filter((invoice) => !hasActiveRevisionRequest(invoice))
      : loadedInvoices;
  const commentsByInvoiceId = (await getCommentsForEntities("invoice", invoices.map((invoice) => invoice.id))) as Record<string, CommentRecord[]>;

  const summary = getInvoiceSummary(invoices);
  const canManage = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
  const pendingInvoices = invoices.filter((invoice) => invoice.approval_status === "pending" && !hasActiveRevisionRequest(invoice));
  const pendingApprovalCount = pendingInvoices.length;
  const changesRequestedCount = invoices.filter(hasActiveRevisionRequest).length;
  const urgentApprovalCount = pendingInvoices.filter((invoice) => getWaitingDays(invoice.updated_at) >= 3).length;
  const viewingCorrections = filters.approvalStatus === "changes_requested";
  const displayedInvoices = auth.role === "admin"
    ? [...invoices].sort((left, right) => {
        if (left.approval_status !== right.approval_status) return left.approval_status === "pending" ? -1 : 1;
        if (left.approval_status === "pending") return new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      })
    : invoices;
  return (
    <div className="space-y-6">
      <InvoiceToast />

      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow={isFr ? "Module factures" : "Invoices module"}
          title={isFr ? "Suivez l’émission des factures, l’état des encaissements, les justificatifs et le solde restant dans un espace financier opérationnel." : "Track invoice issuance, collection status, receipts, and remaining balance in one operational finance workspace."}
          subtitle={isFr ? "Gérez la facturation clients, clarifiez l’état des factures et suivez les encaissements de l’émission au paiement." : "Manage client billing, keep invoice status clear, and follow incoming cash from issue to payment."}
        />
        {canManage ? (
          <div className="flex justify-end">
            <InvoiceForm mode="create" filterData={filterData} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" className="rounded-full px-4">
            <Link href="/finance/incoming">{isFr ? "Vue des encaissements" : "Incoming overview"}</Link>
          </Button>
          <Button asChild variant="secondary" className="rounded-full px-4">
            <Link href="/finance/payments">{isFr ? "Encaissements" : "Incoming payments"}</Link>
          </Button>
          <Button asChild className="rounded-full px-4">
            <Link href="/finance/invoices">{isFr ? "Factures" : "Invoices"}</Link>
          </Button>
        </div>
      </div>

      {auth.role === "admin" ? (
        <div className="relative overflow-hidden rounded-[28px] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50 to-white p-5 shadow-[var(--shadow-soft)] dark:border-amber-400/20 dark:from-amber-950/40 dark:via-orange-950/25 dark:to-card">
          <div className="absolute -right-10 -top-16 size-48 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">{isFr ? "File de validation administrative" : "Administrative approval queue"}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {viewingCorrections
                    ? (isFr ? `${changesRequestedCount} facture${changesRequestedCount > 1 ? "s" : ""} attend${changesRequestedCount > 1 ? "ent" : ""} les corrections de leur créateur.` : `${changesRequestedCount} invoice${changesRequestedCount > 1 ? "s" : ""} waiting for creator changes.`)
                    : pendingApprovalCount
                    ? (isFr ? `${pendingApprovalCount} facture${pendingApprovalCount > 1 ? "s" : ""} attend${pendingApprovalCount > 1 ? "ent" : ""} votre validation.` : `${pendingApprovalCount} invoice${pendingApprovalCount > 1 ? "s" : ""} awaiting your approval.`)
                    : (isFr ? "Toutes les factures visibles ont été traitées." : "All visible invoices have been reviewed.")}
                </p>
                {urgentApprovalCount ? (
                  <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {isFr ? `${urgentApprovalCount} validation${urgentApprovalCount > 1 ? "s" : ""} attend${urgentApprovalCount > 1 ? "ent" : ""} depuis au moins 3 jours.` : `${urgentApprovalCount} approval${urgentApprovalCount > 1 ? "s" : ""} waiting for at least 3 days.`}
                  </p>
                ) : null}
              </div>
            </div>
            <Button asChild variant={pendingApprovalCount || viewingCorrections ? "primary" : "secondary"} className="rounded-full px-5">
              <Link href={viewingCorrections ? "/finance/invoices?approval=pending" : pendingApprovalCount ? "/finance/invoices?approval=pending" : "/finance/invoices?approval=approved"}>
                {viewingCorrections ? (isFr ? "Voir les factures à valider" : "View invoices to approve") : pendingApprovalCount ? (isFr ? "Examiner maintenant" : "Review now") : (isFr ? "Voir les validations" : "View approvals")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2 border-t border-amber-200/70 pt-4 dark:border-amber-400/15">
            <Button asChild variant={filters.approvalStatus === "pending" ? "primary" : "secondary"} size="sm" className="rounded-full">
              <Link href="/finance/invoices?approval=pending">{isFr ? "À valider" : "To approve"}</Link>
            </Button>
            <Button asChild variant={filters.approvalStatus === "changes_requested" ? "primary" : "secondary"} size="sm" className="rounded-full">
              <Link href="/finance/invoices?approval=changes_requested">{isFr ? "À corriger" : "Changes requested"}{changesRequestedCount ? ` · ${changesRequestedCount}` : ""}</Link>
            </Button>
            <Button asChild variant={filters.approvalStatus === "approved" ? "primary" : "secondary"} size="sm" className="rounded-full">
              <Link href="/finance/invoices?approval=approved">{isFr ? "Validées" : "Approved"}</Link>
            </Button>
            <Button asChild variant={!filters.approvalStatus ? "primary" : "secondary"} size="sm" className="rounded-full">
              <Link href="/finance/invoices">{isFr ? "Toutes" : "All"}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm" className="ml-auto rounded-full">
              <a href="/api/invoices/approval-report"><Download className="size-4" />{isFr ? "Exporter" : "Export"}</a>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        {[
          { icon: FilePenLine, label: isFr ? "Factures en attente" : "Standby invoices", value: formatNumber(summary.draftCount), detail: isFr ? "Préparées mais pas encore actives" : "Prepared but not yet active" },
          { icon: FileText, label: isFr ? "Factures à encaisser" : "Pending invoices", value: formatNumber(summary.sentCount), detail: isFr ? "Émises et en attente d’encaissement" : "Issued and awaiting collection" },
          { icon: CalendarClock, label: isFr ? "Factures en retard" : "Overdue invoices", value: formatNumber(summary.overdueCount), detail: isFr ? "Échéance dépassée avec solde restant" : "Past due with balance outstanding" },
          { icon: Landmark, label: isFr ? "Factures réglées" : "Paid invoices", value: formatNumber(summary.paidCount), detail: isFr ? "Entièrement couvertes par les paiements liés" : "Fully covered by linked payments" },
          { icon: Wallet, label: isFr ? "Facturé ce mois-ci" : "Invoiced this month", value: formatFinanceCurrency(summary.totalInvoicedThisMonth, invoices[0]?.currency ?? "USD"), detail: isFr ? "Montant total facturé ce mois-ci" : "Gross invoiced amount in current month" },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <InvoiceFilters filters={filters} filterData={filterData} />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Registre des factures" : "Invoice ledger"}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Liste des factures" : "Invoices list"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">{formatNumber(invoices.length)} {isFr ? "résultats" : "results"}</Badge>
          </div>
        </div>

        {invoices.length ? (
          <>
            <div className="hidden xl:block">
              <InvoiceTable
                invoices={displayedInvoices}
                canManage={canManage}
                filterData={filterData}
                commentsByInvoiceId={commentsByInvoiceId}
                role={auth.role}
                currentUserId={auth.profile.id}
                mentionCandidates={mentionCandidates}
                returnPath="/finance/invoices"
              />
            </div>
            <div className="grid gap-4 xl:hidden">
              {displayedInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  canManage={canManage}
                  filterData={filterData}
                  comments={commentsByInvoiceId[invoice.id] ?? []}
                  role={auth.role}
                  currentUserId={auth.profile.id}
                  mentionCandidates={mentionCandidates}
                  returnPath="/finance/invoices"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
            {isFr ? "Aucune facture ne correspond aux filtres actuels." : "No invoices match the current filters."}
          </div>
        )}
      </div>
    </div>
  );
}

function getWaitingDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function hasActiveRevisionRequest(invoice: { updated_at: string; recentActivity: Array<{ action: string; created_at: string }> }) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  return Boolean(request && new Date(request.created_at).getTime() > new Date(invoice.updated_at).getTime());
}
