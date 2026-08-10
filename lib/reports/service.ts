import "server-only";

import {
  getClientById,
  getClientLinkedContracts,
  getClientLinkedDocuments,
  getClientRelationshipSummary,
  getClients,
} from "@/lib/clients/service";
import { getContractsDueForRenewal } from "@/lib/contracts/service";
import {
  getFinanceOverview,
  getInvoices,
  getOverdueFinanceItems,
  getPayments,
  getShareholderFinanceSummary,
  getTransfers,
} from "@/lib/finance/service";
import { SHAREHOLDER_NOTES_ENTITY_ID } from "@/lib/notes/constants";
import { getNotesForEntity } from "@/lib/notes/service";
import { getProjects, getProjectById } from "@/lib/projects/service";
import { getRoadmapProjects } from "@/lib/roadmap/service";
import {
  getAvailableTeamMembers,
  getOverloadedTeamMembers,
  getTeamMembers,
  getTeamPerformance,
  getTeamWorkload,
  getUserPerformance,
} from "@/lib/team/service";
import { getTickets } from "@/lib/tickets/service";
import type { AppRole } from "@/types/auth";
import type { ReportBuilderData, ReportContext, ReportDocument, ReportSection, ReportType } from "@/types/report";
import type { TicketRecord } from "@/types/ticket";

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function getDefaultDateRange(type: ReportType) {
  const today = startOfToday();
  const start = new Date(today);

  if (type === "daily_individual") {
    return {
      startDate: today.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
    };
  }

  if (
    type === "weekly_individual"
    || type === "weekly_team"
    || type === "project_status"
    || type === "finance_summary"
    || type === "team_workload"
    || type === "client_relationship"
    || type === "shareholder_executive"
    || type === "shareholder_monthly"
    || type === "shareholder_portfolio"
    || type === "shareholder_finance"
    || type === "shareholder_risk"
  ) {
    start.setDate(today.getDate() - 6);
  } else {
    start.setDate(today.getDate() - 13);
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
  };
}

