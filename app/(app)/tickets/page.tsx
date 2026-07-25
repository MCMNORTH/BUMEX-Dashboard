import { Suspense } from "react";
import { ClipboardList, FolderKanban, ShieldAlert, Zap } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { getTeamWorkload } from "@/lib/team/service";
import { getTeamWorkloadPreview, getTickets, getTicketsFilterData, getTicketStats } from "@/lib/tickets/service";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

    if (normalized) {
      nextParams.set(key, normalized);
    }
  }

  return nextParams.toString();
}

export default function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="space-y-5">
      <TicketToast />
      <PageHeader
        eyebrow="Tickets module"
        title="A premium ticketing workspace for operations, delivery, and support."
        subtitle="Search, filter, create, and manage bugs, support requests, internal tasks, and client-linked delivery work from one enterprise-grade module."
      />
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
  };
  const requestedView = (getString(params.view) as TicketWorkspaceView) ?? "table";
  const canUseKanban = auth.role !== "shareholder";
  const activeView: TicketWorkspaceView = requestedView === "kanban" && canUseKanban ? "kanban" : "table";
  const canCreate = auth.role === "admin" || isManagerLikeRole(auth.role);

  const [tickets, filterData, assigneeWorkloads] = await Promise.all([
    getTickets(auth.role, filters),
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

  const stats = getTicketStats(tickets, auth.profile.id);
  const workload = getTeamWorkloadPreview(tickets);
  const queryString = buildQueryString(params);
  const exportRows = tickets.map((ticket) => ({
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    project: ticket.project?.name ?? "",
    assignee: ticket.assignee?.full_name ?? "",
    due_date: ticket.due_date ?? "",
    updated_at: ticket.updated_at,
  }));

  return (
    <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          {auth.role === "shareholder"
            ? getMessage(dictionary, "tickets.page.subtitles.shareholder", "Read-only ticket summaries focused on delivery pressure, backlog movement, and high-level operational risk.")
            : auth.role === "employee"
              ? getMessage(dictionary, "tickets.page.subtitles.employee", "Track the tickets assigned to you, update execution progress, and keep work visible across the organization.")
              : getMessage(dictionary, "tickets.page.subtitles.default", "Search, filter, create, and manage bugs, support requests, internal tasks, and client-linked delivery work from one enterprise-grade module.")}
        </p>
        {canCreate ? (
          <TicketForm
            mode="create"
            role={auth.role}
            filterData={filterData}
            assigneeWorkloads={assigneeWorkloads}
            suggestedAssignees={suggestedAssignees}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <TicketViewSwitcher activeView={activeView} canUseKanban={canUseKanban} queryString={queryString} />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {auth.role === "shareholder"
            ? getMessage(dictionary, "tickets.page.summaryMode", "Summary access mode")
            : getMessage(dictionary, "tickets.page.interactiveMode", "Interactive work management")}
        </Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {[
          {
            icon: ClipboardList,
            label: getMessage(dictionary, "tickets.page.stats.visibleTickets.label", "Visible tickets"),
            value: formatNumber(stats.total),
            detail: getMessage(dictionary, "tickets.page.stats.visibleTickets.detail", "Current scoped workload"),
          },
          {
            icon: FolderKanban,
            label: getMessage(dictionary, "tickets.page.stats.myTickets.label", "My tickets"),
            value: formatNumber(stats.mine),
            detail: getMessage(dictionary, "tickets.page.stats.myTickets.detail", "Assigned to current user"),
          },
          {
            icon: Zap,
            label: getMessage(dictionary, "tickets.page.stats.urgent.label", "Urgent"),
            value: formatNumber(stats.urgent),
            detail: getMessage(dictionary, "tickets.page.stats.urgent.detail", "Highest priority pressure"),
          },
          {
            icon: ShieldAlert,
            label: getMessage(dictionary, "tickets.page.stats.blocked.label", "Blocked"),
            value: formatNumber(stats.blocked),
            detail: getMessage(dictionary, "tickets.page.stats.blocked.detail", "Execution requiring attention"),
          },
        ].map(({ icon: Icon, label, value, detail }) => {
          const normalizedLabel = label.toLowerCase();
          const critical = normalizedLabel.includes("urgent") || normalizedLabel.includes("blocked");

          return (
          <Card
            key={label}
            className={`relative overflow-hidden border-slate-200 bg-white shadow-[var(--shadow-soft)] border-t-2 dark:border-white/10 dark:bg-slate-950/48 dark:shadow-none ${
              critical ? "border-t-red-500" : "border-t-blue-500"
            }`}
          >
            <CardContent className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase dark:text-slate-300/80">{label}</p>
                  <p className="mt-1.5 text-[1.45rem] font-bold tracking-[-0.025em] dark:text-white">{value}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{detail}</p>
                </div>
                <div className={`flex size-8 items-center justify-center rounded-[14px] border ${critical ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-500/12" : "border-blue-200 bg-blue-50 dark:border-sky-400/20 dark:bg-sky-500/12"}`}>
                  <Icon className={`size-4 ${critical ? "text-red-600" : "text-primary"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <TicketFilters filters={filters} filterData={filterData} />
      <TicketWorkloadPreview workload={workload} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{getMessage(dictionary, "tickets.page.queue", "Queue")}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
            {activeView === "kanban"
              ? getMessage(dictionary, "tickets.page.kanbanBoard", "Kanban board")
              : getMessage(dictionary, "tickets.page.ticketList", "Ticket list")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton filename="tickets-export" rows={exportRows} />
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {tickets.length} {getMessage(dictionary, "tickets.page.results", "results")}
          </Badge>
        </div>
      </div>

      {tickets.length ? (
        activeView === "kanban" ? (
          <TicketKanban tickets={tickets.filter((ticket) => ticket.status !== "archived")} canDrag={canUseKanban} />
        ) : (
          <TicketTable tickets={tickets} />
        )
      ) : (
        <TicketEmptyState role={auth.role} filterData={filterData} />
      )}
    </>
  );
}

function TicketsPageFallback() {
  return (
    <div className="space-y-6" aria-label="Loading tickets">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <Skeleton className="h-5 w-full max-w-3xl" />
        <Skeleton className="h-12 w-36 rounded-full" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-64 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-slate-200 bg-white">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="size-11 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)]">
        <CardContent className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-32 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-12 min-w-64 flex-1 rounded-full" />
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-36 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)]">
        <CardContent className="space-y-5 px-5 py-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-20 rounded-[22px]" />
        </CardContent>
      </Card>
      <Card className="border-slate-200 bg-white shadow-[var(--shadow-soft)]">
        <CardContent className="space-y-4 px-5 py-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-10 w-36 rounded-full" />
          </div>
          <Skeleton className="h-28 rounded-[22px]" />
          <Skeleton className="h-28 rounded-[22px]" />
        </CardContent>
      </Card>
    </div>
  );
}
