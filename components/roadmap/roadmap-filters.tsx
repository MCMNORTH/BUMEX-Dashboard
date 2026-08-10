"use client";

import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { RoadmapFilterData, RoadmapFilters, RoadmapView } from "@/types/milestone";

export function RoadmapFilters({
  filters,
  filterData,
  view,
  period,
}: {
  filters: RoadmapFilters;
  filterData: RoadmapFilterData;
  view: RoadmapView;
  period: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
      <input type="hidden" name="period" value={period} />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder={isFr ? "Rechercher des projets" : "Search projects"}
          className="h-11 rounded-2xl border-border/70 bg-background/45 pl-10"
        />
      </div>

      <ModernSelect
        name="view"
        defaultValue={view}
        options={[
          { value: "month", label: isFr ? "Vue mensuelle" : "Month view" },
          { value: "quarter", label: isFr ? "Vue trimestrielle" : "Quarter view" },
          { value: "project", label: isFr ? "Vue projet" : "Project view" },
          { value: "client", label: isFr ? "Vue client" : "Client view" },
        ]}
      />

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts de jalon" : "All milestone statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts de jalon" : "All milestone statuses" },
          { value: "planned", label: isFr ? "Planifié" : "Planned" },
          { value: "in_progress", label: isFr ? "En cours" : "In progress" },
          { value: "completed", label: isFr ? "Terminé" : "Completed" },
          { value: "delayed", label: isFr ? "Retardé" : "Delayed" },
          { value: "cancelled", label: isFr ? "Annulé" : "Cancelled" },
        ]}
      />

      <ModernSelect
        name="project"
        defaultValue={filters.projectId ?? ""}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
      />

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder={isFr ? "Tous les clients" : "All clients"}
        options={[
          { value: "", label: isFr ? "Tous les clients" : "All clients" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <div className="flex gap-3">
        <ModernSelect
          name="owner"
          defaultValue={filters.ownerId ?? ""}
          className="min-w-0 flex-1"
          placeholder={isFr ? "Tous les responsables" : "All owners"}
          options={[
            { value: "", label: isFr ? "Tous les responsables" : "All owners" },
            ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
          ]}
        />
        <button
          type="submit"
          className="h-11 rounded-2xl border border-primary/30 bg-primary/12 px-4 text-sm font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/18"
        >
          {isFr ? "Appliquer" : "Apply"}
        </button>
      </div>
    </form>
  );
}
