import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getTicketActivity, logActivity } from "@/lib/activity/service";
import {
  createAssignmentNotification,
  createScopedNotifications,
  createStatusChangeNotification,
  getNotificationRecipientsForProject,
} from "@/lib/notifications/service";
import {
  applyEntityScope,
  extendWithEntityCode,
  getCurrentEntityCode,
  getEntityScopedCacheKey,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
import { getCached, invalidateCached } from "@/lib/server-cache";
import { createClient } from "@/lib/supabase/server";
import { getTicketDueState, redactTicketDescription, normalizeTicketPriority, normalizeTicketStatus } from "@/lib/tickets/helpers";
import type { AppRole } from "@/types/auth";
import type { TicketActivity, TicketAssignee, TicketFilters, TicketFiltersData, TicketFormValues, TicketProject, TicketRecord, TicketReporter, TicketStats, TicketWorkloadRecord } from "@/types/ticket";

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: string;
  priority: string | null;
  type: TicketRecord["type"];
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
  project: TicketProject | TicketProject[] | null;
  assignee: TicketAssignee | TicketAssignee[] | null;
  reporter: TicketReporter | TicketReporter[] | null;
};

type AppSupabaseClient = SupabaseClient;

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapTicket(row: TicketRow, role: AppRole, activity: TicketActivity[] = []): TicketRecord {
  return {
    id: row.id,
    title: row.title,
    description: redactTicketDescription(row.description, role),
    project_id: row.project_id,
    assignee_id: row.assignee_id,
    reporter_id: row.reporter_id,
    status: normalizeTicketStatus(row.status),
    priority: normalizeTicketPriority(row.priority),
    type: row.type,
    due_date: row.due_date,
    estimated_hours: row.estimated_hours,
    actual_hours: row.actual_hours,
    github_issue_url: role === "shareholder" ? null : row.github_issue_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project: single(row.project),
    assignee: single(row.assignee),
    reporter: single(row.reporter),
    activity,
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

function getBaseTicketQuery(supabase: AppSupabaseClient) {
  return supabase
    .from("tasks")
    .select(
      `
        id,
        title,
        description,
        project_id,
        assignee_id,
        reporter_id,
        status,
        priority,
        type,
        due_date,
        estimated_hours,
        actual_hours,
        github_issue_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          status,
          end_date,
          client:clients (
            id,
            name,
            contact_email
          )
        ),
        assignee:profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        reporter:profiles!tasks_reporter_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .order("updated_at", { ascending: false });
}

type TicketQuery = ReturnType<typeof getBaseTicketQuery>;

function applyFilters(query: TicketQuery, filters: TicketFilters) {
  if (filters.search) {
    query = query.ilike("title", `%${filters.search}%`);
  }

  if (filters.status) {
    query = query.in("status", filters.status === "review" ? ["review", "in_review"] : [filters.status]);
  }

  if (filters.priority) {
    query = query.in("priority", filters.priority === "urgent" ? ["urgent", "critical"] : [filters.priority]);
  }

  if (filters.assigneeId) {
    query = query.eq("assignee_id", filters.assigneeId);
  }

  if (filters.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const monthEnd = new Date(today);
  monthEnd.setDate(today.getDate() + 30);

  if (filters.dueDate === "overdue") {
    query = query.lt("due_date", today.toISOString().slice(0, 10));
  }

  if (filters.dueDate === "this_week") {
    query = query
      .gte("due_date", today.toISOString().slice(0, 10))
      .lte("due_date", weekEnd.toISOString().slice(0, 10));
  }

  if (filters.dueDate === "this_month") {
    query = query
      .gte("due_date", today.toISOString().slice(0, 10))
      .lte("due_date", monthEnd.toISOString().slice(0, 10));
  }

  if (filters.dueDate === "none") {
    query = query.is("due_date", null);
  }

  return query;
}

export async function getTickets(role: AppRole, filters: TicketFilters = {}) {
  const entityCode = await getCurrentEntityCode();
  return getCached(
    getEntityScopedCacheKey(`tickets:list:${role}:${ticketFiltersKey(filters)}`, entityCode),
    12_000,
    () => getFreshTickets(role, filters, entityCode),
  );
}

function ticketFiltersKey(filters: TicketFilters = {}) {
  return JSON.stringify({
    search: filters.search ?? "",
    status: filters.status ?? "",
    priority: filters.priority ?? "",
    assigneeId: filters.assigneeId ?? "",
    projectId: filters.projectId ?? "",
    dueDate: filters.dueDate ?? "",
    type: filters.type ?? "",
  });
}

function invalidateTicketReadCache() {
  invalidateCached((key) => key.startsWith("tickets:") || key === "tickets-filter-data");
}

async function getFreshTickets(role: AppRole, filters: TicketFilters = {}, entityCode?: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = getBaseTicketQuery(supabase);
  if (entityCode) {
    query = applyEntityScope(query, entityCode);
  }
  query = applyFilters(query, filters);

  const { data, error } = await query.returns<TicketRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapTicket(row, role));
}

export async function getMyTickets(userId: string, role: AppRole) {
  const entityCode = await getCurrentEntityCode();
  return getCached(
    getEntityScopedCacheKey(`tickets:mine:${role}:${userId}`, entityCode),
    12_000,
    () => getFreshMyTickets(userId, role, entityCode),
  );
}

async function getFreshMyTickets(userId: string, role: AppRole, entityCode?: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = getBaseTicketQuery(supabase);
  if (entityCode) {
    query = applyEntityScope(query, entityCode);
  }
  query = query.eq("assignee_id", userId);

  const { data, error } = await query.returns<TicketRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapTicket(row, role));
}

export async function getTicketById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("tasks")
    .select(
      `
        id,
        title,
        description,
        project_id,
        assignee_id,
        reporter_id,
        status,
        priority,
        type,
        due_date,
        estimated_hours,
        actual_hours,
        github_issue_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          status,
          end_date,
          client:clients (
            id,
            name,
            contact_email
          )
        ),
        assignee:profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        ),
        reporter:profiles!tasks_reporter_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.maybeSingle<TicketRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const normalizedActivity = await getTicketActivity(id, data.project_id, 10);

  return mapTicket(data, role, normalizedActivity);
}

export async function getTicketsFilterData(): Promise<TicketFiltersData> {
  const entityCode = await getCurrentEntityCode();
  return getCached(getEntityScopedCacheKey("tickets-filter-data", entityCode), 30_000, () =>
    getFreshTicketsFilterData(entityCode),
  );
}

async function getFreshTicketsFilterData(entityCode?: string): Promise<TicketFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const shouldScopeByEntity = isEntityScopingEnabled() && Boolean(entityCode);
  let assigneesQuery = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .order("full_name", { ascending: true });
  let reportersQuery = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .order("full_name", { ascending: true });
  let projectsQuery = supabase
    .from("projects")
    .select(
      `
        id,
        name,
        status,
        end_date,
        client:clients (
          id,
          name,
          contact_email
        )
      `,
    )
    .order("name", { ascending: true });

  if (shouldScopeByEntity) {
    assigneesQuery = assigneesQuery.eq("entity_code", entityCode ?? "");
    reportersQuery = reportersQuery.eq("entity_code", entityCode ?? "");
    projectsQuery = projectsQuery.eq("entity_code", entityCode ?? "");
  }

  const [{ data: assignees, error: assigneeError }, { data: reporters, error: reporterError }, { data: projects, error: projectsError }] =
    await Promise.all([
      assigneesQuery.returns<TicketAssignee[]>(),
      reportersQuery.returns<TicketReporter[]>(),
      projectsQuery.returns<TicketProject[]>(),
    ]);

  if (assigneeError) throw new Error(assigneeError.message);
  if (reporterError) throw new Error(reporterError.message);
  if (projectsError) throw new Error(projectsError.message);

  return {
    assignees: assignees ?? [],
    reporters: reporters ?? [],
    projects: projects ?? [],
  };
}

