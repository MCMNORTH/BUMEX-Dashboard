import "server-only";

import { getPlaceholderCalendarEvents } from "@/data/calendar-placeholders";
import { getProjects } from "@/lib/projects/service";
import { getRoadmapFilterData, getRoadmapProjects } from "@/lib/roadmap/service";
import { getTickets, getTicketsFilterData } from "@/lib/tickets/service";
import type { AppRole } from "@/types/auth";
import type { CalendarEvent, CalendarFilterData, CalendarFilters } from "@/types/calendar";
import type { ProjectRecord } from "@/types/project";
import type { RoadmapProjectRecord } from "@/types/milestone";
import type { TicketRecord } from "@/types/ticket";

function matchesFilters(event: CalendarEvent, filters: CalendarFilters) {
  if (filters.type && event.type !== filters.type) {
    return false;
  }

  if (filters.projectId && event.projectId !== filters.projectId) {
    return false;
  }

  if (filters.clientId && event.clientId !== filters.clientId) {
    return false;
  }

  if (filters.assigneeId && event.assigneeId !== filters.assigneeId) {
    return false;
  }

  if (filters.priority && event.priority !== filters.priority) {
    return false;
  }

  if (filters.status && event.status !== filters.status) {
    return false;
  }

  return true;
}

export function normalizeTicketEvents(tickets: TicketRecord[], role: AppRole): CalendarEvent[] {
  if (role === "shareholder") {
    return [];
  }

  return tickets
    .filter((ticket) => ticket.due_date)
    .map((ticket) => ({
      id: `ticket-${ticket.id}`,
      title: ticket.title,
      type: "ticket_due" as const,
      date: ticket.due_date as string,
      projectId: ticket.project_id,
      projectName: ticket.project?.name ?? null,
      clientId: ticket.project?.client?.id ?? null,
      clientName: ticket.project?.client?.name ?? null,
      assigneeId: ticket.assignee_id,
      assigneeName: ticket.assignee?.full_name ?? null,
      priority: ticket.priority,
      status: ticket.status,
      href: `/tickets/${ticket.id}`,
      entityId: ticket.id,
      entityType: "task",
      description: role === "employee" ? null : ticket.description,
    }));
}

export function normalizeProjectEvents(projects: ProjectRecord[]): CalendarEvent[] {
  return projects
    .filter((project) => project.end_date)
    .map((project) => ({
      id: `project-${project.id}`,
      title: `${project.name} deadline`,
      type: "project_deadline" as const,
      date: project.end_date as string,
      projectId: project.id,
      projectName: project.name,
      clientId: project.client?.id ?? null,
      clientName: project.client?.name ?? null,
      status: project.status,
      health: project.health,
      href: `/projects/${project.id}`,
      entityId: project.id,
      entityType: "project",
      description: project.description,
    }));
}

export function normalizeMilestoneEvents(projects: RoadmapProjectRecord[], role: AppRole): CalendarEvent[] {
  return projects.flatMap((project) =>
    project.milestones.map((milestone) => ({
      id: `milestone-${milestone.id}`,
      title: milestone.title,
      type: "milestone" as const,
      date: milestone.due_date,
      projectId: project.id,
      projectName: project.name,
      clientId: project.client?.id ?? null,
      clientName: project.client?.name ?? null,
      assigneeId: milestone.owner_id,
      assigneeName: role === "shareholder" ? null : milestone.owner?.full_name ?? null,
      status: milestone.status,
      health: project.health,
      href: `/roadmap`,
      entityId: milestone.id,
      entityType: "milestone",
      description: role === "shareholder" ? null : milestone.description,
    })),
  );
}

export async function getCalendarFilterData(): Promise<CalendarFilterData> {
  const [ticketFilterData, roadmapFilterData] = await Promise.all([
    getTicketsFilterData(),
    getRoadmapFilterData(),
  ]);

  return {
    projects: roadmapFilterData.projects,
    clients: roadmapFilterData.clients.map((client) => ({ id: client.id, name: client.name })),
    assignees: ticketFilterData.assignees.map((assignee) => ({
      id: assignee.id,
      full_name: assignee.full_name,
    })),
  };
}

export async function getCalendarEvents(role: AppRole, filters: CalendarFilters = {}) {
  const [tickets, projects, roadmapProjects] = await Promise.all([
    getTickets(role),
    getProjects(),
    getRoadmapProjects(),
  ]);

  const baseEvents = [
    ...normalizeProjectEvents(projects),
    ...normalizeMilestoneEvents(roadmapProjects, role),
    ...normalizeTicketEvents(tickets, role),
  ];

  const placeholderEvents = getPlaceholderCalendarEvents().filter((event) => {
    if (role === "employee" && (event.type === "payment_due" || event.type === "contract_renewal")) {
      return false;
    }

    if (role === "shareholder") {
      return event.type !== "internal_event";
    }

    return true;
  });

  return [...baseEvents, ...placeholderEvents]
    .filter((event) => matchesFilters(event, filters))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

