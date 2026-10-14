"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { RoadmapFilterData, RoadmapFilters, RoadmapView } from "@/types/milestone";

const filterKeys = ["search", "status", "project", "client", "owner"] as const;
const viewKeys = ["view"] as const;

export function RoadmapFilters({
  filters,
  filterData,
  view,
}: {
  filters: RoadmapFilters;
  filterData: RoadmapFilterData;
  view: RoadmapView;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);
  const { applyFilter: applyView } = useFilterParams(viewKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher des projets" : "Search projects"}
        inputClassName="h-11 rounded-xl border-border/70 bg-background/45"
      />

      <ModernSelect
        name="view"
        value={view}
        onValueChange={(value) => applyView("view", value)}
        options={[
          { value: "month", label: isFr ? "Vue mensuelle" : "Month view" },
          { value: "quarter", label: isFr ? "Vue trimestrielle" : "Quarter view" },
          { value: "project", label: isFr ? "Vue projet" : "Project view" },
          { value: "client", label: isFr ? "Vue client" : "Client view" },
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts de jalon" : "All milestone statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts de jalon" : "All milestone statuses" },
          { value: "open", label: isFr ? "Tous les jalons ouverts" : "All open milestones" },
          { value: "planned", label: isFr ? "Planifié" : "Planned" },
          { value: "in_progress", label: isFr ? "En cours" : "In progress" },
          { value: "completed", label: isFr ? "Terminé" : "Completed" },
          { value: "delayed", label: isFr ? "Retardé" : "Delayed" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
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
        name="owner"
        searchable
        value={filters.ownerId ?? ""}
        onValueChange={(value) => applyFilter("owner", value)}
        placeholder={isFr ? "Tous les responsables" : "All owners"}
        options={[
          { value: "", label: isFr ? "Tous les responsables" : "All owners" },
          ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
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
