import "server-only";

import { getContractsDueForRenewal } from "@/lib/contracts/service";
import { formatFinanceCurrency } from "@/lib/finance/helpers";
import { getExpectedPayments, getOverduePayments } from "@/lib/finance/service";
import { getDeadlineState } from "@/lib/projects/helpers";
import { getProjects, getProjectById } from "@/lib/projects/service";
import { getRoadmapProjects } from "@/lib/roadmap/service";
import { getMyTickets, getTeamWorkloadPreview, getTickets } from "@/lib/tickets/service";
import type { Locale } from "@/lib/i18n/config";
import type { AppRole } from "@/types/auth";
import type { PlanningAlert } from "@/types/alert";
import type { ContractRecord } from "@/types/contract";
import type { PaymentRecord } from "@/types/finance";
import type { ProjectRecord } from "@/types/project";
import type { TicketRecord } from "@/types/ticket";

const OVERLOAD_THRESHOLD = 8;

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Alert text is built on the server, so it is localized here rather than in the dictionary.
const alertCopy = {
  en: {
    clientPayment: "Client payment",
    paymentLate: (client: string) => `${client} payment is late`,
    paymentDueSoon: (client: string) => `${client} payment is due soon`,
    paymentExpected: (amount: string, project: string | null) => `${amount} expected${project ? ` for ${project}` : ""}.`,
    noDueDate: "No due date",
    contractValue: (amount: string) => ` Contract value ${amount}.`,
    renewalApproaching: (contract: string) => `${contract} renewal is approaching`,
    clientContract: "Client contract",
    renewalFollowUp: (client: string, amount: string) => `${client} needs renewal follow-up.${amount}`,
    internal: "Internal",
    deadlineLowProgress: (project: string) => `${project} is approaching its deadline with low progress`,
    progressRemaining: (progress: number, days: number) => `${progress}% complete with ${plural(days, "day", "days")} remaining.`,
    progressMetric: (progress: number) => `${progress}% progress`,
    elevatedWorkload: (name: string) => `${name} is carrying a high workload`,
    workloadDetail: (active: number, overdue: number) => `${plural(active, "active ticket", "active tickets")} and ${plural(overdue, "overdue item", "overdue items")}.`,
    activeMetric: (count: number) => `${count} active`,
    deadlinePassed: "Project deadline has passed",
    deadlinePassedDetail: (progress: number) => `The project is at ${progress}% while its deadline is in the past.`,
    blockedTickets: (count: number) => `${plural(count, "blocked ticket", "blocked tickets")} on this project`,
    blockedDetail: "Blocked work slows the project down and should be reviewed first.",
    blockedMetric: (count: number) => `${count} blocked`,
    pressureRising: "Delivery pressure is rising",
    pressureDetail: (overdue: number, urgent: number) => `${plural(overdue, "overdue ticket", "overdue tickets")} and ${plural(urgent, "urgent item", "urgent items")}.`,
    overdueMetric: (count: number) => `${count} overdue`,
    ticketOverdue: (ticket: string) => `${ticket} is overdue`,
    ticketOverdueDetail: (project: string | null) => `${project ?? "The linked project"} has work past its due date.`,
    unassigned: "Unassigned",
    ticketBlocked: (ticket: string) => `${ticket} is blocked`,
    ticketBlockedDetail: (project: string | null) => `Work on ${project ?? "the linked project"} is paused until the blocker is cleared.`,
    urgentUnassigned: (ticket: string) => `${ticket} is urgent and unassigned`,
    urgentUnassignedDetail: "High-priority work has no owner and should be assigned now.",
    milestoneDelayed: (milestone: string) => `${milestone} is delayed`,
    milestoneDelayedDetail: (project: string) => `${project} has a delayed milestone.`,
  },
  fr: {
    clientPayment: "Paiement client",
    paymentLate: (client: string) => `Paiement de ${client} en retard`,
    paymentDueSoon: (client: string) => `Paiement de ${client} bientôt dû`,
    paymentExpected: (amount: string, project: string | null) => `${amount} attendus${project ? ` pour ${project}` : ""}.`,
    noDueDate: "Sans échéance",
    contractValue: (amount: string) => ` Valeur du contrat : ${amount}.`,
    renewalApproaching: (contract: string) => `Le renouvellement de ${contract} approche`,
    clientContract: "Contrat client",
    renewalFollowUp: (client: string, amount: string) => `${client} : renouvellement à suivre.${amount}`,
    internal: "Interne",
    deadlineLowProgress: (project: string) => `${project} approche de son échéance avec peu d’avancement`,
    progressRemaining: (progress: number, days: number) => `${progress} % réalisé, ${plural(days, "jour restant", "jours restants")}.`,
    progressMetric: (progress: number) => `${progress} % d’avancement`,
    elevatedWorkload: (name: string) => `${name} porte une charge élevée`,
    workloadDetail: (active: number, overdue: number) => `${plural(active, "ticket actif", "tickets actifs")} et ${plural(overdue, "élément en retard", "éléments en retard")}.`,
    activeMetric: (count: number) => `${count} actifs`,
    deadlinePassed: "L’échéance du projet est dépassée",
    deadlinePassedDetail: (progress: number) => `Le projet est à ${progress} % alors que son échéance est passée.`,
    blockedTickets: (count: number) => `${plural(count, "ticket bloqué", "tickets bloqués")} sur ce projet`,
    blockedDetail: "Le travail bloqué ralentit le projet et doit être traité en priorité.",
    blockedMetric: (count: number) => `${count} bloqués`,
    pressureRising: "La pression de livraison augmente",
    pressureDetail: (overdue: number, urgent: number) => `${plural(overdue, "ticket en retard", "tickets en retard")} et ${plural(urgent, "élément urgent", "éléments urgents")}.`,
    overdueMetric: (count: number) => `${count} en retard`,
    ticketOverdue: (ticket: string) => `${ticket} est en retard`,
    ticketOverdueDetail: (project: string | null) => `${project ?? "Le projet lié"} a du travail au-delà de son échéance.`,
    unassigned: "Sans responsable",
    ticketBlocked: (ticket: string) => `${ticket} est bloqué`,
    ticketBlockedDetail: (project: string | null) => `Le travail sur ${project ?? "le projet lié"} est en pause jusqu’à la levée du blocage.`,
    urgentUnassigned: (ticket: string) => `${ticket} est urgent et sans responsable`,
    urgentUnassignedDetail: "Ce travail prioritaire n’a pas de responsable et doit être assigné maintenant.",
    milestoneDelayed: (milestone: string) => `${milestone} est en retard`,
    milestoneDelayedDetail: (project: string) => `${project} a un jalon en retard.`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

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

function mapPaymentAlert(payment: PaymentRecord, locale: Locale): PlanningAlert {
  const copy = alertCopy[locale];
  const clientName = payment.client?.name ?? copy.clientPayment;
  const amount = formatFinanceCurrency(payment.amount, payment.currency);

  return {
    id: `financial-due-${payment.id}`,
    type: "financial_due",
    severity: getPaymentAlertSeverity(payment),
    title: payment.status === "late" ? copy.paymentLate(clientName) : copy.paymentDueSoon(clientName),
    description: copy.paymentExpected(amount, payment.project?.name ?? null),
    href: `/finance/payments?payment=${payment.id}`,
    label: payment.reference ?? payment.invoice?.invoice_number ?? payment.contract?.title ?? null,
    metric: payment.due_date ?? copy.noDueDate,
    entityId: payment.id,
    entityType: "payment",
  };
}

function mapContractRenewalAlert(contract: ContractRecord, locale: Locale): PlanningAlert {
  const copy = alertCopy[locale];
  const renewalDate = contract.renewal_date ?? contract.end_date;
  const days = contract.daysUntilRenewal;
  const amount = contract.amount ? copy.contractValue(formatFinanceCurrency(contract.amount, contract.currency)) : "";

  return {
    id: `contract-due-${contract.id}`,
    type: "contract_due",
    severity: days !== null && days <= 7 ? "warning" : "info",
    title: copy.renewalApproaching(contract.title),
    description: copy.renewalFollowUp(contract.client?.name ?? copy.clientContract, amount),
    href: `/contracts/${contract.id}`,
    label: contract.responsibleUser?.full_name ?? contract.client?.name ?? null,
    metric: renewalDate,
    entityId: contract.id,
    entityType: "contract",
  };
}

export function getDeadlineRisks(projects: ProjectRecord[], locale: Locale = "en"): PlanningAlert[] {
  const copy = alertCopy[locale];
  return projects.flatMap((project) => {
    const days = daysUntil(project.end_date);

    if (days === null || days > 14 || project.progress >= 75 || project.status === "completed" || project.status === "cancelled") {
      return [];
    }

    return [{
      id: `deadline-${project.id}`,
      type: "deadline_risk",
      severity: days <= 7 || project.progress < 50 ? "critical" : "warning",
      title: copy.deadlineLowProgress(project.name),
      description: copy.progressRemaining(project.progress, days),
      href: `/projects/${project.id}`,
      label: project.client?.name ?? copy.internal,
      metric: copy.progressMetric(project.progress),
      entityId: project.id,
      entityType: "project",
    }];
  });
}

export function getTeamWorkloadRisksFromTickets(tickets: TicketRecord[], locale: Locale = "en"): PlanningAlert[] {
  const copy = alertCopy[locale];
  const workload = getTeamWorkloadPreview(tickets);

  return workload
    .filter((member) => member.activeTickets >= OVERLOAD_THRESHOLD || member.overdueTickets >= 2)
    .map((member) => ({
      id: `workload-${member.id}`,
      type: "workload" as const,
      severity: member.overdueTickets >= 2 || member.activeTickets >= OVERLOAD_THRESHOLD + 2 ? "critical" : "warning",
      title: copy.elevatedWorkload(member.full_name),
      description: copy.workloadDetail(member.activeTickets, member.overdueTickets),
      href: "/team",
      label: member.role,
      metric: copy.activeMetric(member.activeTickets),
      entityId: member.id,
      entityType: "person",
    }));
}

export async function getTeamWorkloadRisks(role: AppRole, userId?: string, locale: Locale = "en") {
  const tickets = role === "employee" && userId ? await getMyTickets(userId, role) : await getTickets(role);
  return getTeamWorkloadRisksFromTickets(tickets, locale);
}

export async function getProjectRisks(projectId: string, locale: Locale = "en"): Promise<PlanningAlert[]> {
  const copy = alertCopy[locale];
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
      title: copy.deadlinePassed,
      description: copy.deadlinePassedDetail(project.progress),
      href: `/projects/${project.id}`,
      label: project.client?.name ?? copy.internal,
      metric: copy.progressMetric(project.progress),
      entityId: project.id,
      entityType: "project",
    });
  }

  if (blockedTickets > 0) {
    alerts.push({
      id: `project-blocked-${project.id}`,
      type: "blocked",
      severity: blockedTickets >= 2 ? "critical" : "warning",
      title: copy.blockedTickets(blockedTickets),
      description: copy.blockedDetail,
      href: `/projects/${project.id}`,
      label: project.name,
      metric: copy.blockedMetric(blockedTickets),
      entityId: project.id,
      entityType: "project",
    });
  }

  if (overdueTickets > 0 || urgentTickets >= 3) {
    alerts.push({
      id: `project-pressure-${project.id}`,
      type: "overdue",
      severity: overdueTickets >= 2 || urgentTickets >= 4 ? "critical" : "warning",
      title: copy.pressureRising,
      description: copy.pressureDetail(overdueTickets, urgentTickets),
      href: `/projects/${project.id}`,
      label: project.name,
      metric: copy.overdueMetric(overdueTickets),
      entityId: project.id,
      entityType: "project",
    });
  }

  return alerts;
}

