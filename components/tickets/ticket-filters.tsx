"use client";

import { Search, X } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { useFilterParams } from "@/hooks/use-filter-params";
import { cn } from "@/lib/utils";
import type { TicketFilters, TicketFiltersData, TicketStatus } from "@/types/ticket";

type TicketFiltersProps = {
  filters: TicketFilters;
  filterData: TicketFiltersData;
};

const statusOrder: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "archived",
];

const filterKeys = ["search", "status", "priority", "assignee", "project", "due", "type", "attention"] as const;

export function TicketFilters({ filters, filterData }: TicketFiltersProps) {
  const { t } = useI18n();
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
          aria-label={t("tickets.filters.searchLabel", "Search tickets")}
          placeholder={t("tickets.filters.searchPlaceholder", "Search tickets by title")}
          defaultValue={filters.search ?? ""}
          className="pl-9"
        />
      </form>

      <ModernSelect
        name="status"
        value={filters.status ?? ""}
        onValueChange={(value) => applyFilter("status", value)}
        options={[
          { value: "", label: t("tickets.filters.allStatuses", "All statuses") },
          ...statusOrder.map((status) => ({
            value: status,
            label: t(`tickets.form.select.statuses.${status}`, status),
          })),
        ]}
      />

      <ModernSelect
        name="priority"
        value={filters.priority ?? ""}
        onValueChange={(value) => applyFilter("priority", value)}
        options={[
          { value: "", label: t("tickets.filters.allPriorities", "All priorities") },
          { value: "low", label: t("tickets.form.select.priorities.low", "Low") },
          { value: "medium", label: t("tickets.form.select.priorities.medium", "Medium") },
          { value: "high", label: t("tickets.form.select.priorities.high", "High") },
          { value: "urgent", label: t("tickets.form.select.priorities.urgent", "Urgent") },
        ]}
      />

      <ModernSelect
        name="assignee"
        value={filters.assigneeId ?? ""}
        onValueChange={(value) => applyFilter("assignee", value)}
        options={[
          { value: "", label: t("tickets.filters.allAssignees", "All assignees") },
          { value: "unassigned", label: t("tickets.filters.unassigned", "Unassigned") },
          ...filterData.assignees.map((assignee) => ({
            value: assignee.id,
            label: assignee.full_name,
          })),
        ]}
      />

      <ModernSelect
        name="project"
        value={filters.projectId ?? ""}
        onValueChange={(value) => applyFilter("project", value)}
        options={[
          { value: "", label: t("tickets.filters.allProjects", "All projects") },
          ...filterData.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
      />

      <ModernSelect
        name="due"
        value={filters.dueDate ?? "all"}
        onValueChange={(value) => applyFilter("due", value)}
        options={[
          { value: "all", label: t("tickets.filters.anyDueDate", "Any due date") },
          { value: "overdue", label: t("tickets.filters.overdue", "Overdue") },
          { value: "this_week", label: t("tickets.filters.dueIn7Days", "Due in 7 days") },
          { value: "this_month", label: t("tickets.filters.dueIn30Days", "Due in 30 days") },
          { value: "none", label: t("tickets.filters.noDeadline", "No deadline") },
        ]}
      />

      <ModernSelect
        name="type"
        value={filters.type ?? ""}
        onValueChange={(value) => applyFilter("type", value)}
        options={[
          { value: "", label: t("tickets.filters.allTypes", "All types") },
          { value: "task", label: t("tickets.form.select.types.task", "Task") },
          { value: "bug", label: t("tickets.form.select.types.bug", "Bug") },
          { value: "feature", label: t("tickets.form.select.types.feature", "Feature") },
          { value: "support", label: t("tickets.form.select.types.support", "Support") },
          { value: "client_request", label: t("tickets.form.select.types.client_request", "Client request") },
          { value: "internal", label: t("tickets.form.select.types.internal", "Internal") },
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
        {t("common.actions.clearFilters", "Clear filters")}
      </Button>
    </div>
  );
}