function getAllowedReportTypes(role: AppRole): ReportType[] {
  if (role === "admin") {
    return [
      "daily_individual",
      "weekly_individual",
      "weekly_team",
      "project_progress",
      "project_status",
      "finance_summary",
      "team_workload",
      "client_relationship",
      "shareholder_executive",
      "shareholder_monthly",
      "shareholder_portfolio",
      "shareholder_finance",
      "shareholder_risk",
    ];
  }

  if (role === "manager") {
    return [
      "daily_individual",
      "weekly_individual",
      "weekly_team",
      "project_progress",
      "project_status",
      "finance_summary",
      "team_workload",
      "client_relationship",
      "shareholder_executive",
      "shareholder_monthly",
      "shareholder_portfolio",
      "shareholder_finance",
      "shareholder_risk",
    ];
  }

  if (role === "supervisor") {
    return [
      "daily_individual",
      "weekly_individual",
      "weekly_team",
      "project_progress",
      "project_status",
      "team_workload",
    ];
  }

  if (role === "employee") {
    return ["daily_individual", "weekly_individual", "weekly_team", "team_workload"];
  }

  return ["shareholder_executive", "shareholder_monthly", "shareholder_portfolio", "shareholder_finance", "shareholder_risk"];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function inRange(dateValue: string | null | undefined, startDate: string, endDate: string) {
  if (!dateValue) {
    return false;
  }

  const value = new Date(dateValue).getTime();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime() + 86399999;
  return value >= start && value <= end;
}

function isOpen(ticket: TicketRecord) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

function createTextReport(document: Omit<ReportDocument, "text">) {
  const lines: string[] = [
    document.title,
    document.subtitle,
    `Scope: ${document.scopeLabel}`,
    `Generated: ${document.generatedAt}`,
    "",
    document.summary,
    "",
  ];

  for (const section of document.sections) {
    lines.push(section.title);
    if (section.items.length) {
      lines.push(...section.items.map((item) => `- ${item}`));
    } else {
      lines.push("- No notable items in this section.");
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function buildReport(params: Omit<ReportDocument, "text">): ReportDocument {
  return {
    ...params,
    text: createTextReport(params),
  };
}

function formatTicketLine(ticket: TicketRecord) {
  const project = ticket.project?.name ?? "No project";
  const due = ticket.due_date ? formatDate(ticket.due_date) : "No due date";
  return `${ticket.title} / ${project} / ${ticket.priority} priority / due ${due}`;
}

function formatProjectLine(project: Awaited<ReturnType<typeof getProjects>>[number]) {
  return `${project.name} / ${project.progress}% progress / ${project.health.replaceAll("_", " ")} / ${project.totalTasks} visible tickets`;
}

function buildNotesSection(type: ReportType) {
  return {
    key: "notes",
    title: "Notes",
    items: [
      "Generated from existing tickets, projects, planning, and activity history using deterministic templates.",
      type.startsWith("shareholder_")
        ? "Future AI-assisted reporting can be layered here later, but is intentionally not enabled."
        : "Future AI-assisted reporting is reserved as a later enhancement and is intentionally not enabled here.",
    ],
  } satisfies ReportSection;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function getShareholderReportData(context: ReportContext) {
  const [projects, roadmapProjects, financeOverview, financeSummary, financeRisks, clients, renewalContracts, notes] = await Promise.all([
    getProjects(),
    getRoadmapProjects(),
    getFinanceOverview("shareholder"),
    getShareholderFinanceSummary(),
    getOverdueFinanceItems("shareholder"),
    getClients("shareholder"),
    getContractsDueForRenewal("shareholder"),
    getNotesForEntity("shareholder", SHAREHOLDER_NOTES_ENTITY_ID),
  ]);

  const activeProjects = projects.filter((project) => project.status === "active");
  const atRiskProjects = projects.filter((project) => project.health === "at_risk" || project.health === "delayed");
  const upcomingMilestones = roadmapProjects
    .flatMap((project) =>
      project.milestones
        .filter((milestone) => milestone.status !== "completed" && milestone.status !== "cancelled")
        .map((milestone) => `${milestone.title} / ${project.name} / due ${formatDate(milestone.due_date)}`),
    )
    .slice(0, 8);
  const strategicClients = clients.filter((client) => client.status === "active" && client.activeProjectsCount >= 2);
  const shareholderNotes = notes
    .filter((note) => note.visibility === "shareholders")
    .filter((note) => !note.archived_at)
    .slice(0, 5)
    .map((note) => `${note.title} / ${note.body}`);

  return {
    projects,
    activeProjects,
    atRiskProjects,
    financeOverview,
    financeSummary,
    financeRisks,
    strategicClients,
    renewalContracts,
    upcomingMilestones,
    shareholderNotes,
    scopeLabel: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
  };
}

export async function getReportBuilderData(role: AppRole, currentUserId: string): Promise<ReportBuilderData> {
  const allowedTypes = getAllowedReportTypes(role);
  const [members, projects] = await Promise.all([
    role === "shareholder" ? Promise.resolve([]) : getTeamMembers(role),
    getProjects(),
  ]);
  const clients = role === "admin" || role === "manager" ? await getClients(role) : [];

  return {
    allowedTypes,
    users:
      role === "employee"
        ? members.filter((member) => member.id === currentUserId).map((member) => ({ id: member.id, full_name: member.full_name }))
        : members.map((member) => ({ id: member.id, full_name: member.full_name })),
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    clients: clients.map((client) => ({ id: client.id, name: client.name })),
  };
}

export async function generateDailyUserReport(context: ReportContext): Promise<ReportDocument> {
  const userId = context.targetUserId ?? context.currentUserId;
  const [performance, tickets] = await Promise.all([
    getUserPerformance(userId, context.role),
    getTickets(context.role, { assigneeId: userId }),
  ]);

  const completedToday = tickets.filter((ticket) => ticket.status === "done" && inRange(ticket.updated_at, context.startDate, context.endDate));
  const updatedToday = tickets.filter((ticket) => inRange(ticket.updated_at, context.startDate, context.endDate) && ticket.status !== "done");
  const blockers = tickets.filter((ticket) => ticket.status === "blocked");
  const overdue = tickets.filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date < context.endDate);
  const upcoming = performance?.upcomingDeadlines ?? [];

  return buildReport({
    type: "daily_individual",
    title: "Daily individual report",
    subtitle: `Delivery summary for ${formatDate(context.startDate)}`,
    scopeLabel: `User ${userId}`,
    generatedAt: new Date().toISOString(),
    summary: `${completedToday.length} ticket(s) completed, ${updatedToday.length} active update(s), ${blockers.length} blocker(s), and ${upcoming.length} upcoming priority item(s).`,
    sections: [
      { key: "completed_work", title: "Completed work", items: completedToday.map(formatTicketLine) },
      { key: "ongoing_work", title: "Ongoing work", items: updatedToday.slice(0, 8).map(formatTicketLine) },
      { key: "blockers", title: "Blockers", items: blockers.slice(0, 6).map(formatTicketLine) },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: upcoming.slice(0, 6).map((ticket) => `${ticket.title} / ${ticket.project_name ?? "No project"} / due ${ticket.due_date ? formatDate(ticket.due_date) : "Not scheduled"}`) },
      { key: "risks", title: "Risks", items: overdue.slice(0, 6).map(formatTicketLine) },
      buildNotesSection("daily_individual"),
    ],
  });
}

export async function generateWeeklyUserReport(context: ReportContext): Promise<ReportDocument> {
  const userId = context.targetUserId ?? context.currentUserId;
  const [performance, tickets] = await Promise.all([
    getUserPerformance(userId, context.role),
    getTickets(context.role, { assigneeId: userId }),
  ]);

  const completed = tickets.filter((ticket) => ticket.status === "done" && inRange(ticket.updated_at, context.startDate, context.endDate));
  const ongoing = tickets.filter((ticket) => isOpen(ticket) && (!ticket.updated_at || inRange(ticket.updated_at, context.startDate, context.endDate)));
  const blockers = tickets.filter((ticket) => ticket.status === "blocked");
  const overdue = tickets.filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date < context.endDate);

  return buildReport({
    type: "weekly_individual",
    title: "Weekly individual report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: `User ${userId}`,
    generatedAt: new Date().toISOString(),
    summary: `${completed.length} ticket(s) completed this period, ${performance?.onTimeCompletionRate ?? 0}% on-time completion, and ${blockers.length} visible blocker(s).`,
    sections: [
      { key: "completed_work", title: "Completed work", items: completed.map(formatTicketLine) },
      { key: "ongoing_work", title: "Ongoing work", items: (performance?.currentFocus ?? ongoing.map((ticket) => ({ ...ticket, project_name: ticket.project?.name ?? null }))).slice(0, 8).map((ticket) => "project_name" in ticket ? `${ticket.title} / ${ticket.project_name ?? "No project"} / ${ticket.status}` : formatTicketLine(ticket)) },
      { key: "blockers", title: "Blockers", items: blockers.slice(0, 6).map(formatTicketLine) },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: (performance?.upcomingDeadlines ?? []).slice(0, 6).map((ticket) => `${ticket.title} / ${ticket.project_name ?? "No project"} / due ${ticket.due_date ? formatDate(ticket.due_date) : "Not scheduled"}`) },
      { key: "risks", title: "Risks", items: overdue.slice(0, 6).map(formatTicketLine) },
      buildNotesSection("weekly_individual"),
    ],
  });
}

export async function generateTeamReport(context: ReportContext): Promise<ReportDocument> {
  const [performance, tickets] = await Promise.all([
    getTeamPerformance(context.role, context.currentUserId),
    getTickets(context.role),
  ]);

  const completed = tickets.filter((ticket) => ticket.status === "done" && inRange(ticket.updated_at, context.startDate, context.endDate));
  const blockers = tickets.filter((ticket) => ticket.status === "blocked");
  const overdue = tickets.filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date < context.endDate);
  const upcoming = tickets
    .filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date >= context.startDate)
    .sort((left, right) => (left.due_date ?? "").localeCompare(right.due_date ?? ""))
    .slice(0, 8);

  return buildReport({
    type: "weekly_team",
    title: "Weekly team report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Visible team scope",
    generatedAt: new Date().toISOString(),
    summary: `${performance.completedThisWeek} completed item(s), ${performance.onTimeCompletionRate}% on-time completion, ${performance.blockedTickets} blocker(s), and ${performance.activeWorkload} active work item(s).`,
    sections: [
      { key: "summary", title: "Summary", items: [`Average completion time: ${performance.averageCompletionDays} days`, `Overdue work items: ${performance.overdueTickets}`, `Completed this month: ${performance.completedThisMonth}`] },
      { key: "completed_work", title: "Completed work", items: completed.slice(0, 10).map(formatTicketLine) },
      { key: "ongoing_work", title: "Ongoing work", items: tickets.filter(isOpen).slice(0, 10).map(formatTicketLine) },
      { key: "blockers", title: "Blockers", items: blockers.slice(0, 8).map(formatTicketLine) },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: upcoming.map(formatTicketLine) },
      { key: "risks", title: "Risks", items: overdue.slice(0, 8).map(formatTicketLine) },
      buildNotesSection("weekly_team"),
    ],
  });
}

