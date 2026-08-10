"use client";

import type { CalendarFilterData, CalendarFilters, CalendarView } from "@/types/calendar";
import { useI18n } from "@/components/layout/i18n-provider";
import { ModernSelect } from "@/components/ui/modern-select";

export function CalendarFilters({
  filters,
  filterData,
  view,
  period,
}: {
  filters: CalendarFilters;
  filterData: CalendarFilterData;
  view: CalendarView;
  period: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  return (
    <form className="grid gap-3 rounded-[28px] border border-border/70 bg-card/72 p-4 shadow-[var(--shadow-soft)] backdrop-blur-xl xl:grid-cols-6">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="period" value={period} />

      <ModernSelect
        name="type"
        defaultValue={filters.type ?? ""}
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
        defaultValue={filters.projectId ?? ""}
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
        defaultValue={filters.clientId ?? ""}
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
        defaultValue={filters.assigneeId ?? ""}
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
        defaultValue={filters.priority ?? ""}
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

      <div className="flex gap-3">
        <ModernSelect
          name="status"
          defaultValue={filters.status ?? ""}
          className="min-w-0 flex-1"
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
