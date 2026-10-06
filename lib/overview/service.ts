import "server-only";

import { getFinanceOverview } from "@/lib/finance/service";
import { getProjects, projectNeedsAttention } from "@/lib/projects/service";
import { getTeamWorkload } from "@/lib/team/service";
import { getTickets, isOpenTicket, isTicketOverdue, ticketNeedsAttention } from "@/lib/tickets/service";
import type { AppRole } from "@/types/auth";
import type { ProjectHealth } from "@/types/project";
import type { WorkloadRisk } from "@/types/team";
import type { TicketRecord } from "@/types/ticket";

export type OverviewSource = "projects" | "tickets" | "workload" | "finance";

export type OverviewAttentionReason = "blocked" | "overdue" | "urgent" | "unassigned";

export type OverviewAttentionTicket = {
  id: string;
  title: string;
  projectName: string | null;
  reason: OverviewAttentionReason;
};

export type OverviewAttentionProject = {
  id: string;
  name: string;
  owner: string | null;
  health: ProjectHealth;
  endDate: string | null;
};

export type OverviewUpcomingItem = {
  key: string;
  kind: "project" | "ticket" | "invoice" | "payment";
  title: string;
  context: string | null;
  date: string;
  href: string;
};

export type OverviewWorkloadPerson = {
  id: string;
  name: string;
  utilization: number;
  activeItems: number;
  overdueItems: number;
  risk: WorkloadRisk;
};

export type OverviewDashboardData = {
  /** Sources that failed or timed out; their numbers are left out rather than shown as zero. */
  unavailable: OverviewSource[];
  kpis: {
    activeProjects: number | null;
    newProjectsThisMonth: number;
    openTickets: number | null;
    newTicketsThisMonth: number;
    attentionTickets: number | null;
    completedThisMonth: number | null;
    pendingInvoices: { count: number; amount: number } | null;
    atRiskProjects: number | null;
  };
  attentionProjects: OverviewAttentionProject[];
  attentionTickets: OverviewAttentionTicket[];
  upcoming: OverviewUpcomingItem[];
  workload: OverviewWorkloadPerson[];
};

const OVERVIEW_DATA_TIMEOUT_MS = 4_000;
const UPCOMING_WINDOW_DAYS = 14;

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isInRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return date >= start && date < end;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getAttentionReason(ticket: TicketRecord, today: string): OverviewAttentionReason {
  if (ticket.status === "blocked") return "blocked";
  if (isTicketOverdue(ticket, today)) return "overdue";
  if (ticket.priority === "urgent") return "urgent";
  return "unassigned";
}

const attentionReasonOrder: Record<OverviewAttentionReason, number> = {
  blocked: 0,
  overdue: 1,
  urgent: 2,
  unassigned: 3,
};

const projectHealthOrder: Record<ProjectHealth, number> = {
  delayed: 0,
  at_risk: 1,
  warning: 2,
  healthy: 3,
};