export async function generateProjectReport(context: ReportContext): Promise<ReportDocument> {
  if (!context.projectId) {
    throw new Error("Project identifier is required.");
  }

  const [project, tickets] = await Promise.all([
    getProjectById(context.projectId),
    getTickets(context.role, { projectId: context.projectId }),
  ]);

  if (!project) {
    throw new Error("Project not found.");
  }

  const completed = tickets.filter((ticket) => ticket.status === "done" && inRange(ticket.updated_at, context.startDate, context.endDate));
  const ongoing = tickets.filter(isOpen);
  const blockers = tickets.filter((ticket) => ticket.status === "blocked");
  const overdue = tickets.filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date < context.endDate);

  return buildReport({
    type: "project_progress",
    title: "Project progress report",
    subtitle: `${project.name} / ${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: project.name,
    generatedAt: new Date().toISOString(),
    summary: `${project.progress}% project progress, ${project.health.replaceAll("_", " ")} health, ${completed.length} completed ticket(s), and ${blockers.length} blocker(s) in scope.`,
    sections: [
      { key: "summary", title: "Summary", items: [formatProjectLine(project), `Client: ${project.client?.name ?? "No client"}`, `Owner: ${project.owner?.full_name ?? "Unassigned"}`] },
      { key: "completed_work", title: "Completed work", items: completed.map(formatTicketLine) },
      { key: "ongoing_work", title: "Ongoing work", items: ongoing.slice(0, 10).map(formatTicketLine) },
      { key: "blockers", title: "Blockers", items: blockers.slice(0, 8).map(formatTicketLine) },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: project.upcomingDeadlines.slice(0, 8).map((ticket) => `${ticket.title} / due ${ticket.due_date ? formatDate(ticket.due_date) : "Not scheduled"}`) },
      { key: "risks", title: "Risks", items: overdue.slice(0, 8).map(formatTicketLine) },
      buildNotesSection("project_progress"),
    ],
  });
}

export async function generateProjectStatusReport(context: ReportContext): Promise<ReportDocument> {
  if (!context.projectId) {
    throw new Error("Project identifier is required.");
  }

  const [project, tickets, roadmapProjects] = await Promise.all([
    getProjectById(context.projectId),
    getTickets(context.role, { projectId: context.projectId }),
    getRoadmapProjects(),
  ]);

  if (!project) {
    throw new Error("Project not found.");
  }

  const projectRoadmap = roadmapProjects.find((item) => item.id === context.projectId);
  const completedTickets = tickets.filter((ticket) => ticket.status === "done");
  const openTickets = tickets.filter(isOpen);
  const overdueTickets = tickets.filter((ticket) => ticket.due_date && isOpen(ticket) && ticket.due_date < context.endDate);
  const milestones = (projectRoadmap?.milestones ?? [])
    .filter((milestone) => milestone.status !== "completed" && milestone.status !== "cancelled")
    .slice(0, 6)
    .map((milestone) => `${milestone.title} / due ${formatDate(milestone.due_date)} / ${milestone.status.replaceAll("_", " ")}`);
  const recentActivity = project.recentActivity.slice(0, 6).map((activity) => `${activity.action} / ${formatDate(activity.created_at)}`);

  return buildReport({
    type: "project_status",
    title: "Project status report",
    subtitle: `${project.name} / ${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: project.name,
    generatedAt: new Date().toISOString(),
    summary: `${project.progress}% progress, ${openTickets.length} open ticket(s), ${completedTickets.length} completed ticket(s), and ${overdueTickets.length} overdue item(s) in the visible project scope.`,
    sections: [
      { key: "summary", title: "Project overview", items: [formatProjectLine(project), `Client: ${project.client?.name ?? "No client"}`, `Owner: ${project.owner?.full_name ?? "Unassigned"}`] },
      { key: "ongoing_work", title: "Open tickets", items: openTickets.slice(0, 10).map(formatTicketLine) },
      { key: "completed_work", title: "Completed tickets", items: completedTickets.slice(0, 10).map(formatTicketLine) },
      { key: "risks", title: "Overdue tickets", items: overdueTickets.slice(0, 8).map(formatTicketLine) },
      { key: "upcoming_priorities", title: "Upcoming milestones", items: milestones },
      { key: "blockers", title: "Recent activity", items: recentActivity },
      buildNotesSection("project_status"),
    ],
  });
}

