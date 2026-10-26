import "server-only";

import { getTicketActivity, logActivity } from "@/lib/activity/service";
import {
  createAssignmentNotification,
  createScopedNotifications,
  createStatusChangeNotification,
  getNotificationRecipientsForProject,
} from "@/lib/notifications/service";
import { isOutsidePerson, projectHomeEntity } from "@/lib/entities/people-options";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { getTicketDueState, redactTicketDescription, normalizeTicketPriority, normalizeTicketStatus } from "@/lib/tickets/helpers";
import {
  describeTransitionError,
  evaluateTransition,
  findStage,
  getCompletionRule,
  getLegacyWorkflow,
  MOVE_REASON_MAX_LENGTH,
  resolveCategoryTarget,
  resolveTicketStageId,
  stageStatus,
} from "@/lib/tickets/workflow";
import { getBoardWorkflow, getConfiguredWorkflows } from "@/lib/tickets/workflow-service";
import { asPerson, select, selectOne, type Tx } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { TicketActivity, TicketAssignee, TicketFilters, TicketFiltersData, TicketFormValues, TicketProject, TicketProjectTeam, TicketRecord, TicketReporter, TicketStats, TicketStatus, TicketWorkloadRecord } from "@/types/ticket";
import type { BoardWorkflow, TransitionErrorCode } from "@/types/workflow";

type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: string;
  stage_id?: string | null;
  priority: string | null;
  type: TicketRecord["type"];
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  github_issue_url: string | null;
  subtasks_total: number | null;
  subtasks_done: number | null;
  created_at: string;
  updated_at: string;
  project: TicketProject | TicketProject[] | null;
  assignee: TicketAssignee | TicketAssignee[] | null;
  reporter: TicketReporter | TicketReporter[] | null;
};

// A ticket is an erp.task of a mission (0008), seen with BUMEX One's rules (row-level security). The engine's
// 'normal' priority is the boards' medium; a done ticket keeps the date it was completed.
const TICKET_SQL = `
  select t.id, t.title, t.notes as description, t.engagement_id as project_id, t.assignee_id, t.reporter_id, t.status, t.stage_id,
         case when t.priority = 'normal' then 'medium' else t.priority end as priority, t.type, t.due_date,
         t.estimated_hours::float8 as estimated_hours, t.actual_hours::float8 as actual_hours, t.github_issue_url,
         (select count(*) from work.subtask s where s.task_id = t.id)::int as subtasks_total,
         (select count(*) from work.subtask s where s.task_id = t.id and s.is_done)::int as subtasks_done,
         t.created_at, t.updated_at,
         (select jsonb_build_object('id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end,
                                    'end_date', e.deadline, 'entity_code', x.code,
                                    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'contact_email', c.contact_email)
                                                 from work.client c where c.id = e.client_id))
            from erp.engagement e join erp.entity x on x.id = e.entity_id where e.id = t.engagement_id) as project,
         work.person_card(t.assignee_id) as assignee,
         work.person_card(t.reporter_id) as reporter
    from erp.task t`;

// the status a ticket is written with, and its completion date following it
const STATUS_SET = `status = $STATUS, completed_at = case when $STATUS = 'done' then coalesce(completed_at, current_date) end`;
const statusSet = (param: string) => STATUS_SET.replaceAll("$STATUS", param);

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
    // The stored value; attachStages() resolves it against the ticket's board.
    stage_id: row.stage_id ?? "",
    stage_name: null,
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
    subtasks_total: row.subtasks_total ?? 0,
    subtasks_done: row.subtasks_done ?? 0,
  };
}

function withStage(ticket: TicketRecord, workflow: BoardWorkflow | undefined): TicketRecord {
  // Boards nothing was saved for use the built-in stages; their labels follow the viewer's language.
  const board = workflow ?? getLegacyWorkflow(ticket.project_id);
  const stageId = resolveTicketStageId(board, ticket);

  return {
    ...ticket,
    stage_id: stageId,
    stage_name: workflow ? findStage(board, stageId)?.name ?? null : null,
  };
}

async function attachStages(tickets: TicketRecord[]) {
  if (!tickets.length) {
    return tickets;
  }

  const workflows = await getConfiguredWorkflows(tickets.map((ticket) => ticket.project_id));
  return tickets.map((ticket) => withStage(ticket, workflows.get(ticket.project_id)));
}

