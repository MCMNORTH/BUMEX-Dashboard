import "server-only";

import { getActivityLogs } from "@/lib/activity/service";
import { getFinanceOverview } from "@/lib/finance/service";
import { getProjects } from "@/lib/projects/service";
import { getTeamWorkload } from "@/lib/team/service";
import { getTickets } from "@/lib/tickets/service";
import type { AppRole } from "@/types/auth";
import type { ProjectHealth } from "@/types/project";
import type { TicketRecord } from "@/types/ticket";

export type OverviewKpiSnapshot = {
  value: string;
  change: string;
  caption: string;
  sparkline: number[];
};

export type OverviewWorkloadSnapshot = {
  name: string;
  workload: number;
  capacity: number;
};

export type OverviewWeeklyProgressPoint = {
  day: string;
  completed: number;
  active: number;
};

export type OverviewProjectHealthSnapshot = {
  name: string;
  health: number;
  status: string;
  owner: string;
};

export type OverviewFocusSnapshot = {
  label: string;
  title: string;
  description: string;
  tone: "blue" | "amber" | "violet";
};

export type OverviewTaskDistributionPoint = {
  name: string;
  value: number;
};

export type OverviewActivityItem = {
  title: string;
  description: string;
  time: string;
  actor: string;
  tone: "blue" | "amber" | "emerald" | "violet";
};

export type OverviewDeadlineItem = {
  title: string;
  date: string;
  detail: string;
};

export type OverviewRiskProject = {
  title: string;
  owner: string;
  risk: string;
  severity: string;
  progress: number;
};

export type OverviewPlanningItem = {
  day: string;
  title: string;
  theme: string;
};

export type OverviewDashboardData = {
  kpis: OverviewKpiSnapshot[];
  workload: OverviewWorkloadSnapshot[];
  weeklyProgress: OverviewWeeklyProgressPoint[];
  projectHealth: OverviewProjectHealthSnapshot[];
  focusToday: OverviewFocusSnapshot[];
  taskDistribution: OverviewTaskDistributionPoint[];
  activityFeed: OverviewActivityItem[];
  upcomingDeadlines: OverviewDeadlineItem[];
  atRiskProjects: OverviewRiskProject[];
  nextSevenDays: OverviewPlanningItem[];
};

const OVERVIEW_DATA_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = OVERVIEW_DATA_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Overview data request timed out.")), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfPreviousMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function isInRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return date >= start && date < end;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? "+100%" : "0%";
  }

  const value = Math.round(((current - previous) / previous) * 100);
  return `${value > 0 ? "+" : ""}${value}%`;
}

function formatCompactCurrency(value: number) {
  if (value >= 1000) {
    return `$${Math.round(value / 1000)}K`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getRecentDayStarts(days = 7) {
  const today = startOfDay(new Date());

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));
    return day;
  });
}

function buildDailyCounts<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return getRecentDayStarts().map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    return items.filter((item) => isInRange(getDate(item), day, nextDay)).length;
  });
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function cumulative(values: number[]) {
  let running = 0;
  return values.map((value) => {
    running += value;
    return running;
  });
}

function isOpenTicket(ticket: TicketRecord) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

function healthLabel(health: ProjectHealth) {
  const labels: Record<ProjectHealth, string> = {
    healthy: "Excellent",
    warning: "Surveillance",
    at_risk: "A risque",
    delayed: "En retard",
  };

  return labels[health];
}

function severityLabel(health: ProjectHealth) {
  if (health === "delayed") {
    return "Critique";
  }

  if (health === "at_risk") {
    return "Eleve";
  }

  if (health === "warning") {
    return "Moyen";
  }

  return "Info";
}

function projectRiskSummary(project: Awaited<ReturnType<typeof getProjects>>[number]) {
  if (project.health === "delayed") {
    return "La date cible est dépassée ou des éléments bloquants restent ouverts.";
  }

  if (project.health === "at_risk") {
    return "Le projet présente des signaux de risque sur les tâches, délais ou progression.";
  }

  if (project.health === "warning") {
    return "Le projet avance, mais nécessite une surveillance opérationnelle.";
  }

  return "Projet visible dans le suivi opérationnel.";
}

function daysUntil(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(new Date(value)).getTime();
  return Math.ceil((target - today) / 86_400_000);
}