export async function generateFinanceSummaryReport(context: ReportContext): Promise<ReportDocument> {
  const [overview, invoices, payments, transfers, risks] = await Promise.all([
    getFinanceOverview(context.role),
    getInvoices(context.role),
    getPayments(context.role),
    getTransfers(context.role),
    getOverdueFinanceItems(context.role),
  ]);

  const overduePayments = payments.filter((payment) => payment.status === "late");
  const expectedPayments = payments.filter((payment) => payment.status === "expected");
  const receivedPayments = payments.filter((payment) => payment.status === "received" || payment.status === "reconciled");
  const pendingTransfers = transfers.filter((transfer) => transfer.status === "planned" || transfer.status === "pending");

  return buildReport({
    type: "finance_summary",
    title: "Finance summary report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Visible finance scope",
    generatedAt: new Date().toISOString(),
    summary: `${formatCurrency(overview.totalReceivedThisMonth)} received this month, ${formatCurrency(overview.totalExpectedThisMonth)} expected, ${formatCurrency(overview.totalOverdue)} overdue, and ${formatCurrency(overview.totalOutgoingThisMonth)} outgoing.`,
    sections: [
      { key: "summary", title: "Invoices summary", items: [`Pending invoices: ${overview.pendingInvoices}`, `Paid invoices: ${overview.paidInvoices}`, `Unpaid invoices: ${overview.unpaidInvoices}`] },
      { key: "completed_work", title: "Payments received", items: receivedPayments.slice(0, 8).map((payment) => `${payment.client?.name ?? "Client"} / ${formatCurrency(payment.amount)} / ${payment.payment_date ? formatDate(payment.payment_date) : "Undated"}`) },
      { key: "ongoing_work", title: "Expected payments", items: expectedPayments.slice(0, 8).map((payment) => `${payment.client?.name ?? "Client"} / ${formatCurrency(payment.amount)} / due ${payment.due_date ? formatDate(payment.due_date) : "Unscheduled"}`) },
      { key: "risks", title: "Overdue payments", items: overduePayments.slice(0, 8).map((payment) => `${payment.client?.name ?? "Client"} / ${formatCurrency(payment.amount)} / due ${payment.due_date ? formatDate(payment.due_date) : "Unscheduled"}`) },
      { key: "upcoming_priorities", title: "Outgoing transfers summary", items: pendingTransfers.slice(0, 8).map((transfer) => `${transfer.category.replaceAll("_", " ")} / ${formatCurrency(transfer.amount)} / ${transfer.transfer_date ? formatDate(transfer.transfer_date) : "Unscheduled"}`) },
      { key: "blockers", title: "Finance risks", items: risks.slice(0, 8).map((risk) => `${risk.title} / ${risk.description}`) },
      buildNotesSection("finance_summary"),
    ],
  });
}