export async function getOverviewDashboardData(
  role: AppRole,
  currentUserId: string,
): Promise<OverviewDashboardData> {
  const canSeeFinanceSignals = role === "admin" || role === "manager" || role === "shareholder";
  const canSeeTeamWorkload = role === "admin" || role === "manager" || role === "supervisor";
  const isEmployee = role === "employee";
  const isShareholder = role === "shareholder";
  const [projectsResult, ticketsResult, workloadResult, financeResult] = await Promise.allSettled([
    withTimeout(getProjects()),
    withTimeout(getTickets(role)),
    canSeeTeamWorkload ? withTimeout(getTeamWorkload(role, currentUserId)) : Promise.resolve([]),
    canSeeFinanceSignals ? withTimeout(getFinanceOverview(role)) : Promise.resolve(null),
  ]);

  const unavailable: OverviewSource[] = [];
  if (projectsResult.status === "rejected") unavailable.push("projects");
  if (ticketsResult.status === "rejected") unavailable.push("tickets");
  if (workloadResult.status === "rejected") unavailable.push("workload");
  if (financeResult.status === "rejected") unavailable.push("finance");

  const projectsLoaded = projectsResult.status === "fulfilled";
  const ticketsLoaded = ticketsResult.status === "fulfilled";
  const projects = projectsLoaded ? projectsResult.value : [];
  const tickets = ticketsLoaded ? ticketsResult.value : [];
  const workload = workloadResult.status === "fulfilled" ? workloadResult.value : [];
  const finance = financeResult.status === "fulfilled" ? financeResult.value : null;
  const visibleProjects = isEmployee
    ? projects.filter((project) => tickets.some((ticket) => ticket.project?.id === project.id))
    : projects;

  const now = new Date();
  const today = dateKey(now);
  const currentMonthStart = startOfMonth(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_DAYS);
  const windowEndKey = dateKey(windowEnd);

  const activeProjects = visibleProjects.filter((project) => project.status === "active");
  const openTickets = tickets.filter(isOpenTicket);
  const completedTickets = tickets.filter((ticket) => ticket.status === "done");
  // Employees see their own attention items; managers see everything in scope.
  const attentionScope = isEmployee
    ? tickets.filter((ticket) => ticket.assignee_id === currentUserId)
    : tickets;
  const attentionTickets = isShareholder ? [] : attentionScope.filter(ticketNeedsAttention);
  const atRiskProjects = visibleProjects.filter(projectNeedsAttention);

  const upcomingProjects: OverviewUpcomingItem[] = visibleProjects
    .filter((project) => project.status !== "completed" && project.status !== "cancelled")
    .filter((project) => project.end_date && project.end_date >= today && project.end_date <= windowEndKey)
    .map((project) => ({
      key: `project-${project.id}`,
      kind: "project",
      title: project.name,
      context: project.client?.name ?? null,
      date: project.end_date as string,
      href: `/projects/${project.id}`,
    }));
  const upcomingTickets: OverviewUpcomingItem[] = isShareholder
    ? []
    : (isEmployee ? openTickets.filter((ticket) => ticket.assignee_id === currentUserId) : openTickets)
        .filter((ticket) => ticket.due_date && ticket.due_date >= today && ticket.due_date <= windowEndKey)
        .map((ticket) => ({
          key: `ticket-${ticket.id}`,
          kind: "ticket",
          title: ticket.title,
          context: ticket.project?.name ?? null,
          date: ticket.due_date as string,
          href: `/tickets/${ticket.id}`,
        }));
  const upcomingFinance: OverviewUpcomingItem[] = (finance?.upcomingFinancialDeadlines ?? [])
    .filter((deadline) => deadline.kind !== "contract_placeholder")
    .filter((deadline) => deadline.dueDate >= today && deadline.dueDate <= windowEndKey)
    .map((deadline, index) => ({
      key: `finance-${index}-${deadline.dueDate}`,
      kind: deadline.kind === "invoice_due" ? "invoice" : "payment",
      title: deadline.label,
      context: deadline.clientName,
      date: deadline.dueDate,
      href: "/finance",
    }));

  return {
    unavailable,
    kpis: {
      activeProjects: projectsLoaded ? activeProjects.length : null,
      newProjectsThisMonth: activeProjects.filter((project) => isInRange(project.created_at, currentMonthStart, nextMonthStart)).length,
      openTickets: ticketsLoaded ? openTickets.length : null,
      newTicketsThisMonth: openTickets.filter((ticket) => isInRange(ticket.created_at, currentMonthStart, nextMonthStart)).length,
      attentionTickets: ticketsLoaded && !isShareholder ? attentionTickets.length : null,
      completedThisMonth: ticketsLoaded
        ? completedTickets.filter((ticket) => isInRange(ticket.updated_at, currentMonthStart, nextMonthStart)).length
        : null,
      pendingInvoices: finance ? { count: finance.pendingInvoices, amount: finance.pendingInvoiceAmount } : null,
      atRiskProjects: projectsLoaded ? atRiskProjects.length : null,
    },
    attentionProjects: atRiskProjects
      .slice()
      .sort((left, right) => projectHealthOrder[left.health] - projectHealthOrder[right.health] || left.progress - right.progress)
      .slice(0, 5)
      .map((project) => ({
        id: project.id,
        name: project.name,
        owner: project.owner?.full_name ?? null,
        health: project.health,
        endDate: project.end_date,
      })),
    attentionTickets: attentionTickets
      .map((ticket) => ({ ticket, reason: getAttentionReason(ticket, today) }))
      .sort((left, right) => attentionReasonOrder[left.reason] - attentionReasonOrder[right.reason])
      .slice(0, 5)
      .map(({ ticket, reason }) => ({
        id: ticket.id,
        title: ticket.title,
        projectName: ticket.project?.name ?? null,
        reason,
      })),
    upcoming: [...upcomingProjects, ...upcomingTickets, ...upcomingFinance]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 8),
    workload: workload
      .slice()
      .sort((left, right) => right.utilization_percentage - left.utilization_percentage)
      .slice(0, 5)
      .map((member) => ({
        id: member.id,
        name: member.full_name,
        utilization: member.utilization_percentage,
        activeItems: member.active_work_items,
        overdueItems: member.overdue_items,
        risk: member.workload_risk,
      })),
  };
}
