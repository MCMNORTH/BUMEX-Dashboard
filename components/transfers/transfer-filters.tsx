"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { TransferFilters as TransferFiltersType, TransferFiltersData } from "@/types/finance";

const filterKeys = ["search", "client", "project", "status", "category", "entity", "date"] as const;

export function TransferFilters({
  filters,
  filterData,
}: {
  filters: TransferFiltersType;
  filterData: TransferFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.2fr_repeat(6,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher un bénéficiaire, une référence, banque ou notes" : "Search beneficiary, reference, bank, notes"}
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
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "planned", label: isFr ? "Planifié" : "Planned" },
          { value: "pending", label: isFr ? "En attente" : "Pending" },
          { value: "sent", label: isFr ? "Envoyé" : "Sent" },
          { value: "confirmed", label: isFr ? "Confirmé" : "Confirmed" },
          { value: "failed", label: isFr ? "Échoué" : "Failed" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
        ]}
      />

      <ModernSelect
        name="category"
        value={filters.category ?? ""}
        onValueChange={(value) => applyFilter("category", value)}
        placeholder={isFr ? "Toutes les catégories" : "All categories"}
        options={[
          { value: "", label: isFr ? "Toutes les catégories" : "All categories" },
          { value: "supplier", label: isFr ? "Fournisseur" : "Supplier" },
          { value: "salary", label: isFr ? "Salaire" : "Salary" },
          { value: "subcontractor", label: isFr ? "Sous-traitant" : "Subcontractor" },
          { value: "software", label: isFr ? "Logiciel" : "Software" },
          { value: "hosting", label: isFr ? "Hébergement" : "Hosting" },
          { value: "taxes", label: "Taxes" },
          { value: "rent", label: isFr ? "Loyer" : "Rent" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="entity"
        value={filters.entity ?? ""}
        onValueChange={(value) => applyFilter("entity", value)}
        placeholder={isFr ? "Toutes les entités" : "All entities"}
        options={[
          { value: "", label: isFr ? "Toutes les entités" : "All entities" },
          { value: "bumex_it", label: "BUMEX IT" },
          { value: "insec", label: "INSEC" },
          { value: "cnam_intec", label: "CNAM INTEC" },
          { value: "ltm_yh", label: "LTM-YH" },
          { value: "unassigned", label: isFr ? "Non assignée" : "Unassigned" },
        ]}
      />

      <ModernSelect
        name="date"
        value={filters.dateWindow ?? "all"}
        onValueChange={(value) => applyFilter("date", value)}
        options={[
          { value: "all", label: isFr ? "Toute date" : "Any date" },
          { value: "this_month", label: isFr ? "Ce mois-ci" : "This month" },
          { value: "next_30_days", label: isFr ? "30 prochains jours" : "Next 30 days" },
          { value: "past_30_days", label: isFr ? "30 derniers jours" : "Past 30 days" },
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