function parseTicketPayload(values: TicketFormValues) {
  const normalizedStatus = values.status === "review" ? "review" : values.status;
  const normalizedPriority = values.priority === "urgent" ? "urgent" : values.priority;

  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    project_id: values.project_id,
    assignee_id: values.assignee_id || null,
    reporter_id: values.reporter_id || null,
    status: normalizedStatus,
    priority: normalizedPriority,
    type: values.type,
    due_date: values.due_date || null,
    estimated_hours: values.estimated_hours ? Number(values.estimated_hours) : null,
    actual_hours: values.actual_hours ? Number(values.actual_hours) : null,
    github_issue_url: values.github_issue_url.trim() || null,
  };
}

export async function createTicket(values: TicketFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseTicketPayload(values), entityCode);
  const { data, error } = await supabase
    .from("tasks")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Created ticket ${payload.title}`,
    entityType: "task",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Ticket created",
    },
  });

  await createAssignmentNotification({
    userId: payload.assignee_id,
    title: "New ticket assignment",
    body: `You were assigned to ${payload.title}.`,
    entityType: "ticket",
    entityId: data.id,
    skipUserId: actorUserId,
  });

  const projectRecipients = await getNotificationRecipientsForProject(payload.project_id);

  await createScopedNotifications({
    userIds: projectRecipients.map((recipient) => recipient.id),
    type: "comment",
    title: "New ticket created",
    body: `${payload.title} was added to the operational queue.`,
    entityType: "ticket",
    entityId: data.id,
    skipUserId: actorUserId,
  });

  invalidateTicketReadCache();

  return data.id;
}

export async function updateTicket(id: string, values: TicketFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const previousQuery = applyEntityScope(supabase
    .from("tasks")
    .select("title, status, priority, assignee_id, due_date, project_id")
    .eq("id", id), entityCode);
  const previousResponse = await previousQuery.maybeSingle();
  const { data: previousTicket, error: previousError } = previousResponse as {
    data: {
      title: string;
      status: string;
      priority: string;
      assignee_id: string | null;
      due_date: string | null;
      project_id: string;
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = parseTicketPayload(values);
  const { error } = await applyEntityScope(supabase.from("tasks").update(payload).eq("id", id), entityCode);

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks = [];

  if (!previousTicket) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated ticket ${payload.title}`,
        entityType: "task",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Ticket updated",
        },
      }),
    );
  } else {
    const changes = [
      ["status", previousTicket.status, payload.status, `Moved ticket to ${payload.status}`, "status_change"],
      ["assignee_id", previousTicket.assignee_id, payload.assignee_id, "Changed ticket assignee", "assignment_change"],
      ["priority", previousTicket.priority, payload.priority, `Changed priority to ${payload.priority}`, "priority_change"],
      ["due_date", previousTicket.due_date, payload.due_date, "Updated due date", "due_date_change"],
      ["project_id", previousTicket.project_id, payload.project_id, "Moved ticket to another project", "update"],
      ["title", previousTicket.title, payload.title, `Renamed ticket to ${payload.title}`, "update"],
    ] as const;

    for (const [field, from, to, action, kind] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({
            userId: actorUserId,
            action,
            entityType: "task",
            entityId: id,
            metadata: {
              kind,
              field,
              from,
              to,
            },
          }),
        );
      }
    }

    if (previousTicket.assignee_id !== payload.assignee_id) {
      activityTasks.push(
        createAssignmentNotification({
          userId: payload.assignee_id,
          title: previousTicket.assignee_id ? "Ticket reassigned" : "New ticket assignment",
          body: `You are now assigned to ${payload.title}.`,
          entityType: "ticket",
          entityId: id,
          skipUserId: actorUserId,
        }),
      );
    }

    if (previousTicket.status !== payload.status) {
      activityTasks.push(
        getNotificationRecipientsForProject(payload.project_id).then((recipients) =>
          createStatusChangeNotification({
            userIds: recipients.map((recipient) => recipient.id),
            title: "Ticket status updated",
            body: `${payload.title} moved to ${payload.status.replaceAll("_", " ")}.`,
            entityType: "ticket",
            entityId: id,
            skipUserId: actorUserId,
          }),
        ),
      );
    }

    const hasGeneralUpdate =
      previousTicket.title !== payload.title
      || previousTicket.priority !== payload.priority
      || previousTicket.due_date !== payload.due_date
      || previousTicket.project_id !== payload.project_id;

    if (hasGeneralUpdate) {
      activityTasks.push(
        getNotificationRecipientsForProject(payload.project_id).then((recipients) =>
          createScopedNotifications({
            userIds: recipients.map((recipient) => recipient.id),
            type: "comment",
            title: "Ticket updated",
            body: `${payload.title} has new operational updates.`,
            entityType: "ticket",
            entityId: id,
            skipUserId: actorUserId,
          }),
        ),
      );
    }
  }

  await Promise.all(activityTasks);

  invalidateTicketReadCache();

  return id;
}