// The tickets the person sees (archived ones included: the boards and lists leave them out themselves), most recently
// changed first, with the filters the lists offer.
async function readTickets(role: AppRole, filters: TicketFilters = {}, more?: { where: string; params: unknown[] }) {
  const where = ["t.engagement_id is not null"];
  const params: unknown[] = [...(more?.params ?? [])];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (more) where.push(more.where);
  if (filters.status) where.push(`t.status = ${param(filters.status)}`);
  if (filters.priority) where.push(`(case when t.priority = 'normal' then 'medium' else t.priority end) = ${param(filters.priority)}`);
  if (filters.assigneeId) where.push(filters.assigneeId === "unassigned" ? "t.assignee_id is null" : `t.assignee_id = ${param(filters.assigneeId)}`);
  if (filters.projectId) where.push(`t.engagement_id = ${param(filters.projectId)}::uuid`);
  if (filters.type) where.push(`t.type = ${param(filters.type)}`);
  const today = new Date();
  const key = (offset: number) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  if (filters.dueDate === "overdue") where.push(`t.due_date < ${param(key(0))}::date`);
  if (filters.dueDate === "this_week") where.push(`t.due_date between ${param(key(0))}::date and ${param(key(7))}::date`);
  if (filters.dueDate === "this_month") where.push(`t.due_date between ${param(key(0))}::date and ${param(key(30))}::date`);
  if (filters.dueDate === "none") where.push("t.due_date is null");

  const rows = await asPerson((tx) => select<TicketRow>(tx, `${TICKET_SQL} where ${where.join(" and ")} order by t.updated_at desc`, params));
  const terms = filters.search ? searchTerms(filters.search) : [];
  return attachStages(rows.filter((row) => matchesSearchTerms(terms, [row.title])).map((row) => mapTicket(row, role)));
}

export async function getTickets(role: AppRole, filters: TicketFilters = {}) {
  const tickets = await readTickets(role, filters);

  // These filters need OR logic or a status exclusion.
  if (filters.attention) {
    return tickets.filter(ticketNeedsAttention);
  }

  // A due-date view is about outstanding work, so closed tickets are left out
  // unless the user explicitly filtered on a status.
  if (filters.dueDate === "overdue" || (!filters.status && (filters.dueDate === "this_week" || filters.dueDate === "this_month"))) {
    return tickets.filter(isOpenTicket);
  }

  return tickets;
}

// Every entity's (the lists were scoped by entity in BUMEX One; the rules are not).
export const getTicketsAcrossEntities = getTickets;

export function isOpenTicket(ticket: Pick<TicketRecord, "status">) {
  return ticket.status !== "done" && ticket.status !== "archived";
}

export function isTicketOverdue(ticket: Pick<TicketRecord, "status" | "due_date">, today = new Date().toISOString().slice(0, 10)) {
  return isOpenTicket(ticket) && Boolean(ticket.due_date && ticket.due_date < today);
}

export function ticketNeedsAttention(ticket: TicketRecord) {
  return isOpenTicket(ticket) && (
    ticket.status === "blocked"
    || isTicketOverdue(ticket)
    || ticket.priority === "urgent"
    || !ticket.assignee_id
  );
}

export async function getMyTickets(userId: string, role: AppRole) {
  return readTickets(role, {}, { where: "t.assignee_id = $1", params: [userId] });
}

export async function getTicketById(id: string, role: AppRole) {
  const row = await asPerson((tx) => selectOne<TicketRow>(tx, `${TICKET_SQL} where t.id = $1::uuid`, [id])).catch(() => null);

  if (!row) {
    return null;
  }

  const normalizedActivity = await getTicketActivity(id, row.project_id, 10);
  const [ticket] = await attachStages([mapTicket(row, role, normalizedActivity)]);

  return ticket;
}

const PICKER_PERSON = "work.person_card(p.id) as card";

export async function getTicketsFilterData(): Promise<TicketFiltersData> {
  return asPerson(async (tx) => {
    const people = (await select<{ card: TicketAssignee }>(tx, `select ${PICKER_PERSON} from work.person p order by p.full_name`)).map((p) => p.card);
    const projects = await select<TicketProject & { owner_id: string | null }>(
      tx,
      `select e.id, e.name, case when e.status = 'planned' then 'draft' else e.status::text end as status, e.deadline as end_date, x.code as entity_code,
              e.owner_id, (select jsonb_build_object('id', c.id, 'name', c.name, 'contact_email', c.contact_email) from work.client c where c.id = e.client_id) as client
         from erp.engagement e join erp.entity x on x.id = e.entity_id
        order by e.name`,
    );
    return { assignees: people, reporters: people, projects, projectTeams: await getProjectTeams(tx, projects, people) };
  });
}

