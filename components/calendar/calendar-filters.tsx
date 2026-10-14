"use client";

import type { CalendarFilterData, CalendarFilters } from "@/types/calendar";
import { X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";

const filterKeys = ["type", "project", "client", "assignee", "priority", "status"] as const;

export function CalendarFilters({
  filters,
  filterData,
}: {
  filters: CalendarFilters;
  filterData: CalendarFilterData;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { applyFilter, clearFilters, hasActiveFilters, isPending } = useFilterParams(filterKeys);

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--shadow-soft)] xl:grid-cols-[repeat(6,minmax(0,1fr))_auto] transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending}
    >
      <ModernSelect
        name="type"
        value={filters.type ?? ""}
        onValueChange={(value) => applyFilter("type", value)}
        placeholder={isFr ? "Tous les types d'événement" : "All event types"}
        options={[
          { value: "", label: isFr ? "Tous les types d'événement" : "All event types" },
          { value: "ticket_due", label: isFr ? "Échéance ticket" : "Ticket due" },
          { value: "project_deadline", label: isFr ? "Échéance projet" : "Project deadline" },
          { value: "milestone", label: isFr ? "Jalon" : "Milestone" },
          { value: "payment_due", label: isFr ? "Échéance paiement" : "Payment due" },
          { value: "contract_renewal", label: isFr ? "Renouvellement contrat" : "Contract renewal" },
          { value: "internal_event", label: isFr ? "Événement interne" : "Internal event" },
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
          ...filterData.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
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
          ...filterData.clients.map((client) => ({
            value: client.id,
            label: client.name,
          })),
        ]}
      />

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

      <ModernSelect
        name="priority"
        value={filters.priority ?? ""}
        onValueChange={(value) => applyFilter("priority", value)}
        placeholder={isFr ? "Toutes les priorités" : "All priorities"}
        options={[
          { value: "", label: isFr ? "Toutes les priorités" : "All priorities" },
          { value: "low", label: isFr ? "Faible" : "Low" },
          { value: "medium", label: isFr ? "Moyenne" : "Medium" },
          { value: "high", label: isFr ? "Haute" : "High" },
          { value: "urgent", label: isFr ? "Urgente" : "Urgent" },
          { value: "critical", label: isFr ? "Critique" : "Critical" },
        ]}
      />

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        placeholder={isFr ? "Tous les statuts" : "All statuses"}
        options={[
          { value: "", label: isFr ? "Tous les statuts" : "All statuses" },
          { value: "backlog", label: "Backlog" },
          { value: "todo", label: isFr ? "À faire" : "To do" },
          { value: "in_progress", label: isFr ? "En cours" : "In progress" },
          { value: "review", label: isFr ? "Revue" : "Review" },
          { value: "blocked", label: isFr ? "Bloqué" : "Blocked" },
          { value: "done", label: isFr ? "Terminé" : "Done" },
          { value: "planned", label: isFr ? "Planifié" : "Planned" },
          { value: "completed", label: isFr ? "Complété" : "Completed" },
          { value: "delayed", label: isFr ? "Retardé" : "Delayed" },
          { value: "upcoming", label: isFr ? "À venir" : "Upcoming" },
          { value: "scheduled", label: isFr ? "Planifié" : "Scheduled" },
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
