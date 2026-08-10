import Link from "next/link";
import { CalendarClock, FilePenLine, FileText, Landmark, Wallet } from "lucide-react";

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
    dueWindow: (getString(params.due) as InvoiceFiltersType["dueWindow"]) ?? "all",
  };

  const [invoices, filterData, mentionCandidates] = await Promise.all([
    getInvoices(auth.role, filters),
    getInvoiceFiltersData(),
    getMentionCandidates(),
  ]);
  const commentsByInvoiceId = (await getCommentsForEntities("invoice", invoices.map((invoice) => invoice.id))) as Record<string, CommentRecord[]>;

  const summary = getInvoiceSummary(invoices);
  const canManage = auth.role === "admin" || auth.role === "manager" || auth.role === "employee";
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
                invoices={invoices}
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
              {invoices.map((invoice) => (
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
