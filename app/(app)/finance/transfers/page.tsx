import Link from "next/link";
import { ArrowRightLeft, BanknoteArrowDown, CircleCheckBig, CircleDashed, CircleX } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TransferCard } from "@/components/transfers/transfer-card";
import { TransferCategoryBadge } from "@/components/transfers/transfer-category-badge";
import { TransferEntityBadge } from "@/components/transfers/transfer-entity-badge";
import { TransferFilters } from "@/components/transfers/transfer-filters";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusBadge } from "@/components/transfers/transfer-status-badge";
import { TransferTable } from "@/components/transfers/transfer-table";
import { TransferToast } from "@/components/transfers/transfer-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFinanceOperationsAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getCommentsForEntities } from "@/lib/comments/service";
import { formatFinanceCurrency, getTransferEntityLabel } from "@/lib/finance/helpers";
import { formatNumber } from "@/lib/formatters";
import { getMentionCandidates } from "@/lib/notifications/service";
import { formatDate } from "@/lib/projects/helpers";
import {
  getMonthlyOutgoingTransfers,
  getTransferSummary,
  getTransfers,
  getTransfersFilterData,
} from "@/lib/finance/service";
import type { CommentRecord } from "@/types/comment";
import type { TransferFilters as TransferFiltersType } from "@/types/finance";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getMonthBucket(dateValue: string, locale: "fr" | "en") {
  const date = new Date(dateValue);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" }).format(date);
}

function buildStructuredTransferGroups(transfers: Awaited<ReturnType<typeof getTransfers>>, locale: "fr" | "en") {
  const paidTransfers = transfers.filter((transfer) => transfer.status === "confirmed" || transfer.status === "sent");
  const groups = new Map<string, Map<string, typeof paidTransfers>>();

  for (const transfer of paidTransfers) {
    const entityKey = transfer.entity;
    const monthKey = getMonthBucket(transfer.transfer_date, locale);
    const entityGroup = groups.get(entityKey) ?? new Map<string, typeof paidTransfers>();
    const monthGroup = entityGroup.get(monthKey) ?? [];
    monthGroup.push(transfer);
    entityGroup.set(monthKey, monthGroup);
    groups.set(entityKey, entityGroup);
  }

  return Array.from(groups.entries()).map(([entity, monthGroups]) => ({
    entity,
    totalAmount: Array.from(monthGroups.values()).flat().reduce((sum, transfer) => sum + transfer.amount, 0),
    count: Array.from(monthGroups.values()).flat().length,
    months: Array.from(monthGroups.entries()).map(([month, items]) => ({
      month,
      items: [...items].sort((left, right) => new Date(right.transfer_date).getTime() - new Date(left.transfer_date).getTime()),
      totalAmount: items.reduce((sum, transfer) => sum + transfer.amount, 0),
    })),
  }));
}

