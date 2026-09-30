import "server-only";

import { getProjectActivity, logActivity } from "@/lib/activity/service";
import { createStatusChangeNotification } from "@/lib/notifications/service";
import { calculateProjectHealth, calculateProjectProgress, getDeadlineState } from "@/lib/projects/helpers";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = supabase
    .from("projects")
    .select(
      `
        id,
        name,
        description,
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
        tasks (
          id,
          title,
          status,
          priority,
          due_date,
          assignee_id
        ),
        milestones (
          id,
          project_id,
          title,
          description,
          status,
          due_date,
          completed_at,
          owner_id,
          created_at,
          updated_at,
          owner:profiles!milestones_owner_id_fkey (
            id,
            full_name,
            email,
            avatar_url,
            role
          )
        )
      `,
    )
    .order("end_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  if (filters.projectId) {
    query = query.eq("id", filters.projectId);
  }

  if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  const { data, error } = await query.returns<RoadmapProjectRow[]>();

  if (error) {
    throw new Error(error.message);
  }

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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [{ data: projects, error: projectsError }, { data: clients, error: clientsError }, { data: owners, error: ownersError }] =
    await Promise.all([
      supabase.from("projects").select("id, name").order("name", { ascending: true }).returns<Array<{ id: string; name: string }>>(),
      supabase
        .from("clients")
        .select("id, name, contact_email")
        .order("name", { ascending: true })
        .returns<ProjectClient[]>(),
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role")
        .order("full_name", { ascending: true })
        .returns<ProjectOwner[]>(),
    ]);

  if (projectsError) throw new Error(projectsError.message);
  if (clientsError) throw new Error(clientsError.message);
  if (ownersError) throw new Error(ownersError.message);

  return {
    projects: projects ?? [],
    clients: clients ?? [],
    owners: owners ?? [],
  };
}

export async function getProjectMilestones(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("milestones")
    .select(
      `
        id,
        project_id,
        title,
        description,
        status,
        due_date,
        completed_at,
        owner_id,
        created_at,
        updated_at,
        owner:profiles!milestones_owner_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("project_id", projectId)
    .order("due_date", { ascending: true })
    .returns<MilestoneRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapMilestone);
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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const payload = parseMilestonePayload(values);
  const { data, error } = await supabase
    .from("milestones")
    .insert(payload)
    .select("id, project_id")
    .single<{ id: string; project_id: string }>();

  if (error) {
    throw new Error(error.message);
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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: previous, error: previousError } = await supabase
    .from("milestones")
    .select("title, status, due_date, owner_id, project_id")
    .eq("id", id)
    .maybeSingle<{
      title: string;
      status: MilestoneStatus;
      due_date: string;
      owner_id: string | null;
      project_id: string;
    }>();

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...parseMilestonePayload(values),
    updated_at: new Date().toISOString(),
    completed_at: values.status === "completed" ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from("milestones").update(payload).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

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
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error: selectError } = await supabase
    .from("milestones")
    .select("project_id")
    .eq("id", id)
    .maybeSingle<{ project_id: string }>();

  if (selectError) {
    throw new Error(selectError.message);
  }

  const { error } = await supabase.from("milestones").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return data?.project_id ?? null;
}

export async function completeMilestone(id: string, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("milestones")
    .update({
      status: "completed",
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", id)
    .select("project_id")
    .single<{ project_id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: "Completed milestone",
    entityType: "milestone",
    entityId: id,
    metadata: {
      kind: "completion_change",
      field: "status",
      to: "completed",
      summary: "Milestone completed",
    },
  });

  const { data: milestone } = await supabase
    .from("milestones")
    .select("title, owner_id")
    .eq("id", id)
    .maybeSingle<{ title: string; owner_id: string | null }>();

  if (milestone) {
    await createStatusChangeNotification({
      userIds: [milestone.owner_id],
      title: "Milestone completed",
      body: `${milestone.title} was marked as completed.`,
      entityType: "milestone",
      entityId: id,
      skipUserId: actorUserId,
    });
  }

  return data.project_id;
}

export async function getMilestoneActivity(milestoneIds: string[], limit = 20) {
  if (!milestoneIds.length) {
    return [];
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const activity = await getProjectActivity("", [], milestoneIds, limit, supabase);
  return activity;
}
