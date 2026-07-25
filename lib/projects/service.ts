import "server-only";

import { getProjectActivity, logActivity } from "@/lib/activity/service";
import {
  createAssignmentNotification,
  createStatusChangeNotification,
  getNotificationRecipientsForProject,
} from "@/lib/notifications/service";
import { getCached, invalidateCached } from "@/lib/server-cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyEntityScope,
  extendWithEntityCode,
  getCurrentEntityCode,
  getEntityScopedCacheKey,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
import {
  calculateProjectHealth,
  calculateProjectProgress,
  getProjectOverdueTasks,
  getProjectStatusBreakdown,
  getProjectUpcomingDeadlines,
} from "@/lib/projects/helpers";
import { parseFormattedNumber } from "@/lib/formatters";
import type {
  ProjectActivity,
  ProjectClient,
  ProjectFilters,
  ProjectFiltersData,
  ProjectFormValues,
  ProjectMember,
  ProjectOwner,
  ProjectRecord,
  ProjectTaskPreview,
} from "@/types/project";

type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  client_id: string;
  status: ProjectRecord["status"];
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  budget_amount?: number | null;
  priority?: ProjectRecord["priority"];
  client: ProjectClient | ProjectClient[] | null;
  owner: ProjectOwner | ProjectOwner[] | null;
  members:
    | Array<{
        id: string;
        role: ProjectMember["role"];
        user: ProjectOwner | ProjectOwner[] | null;
      }>
    | null;
  tasks: ProjectTaskPreview[] | null;
};

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeMembers(
  members: ProjectRow["members"],
): ProjectMember[] {
  return (members ?? []).map((member) => ({
    id: member.id,
    role: member.role,
    user: single(member.user),
  }));
}

function mapProject(row: ProjectRow, recentActivity: ProjectActivity[] = []): ProjectRecord {
  const tasks = row.tasks ?? [];
  const progress = calculateProjectProgress(tasks);
  const statusBreakdown = getProjectStatusBreakdown(tasks);
  const overdueTasks = getProjectOverdueTasks(tasks);
  const upcomingDeadlines = getProjectUpcomingDeadlines(tasks);
  const { health, deadlineState } = calculateProjectHealth(
    progress,
    row.end_date,
    row.status,
    tasks,
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    client_id: row.client_id,
    status: row.status,
    owner_id: row.owner_id,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    budget_amount: row.budget_amount ?? null,
    priority: row.priority ?? "medium",
    client: single(row.client),
    owner: single(row.owner),
    members: normalizeMembers(row.members),
    tasks,
    recentActivity,
    progress,
    health,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    totalTasks: tasks.filter((task) => task.status !== "archived" && task.status !== "cancelled").length,
    deadlineState,
    overdueTasks,
    upcomingDeadlines,
    statusBreakdown,
  };
}

const FULL_PROJECT_SELECT = `
  id,
  name,
  description,
  client_id,
  status,
  owner_id,
  start_date,
  end_date,
  created_at,
  budget_amount,
  priority,
  client:clients (
    id,
    name,
    contact_email
  ),
  owner:profiles!projects_owner_id_fkey (
    id,
    full_name,
    email,
    avatar_url,
    role
  ),
  members:project_members (
    id,
    role,
    user:profiles (
      id,
      full_name,
      email,
      avatar_url,
      role
    )
  ),
  tasks (
    id,
    title,
    status,
    priority,
    due_date,
    assignee_id
  )
`;

const LEGACY_PROJECT_SELECT = `
  id,
  name,
  client_id,
  status,
  owner_id,
  start_date,
  end_date,
  created_at,
  client:clients (
    id,
    name,
    contact_email
  ),
  owner:profiles!projects_owner_id_fkey (
    id,
    full_name,
    email,
    avatar_url,
    role
  ),
  members:project_members (
    id,
    role,
    user:profiles (
      id,
      full_name,
      email,
      avatar_url,
      role
    )
  ),
  tasks (
    id,
    title,
    status,
    priority,
    due_date,
    assignee_id
  )
`;

const FULL_PROJECT_PREVIOUS_SELECT = "name, description, client_id, owner_id, status, start_date, end_date";
const LEGACY_PROJECT_PREVIOUS_SELECT = "name, client_id, owner_id, status, start_date, end_date";

function isMissingProjectExtensionColumn(message: string) {
  return [
    "projects.description",
    "projects.budget_amount",
    "projects.priority",
  ].some((column) => message.includes(`column ${column} does not exist`));
}