/**
 * The listed projects that have members from another entity than their own, with those members, for the ticket
 * pickers.
 */
async function getProjectTeams(
  tx: Tx,
  projects: Array<Pick<TicketProject, "id" | "entity_code"> & { owner_id: string | null }>,
  people: TicketAssignee[],
): Promise<Record<string, TicketProjectTeam>> {
  if (!projects.length) {
    return {};
  }

  const memberships = await select<{ project_id: string; user_id: string }>(
    tx,
    "select engagement_id as project_id, user_id from erp.engagement_staff where engagement_id = any($1::uuid[])",
    [projects.map((project) => project.id)],
  );
  if (!memberships.length) return {};

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const teams: Record<string, TicketProjectTeam> = {};

  for (const project of projects) {
    const entityCode = projectHomeEntity(project, project.owner_id ? peopleById.get(project.owner_id) : null);
    const outsideMembers = memberships
      .filter((membership) => membership.project_id === project.id)
      .flatMap((membership) => peopleById.get(membership.user_id) ?? [])
      .filter((person) => isOutsidePerson(person, entityCode));

    if (entityCode && outsideMembers.length) {
      teams[project.id] = { entityCode, outsideMembers };
    }
  }

  return teams;
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
    stage_id: values.stage_id,
    priority: normalizedPriority,
    type: values.type,
    due_date: values.due_date || null,
    estimated_hours: values.estimated_hours ? Number(values.estimated_hours) : null,
    actual_hours: values.actual_hours ? Number(values.actual_hours) : null,
    github_issue_url: values.github_issue_url.trim() || null,
  };
}

const payloadParams = (p: ReturnType<typeof parseTicketPayload>) => [
  p.project_id, p.title, p.description, p.assignee_id, p.reporter_id, p.status, p.stage_id || null, p.priority, p.type, p.due_date,
  p.estimated_hours, p.actual_hours, p.github_issue_url,
];

export async function createTicket(
  values: TicketFormValues,
  actorUserId: string,
  options: { emailAssignee?: boolean } = {},
) {
  const payload = parseTicketPayload(values);
  const data = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      `insert into erp.task (engagement_id, title, notes, assignee_id, reporter_id, status, completed_at, stage_id, priority, type, due_date,
                             estimated_hours, actual_hours, github_issue_url)
       values ($1::uuid, $2, $3, $4, $5, $6, case when $6 = 'done' then current_date end, $7, $8, $9, $10::date, $11::numeric, $12::numeric, $13)
       returning id`,
      payloadParams(payload),
    ),
  );

  if (!data) {
    throw new Error("Ticket creation did not return an id.");
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
    email: options.emailAssignee ?? true,
  });

  const projectRecipients = await getNotificationRecipientsForProject(payload.project_id);

  // The assignee already got "New ticket assignment" for this ticket.
  await createScopedNotifications({
    userIds: projectRecipients.map((recipient) => recipient.id).filter((id) => id !== payload.assignee_id),
    type: "comment",
    title: "New ticket created",
    body: `${payload.title} was added to the operational queue.`,
    entityType: "ticket",
    entityId: data.id,
    skipUserId: actorUserId,
  });

  return data.id;
}

/**
 * Who hears about a ticket's stage changes: its assignee and its reporter (not
 * the whole project, which made every move a notification, and an email, for
 * every member). The person who made the change is left out by the caller.
 */
function ticketParticipants(ticket: { assignee_id?: string | null; reporter_id?: string | null }) {
  return [ticket.assignee_id, ticket.reporter_id];
}

/** A stage change that already passed the board's rules, for the ticket's history. */
export type TicketStageChange = {
  fromStageId: string;
  toStageId: string;
  fromName: string;
  toName: string;
  reason: string | null;
};

