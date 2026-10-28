import "server-only";

import { getProjectActivity, logActivity } from "@/lib/activity/service";
import {
  createAssignmentNotification,
  createStatusChangeNotification,
  getNotificationRecipientsForProject,
} from "@/lib/notifications/service";
import {
  calculateProjectHealth,
  getProjectOverdueTasks,
  getProjectStatusBreakdown,
  getProjectUpcomingDeadlines,
} from "@/lib/projects/helpers";
import { parseFormattedNumber } from "@/lib/formatters";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select, selectOne, type Tx } from "@/lib/work/db";
import type {
  ProjectClient,
  ProjectFilters,
  ProjectFormValues,
  ProjectMember,
  ProjectOwner,
  ProjectRecord,
  ProjectTaskPreview,
} from "@/types/project";
import type { BumexEntityCode } from "@/types/entity";

// A project is a mission: an erp.engagement (0008), seen with BUMEX One's rules (row-level security). The ERP's
// "planned" is BUMEX One's draft; the deadline is the project's end date, the fixed fee its budget.

type ProjectRow = Omit<ProjectRecord, "recentActivity" | "health" | "completedTasks" | "totalTasks" | "deadlineState" | "overdueTasks" | "upcomingDeadlines" | "statusBreakdown"> & {
  client: ProjectClient | null;
  owner: ProjectOwner | null;
  members: ProjectMember[];
  tasks: ProjectTaskPreview[];
};

// The project as the screens read it; `e` is the engagement.
export const PROJECT_COLUMNS = `
  e.id, e.name, e.description, e.client_id, case when e.status = 'planned' then 'draft' else e.status::text end as status,
  e.owner_id, e.start_date, e.deadline as end_date, e.created_at, e.fixed_fee::float8 as budget_amount, e.priority,
  coalesce(e.project_kind, 'client_mission') as project_kind, e.manual_progress,
  (select x.code from erp.entity x where x.id = e.entity_id) as entity_code`;

const PROJECT_SQL = `
  select ${PROJECT_COLUMNS}, work.mission_progress(e.id) as progress,
         (select jsonb_build_object('id', c.id, 'name', c.name, 'contact_email', c.contact_email) from work.client c where c.id = e.client_id) as client,
         work.person_card(e.owner_id) as owner,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.user_id, 'role', s.role, 'user', work.person_card(s.user_id)) order by s.user_id)
                     from erp.engagement_staff s where s.engagement_id = e.id), '[]'::jsonb) as members,
         coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
                                                       'priority', case when t.priority = 'normal' then 'medium' else t.priority end,
                                                       'due_date', t.due_date, 'assignee_id', t.assignee_id, 'created_at', t.created_at) order by t.created_at)
                     from erp.task t where t.engagement_id = e.id), '[]'::jsonb) as tasks
    from erp.engagement e`;

function mapProject(row: ProjectRow, recentActivity: ProjectRecord["recentActivity"] = []): ProjectRecord {
  const tasks = row.tasks ?? [];
  const { health, deadlineState } = calculateProjectHealth(row.progress, row.end_date, row.status, tasks);

  return {
    ...row,
    priority: row.priority ?? "medium",
    tasks,
    recentActivity,
    health,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    totalTasks: tasks.filter((task) => task.status !== "archived").length,
    deadlineState,
    overdueTasks: getProjectOverdueTasks(tasks),
    upcomingDeadlines: getProjectUpcomingDeadlines(tasks),
    statusBreakdown: getProjectStatusBreakdown(tasks),
  };
}

const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

