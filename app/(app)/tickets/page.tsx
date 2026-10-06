import { Suspense } from "react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { getTeamWorkload } from "@/lib/team/service";
import { getTeamWorkloadPreview, getTicketQuickCounts, getTickets, getTicketsFilterData } from "@/lib/tickets/service";
import { Card, CardContent } from "@/components/ui/card";
import { QuickFilters } from "@/components/shared/quick-filters";
import { TicketEmptyState } from "@/components/tickets/ticket-empty-state";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketForm } from "@/components/tickets/ticket-form";
import { TicketKanban } from "@/components/tickets/ticket-kanban";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketToast } from "@/components/tickets/ticket-toast";
import { TicketViewSwitcher } from "@/components/tickets/ticket-view-switcher";
import { TicketWorkloadPreview } from "@/components/tickets/ticket-workload-preview";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/formatters";
import type { TicketFilters as TicketFiltersType, TicketWorkspaceView } from "@/types/ticket";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildQueryString(params: Record<string, string | string[] | undefined>) {
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalized = getString(value);

    if (normalized && key !== "toast" && key !== "create") {
      nextParams.set(key, normalized);
    }
  }

  return nextParams.toString();
}

// Keys owned by the quick filters: picking a quick filter replaces all of them,
// while search, project, type, and view are kept.
const quickFilterKeys = ["status", "priority", "assignee", "due", "attention"] as const;