function isMissingProjectExtensionSchemaCacheColumn(message: string) {
  return [
    "description",
    "budget_amount",
    "priority",
  ].some((column) => message.includes(`'${column}' column of 'projects'`));
}

function isMissingOptionalProjectField(message: string) {
  return isMissingProjectExtensionColumn(message) || isMissingProjectExtensionSchemaCacheColumn(message);
}

function stripOptionalProjectFields(
  payload: ReturnType<typeof parseProjectPayload>,
) {
  return {
    name: payload.name,
    client_id: payload.client_id,
    owner_id: payload.owner_id,
    status: payload.status,
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
}

function projectFiltersKey(filters: ProjectFilters = {}) {
  return JSON.stringify({
    search: filters.search ?? "",
    status: filters.status ?? "",
    clientId: filters.clientId ?? "",
    ownerId: filters.ownerId ?? "",
    deadline: filters.deadline ?? "",
  });
}

function invalidateProjectReadCache() {
  invalidateCached(
    (key) =>
      key.startsWith("projects:")
      || key === "projects-filter-data"
      || key.startsWith("tickets:")
      || key === "tickets-filter-data",
  );
}

export async function getProjects(filters: ProjectFilters = {}): Promise<ProjectRecord[]> {
  const entityCode = await getCurrentEntityCode();
  return getCached(
    getEntityScopedCacheKey(`projects:list:${projectFiltersKey(filters)}`, entityCode),
    12_000,
    () => getFreshProjects(filters, entityCode),
  );
}

async function getFreshProjects(filters: ProjectFilters = {}, entityCode?: string): Promise<ProjectRecord[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const today = new Date();
  const sevenDays = new Date(today);
  sevenDays.setDate(today.getDate() + 7);
  const monthEnd = new Date(today);
  monthEnd.setDate(today.getDate() + 30);

  const runQuery = async (selectClause: string) => {
    let query = supabase
      .from("projects")
      .select(selectClause)
      .order("created_at", { ascending: false });

    if (entityCode) {
      query = applyEntityScope(query, entityCode);
    }

    if (filters.search) {
      query = query.ilike("name", `%${filters.search}%`);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.clientId) {
      query = query.eq("client_id", filters.clientId);
    }

    if (filters.ownerId) {
      query = query.eq("owner_id", filters.ownerId);
    }

    if (filters.deadline === "overdue") {
      query = query.lt("end_date", today.toISOString().slice(0, 10));
    }

    if (filters.deadline === "this_week") {
      query = query
        .gte("end_date", today.toISOString().slice(0, 10))
        .lte("end_date", sevenDays.toISOString().slice(0, 10));
    }

    if (filters.deadline === "this_month") {
      query = query
        .gte("end_date", today.toISOString().slice(0, 10))
        .lte("end_date", monthEnd.toISOString().slice(0, 10));
    }

    if (filters.deadline === "none") {
      query = query.is("end_date", null);
    }

    return query.returns<ProjectRow[]>();
  };

  let { data, error } = await runQuery(FULL_PROJECT_SELECT);

  if (error && isMissingOptionalProjectField(error.message)) {
    ({ data, error } = await runQuery(LEGACY_PROJECT_SELECT));
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapProject(row));
}

export async function getProjectsFilterData(): Promise<ProjectFiltersData> {
  const entityCode = await getCurrentEntityCode();
  return getCached(getEntityScopedCacheKey("projects-filter-data", entityCode), 30_000, () =>
    getFreshProjectsFilterData(entityCode),
  );
}

async function getFreshProjectsFilterData(entityCode?: string): Promise<ProjectFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const shouldScopeByEntity = isEntityScopingEnabled() && Boolean(entityCode);
  let clientsQuery = supabase
    .from("clients")
    .select("id, name, contact_email")
    .order("name", { ascending: true });
  let ownersQuery = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .in("role", ["admin", "manager"])
    .order("full_name", { ascending: true });

  if (shouldScopeByEntity) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode ?? "");
    ownersQuery = ownersQuery.eq("entity_code", entityCode ?? "");
  }

  const [{ data: clients, error: clientsError }, { data: owners, error: ownersError }] =
    await Promise.all([
      clientsQuery.returns<ProjectClient[]>(),
      ownersQuery.returns<ProjectOwner[]>(),
    ]);

  if (clientsError) {
    throw new Error(clientsError.message);
  }

  if (ownersError) {
    throw new Error(ownersError.message);
  }

  return {
    clients: clients ?? [],
    owners: owners ?? [],
  };
}