// Every mission the person sees (deleted projects are gone; the ERP's cancelled ones are BUMEX One's cancelled ones).
export async function getProjects(filters: ProjectFilters = {}): Promise<ProjectRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status) where.push(`e.status = (case when ${param(filters.status)} = 'draft' then 'planned' else $${params.length} end)::erp.engagement_status`);
  if (filters.clientId) where.push(`e.client_id = ${param(filters.clientId)}::uuid`);
  if (filters.ownerId) where.push(`e.owner_id = ${param(filters.ownerId)}`);
  if (filters.kind) where.push(`coalesce(e.project_kind, 'client_mission') = ${param(filters.kind)}`);
  if (filters.deadline === "overdue") where.push(`e.deadline < ${param(day())}::date`);
  if (filters.deadline === "this_week") where.push(`e.deadline between ${param(day())}::date and ${param(day(7))}::date`);
  if (filters.deadline === "this_month") where.push(`e.deadline between ${param(day())}::date and ${param(day(30))}::date`);
  if (filters.deadline === "none") where.push("e.deadline is null");

  const rows = await asPerson((tx) =>
    select<ProjectRow>(tx, `${PROJECT_SQL} ${where.length ? `where ${where.join(" and ")}` : ""} order by e.created_at desc`, params),
  );
  const terms = filters.search ? searchTerms(filters.search) : [];
  let projects = rows.filter((row) => matchesSearchTerms(terms, [row.name])).map((row) => mapProject(row));

  // A deadline view is about outstanding delivery, so closed projects are left out unless the user explicitly
  // filtered on a status.
  if (filters.deadline === "overdue" || (!filters.status && (filters.deadline === "this_week" || filters.deadline === "this_month"))) {
    projects = projects.filter(isOpenProject);
  }
  if (filters.health === "attention") {
    return projects.filter(projectNeedsAttention);
  }
  if (filters.health) {
    return projects.filter((project) => project.health === filters.health);
  }
  return projects;
}

export function isOpenProject(project: Pick<ProjectRecord, "status">) {
  return project.status !== "completed" && project.status !== "cancelled";
}

export function projectNeedsAttention(project: Pick<ProjectRecord, "health">) {
  return project.health === "at_risk" || project.health === "delayed";
}

export async function getProjectById(id: string): Promise<ProjectRecord | null> {
  const row = await asPerson((tx) => selectOne<ProjectRow>(tx, `${PROJECT_SQL} where e.id = $1::uuid`, [id])).catch(() => null);
  if (!row) return null;
  const activity = await getProjectActivity(id, row.tasks.map((task) => task.id), [], 8);
  return mapProject(row, activity);
}

function parseProjectPayload(values: ProjectFormValues) {
  const isInternalProject = values.project_kind === "internal_product" || values.project_kind === "internal_tool";
  return {
    name: values.name.trim(),
    // An internal BUMEX product/tool must not be represented as an external client relationship.
    client_id: isInternalProject ? null : values.client_id || null,
    description: values.description.trim() || null,
    owner_id: values.owner_id,
    status: values.status,
    start_date: values.start_date || null,
    end_date: values.end_date || null,
    budget_amount: values.budget_amount ? parseFormattedNumber(values.budget_amount) : null,
    priority: values.priority || "medium",
    project_kind: values.project_kind || "client_mission",
    manual_progress: values.manual_progress === "" ? null : Number(values.manual_progress),
  };
}

type Payload = ReturnType<typeof parseProjectPayload>;

const payloadParams = (p: Payload) => [
  p.name, p.description, p.client_id, p.owner_id, p.status, p.start_date, p.end_date, p.budget_amount, p.priority, p.project_kind, p.manual_progress,
];

// floor: the entity (Vanguard's floor) the mission belongs to
export async function createProject(values: ProjectFormValues, actorUserId: string, floor: BumexEntityCode) {
  const payload = parseProjectPayload(values);
  const created = await asPerson((tx) =>
    selectOne<{ id: string }>(
      tx,
      `insert into erp.engagement (entity_id, name, description, client_id, owner_id, status, start_date, deadline, fixed_fee, priority, project_kind,
                                   manual_progress)
       values ((select id from erp.entity where code = $12), $1, $2, $3::uuid, $4, (case when $5 = 'draft' then 'planned' else $5 end)::erp.engagement_status,
               $6::date, $7::date, $8::numeric, $9, $10, $11::smallint)
       returning id`,
      [...payloadParams(payload), floor],
    ),
  );
  if (!created) throw new Error("Project creation did not return an id.");

  // its board is its floor's (work.floor_board, 0014): nothing to create

  await logActivity({
    userId: actorUserId,
    action: `Created project ${payload.name}`,
    entityType: "project",
    entityId: created.id,
    metadata: { kind: "create", summary: "Project created" },
  });

  await createAssignmentNotification({
    userId: payload.owner_id,
    title: "Project ownership assigned",
    body: `You are now the owner of ${payload.name}.`,
    entityType: "project",
    entityId: created.id,
    skipUserId: actorUserId,
  });

  return created.id;
}

