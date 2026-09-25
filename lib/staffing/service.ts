import "server-only";

import { logActivity } from "@/lib/activity/service";
import { requireCurrentEntityContext } from "@/lib/entities/scope";
import { createAssignmentNotification } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/server";
import type { StaffingActivity, StaffingAssignment, StaffingPerson, StaffingProject, StaffingStatus } from "@/types/staffing";

async function notifyStaffing(params: Parameters<typeof createAssignmentNotification>[0]) {
  try {
    await createAssignmentNotification(params);
  } catch (error) {
    console.error("[staffing:notification]", error instanceof Error ? error.message : "unknown");
  }
}

export async function getStaffingWorkspace() {
  const { auth, entityCode } = await requireCurrentEntityContext();
  if (auth.role !== "admin" && auth.role !== "manager") throw new Error("Staffing access denied.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Staffing unavailable.");
  const companyWide = auth.role === "admin";

  let projectsQuery = supabase.from("projects").select("id, name, entity_code, status, start_date, end_date").in("status", ["draft", "active", "on_hold"]).order("name");
  let peopleQuery = supabase.from("profiles").select("id, full_name, job_title, department, entity_code, availability_status, weekly_capacity_hours, skills").neq("role", "shareholder").order("full_name");
  let assignmentsQuery = supabase.from("staffing_assignments").select("id, project_id, user_id, entity_code, project_role, start_date, end_date, allocation_percent, weekly_hours, status, note, created_at, project:projects(id, name), person:profiles!staffing_assignments_user_id_fkey(id, full_name, job_title, entity_code)").order("start_date", { ascending: false });
  let activityQuery = supabase.from("activity_logs").select("id, action, entity_id, metadata, created_at, user:profiles(full_name)").eq("metadata->>related_type", "staffing").order("created_at", { ascending: false }).limit(8);
  if (!companyWide) {
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
    peopleQuery = peopleQuery.eq("entity_code", entityCode);
    assignmentsQuery = assignmentsQuery.eq("entity_code", entityCode);
    activityQuery = activityQuery.eq("entity_code", entityCode);
  }

  const [projectsResult, peopleResult, assignmentsResult, activityResult] = await Promise.all([
    projectsQuery.returns<StaffingProject[]>(),
    peopleQuery.returns<StaffingPerson[]>(),
    assignmentsQuery.returns<StaffingAssignment[]>(),
    activityQuery.returns<Array<Omit<StaffingActivity, "user"> & { user: { full_name: string } | Array<{ full_name: string }> | null }>>(),
  ]);
  const error = projectsResult.error ?? peopleResult.error ?? assignmentsResult.error;
  if (error) throw new Error(error.message);
  const rawAssignments = assignmentsResult.data ?? [];
  const activities: StaffingActivity[] = (activityResult.data ?? []).map(item => ({ ...item, user: Array.isArray(item.user) ? item.user[0] ?? null : item.user }));
  if (!rawAssignments.length) return { projects: projectsResult.data ?? [], people: peopleResult.data ?? [], assignments: [], activities, companyWide };
  const userIds = [...new Set(rawAssignments.map(item => item.user_id))];
  const firstDate = rawAssignments.reduce((value, item) => item.start_date < value ? item.start_date : value, rawAssignments[0].start_date);
  const lastDate = rawAssignments.reduce((value, item) => item.end_date > value ? item.end_date : value, rawAssignments[0].end_date);
  let entriesQuery = supabase.from("time_entries").select("user_id, project_id, work_date, duration_minutes").in("user_id", userIds).gte("work_date", firstDate).lte("work_date", lastDate);
  if (!companyWide) entriesQuery = entriesQuery.eq("entity_code", entityCode);
  const { data: entries, error: entriesError } = await entriesQuery.returns<Array<{ user_id: string; project_id: string; work_date: string; duration_minutes: number }>>();
  if (entriesError) throw new Error(entriesError.message);
  const assignments = rawAssignments.map(assignment => ({
    ...assignment,
    actual_minutes: (entries ?? []).filter(entry => entry.user_id === assignment.user_id && entry.project_id === assignment.project_id && entry.work_date >= assignment.start_date && entry.work_date <= assignment.end_date).reduce((sum, entry) => sum + Number(entry.duration_minutes), 0),
  }));
  return { projects: projectsResult.data ?? [], people: peopleResult.data ?? [], assignments, activities, companyWide };
}