export async function getProjectById(id: string): Promise<ProjectRecord | null> {
  const entityCode = await getCurrentEntityCode();
  return getCached(getEntityScopedCacheKey(`projects:detail:${id}`, entityCode), 12_000, () =>
    getFreshProjectById(id, entityCode),
  );
}

async function getFreshProjectById(id: string, entityCode?: string): Promise<ProjectRecord | null> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const scopedEntityCode = entityCode ?? await getCurrentEntityCode();
  const runQuery = async (selectClause: string) =>
    applyEntityScope(
      supabase
        .from("projects")
        .select(selectClause)
        .eq("id", id),
      scopedEntityCode,
    ).maybeSingle();

  let response = await runQuery(FULL_PROJECT_SELECT);
  let { data, error } = response as {
    data: ProjectRow | null;
    error: { message: string } | null;
  };

  if (error && isMissingOptionalProjectField(error.message)) {
    response = await runQuery(LEGACY_PROJECT_SELECT);
    ({ data, error } = response as {
      data: ProjectRow | null;
      error: { message: string } | null;
    });
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const normalizedActivity = await getProjectActivity(
    id,
    (data.tasks ?? []).map((task) => task.id),
    [],
    8,
  );

  return mapProject(data, normalizedActivity);
}

function parseProjectPayload(values: ProjectFormValues) {
  return {
    name: values.name.trim(),
    client_id: values.client_id,
    description: values.description.trim() || null,
    owner_id: values.owner_id,
    status: values.status,
    start_date: values.start_date || null,
    end_date: values.end_date || null,
    budget_amount: values.budget_amount ? parseFormattedNumber(values.budget_amount) : null,
    priority: values.priority || "medium",
  };
}

export async function createProject(values: ProjectFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseProjectPayload(values), entityCode);

  let { data, error } = await supabase
    .from("projects")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error && isMissingOptionalProjectField(error.message)) {
    ({ data, error } = await supabase
      .from("projects")
      .insert(extendWithEntityCode(stripOptionalProjectFields(payload), entityCode))
      .select("id")
      .single<{ id: string }>());
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Project creation did not return an id.");
  }

  await logActivity({
    userId: actorUserId,
    action: `Created project ${payload.name}`,
    entityType: "project",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Project created",
    },
  });

  await createAssignmentNotification({
    userId: payload.owner_id,
    title: "Project ownership assigned",
    body: `You are now the owner of ${payload.name}.`,
    entityType: "project",
    entityId: data.id,
    skipUserId: actorUserId,
  });

  invalidateProjectReadCache();

  return data.id;
}

export async function updateProject(id: string, values: ProjectFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  type PreviousProjectRow = {
    name: string;
    description?: string | null;
    client_id: string;
    owner_id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
  };

  const entityCode = await getCurrentEntityCode();
  const runPreviousQuery = async (selectClause: string) =>
    applyEntityScope(
      supabase
        .from("projects")
        .select(selectClause)
        .eq("id", id),
      entityCode,
    ).maybeSingle();

  let previousResponse = await runPreviousQuery(
    FULL_PROJECT_PREVIOUS_SELECT,
  );
  let { data: previousProject, error: previousError } = previousResponse as {
    data: PreviousProjectRow | null;
    error: { message: string } | null;
  };

  if (previousError && isMissingOptionalProjectField(previousError.message)) {
    previousResponse = await runPreviousQuery(
      LEGACY_PROJECT_PREVIOUS_SELECT,
    );
    ({ data: previousProject, error: previousError } = previousResponse as {
      data: PreviousProjectRow | null;
      error: { message: string } | null;
    });
  }

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = parseProjectPayload(values);
  let { error } = await applyEntityScope(supabase.from("projects").update(payload).eq("id", id), entityCode);

  if (error && isMissingOptionalProjectField(error.message)) {
    ({ error } = await applyEntityScope(
      supabase
        .from("projects")
        .update(stripOptionalProjectFields(payload))
        .eq("id", id),
      entityCode,
    ));
  }

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks = [];

  if (!previousProject) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated project ${payload.name}`,
        entityType: "project",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Project updated",
        },
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
    ] as const;

    for (const [field, from, to, action] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({
            userId: actorUserId,
            action,
            entityType: "project",
            entityId: id,
            metadata: {
              kind: "update",
              field,
              from,
              to,
            },
          }),
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

  invalidateProjectReadCache();

  return id;
}

export async function deleteProject(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const { error } = await applyEntityScope(supabase.from("projects").delete().eq("id", id), entityCode);

  if (error) {
    throw new Error(error.message);
  }

  invalidateProjectReadCache();
}