export async function generateTeamWorkloadReport(context: ReportContext): Promise<ReportDocument> {
  const [workload, performance, availableMembers, overloadedMembers] = await Promise.all([
    getTeamWorkload(context.role, context.currentUserId),
    getTeamPerformance(context.role, context.currentUserId),
    getAvailableTeamMembers(context.role, context.currentUserId),
    getOverloadedTeamMembers(context.role, context.currentUserId),
  ]);

  return buildReport({
    type: "team_workload",
    title: "Team workload report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Visible team workload",
    generatedAt: new Date().toISOString(),
    summary: `${workload.length} visible team member(s), ${overloadedMembers.length} high-capacity signal(s), ${availableMembers.length} available capacity signal(s), and ${performance.blockedTickets} blocker(s) in the current scope.`,
    sections: [
      { key: "summary", title: "Workload overview", items: workload.slice(0, 10).map((member) => `${member.full_name} / ${member.active_work_items} active items / ${member.utilization_percentage}% utilization`) },
      { key: "ongoing_work", title: "Overdue work", items: workload.filter((member) => member.overdue_items > 0).slice(0, 8).map((member) => `${member.full_name} / ${member.overdue_items} overdue item(s)`) },
      { key: "upcoming_priorities", title: "Available capacity", items: availableMembers.slice(0, 8).map((member) => `${member.full_name} / ${member.utilization_percentage}% utilization / ${member.weekly_capacity_hours}h capacity`) },
      { key: "blockers", title: "Blockers", items: performance.blockersSummary.slice(0, 8).map((item) => `${item.projectName} / ${item.count} blocker(s)`) },
      { key: "risks", title: "Capacity risks", items: overloadedMembers.slice(0, 8).map((member) => `${member.full_name} / ${member.utilization_percentage}% utilization / ${member.overdue_items} overdue item(s)`) },
      buildNotesSection("team_workload"),
    ],
  });
}