type PreviousProject = Pick<ProjectRecord, "name" | "description" | "project_kind" | "client_id" | "owner_id" | "status" | "start_date" | "end_date">;

export async function updateProject(id: string, values: ProjectFormValues, actorUserId: string) {
  const payload = parseProjectPayload(values);
  const previousProject = await asPerson(async (tx) => {
    const previous = await selectOne<PreviousProject>(tx, `select ${PROJECT_COLUMNS} from erp.engagement e where e.id = $1::uuid`, [id]);
    const updated = await tx.run(
      `update erp.engagement
          set name = $1, description = $2, client_id = $3::uuid, owner_id = $4, status = (case when $5 = 'draft' then 'planned' else $5 end)::erp.engagement_status,
              start_date = $6::date, deadline = $7::date, fixed_fee = $8::numeric, priority = $9, project_kind = $10, manual_progress = $11::smallint
        where id = $12::uuid`,
      [...payloadParams(payload), id],
    );
    if (!updated) throw new Error("You cannot edit this project.");
    return previous;
  });

  const activityTasks: Promise<unknown>[] = [];

  if (!previousProject) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated project ${payload.name}`,
        entityType: "project",
        entityId: id,
        metadata: { kind: "update", summary: "Project updated" },
      }),
    );
  } else {
    const changes = [
      ["name", previousProject.name, payload.name, `Renamed project to ${payload.name}`],
      ["status", previousProject.status, payload.status, `Changed project status to ${payload.status}`],
      ["owner_id", previousProject.owner_id, payload.owner_id, "Changed project owner"],
      ["start_date", previousProject.start_date, payload.start_date, "Updated project start date"],
      ["end_date", previousProject.end_date, payload.end_date, "Updated project deadline"],
      ["client_id", previousProject.client_id, payload.client_id, "Changed linked client"],
      ["project_kind", previousProject.project_kind, payload.project_kind, "Changed project type"],
    ] as const;

    for (const [field, from, to, action] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({ userId: actorUserId, action, entityType: "project", entityId: id, metadata: { kind: "update", field, from, to } }),
        );
      }
    }

    if (previousProject.owner_id !== payload.owner_id) {
      activityTasks.push(
        createAssignmentNotification({
          userId: payload.owner_id,
          title: "Project ownership updated",
          body: `You are now the owner of ${payload.name}.`,
          entityType: "project",
          entityId: id,
          skipUserId: actorUserId,
        }),
      );
    }

    if (previousProject.status !== payload.status) {
      activityTasks.push(
        getNotificationRecipientsForProject(id).then((recipients) =>
          createStatusChangeNotification({
            userIds: recipients.map((recipient) => recipient.id),
            title: "Project status updated",
            body: `${payload.name} moved to ${payload.status.replaceAll("_", " ")}.`,
            entityType: "project",
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

// The ERP's own fields of a mission (how it is billed, its hours budget).
export async function setMissionTerms(tx: Tx, id: string, feeType: "fixed" | "time", budgetHours: number | null) {
  await tx.query("update erp.engagement set fee_type = $2, budget_hours = $3 where id = $1::uuid", [id, feeType, budgetHours]);
}

// A project goes with its tickets, milestones, board and team; one with time entered, archived boxes or invoices stays
// (BUMEX One kept time entries the same way).
export async function deleteProject(id: string) {
  await asPerson(async (tx) => {
    const [used] = await tx.query<{ used: boolean }>(
      `select exists (select 1 from erp.sales_invoice where engagement_id = $1::uuid)
           or exists (select 1 from erp.supplier_invoice where engagement_id = $1::uuid)
           or exists (select 1 from erp.journal_line where engagement_id = $1::uuid) as used`,
      [id],
    );
    if (used?.used) throw new Error("invoiced");
    await tx.query("delete from erp.task where engagement_id = $1::uuid", [id]);
    const deleted = await tx.query("delete from erp.engagement where id = $1::uuid returning id", [id]);
    if (!deleted.length) throw new Error("You cannot delete this project.");
  });
}