export default function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="space-y-4">
      <TicketToast />
      <Suspense fallback={<TicketsPageFallback />}>
        <TicketsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TicketsContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("tickets");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const dictionary = getDictionary(locale);
  const params = (await searchParams) ?? {};

  const filters: TicketFiltersType = {
    search: getString(params.search) ?? "",
    status: (getString(params.status) as TicketFiltersType["status"]) ?? "",
    priority: (getString(params.priority) as TicketFiltersType["priority"]) ?? "",
    assigneeId: getString(params.assignee) ?? "",
    projectId: getString(params.project) ?? "",
    dueDate: (getString(params.due) as TicketFiltersType["dueDate"]) ?? "all",
    type: (getString(params.type) as TicketFiltersType["type"]) ?? "",
    attention: getString(params.attention) === "1",
  };
  // The quick-filter counts are computed within the same search/project/type scope as the list.
  const baseFilters: TicketFiltersType = {
    search: filters.search,
    projectId: filters.projectId,
    type: filters.type,
  };
  const requestedView = (getString(params.view) as TicketWorkspaceView) ?? "table";
  const canUseKanban = auth.role !== "shareholder";
  const activeView: TicketWorkspaceView = requestedView === "kanban" && canUseKanban ? "kanban" : "table";
  const canCreate = auth.role === "admin" || isManagerLikeRole(auth.role);

  const [tickets, scopeTickets, filterData, assigneeWorkloads] = await Promise.all([
    getTickets(auth.role, filters),
    getTickets(auth.role, baseFilters),
    getTicketsFilterData(),
    canCreate ? getTeamWorkload(auth.role, auth.profile.id) : Promise.resolve([]),
  ]);
  const suggestedAssignees = assigneeWorkloads
    .filter((member) => member.availability_status === "available" || member.availability_status === "busy")
    .filter((member) => member.workload_risk !== "high")
    .sort((left, right) => {
      if (left.utilization_percentage !== right.utilization_percentage) {
        return left.utilization_percentage - right.utilization_percentage;
      }

      return left.full_name.localeCompare(right.full_name);
    })
    .slice(0, 6);
  const requestedProjectId = getString(params.project) ?? "";
  const initialProjectId = filterData.projects.some((project) => project.id === requestedProjectId) ? requestedProjectId : "";
  const openCreateForm = canCreate && getString(params.create) === "1";

  const counts = getTicketQuickCounts(scopeTickets, auth.profile.id);
  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.priority || filters.assigneeId || filters.projectId || filters.type || filters.attention
      || (filters.dueDate && filters.dueDate !== "all"),
  );
  const workload = getTeamWorkloadPreview(tickets);
  const queryString = buildQueryString(params);
  const quickFilterHref = (updates: Partial<Record<(typeof quickFilterKeys)[number], string>>) => {
    const next = new URLSearchParams(queryString);
    next.delete("create");
    quickFilterKeys.forEach((key) => next.delete(key));
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    return `/tickets${next.size ? `?${next.toString()}` : ""}`;
  };
  const isQuickFilterActive = (expected: Partial<Record<(typeof quickFilterKeys)[number], string>>) =>
    quickFilterKeys.every((key) => (getString(params[key]) ?? "") === (expected[key] ?? ""));

  return (
    <>
      <section className="surface-hero px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isFr ? "Chaque demande devient une action claire." : "Turn every request into a clear action."}
            </h1>
            <p className="mt-1.5 text-sm text-white/75">
              {isFr
                ? "Décrivez le besoin, confiez la tâche à un membre impliqué, puis suivez son avancée sans perdre le contexte."
                : "Describe the need, assign the task, and follow progress without losing context."}
            </p>
          </div>
          {canCreate ? (
            <TicketForm
              mode="create"
              role={auth.role}
              filterData={filterData}
              defaults={initialProjectId ? { project_id: initialProjectId } : undefined}
              openOnLoad={openCreateForm}
              assigneeWorkloads={assigneeWorkloads}
              suggestedAssignees={suggestedAssignees}
            />
          ) : null}
        </div>
      </section>

      <QuickFilters
        label={isFr ? "Filtres rapides des tickets" : "Ticket quick filters"}
        items={[
          { key: "all", label: isFr ? "Tous" : "All", count: counts.all, href: quickFilterHref({}), active: isQuickFilterActive({}) },
          { key: "mine", label: isFr ? "Mes tickets" : "Mine", count: counts.mine, href: quickFilterHref({ assignee: auth.profile.id }), active: isQuickFilterActive({ assignee: auth.profile.id }) },
          { key: "attention", label: isFr ? "À traiter" : "Needs attention", count: counts.attention, href: quickFilterHref({ attention: "1" }), active: isQuickFilterActive({ attention: "1" }), tone: "danger" },
          { key: "overdue", label: isFr ? "En retard" : "Overdue", count: counts.overdue, href: quickFilterHref({ due: "overdue" }), active: isQuickFilterActive({ due: "overdue" }), tone: "danger" },
          { key: "week", label: isFr ? "Cette semaine" : "Due this week", count: counts.dueThisWeek, href: quickFilterHref({ due: "this_week" }), active: isQuickFilterActive({ due: "this_week" }) },
          { key: "blocked", label: isFr ? "Bloqués" : "Blocked", count: counts.blocked, href: quickFilterHref({ status: "blocked" }), active: isQuickFilterActive({ status: "blocked" }), tone: "danger" },
          { key: "unassigned", label: isFr ? "Sans responsable" : "Unassigned", count: counts.unassigned, href: quickFilterHref({ assignee: "unassigned" }), active: isQuickFilterActive({ assignee: "unassigned" }) },
        ]}
      />

      <TicketFilters filters={filters} filterData={filterData} />

      <section aria-labelledby="ticket-queue-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 id="ticket-queue-heading" className="text-lg font-semibold tracking-tight">
              {activeView === "kanban"
                ? getMessage(dictionary, "tickets.page.kanbanBoard", "Kanban board")
                : getMessage(dictionary, "tickets.page.ticketList", "Ticket list")}
            </h2>
            <span className="text-sm text-muted-foreground">
              {formatNumber(tickets.length)} {getMessage(dictionary, "tickets.page.results", "results")}
            </span>
          </div>
          <TicketViewSwitcher
            activeView={activeView}
            canUseKanban={canUseKanban}
            queryString={queryString}
            labels={{ table: isFr ? "Liste" : "Table", kanban: "Kanban" }}
          />
        </div>

        {tickets.length ? (
          activeView === "kanban" ? (
            <TicketKanban tickets={tickets.filter((ticket) => ticket.status !== "archived")} canDrag={canUseKanban} />
          ) : (
            <TicketTable tickets={tickets} />
          )
        ) : (
          <TicketEmptyState
            role={auth.role}
            filterData={filterData}
            clearFiltersHref={hasActiveFilters ? `/tickets${activeView === "kanban" ? "?view=kanban" : ""}` : undefined}
          />
        )}
      </section>

      {workload.length ? (
        <TicketWorkloadPreview
          workload={workload}
          title={isFr ? "Charge de l’équipe" : "Team workload"}
          subtitle={isFr ? "Tickets assignés, en retard et actifs par personne, pour la sélection actuelle." : "Assigned, overdue, and active tickets per person for the current selection."}
        />
      ) : null}
    </>
  );
}

function TicketsPageFallback() {
  return (
    <div className="space-y-4" aria-label="Loading tickets">
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-15 w-full" />
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
