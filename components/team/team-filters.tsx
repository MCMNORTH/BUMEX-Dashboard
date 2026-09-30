"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { TeamFilters as TeamFiltersType, TeamFiltersData } from "@/types/team";

export function TeamFilters({
  filters,
  filterData,
}: {
  filters: TeamFiltersType;
  filterData: TeamFiltersData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[30px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))_auto] dark:border-white/10 dark:bg-slate-950/40 dark:shadow-none">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder={isFr ? "Rechercher une personne, un projet, un client ou une tâche active" : "Search a person, project, client, or active task"}
          className="border-border/70 bg-background/55 pl-11 dark:border-white/10 dark:bg-slate-950/45"
        />
      </div>

      <ModernSelect
        name="role"
        defaultValue={filters.role ?? ""}
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
        defaultValue={filters.teamId ?? ""}
        placeholder={isFr ? "Toutes les équipes" : "All teams"}
        options={[
          { value: "", label: isFr ? "Toutes les équipes" : "All teams" },
          ...filterData.teams.map((team) => ({ value: team.id, label: team.name })),
        ]}
      />

      <ModernSelect
        name="availability"
        defaultValue={filters.availability ?? ""}
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
        defaultValue={filters.workload ?? ""}
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
        defaultValue={filters.assignment ?? ""}
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

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          {isFr ? "Appliquer" : "Apply"}
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/team">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