export async function generateClientRelationshipReport(context: ReportContext): Promise<ReportDocument> {
  if (!context.clientId) {
    throw new Error("Client identifier is required.");
  }

  const [client, summary, contracts, documents] = await Promise.all([
    getClientById(context.clientId, context.role),
    getClientRelationshipSummary(context.clientId, context.role),
    getClientLinkedContracts(context.clientId, context.role),
    getClientLinkedDocuments(context.clientId, context.role),
  ]);

  if (!client) {
    throw new Error("Client not found.");
  }

  return buildReport({
    type: "client_relationship",
    title: "Client relationship report",
    subtitle: `${client.name} / ${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: client.name,
    generatedAt: new Date().toISOString(),
    summary: `${summary.activeProjects} active project(s), ${summary.openTickets} open ticket(s), ${summary.activeContracts} active contract(s), and ${documents.length} visible document(s) in the client relationship scope.`,
    sections: [
      { key: "summary", title: "Client overview", items: [`Status: ${client.status}`, `Relationship health: ${summary.relationshipHealth.replaceAll("_", " ")}`, `Account manager: ${client.accountManager?.full_name ?? "Unassigned"}`] },
      { key: "ongoing_work", title: "Active projects", items: client.linkedProjects.slice(0, 8).map((project) => `${project.name} / ${project.progress}% progress / ${project.health.replaceAll("_", " ")}`) },
      { key: "completed_work", title: "Contracts summary", items: contracts.slice(0, 8).map((contract) => `${contract.title} / ${contract.status} / renewal ${contract.renewal_date ? formatDate(contract.renewal_date) : "Not scheduled"}`) },
      { key: "blockers", title: "Recent activity", items: client.recentActivity.slice(0, 8).map((activity) => `${activity.action} / ${formatDate(activity.created_at)}`) },
      { key: "upcoming_priorities", title: "Documents count", items: [`Visible documents: ${documents.length}`, `Archived documents: ${summary.archivedDocumentsCount}`, `Upcoming project deadline: ${summary.upcomingProjectDeadline?.name ?? "None"}`] },
      { key: "risks", title: "Relationship risks", items: [`Overdue tickets: ${summary.overdueTickets}`, `Delayed projects: ${summary.delayedProjects}`, `Expired contracts: ${summary.expiredContracts}`] },
      buildNotesSection("client_relationship"),
    ],
  });
}

export async function generateShareholderExecutiveReport(context: ReportContext): Promise<ReportDocument> {
  const data = await getShareholderReportData(context);

  return buildReport({
    type: "shareholder_executive",
    title: "Shareholder executive report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Executive consolidated summary",
    generatedAt: new Date().toISOString(),
    summary: `${data.projects.length} portfolio project(s), ${formatCurrency(data.financeSummary.revenue)} received, ${data.upcomingMilestones.length} upcoming milestone(s), and ${data.financeRisks.length} visible risk signal(s) in the current executive window.`,
    sections: [
      { key: "summary", title: "Executive summary", items: [`Active projects: ${data.activeProjects.length}`, `Strategic clients: ${data.strategicClients.length}`, `Renewals to watch: ${data.renewalContracts.length}`] },
      { key: "completed_work", title: "Project portfolio status", items: data.projects.slice(0, 8).map(formatProjectLine) },
      { key: "ongoing_work", title: "Roadmap", items: data.upcomingMilestones.slice(0, 8) },
      { key: "blockers", title: "High-level finance", items: [`Revenue: ${formatCurrency(data.financeSummary.revenue)}`, `Expected collections: ${formatCurrency(data.financeSummary.expectedCollections)}`, `Overdue exposure: ${formatCurrency(data.financeSummary.overdueExposure)}`] },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: data.renewalContracts.slice(0, 8).map((contract) => `${contract.title} / ${contract.client?.name ?? "Visible scope"} / ${contract.daysUntilRenewal ?? "No"} day renewal window`) },
      { key: "risks", title: "Risks", items: data.financeRisks.slice(0, 8).map((risk) => `${risk.title} / ${risk.description}`) },
      { key: "notes", title: "Management notes visible to shareholders", items: data.shareholderNotes.length ? data.shareholderNotes : ["No shareholder-visible management notes in the current window."] },
    ],
  });
}

export async function generateShareholderMonthlyReport(context: ReportContext): Promise<ReportDocument> {
  const data = await getShareholderReportData(context);

  return buildReport({
    type: "shareholder_monthly",
    title: "Monthly shareholder summary",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Executive monthly summary",
    generatedAt: new Date().toISOString(),
    summary: `${data.activeProjects.length} active project(s), ${data.atRiskProjects.length} project(s) needing attention, ${formatCurrency(data.financeSummary.revenue)} received, and ${formatCurrency(data.financeSummary.overdueExposure)} overdue exposure are visible in the current executive window.`,
    sections: [
      { key: "summary", title: "Executive summary", items: [`Portfolio projects visible: ${data.projects.length}`, `Strategic clients in scope: ${data.strategicClients.length}`, `Upcoming finance deadlines: ${data.financeOverview.upcomingFinancialDeadlines.length}`] },
      { key: "completed_work", title: "Project portfolio status", items: data.projects.slice(0, 8).map(formatProjectLine) },
      { key: "ongoing_work", title: "Key milestones", items: data.upcomingMilestones },
      { key: "blockers", title: "Financial high-level summary", items: [`Received: ${formatCurrency(data.financeSummary.revenue)}`, `Expected collections: ${formatCurrency(data.financeSummary.expectedCollections)}`, `Net estimate: ${formatCurrency(data.financeSummary.netEstimate)}`] },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: data.renewalContracts.slice(0, 6).map((contract) => `${contract.title} / ${contract.client?.name ?? "Unlinked client"} / renewal ${formatDate(contract.renewal_date ?? contract.end_date ?? context.endDate)}`) },
      { key: "risks", title: "Risks", items: data.financeRisks.slice(0, 6).map((risk) => `${risk.title} / ${risk.description}`) },
      { key: "notes", title: "Management notes visible to shareholders", items: data.shareholderNotes.length ? data.shareholderNotes : ["No shareholder-visible management notes in the current window."] },
    ],
  });
}

export async function generateShareholderPortfolioReport(context: ReportContext): Promise<ReportDocument> {
  const data = await getShareholderReportData(context);

  return buildReport({
    type: "shareholder_portfolio",
    title: "Project portfolio report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Executive portfolio view",
    generatedAt: new Date().toISOString(),
    summary: `${data.projects.length} visible project(s), ${data.activeProjects.length} active, and ${data.atRiskProjects.length} currently flagged as at risk or delayed.`,
    sections: [
      { key: "summary", title: "Executive summary", items: [`Active projects: ${data.activeProjects.length}`, `Completed projects: ${data.projects.filter((project) => project.status === "completed").length}`, `Delayed projects: ${data.projects.filter((project) => project.health === "delayed").length}`] },
      { key: "completed_work", title: "Project portfolio status", items: data.projects.slice(0, 10).map(formatProjectLine) },
      { key: "ongoing_work", title: "Key milestones", items: data.upcomingMilestones },
      { key: "blockers", title: "Financial high-level summary", items: [`Revenue visible: ${formatCurrency(data.financeSummary.revenue)}`, `Overdue exposure: ${formatCurrency(data.financeSummary.overdueExposure)}`] },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: data.activeProjects.flatMap((project) => project.upcomingDeadlines.slice(0, 1).map((ticket) => `${project.name} / upcoming work due ${ticket.due_date ? formatDate(ticket.due_date) : "Not scheduled"}`)).slice(0, 8) },
      { key: "risks", title: "Risks", items: data.atRiskProjects.slice(0, 8).map(formatProjectLine) },
      { key: "notes", title: "Management notes visible to shareholders", items: data.shareholderNotes.length ? data.shareholderNotes : ["No shareholder-visible management notes in the current window."] },
    ],
  });
}

export async function generateShareholderFinanceReport(context: ReportContext): Promise<ReportDocument> {
  const data = await getShareholderReportData(context);

  return buildReport({
    type: "shareholder_finance",
    title: "Financial summary report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Executive finance summary",
    generatedAt: new Date().toISOString(),
    summary: `${formatCurrency(data.financeSummary.revenue)} received, ${formatCurrency(data.financeSummary.expectedCollections)} expected, ${formatCurrency(data.financeSummary.overdueExposure)} overdue, and ${formatCurrency(data.financeSummary.expenses)} outgoing in the current visible scope.`,
    sections: [
      { key: "summary", title: "Executive summary", items: [`Revenue: ${formatCurrency(data.financeSummary.revenue)}`, `Expected collections: ${formatCurrency(data.financeSummary.expectedCollections)}`, `Outgoing: ${formatCurrency(data.financeSummary.expenses)}`] },
      { key: "completed_work", title: "Project portfolio status", items: data.projects.slice(0, 6).map(formatProjectLine) },
      { key: "ongoing_work", title: "Key milestones", items: data.upcomingMilestones.slice(0, 6) },
      { key: "blockers", title: "Financial high-level summary", items: data.financeOverview.upcomingFinancialDeadlines.slice(0, 8).map((deadline) => `${deadline.label} / ${deadline.clientName ?? "Visible scope"} / ${formatCurrency(deadline.amount)} / due ${formatDate(deadline.dueDate)}`) },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: data.renewalContracts.slice(0, 6).map((contract) => `${contract.title} / renewal ${formatDate(contract.renewal_date ?? contract.end_date ?? context.endDate)}`) },
      { key: "risks", title: "Risks", items: data.financeRisks.slice(0, 8).map((risk) => `${risk.title} / ${risk.description}`) },
      { key: "notes", title: "Management notes visible to shareholders", items: data.shareholderNotes.length ? data.shareholderNotes : ["No shareholder-visible management notes in the current window."] },
    ],
  });
}

export async function generateShareholderRiskReport(context: ReportContext): Promise<ReportDocument> {
  const data = await getShareholderReportData(context);

  return buildReport({
    type: "shareholder_risk",
    title: "Roadmap and risks report",
    subtitle: `${formatDate(context.startDate)} to ${formatDate(context.endDate)}`,
    scopeLabel: "Executive roadmap and risk view",
    generatedAt: new Date().toISOString(),
    summary: `${data.upcomingMilestones.length} visible milestone(s), ${data.atRiskProjects.length} project risk signal(s), and ${data.financeRisks.length} finance or renewal signal(s) in the current executive scope.`,
    sections: [
      { key: "summary", title: "Executive summary", items: [`At-risk or delayed projects: ${data.atRiskProjects.length}`, `Renewals to watch: ${data.renewalContracts.length}`, `Visible finance risks: ${data.financeRisks.length}`] },
      { key: "completed_work", title: "Project portfolio status", items: data.projects.slice(0, 8).map(formatProjectLine) },
      { key: "ongoing_work", title: "Key milestones", items: data.upcomingMilestones },
      { key: "blockers", title: "Financial high-level summary", items: [`Overdue exposure: ${formatCurrency(data.financeSummary.overdueExposure)}`, `Unpaid invoices: ${data.financeSummary.unpaidInvoices}`, `Confirmed transfers: ${data.financeSummary.confirmedTransfers}`] },
      { key: "upcoming_priorities", title: "Upcoming priorities", items: data.renewalContracts.slice(0, 6).map((contract) => `${contract.title} / ${contract.client?.name ?? "Visible scope"} / ${contract.daysUntilRenewal ?? "No"} day renewal window`) },
      { key: "risks", title: "Risks", items: [...data.atRiskProjects.slice(0, 4).map(formatProjectLine), ...data.financeRisks.slice(0, 4).map((risk) => `${risk.title} / ${risk.description}`)].slice(0, 8) },
      { key: "notes", title: "Management notes visible to shareholders", items: data.shareholderNotes.length ? data.shareholderNotes : ["No shareholder-visible management notes in the current window."] },
    ],
  });
}

export async function generateReport(type: ReportType, context: ReportContext): Promise<ReportDocument> {
  if (type === "daily_individual") {
    return generateDailyUserReport(context);
  }

  if (type === "weekly_individual") {
    return generateWeeklyUserReport(context);
  }

  if (type === "weekly_team") {
    return generateTeamReport(context);
  }

  if (type === "project_progress") {
    return generateProjectReport(context);
  }

  if (type === "project_status") {
    return generateProjectStatusReport(context);
  }

  if (type === "finance_summary") {
    return generateFinanceSummaryReport(context);
  }

  if (type === "team_workload") {
    return generateTeamWorkloadReport(context);
  }

  if (type === "client_relationship") {
    return generateClientRelationshipReport(context);
  }

  if (type === "shareholder_executive") {
    return generateShareholderExecutiveReport(context);
  }

  if (type === "shareholder_monthly") {
    return generateShareholderMonthlyReport(context);
  }

  if (type === "shareholder_portfolio") {
    return generateShareholderPortfolioReport(context);
  }

  if (type === "shareholder_finance") {
    return generateShareholderFinanceReport(context);
  }

  return generateShareholderRiskReport(context);
}

export { getAllowedReportTypes, getDefaultDateRange };
