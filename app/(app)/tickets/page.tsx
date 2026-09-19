import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, FolderKanban, ShieldAlert, UserRoundX, Zap } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale, getDictionary, getMessage } from "@/lib/i18n/server";
import { getTeamWorkload } from "@/lib/team/service";
import { getTeamWorkloadPreview, getTickets, getTicketsFilterData, getTicketStats } from "@/lib/tickets/service";
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
  const requestedProjectId = getString(params.project) ?? "";
  const initialProjectId = filterData.projects.some((project) => project.id === requestedProjectId) ? requestedProjectId : "";
  const openCreateForm = canCreate && getString(params.create) === "1" && Boolean(initialProjectId);

  const stats = getTicketStats(tickets, auth.profile.id);
  const workload = getTeamWorkloadPreview(tickets);
  const queryString = buildQueryString(params);
  const ticketFilterHref = (updates: Record<string, string>) => {
    const next = new URLSearchParams(queryString);
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return `/tickets${next.size ? `?${next.toString()}` : ""}`;
  };
  const today = new Date().toISOString().slice(0, 10);
  const openTickets = tickets.filter((ticket) => !["done", "archived"].includes(ticket.status));
  const attentionMap = new Map<string, { ticket: (typeof tickets)[number]; reason: string; tone: "rose" | "amber" | "violet" }>();
  openTickets.filter((ticket) => ticket.status === "blocked").forEach((ticket) => attentionMap.set(ticket.id, { ticket, reason: locale === "fr" ? "Bloqué" : "Blocked", tone: "rose" }));
  openTickets.filter((ticket) => ticket.due_date && ticket.due_date < today).forEach((ticket) => { if (!attentionMap.has(ticket.id)) attentionMap.set(ticket.id, { ticket, reason: locale === "fr" ? "En retard" : "Overdue", tone: "rose" }); });
  openTickets.filter((ticket) => ticket.priority === "urgent").forEach((ticket) => { if (!attentionMap.has(ticket.id)) attentionMap.set(ticket.id, { ticket, reason: locale === "fr" ? "Urgent" : "Urgent", tone: "amber" }); });
  openTickets.filter((ticket) => !ticket.assignee_id).forEach((ticket) => { if (!attentionMap.has(ticket.id)) attentionMap.set(ticket.id, { ticket, reason: locale === "fr" ? "Sans responsable" : "Unassigned", tone: "violet" }); });
  const attentionTickets = [...attentionMap.values()].slice(0, 5);

  return (
    <>
      <section className="relative overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[linear-gradient(125deg,#071a37_0%,#075f79_48%,#41308e_100%)] px-7 py-7 text-white shadow-[0_32px_90px_-42px_rgba(6,182,212,.75)]">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-violet-400/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-3xl"><h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{locale === "fr" ? "Chaque demande devient une action claire." : "Turn every request into a clear action."}</h1><p className="mt-3 text-sm leading-6 text-cyan-50/80">{locale === "fr" ? "Décrivez le besoin, confiez la tâche à un membre impliqué, puis suivez son avancée sans perdre le contexte." : "Describe the need, assign the task, and follow progress without losing context."}</p></div>{canCreate ? <TicketForm mode="create" role={auth.role} filterData={filterData} defaults={initialProjectId ? { project_id: initialProjectId } : undefined} openOnLoad={openCreateForm} assigneeWorkloads={assigneeWorkloads} suggestedAssignees={suggestedAssignees} /> : null}</div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">{[(locale === "fr" ? "1 · Décrire" : "1 · Describe"),(locale === "fr" ? "2 · Assigner" : "2 · Assign"),(locale === "fr" ? "3 · Résoudre" : "3 · Resolve")].map((step,index)=><div key={step} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[.08] px-4 py-3 text-xs font-semibold backdrop-blur"><span>{step}</span>{index < 2 ? <ArrowRight className="size-4 text-cyan-200" /> : <CheckCircle2 className="size-4 text-emerald-300" />}</div>)}</div>
      </section>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          {auth.role === "shareholder"
            ? getMessage(dictionary, "tickets.page.subtitles.shareholder", "Read-only ticket summaries focused on delivery pressure, backlog movement, and high-level operational risk.")
            : auth.role === "employee"
              ? getMessage(dictionary, "tickets.page.subtitles.employee", "Track the tickets assigned to you, update execution progress, and keep work visible across the organization.")
              : getMessage(dictionary, "tickets.page.subtitles.default", "Search, filter, create, and manage bugs, support requests, internal tasks, and client-linked delivery work from one enterprise-grade module.")}
        </p>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <TicketViewSwitcher activeView={activeView} canUseKanban={canUseKanban} queryString={queryString} />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {auth.role === "shareholder"
            ? getMessage(dictionary, "tickets.page.summaryMode", "Summary access mode")
            : getMessage(dictionary, "tickets.page.interactiveMode", "Interactive work management")}
        </Badge>
      </div>

      <nav aria-label={locale === "fr" ? "Vues rapides des tickets" : "Ticket quick views"} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-sm">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{locale === "fr" ? "Vues rapides" : "Quick views"}</span>
        {[
          { label: locale === "fr" ? "Tous" : "All", href: ticketFilterHref({ status: "", priority: "", assignee: "", due: "" }), active: !filters.status && !filters.priority && !filters.assigneeId && (!filters.dueDate || filters.dueDate === "all") },
          { label: locale === "fr" ? "Mon travail" : "My work", href: ticketFilterHref({ assignee: auth.profile.id }), active: filters.assigneeId === auth.profile.id },
          { label: locale === "fr" ? "En retard" : "Overdue", href: ticketFilterHref({ due: "overdue" }), active: filters.dueDate === "overdue" },
          { label: locale === "fr" ? "Cette semaine" : "This week", href: ticketFilterHref({ due: "this_week" }), active: filters.dueDate === "this_week" },
          { label: locale === "fr" ? "Sans responsable" : "Unassigned", href: ticketFilterHref({ assignee: "unassigned" }), active: filters.assigneeId === "unassigned" },
        ].map((view) => <Link key={view.label} href={view.href} aria-current={view.active ? "page" : undefined} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${view.active ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-muted/45 text-muted-foreground hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"}`}>{view.label}</Link>)}
      </nav>

      <div className="grid gap-3 xl:grid-cols-4">
        {[
          {
            icon: ClipboardList,
            label: getMessage(dictionary, "tickets.page.stats.visibleTickets.label", "Visible tickets"),
            value: formatNumber(stats.total),
            detail: getMessage(dictionary, "tickets.page.stats.visibleTickets.detail", "Current scoped workload"),
            href: ticketFilterHref({ status: "", priority: "", assignee: "" }),
          },
          {
            icon: FolderKanban,
            label: getMessage(dictionary, "tickets.page.stats.myTickets.label", "My tickets"),
            value: formatNumber(stats.mine),
            detail: getMessage(dictionary, "tickets.page.stats.myTickets.detail", "Assigned to current user"),
            href: ticketFilterHref({ assignee: auth.profile.id }),
          },
          {
            icon: Zap,
            label: getMessage(dictionary, "tickets.page.stats.urgent.label", "Urgent"),
            value: formatNumber(stats.urgent),
            detail: getMessage(dictionary, "tickets.page.stats.urgent.detail", "Highest priority pressure"),
            href: ticketFilterHref({ priority: "urgent" }),
          },
          {
            icon: ShieldAlert,
            label: getMessage(dictionary, "tickets.page.stats.blocked.label", "Blocked"),
            value: formatNumber(stats.blocked),
            detail: getMessage(dictionary, "tickets.page.stats.blocked.detail", "Execution requiring attention"),
            href: ticketFilterHref({ status: "blocked" }),
          },
        ].map(({ icon: Icon, label, value, detail, href }) => {
          const normalizedLabel = label.toLowerCase();
          const critical = normalizedLabel.includes("urgent") || normalizedLabel.includes("blocked");

          return (
          <Link key={label} href={href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"><Card
            className={`relative h-full overflow-hidden border shadow-[var(--shadow-soft)] transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg dark:border-slate-700 dark:shadow-none ${critical ? "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/65 dark:to-orange-950/45" : "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/70"}`}
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
          </Card></Link>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[26px] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50/70 to-rose-50/60 p-5 dark:border-amber-500/20 dark:from-amber-950/20 dark:via-orange-950/15 dark:to-rose-950/15">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-amber-800 dark:text-amber-200"><AlertTriangle className="size-4" />{locale === "fr" ? "Centre d’attention" : "Attention center"}</p><h2 className="mt-1 text-lg font-semibold">{attentionTickets.length ? (locale === "fr" ? `${attentionTickets.length} élément(s) à traiter en priorité` : `${attentionTickets.length} item(s) need priority attention`) : (locale === "fr" ? "La file de travail est sous contrôle" : "The work queue is under control")}</h2></div>{attentionMap.size > attentionTickets.length ? <Badge variant="secondary">+{attentionMap.size - attentionTickets.length}</Badge> : null}</div>
        {attentionTickets.length ? <div className="mt-4 grid gap-2 xl:grid-cols-5">{attentionTickets.map(({ ticket, reason, tone }) => <Link href={`/tickets/${ticket.id}`} key={ticket.id} className={`group rounded-2xl border bg-white/75 p-3 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-background/55 ${tone === "rose" ? "border-rose-200 dark:border-rose-500/25" : tone === "amber" ? "border-amber-200 dark:border-amber-500/25" : "border-violet-200 dark:border-violet-500/25"}`}><div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone === "rose" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : tone === "amber" ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"}`}>{reason}</span>{!ticket.assignee_id ? <UserRoundX className="size-4 text-violet-500" /> : <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}</div><p className="mt-3 line-clamp-2 text-sm font-semibold">{ticket.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.project?.name ?? (locale === "fr" ? "Sans projet" : "No project")}</p></Link>)}</div> : <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="size-5" />{locale === "fr" ? "Aucun ticket bloqué, urgent, en retard ou sans responsable dans la sélection actuelle." : "No blocked, urgent, overdue, or unassigned ticket in the current selection."}</div>}
      </section>

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
