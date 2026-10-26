import "server-only";

import { logActivity } from "@/lib/activity/service";
import { createStatusChangeNotification } from "@/lib/notifications/service";
import { calculateProjectHealth, calculateProjectProgress, getDeadlineState } from "@/lib/projects/helpers";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type {
  MilestoneFormValues,
  MilestoneRecord,
  MilestoneStatus,
  RoadmapFilterData,
  RoadmapFilters,
  RoadmapProjectRecord,
} from "@/types/milestone";
import type { ProjectClient, ProjectOwner, ProjectTaskPreview } from "@/types/project";

type MilestoneOwnerRow = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: "admin" | "manager" | "supervisor" | "employee" | "shareholder";
};

type MilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  due_date: string;
  completed_at: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  owner: MilestoneOwnerRow | MilestoneOwnerRow[] | null;
};

type RoadmapProjectRow = {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  status: RoadmapProjectRecord["status"];
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  client: ProjectClient | ProjectClient[] | null;
  owner: ProjectOwner | ProjectOwner[] | null;
  tasks: ProjectTaskPreview[] | null;
  milestones: MilestoneRow[] | null;
};

// Milestones: work.milestone of a mission (0008), seen by whoever sees the mission and managed by its owner.
const MILESTONE_JSON = `jsonb_build_object('id', m.id, 'project_id', m.engagement_id, 'title', m.title, 'description', m.description, 'status', m.status,
  'due_date', m.due_date, 'completed_at', m.completed_at, 'owner_id', m.owner_id, 'created_at', m.created_at, 'updated_at', m.updated_at,
  'owner', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
              from work.person p where p.id = m.owner_id))`;

const ROADMAP_SQL = `
  select e.id, e.name, e.description, e.client_id, case when e.status = 'planned' then 'draft' else e.status::text end as status, e.owner_id,
         e.start_date, e.deadline as end_date, e.created_at,
         (select jsonb_build_object('id', c.id, 'name', c.name, 'contact_email', c.contact_email) from work.client c where c.id = e.client_id) as client,
         work.person_card(e.owner_id) as owner,
         coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
                                                       'priority', case when t.priority = 'normal' then 'medium' else t.priority end,
                                                       'due_date', t.due_date, 'assignee_id', t.assignee_id))
                     from erp.task t where t.engagement_id = e.id), '[]'::jsonb) as tasks,
         coalesce((select jsonb_agg(${MILESTONE_JSON}) from work.milestone m where m.engagement_id = e.id), '[]'::jsonb) as milestones
    from erp.engagement e`;

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapMilestone(row: MilestoneRow): MilestoneRecord {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    due_date: row.due_date,
    completed_at: row.completed_at,
    owner_id: row.owner_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: single(row.owner),
    dueState: getDeadlineState(row.due_date),
  };
}

function mapRoadmapProject(row: RoadmapProjectRow): RoadmapProjectRecord {
  const tasks = row.tasks ?? [];
  const progress = calculateProjectProgress(tasks);
  const { health } = calculateProjectHealth(progress, row.end_date, row.status, tasks);
  const milestones = (row.milestones ?? [])
    .map(mapMilestone)
    .sort((left, right) => new Date(left.due_date).getTime() - new Date(right.due_date).getTime());
  const openMilestones = milestones.filter((milestone) => milestone.status !== "completed" && milestone.status !== "cancelled").length;
  const delayedMilestones = milestones.filter((milestone) => milestone.status === "delayed").length;
  const totalMilestones = milestones.length;
  const milestoneCompletion = totalMilestones
    ? Math.round((milestones.filter((milestone) => milestone.status === "completed").length / totalMilestones) * 100)
    : 0;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    client_id: row.client_id,
    status: row.status,
    owner_id: row.owner_id,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    client: single(row.client),
    owner: single(row.owner),
    progress,
    health,
    milestoneCompletion,
    totalMilestones,
    openMilestones,
    delayedMilestones,
    nextMilestone: milestones.find((milestone) => milestone.status !== "completed" && milestone.status !== "cancelled") ?? null,
    milestones,
  };
}

export async function getRoadmapProjects(filters: RoadmapFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`e.id = $${params.length}::uuid`);
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    where.push(`e.client_id = $${params.length}::uuid`);
  }

  const rows = await asPerson((tx) =>
    select<RoadmapProjectRow>(tx, `${ROADMAP_SQL} ${where.length ? `where ${where.join(" and ")}` : ""} order by e.deadline nulls last, e.created_at desc`, params),
  );
  const terms = filters.search ? searchTerms(filters.search) : [];
  const data = rows.filter((row) => matchesSearchTerms(terms, [row.name]));

  return (data ?? [])
    .map(mapRoadmapProject)
    .map((project) => ({
      ...project,
      milestones: project.milestones.filter((milestone) => {
        if (filters.status === "open" && (milestone.status === "completed" || milestone.status === "cancelled")) return false;
        if (filters.status && filters.status !== "open" && milestone.status !== filters.status) return false;

        if (filters.ownerId && milestone.owner_id !== filters.ownerId) {
          return false;
        }

        return true;
      }),
    }))
    .filter((project) => {
      if (filters.status || filters.ownerId) {
        return project.milestones.length > 0;
      }

      return true;
    });
}

