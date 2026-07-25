"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { InvoiceFilters as InvoiceFiltersType, InvoiceFiltersData } from "@/types/finance";

export function InvoiceFilters({
  filters,
  filterData,
}: {
  filters: InvoiceFiltersType;
  filterData: InvoiceFiltersData;
}) {
  const { t } = useI18n();
  return (
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none xl:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="search" placeholder={t("finance.invoiceFilters.searchPlaceholder", "Search invoice number or notes")} defaultValue={filters.search ?? ""} className="pl-11" />
      </div>

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder={t("finance.invoiceFilters.allClients", "All clients")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allClients", "All clients") },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder={t("finance.invoiceFilters.allProjects", "All projects")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allProjects", "All projects") },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="contract"
        defaultValue={filters.contractId ?? ""}
        placeholder={t("finance.invoiceFilters.allContracts", "All contracts")}
        options={[
          { value: "", label: t("finance.invoiceFilters.allContracts", "All contracts") },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
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
        name="due"
        defaultValue={filters.dueWindow ?? "all"}
        options={[
          { value: "all", label: t("finance.invoiceFilters.anyDueDate", "Any due date") },
          { value: "overdue", label: t("finance.invoiceFilters.overdue", "Overdue") },
          { value: "next_7_days", label: t("finance.invoiceFilters.next7Days", "Next 7 days") },
          { value: "next_30_days", label: t("finance.invoiceFilters.next30Days", "Next 30 days") },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">{t("common.actions.apply", "Apply")}</Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/finance/invoices">{t("common.actions.reset", "Reset")}</Link>
        </Button>
      </div>
    </form>
  );
}
