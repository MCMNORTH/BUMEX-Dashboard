"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { FilterSearchInput } from "@/components/shared/filter-search-input";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { TeamFilters as TeamFiltersType, TeamFiltersData } from "@/types/team";

const filterKeys = ["search", "role", "team", "availability", "workload", "assignment"] as const;

export function TeamFilters({
  filters,
  filterData,
}: {
  filters: TeamFiltersType;
  filterData: TeamFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))_auto] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <FilterSearchInput
        value={filters.search ?? ""}
        onSearch={(value) => applyFilter("search", value, { history: "replace" })}
        placeholder={isFr ? "Rechercher une personne, un projet, un client ou une tâche active" : "Search a person, project, client, or active task"}
        inputClassName="border-border/70 bg-background/55 dark:border-white/10 dark:bg-slate-950/45"
      />

      <ModernSelect
        name="role"
        value={filters.role ?? ""}
        onValueChange={(value) => applyFilter("role", value)}
        placeholder={isFr ? "Tous les rôles" : "All roles"}
        options={[
          { value: "", label: isFr ? "Tous les rôles" : "All roles" },
          { value: "admin", label: "Admin" },
          { value: "manager", label: "Manager" },
          { value: "supervisor", label: isFr ? "Superviseur" : "Supervisor" },
          { value: "employee", label: isFr ? "Employé" : "Employee" },
          { value: "shareholder", label: isFr ? "Actionnaire" : "Shareholder" },
        ]}
      />

      <ModernSelect
        name="team"
        searchable
        value={filters.teamId ?? ""}
        onValueChange={(value) => applyFilter("team", value)}
        placeholder={isFr ? "Toutes les équipes" : "All teams"}
        options={[
          { value: "", label: isFr ? "Toutes les équipes" : "All teams" },
          ...filterData.teams.map((team) => ({ value: team.id, label: team.name })),
        ]}
      />

      <ModernSelect
        name="availability"
        value={filters.availability ?? ""}
        onValueChange={(value) => applyFilter("availability", value)}
        placeholder={isFr ? "Toute disponibilité" : "Any availability"}
        options={[
          { value: "", label: isFr ? "Toute disponibilité" : "Any availability" },
          { value: "available", label: isFr ? "Disponible" : "Available" },
          { value: "busy", label: isFr ? "Occupé" : "Busy" },
          { value: "overloaded", label: isFr ? "Surchargé" : "Overloaded" },
          { value: "away", label: isFr ? "Absent" : "Away" },
          { value: "inactive", label: isFr ? "Inactif" : "Inactive" },
        ]}
      />

      <ModernSelect
        name="workload"
        value={filters.workload ?? ""}
        onValueChange={(value) => applyFilter("workload", value)}
        placeholder={isFr ? "Toute charge" : "Any workload"}
        options={[
          { value: "", label: isFr ? "Toute charge" : "Any workload" },
          { value: "light", label: isFr ? "Charge légère" : "Light workload" },
          { value: "balanced", label: isFr ? "Charge équilibrée" : "Balanced workload" },
          { value: "high", label: isFr ? "Charge élevée" : "High workload" },
          { value: "critical", label: isFr ? "Charge critique" : "Critical workload" },
        ]}
      />

      <ModernSelect
        name="assignment"
        value={filters.assignment ?? ""}
        onValueChange={(value) => applyFilter("assignment", value)}
        placeholder={isFr ? "Tout état" : "Any state"}
        options={[
          { value: "", label: isFr ? "Tout état d’affectation" : "Any assignment state" },
          { value: "available", label: isFr ? "Prêt pour une mission" : "Ready for work" },
          { value: "engaged", label: isFr ? "En livraison" : "In delivery" },
          { value: "steady", label: isFr ? "En rythme" : "In flow" },
          { value: "loaded", label: isFr ? "Chargé" : "Loaded" },
          { value: "attention", label: isFr ? "À surveiller" : "Needs attention" },
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