export default async function FinanceTransfersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireFinanceOperationsAccess();
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const params = (await searchParams) ?? {};
  const filters: TransferFiltersType = {
    search: getString(params.search) ?? "",
    clientId: getString(params.client) ?? "",
    projectId: getString(params.project) ?? "",
    status: (getString(params.status) as TransferFiltersType["status"]) ?? "",
    category: (getString(params.category) as TransferFiltersType["category"]) ?? "",
    entity: (getString(params.entity) as TransferFiltersType["entity"]) ?? "",
    dateWindow: (getString(params.date) as TransferFiltersType["dateWindow"]) ?? "all",
  };

  const [transfers, filterData, monthlyTransfers, mentionCandidates] = await Promise.all([
    getTransfers(auth.role, filters),
    getTransfersFilterData(),
    getMonthlyOutgoingTransfers(auth.role),
    getMentionCandidates(),
  ]);
  const commentsByTransferId = (await getCommentsForEntities("transfer", transfers.map((transfer) => transfer.id))) as Record<string, CommentRecord[]>;

  const canManage = auth.role === "admin" || auth.role === "manager";
  const summary = getTransferSummary(transfers);
  const structuredGroups = buildStructuredTransferGroups(transfers, locale);
  const entitySummary = ["bumex_it", "insec", "cnam_intec", "ltm_yh", "unassigned"].map((entity) => {
    const entityTransfers = transfers.filter((transfer) => transfer.entity === entity);
    return {
      entity,
      count: entityTransfers.length,
      paidCount: entityTransfers.filter((transfer) => transfer.status === "confirmed" || transfer.status === "sent").length,
      amount: entityTransfers.reduce((sum, transfer) => sum + transfer.amount, 0),
    };
  });

  return (
    <div className="space-y-6">
      <TransferToast />

      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow={isFr ? "Registre des décaissements" : "Outgoing registry"}
          title={isFr ? "Suivez les factures fournisseurs réglées, les engagements sortants et les dépenses dans un registre financier structuré." : "Track paid supplier invoices, outgoing commitments, and portfolio-level spending with a structured finance register."}
          subtitle={isFr ? "Organisez chaque décaissement par entité, catégorie financière et date afin de faciliter le contrôle des dépenses." : "Organize every outgoing payment by entity, by financial category, and by date so paid bills remain easy to audit and review."}
        />
        {canManage ? (
          <div className="flex justify-end">
            <TransferForm mode="create" filterData={filterData} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" className="rounded-full px-4">
            <Link href="/finance/outgoing">{isFr ? "Vue des décaissements" : "Outgoing overview"}</Link>
          </Button>
          <Button asChild className="rounded-full px-4">
            <Link href="/finance/transfers">{isFr ? "Décaissements" : "Outgoing transfers"}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {[
          {
            icon: CircleDashed,
            label: isFr ? "Décaissements planifiés" : "Planned transfers",
            value: formatNumber(summary.plannedCount),
            detail: isFr ? "Planifiés mais non exécutés" : "Scheduled but not released",
          },
          {
            icon: ArrowRightLeft,
            label: isFr ? "Décaissements en attente" : "Pending transfers",
            value: formatNumber(summary.pendingCount),
            detail: isFr ? "En attente de confirmation d’exécution" : "Awaiting execution confirmation",
          },
          {
            icon: CircleCheckBig,
            label: isFr ? "Décaissements confirmés" : "Confirmed transfers",
            value: formatNumber(summary.confirmedCount),
            detail: isFr ? "Mouvements sortants confirmés" : "Confirmed outgoing movements",
          },
          {
            icon: CircleX,
            label: isFr ? "Décaissements échoués" : "Failed transfers",
            value: formatNumber(summary.failedCount),
            detail: isFr ? "Anomalies d’exécution à examiner" : "Execution issues needing review",
          },
          {
            icon: BanknoteArrowDown,
            label: isFr ? "Décaissements ce mois-ci" : "Outgoing this month",
            value: formatFinanceCurrency(
              monthlyTransfers.reduce((sum, transfer) => sum + transfer.amount, 0),
              monthlyTransfers[0]?.currency ?? "USD",
            ),
            detail: isFr ? "Montant des décaissements suivis ce mois-ci" : "Tracked outgoing amount this month",
          },
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

      <TransferFilters filters={filters} filterData={filterData} />

      <div className="grid gap-4 xl:grid-cols-5">
        {entitySummary.map((item) => (
          <Card key={item.entity} className="border-border/70 bg-card/72 shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-3 px-5 py-5">
              <TransferEntityBadge entity={item.entity as "bumex_it" | "insec" | "cnam_intec" | "ltm_yh" | "unassigned"} />
              <div>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{formatFinanceCurrency(item.amount, transfers[0]?.currency ?? "USD")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isFr ? `${item.paidCount} élément${item.paidCount === 1 ? " réglé" : "s réglés"} • ${item.count} élément${item.count === 1 ? " au total" : "s au total"}` : `${item.paidCount} paid item(s) • ${item.count} total item(s)`}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Registre des règlements" : "Structured paid register"}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Éléments réglés par entité et par mois" : "Paid items grouped by entity and month"}</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">{formatNumber(structuredGroups.reduce((sum, group) => sum + group.count, 0))} {isFr ? "règlements" : "paid results"}</Badge>
        </div>

        {structuredGroups.length ? (
          <div className="grid gap-4">
            {structuredGroups.map((group) => (
              <Card key={group.entity} className="border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f9fbff)] shadow-[var(--shadow-soft)]">
                <CardContent className="space-y-4 px-5 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <TransferEntityBadge entity={group.entity as "bumex_it" | "insec" | "cnam_intec" | "ltm_yh" | "unassigned"} />
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">{getTransferEntityLabel(group.entity, locale)}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{isFr ? `${group.count} règlement${group.count === 1 ? " regroupé" : "s regroupés"} dans un registre chronologique.` : `${group.count} paid record(s) grouped in a date-first register.`}</p>
                    </div>
                    <p className="text-xl font-semibold tracking-[-0.04em]">{formatFinanceCurrency(group.totalAmount, transfers[0]?.currency ?? "USD")}</p>
                  </div>

                  <div className="grid gap-4">
                    {group.months.map((monthGroup) => (
                      <div key={`${group.entity}-${monthGroup.month}`} className="rounded-[24px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{monthGroup.month}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{isFr ? `${monthGroup.items.length} élément${monthGroup.items.length === 1 ? " réglé" : "s réglés"}` : `${monthGroup.items.length} paid item(s)`}</p>
                          </div>
                          <p className="text-sm font-semibold">{formatFinanceCurrency(monthGroup.totalAmount, monthGroup.items[0]?.currency ?? "USD")}</p>
                        </div>

                        <div className="mt-4 space-y-3">
                          {monthGroup.items.map((transfer) => (
                            <div key={transfer.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-sm font-semibold">{transfer.beneficiary_name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{transfer.transfer_reference} • {formatDate(transfer.transfer_date)}</p>
                                  <p className="mt-3 text-xs text-muted-foreground">{transfer.notes ?? (isFr ? "Aucune note associée." : "No note attached.")}</p>
                                </div>
                                <div className="text-right">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <TransferStatusBadge status={transfer.status} />
                                    <TransferCategoryBadge category={transfer.category} />
                                  </div>
                                  <p className="mt-3 text-sm font-semibold">{formatFinanceCurrency(transfer.amount, transfer.currency)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
            {isFr ? "Aucun décaissement réglé n’est visible avec les filtres actuels." : "No paid outgoing records are visible yet for the current filters."}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{isFr ? "Registre des décaissements" : "Outgoing ledger"}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{isFr ? "Liste des décaissements" : "Transfers list"}</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">{formatNumber(transfers.length)} {isFr ? "résultats" : "results"}</Badge>
        </div>

        {transfers.length ? (
          <>
            <div className="hidden xl:block">
              <TransferTable
                transfers={transfers}
                canManage={canManage}
                filterData={filterData}
                commentsByTransferId={commentsByTransferId}
                role={auth.role}
                currentUserId={auth.profile.id}
                mentionCandidates={mentionCandidates}
              />
            </div>

            <div className="grid gap-4 xl:hidden">
              {transfers.map((transfer) => (
                <TransferCard
                  key={transfer.id}
                  transfer={transfer}
                  canManage={canManage}
                  filterData={filterData}
                  comments={commentsByTransferId[transfer.id] ?? []}
                  role={auth.role}
                  currentUserId={auth.profile.id}
                  mentionCandidates={mentionCandidates}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
            {isFr ? "Aucun décaissement ne correspond aux filtres actuels." : "No transfers match the current filters."}
          </div>
        )}
      </div>
    </div>
  );
}
