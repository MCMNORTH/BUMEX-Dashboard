"use client";

import { Search, X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { ProjectFilters, ProjectFiltersData } from "@/types/project";

type ProjectFiltersProps = {
  filters: ProjectFilters;
  filterData: ProjectFiltersData;
};

const filterKeys = ["search", "status", "kind", "client", "owner", "deadline", "health"] as const;

export function ProjectFilters({ filters, filterData }: ProjectFiltersProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-2 rounded-xl border border-border bg-card p-3 transition-opacity sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.6fr)_repeat(6,minmax(0,1fr))_auto]",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <form
        className="relative sm:col-span-2 xl:col-span-1"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("search");
          applyFilter("search", typeof value === "string" ? value.trim() : "");
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          key={filters.search ?? ""}
          name="search"
          type="search"
          aria-label={isFr ? "Rechercher des projets" : "Search projects"}
          placeholder={isFr ? "Rechercher un projet par nom" : "Search projects by name"}
          defaultValue={filters.search ?? ""}
          className="pl-9"
        />
      </form>

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "draft", label: isFr ? "Brouillon" : "Draft" },
          { value: "active", label: isFr ? "Actif" : "Active" },
          { value: "on_hold", label: isFr ? "En pause" : "On hold" },
          { value: "completed", label: isFr ? "Terminé" : "Completed" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
        ]}
      />

      <ModernSelect
        name="kind"
        value={filters.kind ?? ""}
        onValueChange={(value) => applyFilter("kind", value)}
        options={[
          { value: "", label: isFr ? "Tous les types" : "All project types" },
          { value: "client_mission", label: isFr ? "Mission client" : "Client mission" },
          { value: "institutional_partnership", label: isFr ? "Partenariat institutionnel" : "Institutional partnership" },
          { value: "internal_product", label: isFr ? "Produit interne BUMEX" : "Internal BUMEX product" },
          { value: "internal_tool", label: isFr ? "Outil interne BUMEX" : "Internal BUMEX tool" },
        ]}
      />

      <ModernSelect
        name="client"
        value={filters.clientId ?? ""}
        onValueChange={(value) => applyFilter("client", value)}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="owner"
        value={filters.ownerId ?? ""}
        onValueChange={(value) => applyFilter("owner", value)}
        options={[
          { value: "", label: isFr ? "Tous les responsables" : "All owners" },
          ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
        ]}
      />

      <ModernSelect
        name="deadline"
        value={filters.deadline ?? "all"}
        onValueChange={(value) => applyFilter("deadline", value)}
        options={[
          { value: "all", label: isFr ? "Toute échéance" : "Any deadline" },
          { value: "overdue", label: isFr ? "En retard" : "Overdue" },
          { value: "this_week", label: isFr ? "Dans 7 jours" : "Due in 7 days" },
          { value: "this_month", label: isFr ? "Dans 30 jours" : "Due in 30 days" },
          { value: "none", label: isFr ? "Aucune échéance" : "No deadline" },
        ]}
      />

      <ModernSelect
        name="health"
        value={filters.health ?? ""}
        onValueChange={(value) => applyFilter("health", value)}
        options={[
          { value: "", label: isFr ? "Toute santé" : "Any health" },
          { value: "healthy", label: isFr ? "Bonne santé" : "Healthy" },
          { value: "warning", label: isFr ? "Vigilance" : "Warning" },
          { value: "attention", label: isFr ? "À risque ou en retard" : "At risk or delayed" },
          { value: "at_risk", label: isFr ? "À risque" : "At risk" },
          { value: "delayed", label: isFr ? "En retard" : "Delayed" },
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