export async function updateTicket(
  id: string,
  values: TicketFormValues,
  actorUserId: string,
  stageChange?: TicketStageChange,
) {
  const payload = parseTicketPayload(values);
  const previousTicket = await asPerson(async (tx) => {
    const previous = await selectOne<{ title: string; status: string; priority: string; assignee_id: string | null; due_date: string | null; project_id: string }>(
      tx,
      `select title, status, case when priority = 'normal' then 'medium' else priority end as priority, assignee_id, due_date, engagement_id as project_id
         from erp.task where id = $1::uuid`,
      [id],
    );
    const updated = await tx.run(
      `update erp.task
          set engagement_id = $1::uuid, title = $2, notes = $3, assignee_id = $4, reporter_id = $5, ${statusSet("$6")}, stage_id = $7, priority = $8,
              type = $9, due_date = $10::date, estimated_hours = $11::numeric, actual_hours = $12::numeric, github_issue_url = $13
        where id = $14::uuid`,
      [...payloadParams(payload), id],
    );
    if (!updated) throw new Error("You cannot edit this ticket.");
    return previous;
  });

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
      // A stage change is logged on its own below, with the stage names and the reason.
      ["status", previousTicket.status, stageChange ? previousTicket.status : payload.status, `Moved ticket to ${payload.status}`, "status_change"],
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

    if (stageChange) {
      activityTasks.push(logStageChange(id, stageChange, actorUserId));
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

    if (stageChange || previousTicket.status !== payload.status) {
      activityTasks.push(
        createStatusChangeNotification({
          userIds: ticketParticipants(payload),
          title: "Ticket status updated",
          body: `${payload.title} moved to ${stageChange?.toName ?? payload.status.replaceAll("_", " ")}.`,
          entityType: "ticket",
          entityId: id,
          skipUserId: actorUserId,
        }),
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

  return id;
}

function logStageChange(ticketId: string, change: TicketStageChange, actorUserId: string) {
  return logActivity({
    userId: actorUserId,
    action: `Moved ticket from ${change.fromName} to ${change.toName}`,
    entityType: "task",
    entityId: ticketId,
    metadata: {
      kind: "status_change",
      field: "stage",
      from: change.fromName,
      to: change.toName,
      from_stage_id: change.fromStageId,
      to_stage_id: change.toStageId,
      reason: change.reason,
      summary: change.reason
        ? `${change.fromName} → ${change.toName}. Reason: ${change.reason}`
        : `${change.fromName} → ${change.toName}`,
    },
  });
}

export type StageMoveTarget = { stageId: string } | { status: TicketStatus };

export type StageMoveResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: TransitionErrorCode | "write_failed"; message: string; stageId?: string };

export function normalizeMoveReason(reason: string | null | undefined) {
  return (reason ?? "").trim().slice(0, MOVE_REASON_MAX_LENGTH);
}

/**
 * Moves a ticket to another stage of its board. Every way of changing a card's stage
 * goes through here (or checks the same evaluateTransition rules first, like the edit
 * form), so the board's rules hold however the move is attempted. Only the reporter may
 * complete a ticket; other permissions are checked by the caller, as for any other
 * ticket update. A rejected move writes nothing.
 */
export async function moveTicketToStage(
  ticket: TicketRecord,
  target: StageMoveTarget,
  options: { reason?: string | null; actorUserId: string; locale: "en" | "fr" },
): Promise<StageMoveResult> {
  const workflow = await getBoardWorkflow(ticket.project_id);
  const fromId = resolveTicketStageId(workflow, ticket);
  const reason = normalizeMoveReason(options.reason);
  const rules = getCompletionRule(ticket, options.actorUserId);
  let toId: string;

  if ("stageId" in target) {
    const check = evaluateTransition(workflow, fromId, target.stageId, reason, rules);

    if (!check.ok) {
      return { ok: false, code: check.error.code, message: describeTransitionError(check.error, options.locale), stageId: target.stageId };
    }

    if (check.noop) {
      return { ok: true, changed: false };
    }

    toId = target.stageId;
  } else {
    const resolved = resolveCategoryTarget(workflow, fromId, target.status, options.locale, reason, rules);

    if (!resolved.ok) {
      return { ok: false, code: resolved.error.code, message: describeTransitionError(resolved.error, options.locale), stageId: resolved.stageId };
    }

    if (resolved.noop) {
      return { ok: true, changed: false };
    }

    toId = resolved.stageId;
  }

  const to = findStage(workflow, toId)!;
  const fromName = findStage(workflow, fromId)?.name ?? fromId;
  const moved = await asPerson((tx) => tx.run(`update erp.task set stage_id = $2, ${statusSet("$3")} where id = $1::uuid`, [ticket.id, to.id, stageStatus(to)]));

  // The rules skip rows the caller may not update instead of failing.
  if (!moved) {
    return {
      ok: false,
      code: "write_failed",
      message: options.locale === "fr" ? "Vous ne pouvez pas déplacer ce ticket." : "You cannot move this ticket.",
    };
  }

  await logStageChange(ticket.id, { fromStageId: fromId, toStageId: to.id, fromName, toName: to.name, reason: reason || null }, options.actorUserId);

  await createStatusChangeNotification({
    userIds: ticketParticipants(ticket),
    title: "Ticket status updated",
    body: `${ticket.title} moved to ${to.name}.`,
    entityType: "ticket",
    entityId: ticket.id,
    skipUserId: options.actorUserId,
  });

  return { ok: true, changed: true };
}

type ProjectTicketStageRow = { id: string; status: string; stage_id?: string | null };

/** Every ticket of a board with just what stage bookkeeping needs, archived ones included. */
export async function getProjectTicketStages(projectId: string) {
  return asPerson((tx) => select<ProjectTicketStageRow>(tx, "select id, status, stage_id from erp.task where engagement_id = $1::uuid", [projectId]));
}

/** Cards on the board per stage id. Archived tickets are off the board and not counted. */
export function countCardsByStage(rows: ProjectTicketStageRow[], workflow: BoardWorkflow) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const status = normalizeTicketStatus(row.status);

    if (status === "archived") continue;

    const stageId = resolveTicketStageId(workflow, { stage_id: row.stage_id, status });
    counts[stageId] = (counts[stageId] ?? 0) + 1;
  }

  return counts;
}