export async function createStaffingAssignment(input: {
  projectId: string;
  userId: string;
  projectRole: string;
  startDate: string;
  endDate: string;
  allocationPercent: number;
  weeklyHours: number;
  status: StaffingStatus;
  note: string;
}) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  if (auth.role !== "admin" && auth.role !== "manager") throw new Error("Staffing access denied.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Staffing unavailable.");

  const [{ data: project }, { data: person }] = await Promise.all([
    supabase.from("projects").select("id, name, entity_code").eq("id", input.projectId).maybeSingle<{ id: string; name: string; entity_code: string | null }>(),
    supabase.from("profiles").select("id, full_name, entity_code, role, availability_status").eq("id", input.userId).maybeSingle<{ id: string; full_name: string; entity_code: string | null; role: string; availability_status: string }>(),
  ]);
  if (!project || !person) throw new Error("Project or person not found.");
  if (auth.role === "manager" && (project.entity_code !== entityCode || person.entity_code !== entityCode)) throw new Error("Selection outside your entity.");
  if (person.availability_status === "inactive") throw new Error("This person is inactive.");

  const assignmentEntity = project.entity_code ?? person.entity_code ?? entityCode;
  const { data: assignment, error } = await supabase.from("staffing_assignments").insert({
    project_id: input.projectId,
    user_id: input.userId,
    entity_code: assignmentEntity,
    project_role: input.projectRole,
    start_date: input.startDate,
    end_date: input.endDate,
    allocation_percent: input.allocationPercent,
    weekly_hours: input.weeklyHours,
    status: input.status,
    note: input.note || null,
    created_by: auth.profile.id,
  }).select("id").single<{ id: string }>();
  if (error) throw new Error(error.message);

  if (input.status === "confirmed") {
    const { error: membershipError } = await supabase.from("project_members").upsert({ project_id: input.projectId, user_id: input.userId, role: person.role }, { onConflict: "project_id,user_id" });
    if (membershipError) {
      await supabase.from("staffing_assignments").delete().eq("id", assignment.id);
      throw new Error(membershipError.message);
    }
  }
  await logActivity({ userId: auth.profile.id, action: `Created staffing assignment for ${person.id}`, entityType: "project", entityId: input.projectId, metadata: { kind: "assignment_change", summary: `Staffing assignment created at ${input.allocationPercent}%`, related_type: "staffing", related_id: assignment.id, assignee_id: person.id, status: input.status } });
  await notifyStaffing({ userId: person.id, skipUserId: auth.profile.id, title: input.status === "confirmed" ? "New project assignment confirmed" : "New staffing assignment", body: `${project.name} · ${input.projectRole} · ${input.allocationPercent}% from ${input.startDate} to ${input.endDate}.`, entityType: "project", entityId: input.projectId });
}