export async function updateTicketStatus(id: string, status: TicketRecord["status"], actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const payloadStatus = status === "review" ? "review" : status;
  const entityCode = await getCurrentEntityCode();
  const { error } = await applyEntityScope(
    supabase.from("tasks").update({ status: payloadStatus }).eq("id", id),
    entityCode,
  );

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Moved ticket to ${status.replace("_", " ")}`,
    entityType: "task",
    entityId: id,
    metadata: {
      kind: "status_change",
      field: "status",
      to: status,
    },
  });

  const ticketQuery = applyEntityScope(supabase
    .from("tasks")
    .select("title, project_id")
    .eq("id", id), entityCode);
  const ticketResponse = await ticketQuery.maybeSingle();
  const { data: ticket } = ticketResponse as {
    data: { title: string; project_id: string } | null;
    error: { message: string } | null;
  };

  if (ticket) {
    const recipients = await getNotificationRecipientsForProject(ticket.project_id);

    await createStatusChangeNotification({
      userIds: recipients.map((recipient) => recipient.id),
      title: "Ticket status updated",
      body: `${ticket.title} moved to ${status.replaceAll("_", " ")}.`,
      entityType: "ticket",
      entityId: id,
      skipUserId: actorUserId,
    });
  }

  invalidateTicketReadCache();

  return id;
}

export async function deleteTicket(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  invalidateTicketReadCache();
}

export function getTicketStats(tickets: TicketRecord[], currentUserId: string): TicketStats {
  return {
    total: tickets.length,
    mine: tickets.filter((ticket) => ticket.assignee_id === currentUserId).length,
    urgent: tickets.filter((ticket) => ticket.priority === "urgent").length,
    blocked: tickets.filter((ticket) => ticket.status === "blocked").length,
  };
}

export function getTeamWorkloadPreview(tickets: TicketRecord[]): TicketWorkloadRecord[] {
  const workload = new Map<string, TicketWorkloadRecord>();

  for (const ticket of tickets) {
    if (!ticket.assignee) {
      continue;
    }

    const current = workload.get(ticket.assignee.id) ?? {
      id: ticket.assignee.id,
      full_name: ticket.assignee.full_name,
      role: ticket.assignee.role,
      assignedTickets: 0,
      overdueTickets: 0,
      activeTickets: 0,
    };

    current.assignedTickets += 1;

    if (ticket.status !== "done" && ticket.status !== "archived") {
      current.activeTickets += 1;
    }

    if (getTicketDueState(ticket.due_date) === "overdue" && ticket.status !== "done" && ticket.status !== "archived") {
      current.overdueTickets += 1;
    }

    workload.set(ticket.assignee.id, current);
  }

  return [...workload.values()].sort((left, right) => {
    if (right.activeTickets !== left.activeTickets) {
      return right.activeTickets - left.activeTickets;
    }

    return left.full_name.localeCompare(right.full_name);
  });
}