export async function getRoadmapFilterData(): Promise<RoadmapFilterData> {
  return asPerson(async (tx) => ({
    projects: await select<{ id: string; name: string }>(tx, "select id, name from erp.engagement order by name"),
    clients: await select<ProjectClient>(tx, "select id, name, contact_email from work.client order by name"),
    owners: await select<ProjectOwner>(tx, "select p.id, p.full_name, p.email, p.avatar_url, work.person_role(p.id) as role from work.person p order by p.full_name"),
  }));
}

function parseMilestonePayload(values: MilestoneFormValues) {
  return {
    project_id: values.project_id,
    title: values.title.trim(),
    description: values.description.trim() || null,
    status: values.status,
    due_date: values.due_date,
    owner_id: values.owner_id || null,
  };
}

export async function createMilestone(values: MilestoneFormValues, actorUserId: string) {
  const payload = parseMilestonePayload(values);
  const data = await asPerson((tx) =>
    selectOne<{ id: string; project_id: string }>(
      tx,
      `insert into work.milestone (engagement_id, title, description, status, due_date, owner_id, completed_at)
       values ($1::uuid, $2, $3, $4, $5::date, $6, case when $4 = 'completed' then now() end)
       returning id, engagement_id as project_id`,
      [payload.project_id, payload.title, payload.description, payload.status, payload.due_date, payload.owner_id],
    ),
  );

  if (!data) {
    throw new Error("Milestone creation did not return an id.");
  }

  await logActivity({
    userId: actorUserId,
    action: `Created milestone ${payload.title}`,
    entityType: "milestone",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Milestone created",
    },
  });

  return data;
}

export async function updateMilestone(id: string, values: MilestoneFormValues, actorUserId: string) {
  const payload = parseMilestonePayload(values);
  const previous = await asPerson(async (tx) => {
    const before = await selectOne<{ title: string; status: MilestoneStatus; due_date: string; owner_id: string | null; project_id: string }>(
      tx,
      "select title, status, due_date, owner_id, engagement_id as project_id from work.milestone where id = $1::uuid",
      [id],
    );
    const updated = await tx.run(
      `update work.milestone
          set engagement_id = $2::uuid, title = $3, description = $4, status = $5, due_date = $6::date, owner_id = $7,
              completed_at = case when $5 = 'completed' then coalesce(completed_at, now()) end
        where id = $1::uuid`,
      [id, payload.project_id, payload.title, payload.description, payload.status, payload.due_date, payload.owner_id],
    );
    if (!updated) throw new Error("You cannot edit this milestone.");
    return before;
  });

  const activityTasks = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: `Updated milestone ${payload.title}`,
        entityType: "milestone",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Milestone updated",
        },
      }),
    );
  } else {
    const changes = [
      ["title", previous.title, payload.title, `Renamed milestone to ${payload.title}`, "update"],
      ["status", previous.status, payload.status, `Changed milestone status to ${payload.status.replace("_", " ")}`, "status_change"],
      ["due_date", previous.due_date, payload.due_date, "Updated milestone deadline", "due_date_change"],
      ["owner_id", previous.owner_id, payload.owner_id, "Changed milestone owner", "assignment_change"],
    ] as const;

    for (const [field, from, to, action, kind] of changes) {
      if (from !== to) {
        activityTasks.push(
          logActivity({
            userId: actorUserId,
            action,
            entityType: "milestone",
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

    if (previous.status !== "delayed" && payload.status === "delayed") {
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action: "Marked milestone as delayed",
          entityType: "milestone",
          entityId: id,
          metadata: {
            kind: "status_change",
            field: "status",
            from: previous.status,
            to: "delayed",
            summary: "Milestone delayed",
          },
        }),
      );

      activityTasks.push(
        createStatusChangeNotification({
          userIds: [payload.owner_id],
          title: "Milestone delayed",
          body: `${payload.title} was marked as delayed.`,
          entityType: "milestone",
          entityId: id,
          skipUserId: actorUserId,
        }),
      );
    }

    if (previous.status !== payload.status && payload.status === "completed") {
      activityTasks.push(
        createStatusChangeNotification({
          userIds: [payload.owner_id],
          title: "Milestone completed",
          body: `${payload.title} was marked as completed.`,
          entityType: "milestone",
          entityId: id,
          skipUserId: actorUserId,
        }),
      );
    }
  }

  await Promise.all(activityTasks);

  return payload.project_id;
}

export async function deleteMilestone(id: string) {
  const [deleted] = await asPerson((tx) => select<{ project_id: string }>(tx, "delete from work.milestone where id = $1::uuid returning engagement_id as project_id", [id]));
  return deleted?.project_id ?? null;
}

export async function completeMilestone(id: string, actorUserId: string) {
  const milestone = await asPerson((tx) =>
    selectOne<{ project_id: string; title: string; owner_id: string | null }>(
      tx,
      `update work.milestone set status = 'completed', completed_at = coalesce(completed_at, now()) where id = $1::uuid
       returning engagement_id as project_id, title, owner_id`,
      [id],
    ),
  );

  if (!milestone) {
    throw new Error("You cannot complete this milestone.");
  }

  await logActivity({
    userId: actorUserId,
    action: "Completed milestone",
    entityType: "milestone",
    entityId: id,
    metadata: { kind: "completion_change", field: "status", to: "completed", summary: "Milestone completed" },
  });

  await createStatusChangeNotification({
    userIds: [milestone.owner_id],
    title: "Milestone completed",
    body: `${milestone.title} was marked as completed.`,
    entityType: "milestone",
    entityId: id,
    skipUserId: actorUserId,
  });

  return milestone.project_id;
}