export async function updateStaffingAssignmentStatus(assignmentId: string, status: StaffingStatus) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  if (auth.role !== "admin" && auth.role !== "manager") throw new Error("Staffing access denied.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Staffing unavailable.");
  const { data: assignment, error: readError } = await supabase
    .from("staffing_assignments")
    .select("id, project_id, user_id, entity_code, start_date, end_date, allocation_percent")
    .eq("id", assignmentId)
    .maybeSingle<{ id: string; project_id: string; user_id: string; entity_code: string; start_date: string; end_date: string; allocation_percent: number }>();
  if (readError || !assignment) throw new Error(readError?.message ?? "Assignment not found.");
  if (auth.role === "manager" && assignment.entity_code !== entityCode) throw new Error("Selection outside your entity.");

  if (status === "requested" || status === "confirmed") {
    const { data: overlaps, error: overlapError } = await supabase.from("staffing_assignments").select("allocation_percent")
      .eq("user_id", assignment.user_id).neq("id", assignment.id).in("status", ["requested", "confirmed"])
      .lte("start_date", assignment.end_date).gte("end_date", assignment.start_date)
      .returns<Array<{ allocation_percent: number }>>();
    if (overlapError) throw new Error(overlapError.message);
    if ((overlaps ?? []).reduce((sum, item) => sum + Number(item.allocation_percent), 0) + Number(assignment.allocation_percent) > 100) throw new Error("capacity");
  }

  const { error } = await supabase.from("staffing_assignments").update({ status }).eq("id", assignment.id);
  if (error) throw new Error(error.message);

  if (status === "confirmed") {
    const { data: person } = await supabase.from("profiles").select("role").eq("id", assignment.user_id).maybeSingle<{ role: string }>();
    const { error: membershipError } = await supabase.from("project_members").upsert({ project_id: assignment.project_id, user_id: assignment.user_id, role: person?.role ?? "member" }, { onConflict: "project_id,user_id" });
    if (membershipError) throw new Error(membershipError.message);
  }

  if (status === "cancelled" || status === "completed") {
    const { count } = await supabase.from("staffing_assignments").select("id", { count: "exact", head: true })
      .eq("project_id", assignment.project_id).eq("user_id", assignment.user_id).eq("status", "confirmed").neq("id", assignment.id);
    if (!count) await supabase.from("project_members").delete().eq("project_id", assignment.project_id).eq("user_id", assignment.user_id);
  }
  await logActivity({ userId: auth.profile.id, action: `Changed staffing status to ${status}`, entityType: "project", entityId: assignment.project_id, metadata: { kind: "status_change", summary: `Staffing assignment is now ${status}`, related_type: "staffing", related_id: assignment.id, assignee_id: assignment.user_id, status } });
  const { data: statusProject } = await supabase.from("projects").select("name").eq("id", assignment.project_id).maybeSingle<{ name: string }>();
  await notifyStaffing({ userId: assignment.user_id, skipUserId: auth.profile.id, type: "status_change", title: `Staffing assignment ${status}`, body: `${statusProject?.name ?? "Project"}: your assignment is now ${status}.`, entityType: "project", entityId: assignment.project_id });
}

export async function updateStaffingAssignment(input: { assignmentId: string; projectRole: string; startDate: string; endDate: string; allocationPercent: number; weeklyHours: number; note: string }) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  if (auth.role !== "admin" && auth.role !== "manager") throw new Error("Staffing access denied.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Staffing unavailable.");
  const { data: assignment, error: readError } = await supabase.from("staffing_assignments")
    .select("id, project_id, user_id, entity_code, status").eq("id", input.assignmentId)
    .maybeSingle<{ id: string; project_id: string; user_id: string; entity_code: string; status: StaffingStatus }>();
  if (readError || !assignment) throw new Error(readError?.message ?? "Assignment not found.");
  if (auth.role === "manager" && assignment.entity_code !== entityCode) throw new Error("Selection outside your entity.");
  if (assignment.status === "cancelled" || assignment.status === "completed") throw new Error("Closed assignments cannot be edited.");
  if (assignment.status === "requested" || assignment.status === "confirmed") {
    const { data: overlaps, error: overlapError } = await supabase.from("staffing_assignments").select("allocation_percent")
      .eq("user_id", assignment.user_id).neq("id", assignment.id).in("status", ["requested", "confirmed"])
      .lte("start_date", input.endDate).gte("end_date", input.startDate)
      .returns<Array<{ allocation_percent: number }>>();
    if (overlapError) throw new Error(overlapError.message);
    if ((overlaps ?? []).reduce((sum, item) => sum + Number(item.allocation_percent), 0) + input.allocationPercent > 100) throw new Error("capacity");
  }
  const { error } = await supabase.from("staffing_assignments").update({ project_role: input.projectRole, start_date: input.startDate, end_date: input.endDate, allocation_percent: input.allocationPercent, weekly_hours: input.weeklyHours, note: input.note || null }).eq("id", assignment.id);
  if (error) throw new Error(error.message);
  await logActivity({ userId: auth.profile.id, action: "Updated staffing assignment", entityType: "project", entityId: assignment.project_id, metadata: { kind: "assignment_change", summary: `Staffing assignment updated to ${input.allocationPercent}%`, related_type: "staffing", related_id: assignment.id, assignee_id: assignment.user_id, allocation_percent: input.allocationPercent } });
  const { data: updatedProject } = await supabase.from("projects").select("name").eq("id", assignment.project_id).maybeSingle<{ name: string }>();
  await notifyStaffing({ userId: assignment.user_id, skipUserId: auth.profile.id, title: "Project assignment updated", body: `${updatedProject?.name ?? "Project"} · ${input.projectRole} · ${input.allocationPercent}% from ${input.startDate} to ${input.endDate}.`, entityType: "project", entityId: assignment.project_id });
}
