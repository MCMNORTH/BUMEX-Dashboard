"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { ContractFilters, ContractFiltersData } from "@/types/contract";

const filterKeys = ["search", "client", "status", "date", "value"] as const;

export function ContractFilters({
  filters,
  filterData,
}: {
  filters: ContractFilters;
  filterData: ContractFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher des contrats ou numéros" : "Search contracts or numbers"}
      />

      <ModernSelect
        name="client"
        searchable
        value={filters.clientId ?? ""}
        onValueChange={(value) => applyFilter("client", value)}
        placeholder={isFr ? "Tous les clients" : "All clients"}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({
            value: client.id,
            label: client.name,
          })),
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "draft", label: isFr ? "Brouillon" : "Draft" },
          { value: "under_review", label: isFr ? "En revue" : "Under review" },
          { value: "signed", label: isFr ? "Signé" : "Signed" },
          { value: "active", label: isFr ? "Actif" : "Active" },
          { value: "expired", label: isFr ? "Expiré" : "Expired" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
          { value: "archived", label: isFr ? "Archivé" : "Archived" },
        ]}
      />

      <ModernSelect
        name="date"
        value={filters.date ?? "all"}
        onValueChange={(value) => applyFilter("date", value)}
        options={[
          { value: "all", label: isFr ? "Toute date" : "Any date" },
          { value: "renewing_soon", label: isFr ? "Renouvellement proche" : "Renewing soon" },
          { value: "expired", label: isFr ? "Expiré" : "Expired" },
          { value: "active_window", label: isFr ? "Période active" : "Active window" },
          { value: "none", label: isFr ? "Aucune date" : "No dates" },
        ]}
      />

      <ModernSelect
        name="value"
        value={filters.value ?? "all"}
        onValueChange={(value) => applyFilter("value", value)}
        options={[
          { value: "all", label: isFr ? "Toute valeur" : "Any value" },
          { value: "under_10k", label: isFr ? "Moins de 10k" : "Under 10k" },
          { value: "10k_50k", label: isFr ? "10k à 50k" : "10k to 50k" },
          { value: "50k_plus", label: "50k+" },
          { value: "unset", label: isFr ? "Non défini" : "Unset" },
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
