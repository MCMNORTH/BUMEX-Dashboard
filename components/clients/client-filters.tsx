"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { ClientFilters, ClientFiltersData } from "@/types/client";

const filterKeys = ["search", "status", "type", "stage", "manager"] as const;

export function ClientFilters({
  filters,
  filterData,
}: {
  filters: ClientFilters;
  filterData: ClientFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "bg-card grid gap-3 rounded-xl border border-primary/25 p-4 shadow-[var(--shadow-soft)] dark:border-slate-700 xl:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        className="xl:col-span-1"
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher une relation, organisation ou un secteur" : "Search a relationship, organization, or industry"}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "prospect", label: isFr ? "Prospect" : "Prospect" },
          { value: "active", label: isFr ? "Actif" : "Active" },
          { value: "inactive", label: isFr ? "Inactif" : "Inactive" },
          { value: "suspended", label: isFr ? "Suspendu" : "Suspended" },
          { value: "archived", label: isFr ? "Archivé" : "Archived" },
        ]}
      />

      <ModernSelect
        name="type"
        value={filters.type ?? ""}
        onValueChange={(value) => applyFilter("type", value)}
        placeholder={isFr ? "Tous les types de relation" : "All relationship types"}
        options={[
          { value: "", label: isFr ? "Tous les types de relation" : "All relationship types" },
          { value: "company", label: isFr ? "Entreprise" : "Company" },
          { value: "public_institution", label: isFr ? "Institution publique" : "Public institution" },
          { value: "ngo", label: "NGO" },
          { value: "individual", label: isFr ? "Individuel" : "Individual" },
          { value: "other", label: isFr ? "Autre" : "Other" },
        ]}
      />

      <ModernSelect
        name="stage"
        value={filters.prospectStage ?? ""}
        onValueChange={(value) => applyFilter("stage", value)}
        placeholder={isFr ? "Toutes les phases" : "All stages"}
        options={[
          { value: "", label: isFr ? "Toutes les phases" : "All stages" },
          { value: "initial_contact", label: isFr ? "Premier contact" : "Initial contact" },
          { value: "qualification", label: isFr ? "Qualification" : "Qualification" },
          { value: "negotiation", label: isFr ? "Négociation" : "Negotiation" },
          { value: "proposal_sent", label: isFr ? "Proposition envoyée" : "Proposal sent" },
          { value: "pending_signature", label: isFr ? "En attente de signature" : "Pending signature" },
        ]}
      />

      <ModernSelect
        name="manager"
        searchable
        value={filters.accountManagerId ?? ""}
        onValueChange={(value) => applyFilter("manager", value)}
        placeholder={isFr ? "Tous les responsables" : "All owners"}
        options={[
          { value: "", label: isFr ? "Tous les responsables" : "All owners" },
          ...filterData.accountManagers.map((manager) => ({
            value: manager.id,
            label: manager.full_name,
          })),
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
