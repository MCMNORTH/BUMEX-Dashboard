import { AlertTriangle, CalendarDays, Clock3, FolderKanban } from "lucide-react";

import { PlanningRiskPanel } from "@/components/alerts/planning-risk-panel";
import { requireRouteAccess } from "@/lib/auth/server";
import { getPlanningAlerts } from "@/lib/alerts/service";
import { getPlanningSummary, getUpcomingDeadlines, getWeeklyTasks, getOverdueTasks, getTeamWorkloadPreview } from "@/lib/planning/service";
import { formatDateKey, getWeekStart } from "@/lib/planning/helpers";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { AvailablePeoplePanel } from "@/components/team/available-people-panel";
import { OverloadedPeoplePanel } from "@/components/team/overloaded-people-panel";
import { WorkloadHeatmap } from "@/components/team/workload-heatmap";
import { getAvailableTeamMembers, getOverloadedTeamMembers, getTeamWorkload } from "@/lib/team/service";
import { getTicketsFilterData } from "@/lib/tickets/service";
import { PageHeader } from "@/components/layout/page-header";
import { WeekNavigator } from "@/components/planning/week-navigator";
import { PlanningFilters } from "@/components/planning/planning-filters";
import { WeeklyPlanningBoard } from "@/components/planning/weekly-planning-board";
import { OverdueTasksPanel } from "@/components/planning/overdue-tasks-panel";
import { PlanningTaskCard } from "@/components/planning/planning-task-card";
import { TicketWorkloadPreview } from "@/components/tickets/ticket-workload-preview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanningFilters as PlanningFiltersType } from "@/types/planning";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const auth = await requireRouteAccess("planning");
  const params = (await searchParams) ?? {};
  const week = getString(params.week) ?? formatDateKey(getWeekStart());
  const filters: PlanningFiltersType = {
    assigneeId: getString(params.assignee) ?? "",
    projectId: getString(params.project) ?? "",
    priority: (getString(params.priority) as PlanningFiltersType["priority"]) ?? "",
    status: (getString(params.status) as PlanningFiltersType["status"]) ?? "",
    type: (getString(params.type) as PlanningFiltersType["type"]) ?? "",
  };

  const [weeklyTasks, overdueTasks, filterData, alerts, workloadDetail, availableMembers, overloadedMembers] = await Promise.all([
    getWeeklyTasks(auth.role, week, filters),
    getOverdueTasks(auth.role, filters),
    getTicketsFilterData(),
    getPlanningAlerts(auth.role, auth.profile.id),
    auth.role === "shareholder" ? Promise.resolve([]) : getTeamWorkload(auth.role, auth.profile.id),
    auth.role === "shareholder" ? Promise.resolve([]) : getAvailableTeamMembers(auth.role, auth.profile.id),
    auth.role === "shareholder" ? Promise.resolve([]) : getOverloadedTeamMembers(auth.role, auth.profile.id),
  ]);

  const summary = getPlanningSummary(weeklyTasks);
  const upcomingDeadlines = getUpcomingDeadlines(weeklyTasks.visibleTickets);
  const workload = getTeamWorkloadPreview(weeklyTasks.visibleTickets);
  const summaryMode = auth.role === "shareholder";
  const canDrag = auth.role !== "shareholder";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          eyebrow={isFr ? "Planification" : "Planning"}
          title={
            summaryMode
              ? isFr
                ? "Une visibilité hebdomadaire de haut niveau sur l'espace de travail opérationnel."
                : "High-level weekly planning visibility across the operational workspace."
              : auth.role === "employee"
                ? isFr
                  ? "Un plan hebdomadaire structuré pour votre travail opérationnel assigné."
                  : "A structured weekly plan for your assigned operational work."
                : isFr
                  ? "Un tableau hebdomadaire professionnel pour le delivery, le support et l'exécution."
                  : "A professional weekly planning board for delivery, support, and execution."
          }
          subtitle={
            summaryMode
              ? isFr
                ? "Résumé hebdomadaire uniquement. Le détail interne des tâches est volontairement masqué en mode actionnaire."
                : "Weekly summary only. Internal task detail is intentionally hidden in shareholder mode."
              : auth.role === "employee"
                ? isFr
                  ? "Organisez le travail à échéance par jour, identifiez la pression des délais et replanifiez vos tickets directement depuis le tableau."
                  : "Organize due work by day, identify deadline pressure, and reschedule your assigned tickets directly from the planning board."
                : isFr
                  ? "Planifiez l'exécution de l'équipe semaine par semaine avec les vraies dates des tickets, la visibilité charge, la détection des retards et le réajustement quotidien."
                  : "Plan team execution by week using real ticket dates, workload visibility, overdue detection, and direct day-to-day rescheduling."
          }
        />
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          {summaryMode ? (isFr ? "Mode synthèse" : "Summary mode") : (isFr ? "Connecté aux données réelles des tickets" : "Connected to real ticket data")}
        </Badge>
      </div>

      <WeekNavigator week={week} />
      <PlanningFilters
        filters={filters}
        filterData={filterData}
        week={week}
        canFilterAssignee={!summaryMode}
      />

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: CalendarDays,
            label: isFr ? "Planifiés cette semaine" : "Scheduled this week",
            value: formatNumber(summary.scheduledThisWeek),
            detail: isFr ? "Tickets avec échéance dans la semaine affichée" : "Tickets with due dates inside the visible week",
          },
          {
            icon: Clock3,
            label: isFr ? "À traiter aujourd'hui" : "Due today",
            value: formatNumber(summary.dueToday),
            detail: isFr ? "Tâches nécessitant une attention le jour même" : "Tasks requiring same-day attention",
          },
          {
            icon: AlertTriangle,
            label: isFr ? "En retard" : "Overdue",
            value: formatNumber(summary.overdueCount),
            detail: isFr ? "Travail ouvert au-delà des dates prévues" : "Open work beyond planned dates",
          },
          {
            icon: FolderKanban,
            label: isFr ? "Non planifiés" : "Unscheduled",
            value: formatNumber(summary.unscheduledCount),
            detail: isFr ? "Tickets sans date d'échéance" : "Tickets still missing a due date",
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                  <Icon className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PlanningRiskPanel
        alerts={alerts}
        title={isFr ? "Alertes de planification" : "Planning alerts"}
        subtitle={
          isFr
            ? "Signaux calculés à partir du travail en retard, de la concentration de charge, des tickets bloqués et du calendrier roadmap."
            : "Signals calculated from overdue work, workload concentration, blocked tickets, and roadmap timing."
        }
        compact
      />

      <WeeklyPlanningBoard
        weekDays={weeklyTasks.weekDays}
        ticketsByDay={weeklyTasks.ticketsByDay}
        unscheduledTasks={weeklyTasks.unscheduledTasks}
        canDrag={canDrag}
        summaryMode={summaryMode}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <OverdueTasksPanel tickets={overdueTasks} summaryMode={summaryMode} />

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Échéances à venir" : "Upcoming deadlines"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Prochain travail planifié" : "Next planned work"}</h3>
            </div>
            {upcomingDeadlines.length ? (
              summaryMode ? (
                <div className="rounded-[22px] border border-border/65 bg-background/38 p-4">
                  <p className="text-sm font-medium">{upcomingDeadlines.length} {isFr ? "échéances à venir" : "upcoming deadlines"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{isFr ? "La visibilité détaillée des tâches est masquée en mode synthèse." : "Detailed task visibility is hidden in summary mode."}</p>
                </div>
              ) : (
                upcomingDeadlines.map((ticket) => (
                  <PlanningTaskCard key={ticket.id} ticket={ticket} />
                ))
              )
            ) : (
              <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 p-5 text-sm text-muted-foreground">
                {isFr ? "Aucune échéance à venir dans le périmètre actuel de planification." : "No upcoming deadlines in the current planning scope."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!summaryMode ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <TicketWorkloadPreview
              workload={workload}
              title={isFr ? "Aperçu de la charge équipe" : "Team workload preview"}
              subtitle={
                isFr
                  ? "Volumes de tickets assignés, éléments en retard et charge active dans le périmètre visible de planification."
                  : "Assigned ticket counts, overdue items, and active load across the visible planning scope."
              }
            />
            <WorkloadHeatmap
              workload={workloadDetail}
              title={isFr ? "Répartition de capacité" : "Capacity distribution"}
              description={
                isFr
                  ? "Répartition des heures estimées et utilisation hebdomadaire dans le périmètre visible."
                  : "Estimated-hour distribution and weekly utilization across the visible planning scope."
              }
            />
          </div>
          <div className="grid gap-4">
            <AvailablePeoplePanel members={availableMembers} />
            <OverloadedPeoplePanel members={overloadedMembers} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