/**
 * After a workflow is saved: pins every ticket of the board to the stage it was already
 * in (tickets from before workflows only had a status) and refreshes the status a stage
 * reports as, in case its category or completed flag changed. No ticket changes stage.
 */
export async function syncTicketsToWorkflow(
  rows: ProjectTicketStageRow[],
  previous: BoardWorkflow,
  next: BoardWorkflow,
) {
  const updates = rows.flatMap((row) => {
    const status = normalizeTicketStatus(row.status);
    const stageId = resolveTicketStageId(previous, { stage_id: row.stage_id, status });
    const stage = findStage(next, stageId);
    const nextStatus = status === "archived" || !stage ? status : stageStatus(stage);

    return row.stage_id === stageId && row.status === nextStatus
      ? []
      : [{ id: row.id, stage_id: stageId, status: nextStatus }];
  });

  if (updates.length) {
    await asPerson((tx) =>
      tx.query(
        `update erp.task t set stage_id = u.stage_id, ${statusSet("u.status")}
           from jsonb_to_recordset($1::jsonb) as u(id uuid, stage_id text, status text) where t.id = u.id`,
        [JSON.stringify(updates)],
      ),
    );
  }

  return updates.length;
}

export async function deleteTicket(id: string) {
  const deleted = await asPerson((tx) => tx.query("delete from erp.task where id = $1::uuid returning id", [id]));

  if (!deleted.length) {
    throw new Error("You cannot delete this ticket.");
  }
}

export function getTicketStats(tickets: TicketRecord[], currentUserId: string): TicketStats {
  return {
    total: tickets.length,
    mine: tickets.filter((ticket) => ticket.assignee_id === currentUserId).length,
    urgent: tickets.filter((ticket) => ticket.priority === "urgent").length,
    blocked: tickets.filter((ticket) => ticket.status === "blocked").length,
  };
}

export function getTicketQuickCounts(tickets: TicketRecord[], currentUserId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = weekEnd.toISOString().slice(0, 10);

  return {
    all: tickets.length,
    mine: tickets.filter((ticket) => ticket.assignee_id === currentUserId).length,
    attention: tickets.filter(ticketNeedsAttention).length,
    overdue: tickets.filter((ticket) => isTicketOverdue(ticket, today)).length,
    dueThisWeek: tickets.filter((ticket) => isOpenTicket(ticket) && Boolean(ticket.due_date && ticket.due_date >= today && ticket.due_date <= weekEndKey)).length,
    blocked: tickets.filter((ticket) => ticket.status === "blocked").length,
    unassigned: tickets.filter((ticket) => !ticket.assignee_id).length,
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
