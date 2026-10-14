"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { FinanceFilters, PaymentFiltersData } from "@/types/finance";

const filterKeys = ["search", "client", "project", "contract", "status", "method", "due"] as const;

export function PaymentFilters({
  filters,
  filterData,
}: {
  filters: FinanceFilters;
  filterData: PaymentFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.15fr_repeat(6,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher par référence ou notes" : "Search by reference or notes"}
      />

      <ModernSelect
        name="client"
        searchable
        value={filters.clientId ?? ""}
        onValueChange={(value) => applyFilter("client", value)}
        placeholder={isFr ? "Tous les clients" : "All clients"}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="project"
        searchable
        value={filters.projectId ?? ""}
        onValueChange={(value) => applyFilter("project", value)}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="contract"
        searchable
        value={filters.contractId ?? ""}
        onValueChange={(value) => applyFilter("contract", value)}
        placeholder={isFr ? "Tous les contrats" : "All contracts"}
        options={[
          { value: "", label: isFr ? "Tous les contrats" : "All contracts" },
          ...filterData.contracts.map((contract) => ({ value: contract.id, label: contract.title })),
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "expected", label: isFr ? "Attendu" : "Expected" },
          { value: "received", label: isFr ? "Reçu" : "Received" },
          { value: "late", label: isFr ? "En retard" : "Late" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
          { value: "reconciled", label: isFr ? "Rapproché" : "Reconciled" },
        ]}
      />

      <ModernSelect
        name="method"
        value={filters.method ?? ""}
        onValueChange={(value) => applyFilter("method", value)}
        placeholder={isFr ? "Toutes les méthodes" : "All methods"}
        options={[
          { value: "", label: isFr ? "Toutes les méthodes" : "All methods" },
          { value: "bank_transfer", label: isFr ? "Virement bancaire" : "Bank transfer" },
          { value: "card", label: isFr ? "Carte" : "Card" },
          { value: "cash", label: isFr ? "Espèces" : "Cash" },
          { value: "check", label: isFr ? "Chèque" : "Check" },
          { value: "mobile_money", label: "Mobile money" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="due"
        value={filters.dueWindow ?? "all"}
        onValueChange={(value) => applyFilter("due", value)}
        options={[
          { value: "all", label: isFr ? "Toute échéance" : "Any due date" },
          { value: "overdue", label: isFr ? "En retard" : "Overdue" },
          { value: "next_7_days", label: isFr ? "7 prochains jours" : "Next 7 days" },
          { value: "next_30_days", label: isFr ? "30 prochains jours" : "Next 30 days" },
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
        {isFr ? "Effacer les filtres" : "Clear filters"}
      </Button>
    </div>
  );
}
