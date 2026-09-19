"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import type { ProjectFilters, ProjectFiltersData } from "@/types/project";

type ProjectFiltersProps = {
  filters: ProjectFilters;
  filterData: ProjectFiltersData;
};

export function ProjectFilters({ filters, filterData }: ProjectFiltersProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-violet-50 p-4 shadow-[var(--shadow-soft)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/80 dark:shadow-none xl:grid-cols-[1.3fr_repeat(6,minmax(0,1fr))_auto]">
      <div className="relative xl:col-span-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          placeholder={isFr ? "Rechercher des projets, flux delivery ou clients" : "Search projects, delivery streams, or clients"}
          defaultValue={filters.search ?? ""}
          className="pl-11"
        />
      </div>

      <ModernSelect
        name="status"
        defaultValue={filters.status ?? ""}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
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
        defaultValue={filters.kind ?? ""}
        placeholder={isFr ? "Toutes les natures" : "All project types"}
        options={[
          { value: "", label: isFr ? "Toutes les natures" : "All project types" },
          { value: "client_mission", label: isFr ? "Mission client" : "Client mission" },
          { value: "institutional_partnership", label: isFr ? "Partenariat institutionnel" : "Institutional partnership" },
          { value: "internal_product", label: isFr ? "Produit interne BUMEX" : "Internal BUMEX product" },
          { value: "internal_tool", label: isFr ? "Outil interne BUMEX" : "Internal BUMEX tool" },
        ]}
      />

      <ModernSelect
        name="client"
        defaultValue={filters.clientId ?? ""}
        placeholder={isFr ? "Toutes les entités" : "All entities"}
        options={[
          { value: "", label: isFr ? "Toutes les entités" : "All entities" },
          ...filterData.clients.map((client) => ({ value: client.id, label: client.name })),
        ]}
      />

      <ModernSelect
        name="owner"
        defaultValue={filters.ownerId ?? ""}
        placeholder={isFr ? "Tous les responsables" : "All owners"}
        options={[
          { value: "", label: isFr ? "Tous les responsables" : "All owners" },
          ...filterData.owners.map((owner) => ({ value: owner.id, label: owner.full_name })),
        ]}
      />

      <ModernSelect
        name="deadline"
        defaultValue={filters.deadline ?? "all"}
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
        defaultValue={filters.health ?? ""}
        placeholder={isFr ? "Toute santé" : "Any health"}
        options={[
          { value: "", label: isFr ? "Toute santé" : "Any health" },
          { value: "healthy", label: isFr ? "Bonne santé" : "Healthy" },
          { value: "warning", label: isFr ? "Vigilance" : "Warning" },
          { value: "attention", label: isFr ? "À risque ou en retard" : "At risk or delayed" },
          { value: "at_risk", label: isFr ? "À risque" : "At risk" },
          { value: "delayed", label: isFr ? "En retard" : "Delayed" },
        ]}
      />

      <div className="flex gap-2">
        <Button type="submit" className="rounded-2xl px-5">
          {isFr ? "Appliquer" : "Apply"}
        </Button>
        <Button asChild variant="secondary" className="rounded-2xl px-5">
          <Link href="/projects">{isFr ? "Réinitialiser" : "Reset"}</Link>
        </Button>
      </div>
    </form>
  );
}
