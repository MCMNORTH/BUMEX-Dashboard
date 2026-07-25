import "server-only";

import { getContractsDueForRenewal } from "@/lib/contracts/service";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { getExpectedPayments, getOverduePayments } from "@/lib/finance/service";
import { getDeadlineState } from "@/lib/projects/helpers";
import { getProjects, getProjectById } from "@/lib/projects/service";
import { getRoadmapProjects } from "@/lib/roadmap/service";
import { getMyTickets, getTeamWorkloadPreview, getTickets } from "@/lib/tickets/service";
import type { AppRole } from "@/types/auth";
import type { PlanningAlert } from "@/types/alert";
import type { ContractRecord } from "@/types/contract";
import type { PaymentRecord } from "@/types/finance";
import type { ProjectRecord } from "@/types/project";
import type { TicketRecord } from "@/types/ticket";

const OVERLOAD_THRESHOLD = 8;

function daysUntil(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  const today = new Date();
  const date = new Date(dateValue);
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function isActiveTicket(ticket: TicketRecord) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

function isOverdueTicket(ticket: TicketRecord) {
  const diff = daysUntil(ticket.due_date);
  return diff !== null && diff < 0 && isActiveTicket(ticket);
}

function getPaymentAlertSeverity(payment: PaymentRecord): PlanningAlert["severity"] {
  const days = daysUntil(payment.due_date);

  if (payment.status === "late" || (days !== null && days < 0)) {
    return "critical";
  }

  if (days !== null && days <= 7) {
    return "warning";
  }

  return "info";
}

function mapPaymentAlert(payment: PaymentRecord): PlanningAlert {
  const clientName = payment.client?.name ?? "Client payment";
  const amount = formatFinanceCurrency(payment.amount, payment.currency);

  return {
    id: `financial-due-${payment.id}`,
    type: "financial_due",
    severity: getPaymentAlertSeverity(payment),
    title: `${clientName} payment ${payment.status === "late" ? "is late" : "is due soon"}`,
    description: `${amount} expected${payment.project?.name ? ` for ${payment.project.name}` : ""}.`,
    href: `/finance/payments?payment=${payment.id}`,
    label: payment.reference ?? payment.invoice?.invoice_number ?? payment.contract?.title ?? null,
    metric: payment.due_date ?? "No due date",
    entityId: payment.id,
    entityType: "payment",
  };
}

function mapContractRenewalAlert(contract: ContractRecord): PlanningAlert {
  const renewalDate = contract.renewal_date ?? contract.end_date;
  const days = contract.daysUntilRenewal;
  const amount = contract.amount ? ` Contract value ${formatFinanceCurrency(contract.amount, contract.currency)}.` : "";

  return {
    id: `contract-due-${contract.id}`,
    type: "contract_due",
    severity: days !== null && days <= 7 ? "warning" : "info",
    title: `${contract.title} renewal is approaching`,
    description: `${contract.client?.name ?? "Client contract"} needs renewal follow-up.${amount}`,
    href: `/contracts/${contract.id}`,
    label: contract.responsibleUser?.full_name ?? contract.client?.name ?? null,
    metric: renewalDate,
    entityId: contract.id,
    entityType: "contract",
  };
}

export function getDeadlineRisks(projects: ProjectRecord[]): PlanningAlert[] {
  return projects.flatMap((project) => {
    const days = daysUntil(project.end_date);

    if (days === null || days > 14 || project.progress >= 75 || project.status === "completed" || project.status === "cancelled") {
      return [];
    }

    return [{
      id: `deadline-${project.id}`,
      type: "deadline_risk",
      severity: days <= 7 || project.progress < 50 ? "critical" : "warning",
      title: `${project.name} is approaching deadline with low progress`,
      description: `${project.progress}% complete with ${days} day${days === 1 ? "" : "s"} remaining.`,
      href: `/projects/${project.id}`,
      label: project.client?.name ?? "Internal",
      metric: `${project.progress}% progress`,
      entityId: project.id,
      entityType: "project",
    }];
  });
}

export function getTeamWorkloadRisksFromTickets(tickets: TicketRecord[]): PlanningAlert[] {
  const workload = getTeamWorkloadPreview(tickets);

  return workload
    .filter((member) => member.activeTickets >= OVERLOAD_THRESHOLD || member.overdueTickets >= 2)
    .map((member) => ({
      id: `workload-${member.id}`,
      type: "workload" as const,
      severity: member.overdueTickets >= 2 || member.activeTickets >= OVERLOAD_THRESHOLD + 2 ? "critical" : "warning",
      title: `${member.full_name} is carrying elevated workload`,
      description: `${member.activeTickets} active tickets and ${member.overdueTickets} overdue item${member.overdueTickets === 1 ? "" : "s"} are increasing delivery pressure.`,
      href: "/team",
      label: member.role,
      metric: `${member.activeTickets} active`,
      entityId: member.id,
      entityType: "person",
    }));
}

export async function getTeamWorkloadRisks(role: AppRole, userId?: string) {
  const tickets = role === "employee" && userId ? await getMyTickets(userId, role) : await getTickets(role);
  return getTeamWorkloadRisksFromTickets(tickets);
}

export async function getProjectRisks(projectId: string): Promise<PlanningAlert[]> {
  const project = await getProjectById(projectId);

  if (!project) {
    return [];
  }

  const alerts: PlanningAlert[] = [];
  const deadlineState = getDeadlineState(project.end_date);
  const blockedTickets = project.tasks.filter((task) => task.status === "blocked").length;
  const urgentTickets = project.tasks.filter((task) => task.priority === "critical" || task.priority === "high").length;
  const overdueTickets = project.overdueTasks.length;

  if (deadlineState === "overdue" && project.progress < 100) {
    alerts.push({
      id: `project-overdue-${project.id}`,
      type: "deadline_risk",
      severity: "critical",
      title: "Project deadline has already passed",
      description: `The project remains at ${project.progress}% progress while the deadline is in the past.`,
      href: `/projects/${project.id}`,
      label: project.client?.name ?? "Internal",
      metric: `${project.progress}% progress`,
      entityId: project.id,
      entityType: "project",
    });
  }

  if (blockedTickets > 0) {
    alerts.push({
      id: `project-blocked-${project.id}`,
      type: "blocked",
      severity: blockedTickets >= 2 ? "critical" : "warning",
      title: `${blockedTickets} blocked ticket${blockedTickets === 1 ? "" : "s"} affecting this project`,
      description: "Blocked work is slowing project throughput and should be reviewed in priority order.",
      href: `/projects/${project.id}`,
      label: project.name,
      metric: `${blockedTickets} blocked`,
      entityId: project.id,
      entityType: "project",
    });
  }

  if (overdueTickets > 0 || urgentTickets >= 3) {
    alerts.push({
      id: `project-pressure-${project.id}`,
      type: "overdue",
      severity: overdueTickets >= 2 || urgentTickets >= 4 ? "critical" : "warning",
      title: "Project delivery pressure is rising",
      description: `${overdueTickets} overdue ticket${overdueTickets === 1 ? "" : "s"} and ${urgentTickets} urgent item${urgentTickets === 1 ? "" : "s"} are driving near-term risk.`,
      href: `/projects/${project.id}`,
      label: project.name,
      metric: `${overdueTickets} overdue`,
      entityId: project.id,
      entityType: "project",
    });
  }

  return alerts;
}

export async function getPlanningAlerts(role: AppRole, userId?: string) {
  const canSeeBusinessAlerts = role !== "employee";
  const [projects, tickets, roadmapProjects, overduePayments, expectedPayments, renewalContracts] = await Promise.all([
    getProjects(),
    role === "employee" && userId ? getMyTickets(userId, role) : getTickets(role),
    getRoadmapProjects(),
    canSeeBusinessAlerts ? getOverduePayments(role) : Promise.resolve([]),
    canSeeBusinessAlerts ? getExpectedPayments(role) : Promise.resolve([]),
    canSeeBusinessAlerts ? getContractsDueForRenewal(role) : Promise.resolve([]),
  ]);

  const alerts: PlanningAlert[] = [];
  const relevantTickets = role === "shareholder"
    ? []
    : tickets;

  const overdueTickets = relevantTickets.filter(isOverdueTicket).slice(0, 4);
  alerts.push(
    ...overdueTickets.map((ticket) => ({
      id: `overdue-${ticket.id}`,
      type: "overdue" as const,
      severity: "critical" as const,
      title: `${ticket.title} is overdue`,
      description: `${ticket.project?.name ?? "Linked project"} has work beyond its planned due date.`,
      href: `/tickets/${ticket.id}`,
      label: ticket.assignee?.full_name ?? "Unassigned",
      metric: ticket.due_date,
      entityId: ticket.id,
      entityType: "task" as const,
    })),
  );

  const blocked = relevantTickets.filter((ticket) => ticket.status === "blocked").slice(0, 3);
  alerts.push(
    ...blocked.map((ticket) => ({
      id: `blocked-${ticket.id}`,
      type: "blocked" as const,
      severity: "warning" as const,
      title: `${ticket.title} is blocked`,
      description: `Execution is paused inside ${ticket.project?.name ?? "the linked project"} until the blocker is cleared.`,
      href: `/tickets/${ticket.id}`,
      label: ticket.project?.name ?? null,
      metric: ticket.priority,
      entityId: ticket.id,
      entityType: "task" as const,
    })),
  );

  const urgentUnassigned = relevantTickets
    .filter((ticket) => (ticket.priority === "urgent" || ticket.priority === "high") && !ticket.assignee_id && isActiveTicket(ticket))
    .slice(0, 3);
  alerts.push(
    ...urgentUnassigned.map((ticket) => ({
      id: `unassigned-${ticket.id}`,
      type: "unassigned" as const,
      severity: "critical" as const,
      title: `${ticket.title} is urgent and unassigned`,
      description: "High-priority work has no owner and should be assigned immediately.",
      href: `/tickets/${ticket.id}`,
      label: ticket.project?.name ?? null,
      metric: ticket.priority,
      entityId: ticket.id,
      entityType: "task" as const,
    })),
  );

  alerts.push(...getDeadlineRisks(projects));
  alerts.push(...getTeamWorkloadRisksFromTickets(relevantTickets));

  const delayedMilestones = roadmapProjects
    .flatMap((project) =>
      project.milestones
        .filter((milestone) => milestone.status === "delayed")
        .map((milestone) => ({
          id: `milestone-delayed-${milestone.id}`,
          type: "deadline_risk" as const,
          severity: "warning" as const,
          title: `${milestone.title} is marked as delayed`,
          description: `${project.name} has a delayed milestone requiring roadmap attention.`,
          href: "/roadmap",
          label: project.name,
          metric: milestone.due_date,
          entityId: milestone.id,
          entityType: "milestone" as const,
        })),
    )
    .slice(0, 4);
  alerts.push(...delayedMilestones);

  const upcomingPayments = expectedPayments
    .filter((payment) => {
      const days = daysUntil(payment.due_date);
      return days !== null && days >= 0 && days <= 14;
    })
    .sort((left, right) => (daysUntil(left.due_date) ?? 999) - (daysUntil(right.due_date) ?? 999));

  alerts.push(
    ...[...overduePayments, ...upcomingPayments]
      .slice(0, 4)
      .map(mapPaymentAlert),
    ...renewalContracts
      .slice(0, 4)
      .map(mapContractRenewalAlert),
  );

  if (role === "shareholder") {
    return alerts.filter((alert) => alert.type === "deadline_risk" || alert.type === "financial_due" || alert.type === "contract_due");
  }

  return alerts
    .sort((left, right) => {
      const severityRank = { critical: 0, warning: 1, info: 2 };
      return severityRank[left.severity] - severityRank[right.severity];
    })
    .slice(0, 10);
}
