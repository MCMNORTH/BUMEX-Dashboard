"use client";

import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { PlanningFilters } from "@/types/planning";
import type { TicketFiltersData } from "@/types/ticket";

type PlanningFiltersProps = {
  filters: PlanningFilters;
  filterData: TicketFiltersData;
  canFilterAssignee?: boolean;
};

const filterKeys = ["assignee", "project", "priority", "status", "type"] as const;

export function PlanningFilters({
  filters,
  filterData,
  canFilterAssignee = true,
}: PlanningFiltersProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      {canFilterAssignee ? (
        <ModernSelect
          name="assignee"
          searchable
          value={filters.assigneeId ?? ""}
          onValueChange={(value) => applyFilter("assignee", value)}
          placeholder={isFr ? "Tous les assignés" : "All assignees"}
          options={[
            { value: "", label: isFr ? "Tous les assignés" : "All assignees" },
            ...filterData.assignees.map((assignee) => ({
              value: assignee.id,
              label: assignee.full_name,
            })),
          ]}
        />
      ) : null}

        <ModernSelect
        name="project"
        searchable
        value={filters.projectId ?? ""}
        onValueChange={(value) => applyFilter("project", value)}
        placeholder={isFr ? "Tous les projets" : "All projects"}
        options={[
          { value: "", label: isFr ? "Tous les projets" : "All projects" },
          ...filterData.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
      />

      <ModernSelect
        name="priority"
        value={filters.priority ?? ""}
        onValueChange={(value) => applyFilter("priority", value)}
        placeholder={isFr ? "Toutes les priorités" : "All priorities"}
        options={[
          { value: "", label: isFr ? "Toutes les priorités" : "All priorities" },
          { value: "low", label: isFr ? "Basse" : "Low" },
          { value: "medium", label: isFr ? "Moyenne" : "Medium" },
          { value: "high", label: isFr ? "Haute" : "High" },
          { value: "urgent", label: isFr ? "Urgente" : "Urgent" },
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "backlog", label: isFr ? "Backlog" : "Backlog" },
          { value: "todo", label: isFr ? "À faire" : "To do" },
          { value: "in_progress", label: isFr ? "En cours" : "In progress" },
          { value: "review", label: isFr ? "Revue" : "Review" },
          { value: "blocked", label: isFr ? "Bloqué" : "Blocked" },
          { value: "done", label: isFr ? "Terminé" : "Done" },
        ]}
      />

      <ModernSelect
        name="type"
        value={filters.type ?? ""}
        onValueChange={(value) => applyFilter("type", value)}
        placeholder={isFr ? "Tous les types" : "All types"}
        options={[
          { value: "", label: isFr ? "Tous les types" : "All types" },
          { value: "task", label: isFr ? "Tâche" : "Task" },
          { value: "bug", label: isFr ? "Bug" : "Bug" },
          { value: "feature", label: isFr ? "Fonctionnalité" : "Feature" },
          { value: "support", label: isFr ? "Support" : "Support" },
          { value: "client_request", label: isFr ? "Demande client" : "Client request" },
          { value: "internal", label: isFr ? "Interne" : "Internal" },
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
