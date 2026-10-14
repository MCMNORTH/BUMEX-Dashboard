"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { InvoiceFilters as InvoiceFiltersType, InvoiceFiltersData } from "@/types/finance";

const filterKeys = ["search", "client", "project", "contract", "status", "approval", "due"] as const;

export function InvoiceFilters({
  filters,
  filterData,
}: {
  filters: InvoiceFiltersType;
  filterData: InvoiceFiltersData;
}) {
  const { t } = useI18n();
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);
  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={t("finance.invoiceFilters.searchPlaceholder", "Search invoice number or notes")}
      />

      <ModernSelect
        name="client"
        searchable
        value={filters.clientId ?? ""}
        onValueChange={(value) => applyFilter("client", value)}
        placeholder={t("finance.invoiceFilters.allClients", "All clients")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allClients", "All clients") },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="project"
        searchable
        value={filters.projectId ?? ""}
        onValueChange={(value) => applyFilter("project", value)}
        placeholder={t("finance.invoiceFilters.allProjects", "All projects")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allProjects", "All projects") },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="contract"
        searchable
        value={filters.contractId ?? ""}
        onValueChange={(value) => applyFilter("contract", value)}
        placeholder={t("finance.invoiceFilters.allContracts", "All contracts")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allContracts", "All contracts") },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={t("finance.invoiceFilters.allStatuses", "All statuses")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allStatuses", "All statuses") },
          { value: "draft", label: t("finance.status.invoice.draft", "Standby") },
          { value: "sent", label: t("finance.status.invoice.sent", "Pending") },
          { value: "partially_paid", label: t("finance.status.invoice.partially_paid", "Partially paid") },
          { value: "paid", label: t("finance.status.invoice.paid", "Paid") },
          { value: "overdue", label: t("finance.status.invoice.overdue", "Overdue") },
          { value: "cancelled", label: t("finance.status.invoice.cancelled", "Cancelled") },
          { value: "archived", label: t("finance.status.invoice.archived", "Archived") },
        ]}
      />

      <ModernSelect
        name="approval"
        value={filters.approvalStatus ?? ""}
        onValueChange={(value) => applyFilter("approval", value)}
        placeholder={t("finance.invoiceFilters.allApprovals", "All approvals")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allApprovals", "All approvals") },
          { value: "pending", label: t("finance.approval.pending", "Pending approval") },
          { value: "changes_requested", label: t("finance.approval.changesRequested", "Changes requested") },
          { value: "approved", label: t("finance.approval.approved", "Approved") },
        ]}
      />

      <ModernSelect
        name="due"
        value={filters.dueWindow ?? "all"}
        onValueChange={(value) => applyFilter("due", value)}
        options={[
          { value: "all", label: t("finance.invoiceFilters.anyDueDate", "Any due date") },
          { value: "overdue", label: t("finance.invoiceFilters.overdue", "Overdue") },
          { value: "next_7_days", label: t("finance.invoiceFilters.next7Days", "Next 7 days") },
          { value: "next_30_days", label: t("finance.invoiceFilters.next30Days", "Next 30 days") },
        ]}
      />

      <Button
        type="button"
        variant="ghost"
        onClick={clearFilters}
        disabled={!hasActiveFilters || isPending}
        className="text-muted-foreground"
      >
        <X />
        {t("common.actions.clearFilters", "Clear filters")}
      </Button>
    </div>
  );
}