function relativeDateLabel(value: string | null | undefined) {
  const days = daysUntil(value);

  if (days === null) {
    return "Sans date";
  }

  if (days < 0) {
    return `En retard de ${Math.abs(days)} j`;
  }

  if (days === 0) {
    return "Aujourd'hui";
  }

  if (days === 1) {
    return "Demain";
  }

  return `Dans ${days} jours`;
}

function relativeTimeLabel(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  return `${Math.round(hours / 24)} d ago`;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function percentage(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

export async function getOverviewDashboardData(
  role: AppRole,
  currentUserId: string,
): Promise<OverviewDashboardData> {
  const canSeeFinanceSignals = role === "admin" || role === "manager" || role === "shareholder";
  const [projectsResult, ticketsResult, workloadResult, financeResult, activitiesResult] = await Promise.allSettled([
    withTimeout(getProjects()),
    withTimeout(getTickets(role)),
    withTimeout(getTeamWorkload(role, currentUserId)),
    canSeeFinanceSignals ? withTimeout(getFinanceOverview(role)) : Promise.resolve(null),
    withTimeout(getActivityLogs({ role, currentUserId, limit: 4 })),
  ]);

  const projects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
  const tickets = ticketsResult.status === "fulfilled" ? ticketsResult.value : [];
  const workload = workloadResult.status === "fulfilled" ? workloadResult.value : [];
  const finance = financeResult.status === "fulfilled" ? financeResult.value : null;
  const activities = activitiesResult.status === "fulfilled" ? activitiesResult.value : [];
  const visibleProjects =
    role === "employee"
      ? projects.filter((project) => tickets.some((ticket) => ticket.project?.id === project.id))
      : projects;

  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const previousMonthStart = startOfPreviousMonth(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const activeProjects = visibleProjects.filter((project) => project.status === "active");
  const currentMonthProjectLaunches = activeProjects.filter((project) =>
    isInRange(project.created_at, currentMonthStart, nextMonthStart),
  ).length;
  const previousMonthProjectLaunches = activeProjects.filter((project) =>
    isInRange(project.created_at, previousMonthStart, currentMonthStart),
  ).length;

  const openTickets = tickets.filter(isOpenTicket);
  const currentMonthOpenTicketCreations = openTickets.filter((ticket) =>
    isInRange(ticket.created_at, currentMonthStart, nextMonthStart),
  ).length;
  const previousMonthOpenTicketCreations = openTickets.filter((ticket) =>
    isInRange(ticket.created_at, previousMonthStart, currentMonthStart),
  ).length;

  const completedTickets = tickets.filter((ticket) => ticket.status === "done");
  const currentMonthCompletedTickets = completedTickets.filter((ticket) =>
    isInRange(ticket.updated_at, currentMonthStart, nextMonthStart),
  ).length;
  const previousMonthCompletedTickets = completedTickets.filter((ticket) =>
    isInRange(ticket.updated_at, previousMonthStart, currentMonthStart),
  ).length;

  const pendingAmount = finance
    ? finance.expectedPayments + finance.overduePayments
    : 0;
  const pendingInvoiceCount = finance?.pendingInvoices ?? 0;
  const highestWorkload = workload
    .slice()
    .sort((left, right) => right.utilization_percentage - left.utilization_percentage)[0] ?? null;
  const atRiskProjects = visibleProjects.filter((project) => project.health === "at_risk" || project.health === "delayed");
  const recentDays = getRecentDayStarts();
  const weeklyProgressSnapshot = recentDays.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    return {
      day: formatWeekday(day),
      completed: completedTickets.filter((ticket) => isInRange(ticket.updated_at, day, nextDay)).length,
      active: openTickets.filter((ticket) => isInRange(ticket.updated_at, day, nextDay)).length,
    };
  });

  const workloadByDepartment = new Map<
    string,
    { estimatedHours: number; capacityHours: number; members: number }
  >();

  for (const member of workload) {
    const key = member.department?.trim() || member.role;
    const current = workloadByDepartment.get(key) ?? {
      estimatedHours: 0,
      capacityHours: 0,
      members: 0,
    };

    current.estimatedHours += member.estimated_hours_total;
    current.capacityHours += member.weekly_capacity_hours;
    current.members += 1;
    workloadByDepartment.set(key, current);
  }

  const workloadSnapshot = Array.from(workloadByDepartment.entries())
    .map(([name, item]) => ({
      name,
      workload: item.capacityHours
        ? Math.min(100, Math.round((item.estimatedHours / item.capacityHours) * 100))
        : 0,
      capacity: item.members
        ? Math.min(100, Math.round(item.capacityHours / (item.members * 40) * 100))
        : 0,
    }))
    .sort((left, right) => right.workload - left.workload)
    .slice(0, 5);

  const ticketTypeCounts = new Map<string, number>();
  for (const ticket of tickets) {
    ticketTypeCounts.set(ticket.type, (ticketTypeCounts.get(ticket.type) ?? 0) + 1);
  }

  const taskDistributionSnapshot = Array.from(ticketTypeCounts.entries())
    .map(([name, count]) => ({
      name: titleCase(name),
      value: percentage(count, tickets.length),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 4);

  const projectDeadlines = visibleProjects
    .filter((project) => project.status !== "completed" && project.status !== "cancelled" && project.end_date)
    .map((project) => ({
      title: project.name,
      date: relativeDateLabel(project.end_date),
      detail: `Projet ${project.status.replaceAll("_", " ")} / ${project.client?.name ?? "client interne"}`,
      sortDate: project.end_date ?? "",
    }));

  const ticketDeadlines = openTickets
    .filter((ticket) => ticket.due_date)
    .map((ticket) => ({
      title: ticket.title,
      date: relativeDateLabel(ticket.due_date),
      detail: `Ticket ${ticket.priority} / ${ticket.project?.name ?? "sans projet"}`,
      sortDate: ticket.due_date ?? "",
    }));

  const financeDeadlines = (finance?.upcomingFinancialDeadlines ?? []).map((deadline) => ({
    title: deadline.label,
    date: relativeDateLabel(deadline.dueDate),
    detail: `${deadline.status.replaceAll("_", " ")}${deadline.clientName ? ` / ${deadline.clientName}` : ""}`,
    sortDate: deadline.dueDate,
  }));

  const upcomingDeadlinesSnapshot = [...projectDeadlines, ...ticketDeadlines, ...financeDeadlines]
    .sort((left, right) => new Date(left.sortDate).getTime() - new Date(right.sortDate).getTime())
    .slice(0, 4)
    .map(({ title, date, detail }) => ({ title, date, detail }));
  const nextWeekEnd = new Date(startOfDay(now));
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const nextSevenDaysSnapshot = [...projectDeadlines, ...ticketDeadlines, ...financeDeadlines]
    .filter((item) => {
      const date = new Date(item.sortDate);
      return date >= startOfDay(now) && date < nextWeekEnd;
    })
    .sort((left, right) => new Date(left.sortDate).getTime() - new Date(right.sortDate).getTime())
    .slice(0, 7)
    .map((item) => ({
      day: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(item.sortDate)),
      title: item.title,
      theme: item.detail,
    }));

  return {
    kpis: [
      {
        value: activeProjects.length.toString(),
        change: percentChange(currentMonthProjectLaunches, previousMonthProjectLaunches),
        caption: `${currentMonthProjectLaunches} nouveaux lancements ce mois`,
        sparkline: cumulative(buildDailyCounts(activeProjects, (project) => project.created_at)),
      },
      {
        value: openTickets.length.toString(),
        change: percentChange(currentMonthOpenTicketCreations, previousMonthOpenTicketCreations),
        caption: `${currentMonthOpenTicketCreations} tickets ouverts créés ce mois`,
        sparkline: cumulative(buildDailyCounts(openTickets, (ticket) => ticket.created_at)),
      },
      {
        value: completedTickets.length.toString(),
        change: percentChange(currentMonthCompletedTickets, previousMonthCompletedTickets),
        caption: `${currentMonthCompletedTickets} tâches terminées ce mois`,
        sparkline: cumulative(buildDailyCounts(completedTickets, (ticket) => ticket.updated_at)),
      },
      {
        value: formatCompactCurrency(pendingAmount),
        change: pendingInvoiceCount > 0 ? `+${pendingInvoiceCount}` : "0",
        caption: `${pendingInvoiceCount} facture${pendingInvoiceCount === 1 ? "" : "s"} en attente`,
        sparkline: finance
          ? [finance.totalExpectedThisMonth, finance.totalReceivedThisMonth, finance.totalOverdue, pendingAmount].map((value) => Math.round(value))
          : [0, 0, 0, 0],
      },
    ],
    workload: workloadSnapshot.length
      ? workloadSnapshot
      : [{ name: "Equipe", workload: 0, capacity: 0 }],
    weeklyProgress: weeklyProgressSnapshot,
    projectHealth: visibleProjects
      .filter((project) => project.status !== "cancelled")
      .sort((left, right) => {
        if (left.progress !== right.progress) {
          return left.progress - right.progress;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 4)
      .map((project) => ({
        name: project.name,
        health: project.progress,
        status: healthLabel(project.health),
        owner: project.owner?.full_name ?? project.client?.name ?? "Non assigne",
      })),
    focusToday: [
      {
        label: "Pulse exécutif",
        title: `${currentMonthCompletedTickets} tâche${currentMonthCompletedTickets === 1 ? "" : "s"} terminée${currentMonthCompletedTickets === 1 ? "" : "s"} ce mois`,
        description: `${openTickets.length} ticket${openTickets.length === 1 ? "" : "s"} ouvert${openTickets.length === 1 ? "" : "s"} restent à piloter dans le périmètre visible.`,
        tone: "blue",
      },
      {
        label: "Signal équipe",
        title: highestWorkload
          ? `${highestWorkload.full_name} porte la charge la plus élevée`
          : "Aucune charge équipe visible",
        description: highestWorkload
          ? `${highestWorkload.utilization_percentage}% d'utilisation, ${highestWorkload.active_work_items} élément${highestWorkload.active_work_items === 1 ? "" : "s"} actif${highestWorkload.active_work_items === 1 ? "" : "s"} et ${highestWorkload.overdue_items} retard${highestWorkload.overdue_items === 1 ? "" : "s"}.`
          : "Ajoute des tickets assignés et des capacités hebdomadaires pour alimenter ce signal.",
        tone: "amber",
      },
      {
        label: "Commercial",
        title: finance
          ? `${pendingInvoiceCount} facture${pendingInvoiceCount === 1 ? "" : "s"} en attente`
          : `${atRiskProjects.length} projet${atRiskProjects.length === 1 ? "" : "s"} à surveiller`,
        description: finance
          ? `${formatCompactCurrency(pendingAmount)} restent à suivre entre paiements attendus et retards visibles.`
          : `${atRiskProjects.length} projet${atRiskProjects.length === 1 ? "" : "s"} présente${atRiskProjects.length === 1 ? "" : "nt"} un risque de delivery visible.`,
        tone: "violet",
      },
    ],
    taskDistribution: taskDistributionSnapshot.length
      ? taskDistributionSnapshot
      : [{ name: "Aucune tâche", value: 100 }],
    activityFeed: activities.length
      ? activities.map((activity, index) => ({
          title: typeof activity.metadata.summary === "string" ? activity.metadata.summary : activity.action,
          description: activity.action,
          time: relativeTimeLabel(activity.created_at),
          actor: activity.user?.full_name ?? "System",
          tone: (["emerald", "amber", "blue", "violet"] as const)[index % 4],
        }))
      : [
          {
            title: "Aucune activité récente",
            description: "Les prochains changements de clients, projets, tickets et finance apparaîtront ici.",
            time: "now",
            actor: "System",
            tone: "blue",
          },
        ],
    upcomingDeadlines: upcomingDeadlinesSnapshot.length
      ? upcomingDeadlinesSnapshot
      : [
          {
            title: "Aucune échéance visible",
            date: "Stable",
            detail: "Les dates de projets, tickets et finance apparaîtront ici.",
          },
        ],
    atRiskProjects: (() => {
      const visibleRiskProjects = (atRiskProjects.length ? atRiskProjects : visibleProjects.filter((project) => project.health === "warning"))
        .slice()
        .sort((left, right) => left.progress - right.progress)
        .slice(0, 3)
        .map((project) => ({
          title: project.name,
          owner: project.owner?.full_name ?? project.client?.name ?? "Non assigne",
          risk: projectRiskSummary(project),
          severity: severityLabel(project.health),
          progress: project.progress,
        }));

      return visibleRiskProjects.length
        ? visibleRiskProjects
        : [
            {
              title: "Aucun projet à risque",
              owner: "Portefeuille stable",
              risk: "Aucun projet visible ne présente actuellement un signal de risque.",
              severity: "Stable",
              progress: 100,
            },
          ];
    })(),
    nextSevenDays: nextSevenDaysSnapshot.length
      ? nextSevenDaysSnapshot
      : [
          {
            day: "Stable",
            title: "Aucun jalon dans les 7 prochains jours",
            theme: "Les échéances projets, tickets et finance apparaîtront ici.",
          },
        ],
  };
}