export async function getPlanningAlerts(role: AppRole, userId?: string, locale: Locale = "en") {
  const copy = alertCopy[locale];
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
      title: copy.ticketOverdue(ticket.title),
      description: copy.ticketOverdueDetail(ticket.project?.name ?? null),
      href: `/tickets/${ticket.id}`,
      label: ticket.assignee?.full_name ?? copy.unassigned,
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
      title: copy.ticketBlocked(ticket.title),
      description: copy.ticketBlockedDetail(ticket.project?.name ?? null),
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
      title: copy.urgentUnassigned(ticket.title),
      description: copy.urgentUnassignedDetail,
      href: `/tickets/${ticket.id}`,
      label: ticket.project?.name ?? null,
      metric: ticket.priority,
      entityId: ticket.id,
      entityType: "task" as const,
    })),
  );

  alerts.push(...getDeadlineRisks(projects, locale));
  alerts.push(...getTeamWorkloadRisksFromTickets(relevantTickets, locale));

  const delayedMilestones = roadmapProjects
    .flatMap((project) =>
      project.milestones
        .filter((milestone) => milestone.status === "delayed")
        .map((milestone) => ({
          id: `milestone-delayed-${milestone.id}`,
          type: "deadline_risk" as const,
          severity: "warning" as const,
          title: copy.milestoneDelayed(milestone.title),
          description: copy.milestoneDelayedDetail(project.name),
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
      .map((payment) => mapPaymentAlert(payment, locale)),
    ...renewalContracts
      .slice(0, 4)
      .map((contract) => mapContractRenewalAlert(contract, locale)),
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
