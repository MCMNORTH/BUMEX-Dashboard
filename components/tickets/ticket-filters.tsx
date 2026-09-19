"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import { getTicketStatusLabel } from "@/lib/tickets/helpers";
import type { TicketFilters, TicketFiltersData, TicketStatus } from "@/types/ticket";

type TicketFiltersProps = {
  filters: TicketFilters;
  filterData: TicketFiltersData;
};

const statusOrder: Array<TicketStatus | "all"> = [
  "all",
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "archived",
];

function buildHref(filters: TicketFilters, status: TicketStatus | "all") {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assigneeId) params.set("assignee", filters.assigneeId);
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.dueDate && filters.dueDate !== "all") params.set("due", filters.dueDate);
  if (filters.type) params.set("type", filters.type);
  if (status !== "all") params.set("status", status);

  const query = params.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

export function TicketFilters({ filters, filterData }: TicketFiltersProps) {
  const activeStatus = filters.status || "all";
  const { t } = useI18n();

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-blue-50 p-4 shadow-[var(--shadow-soft)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/70 dark:shadow-none">
      <div className="flex flex-wrap gap-2">
        {statusOrder.map((status) => {
          const active = activeStatus === status;

          return (
            <Link
              key={status}
              href={buildHref(filters, status)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? "border-blue-500/25 bg-blue-50 text-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.12)] dark:border-sky-300/20 dark:bg-sky-500/12 dark:text-sky-100 dark:shadow-none"
                  : "border-slate-200 bg-slate-50/70 text-slate-500 hover:border-blue-200 hover:bg-blue-50/70 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-sky-300/20 dark:hover:bg-white/[0.07] dark:hover:text-white"
              }`}
            >
              {status === "all" ? t("tickets.filters.allStatuses", "All statuses") : getTicketStatusLabel(status)}
            </Link>
          );
        })}
      </div>

      <form className="grid gap-3 xl:grid-cols-[1.35fr_repeat(5,minmax(0,1fr))_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            placeholder={t("tickets.filters.searchPlaceholder", "Search tickets, bugs, client requests, or support work")}
            defaultValue={filters.search ?? ""}
            className="pl-11"
          />
        </div>

        <ModernSelect
          name="priority"
          defaultValue={filters.priority ?? ""}
          placeholder={t("tickets.filters.allPriorities", "All priorities")}
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
          defaultValue={filters.assigneeId ?? ""}
          placeholder={t("tickets.filters.allAssignees", "All assignees")}
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
          defaultValue={filters.projectId ?? ""}
          placeholder={t("tickets.filters.allProjects", "All projects")}
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
          defaultValue={filters.dueDate ?? "all"}
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
          defaultValue={filters.type ?? ""}
          placeholder={t("tickets.filters.allTypes", "All types")}
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

        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}

        <div className="flex gap-2">
          <Button type="submit" className="rounded-2xl px-5">
            {t("common.actions.apply", "Apply")}
          </Button>
          <Button asChild variant="secondary" className="rounded-2xl px-5">
            <Link href="/tickets">{t("common.actions.reset", "Reset")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
