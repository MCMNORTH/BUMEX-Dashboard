"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRouteAccess } from "@/lib/auth/server";
import { createStaffingAssignment, updateStaffingAssignment, updateStaffingAssignmentStatus } from "@/lib/staffing/service";
import { createClient } from "@/lib/supabase/server";
import type { StaffingStatus } from "@/types/staffing";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function createStaffingAssignmentAction(formData: FormData) {
  const auth = await requireRouteAccess("staffing");
  const projectId = text(formData, "project_id");
  const userId = text(formData, "user_id");
  const projectRole = text(formData, "project_role");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const allocationPercent = Number(text(formData, "allocation_percent"));
  const weeklyHours = Number(text(formData, "weekly_hours"));
  const status = text(formData, "status") as StaffingStatus;
  const note = text(formData, "note");
  const validStatuses: StaffingStatus[] = ["draft", "requested", "confirmed"];
  if (!projectId || !userId || projectRole.length < 2 || !startDate || !endDate || endDate < startDate || !Number.isFinite(allocationPercent) || allocationPercent < 1 || allocationPercent > 100 || !Number.isFinite(weeklyHours) || weeklyHours <= 0 || !validStatuses.includes(status)) redirect("/staffing?error=invalid");

  const supabase = await createClient();
  if (!supabase) redirect("/staffing?error=unavailable");
  if (status === "confirmed" || status === "requested") {
    let overlapQuery = supabase.from("staffing_assignments").select("allocation_percent")
      .eq("user_id", userId).in("status", ["requested", "confirmed"])
      .lte("start_date", endDate).gte("end_date", startDate);
    if (auth.role === "manager" && auth.profile.entity_code) overlapQuery = overlapQuery.eq("entity_code", auth.profile.entity_code);
    const { data: overlaps } = await overlapQuery.returns<Array<{ allocation_percent: number }>>();
    const alreadyAllocated = (overlaps ?? []).reduce((sum, item) => sum + item.allocation_percent, 0);
    if (alreadyAllocated + allocationPercent > 100) redirect("/staffing?error=capacity");
  }

  try {
    await createStaffingAssignment({ projectId, userId, projectRole, startDate, endDate, allocationPercent, weeklyHours, status, note });
  } catch (error) {
    console.error("[staffing:create]", error instanceof Error ? error.message : "unknown");
    redirect("/staffing?error=unavailable");
  }
  revalidatePath("/staffing"); revalidatePath("/planning"); revalidatePath("/timesheet"); revalidatePath(`/projects/${projectId}`);
  redirect("/staffing?created=1");
}

export async function updateStaffingAssignmentStatusAction(formData: FormData) {
  await requireRouteAccess("staffing");
  const assignmentId = text(formData, "assignment_id");
  const status = text(formData, "status") as StaffingStatus;
  const validStatuses: StaffingStatus[] = ["draft", "requested", "confirmed", "completed", "cancelled"];
  if (!assignmentId || !validStatuses.includes(status)) redirect("/staffing?error=invalid");
  try {
    await updateStaffingAssignmentStatus(assignmentId, status);
  } catch (error) {
    console.error("[staffing:status]", error instanceof Error ? error.message : "unknown");
    redirect(`/staffing?error=${error instanceof Error && error.message === "capacity" ? "capacity" : "unavailable"}`);
  }
  revalidatePath("/staffing"); revalidatePath("/planning"); revalidatePath("/timesheet");
  redirect("/staffing?updated=1");
}

export async function updateStaffingAssignmentAction(formData: FormData) {
  await requireRouteAccess("staffing");
  const assignmentId = text(formData, "assignment_id");
  const projectRole = text(formData, "project_role");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const allocationPercent = Number(text(formData, "allocation_percent"));
  const weeklyHours = Number(text(formData, "weekly_hours"));
  const note = text(formData, "note");
  if (!assignmentId || projectRole.length < 2 || !startDate || !endDate || endDate < startDate || !Number.isFinite(allocationPercent) || allocationPercent < 1 || allocationPercent > 100 || !Number.isFinite(weeklyHours) || weeklyHours <= 0) redirect("/staffing?error=invalid");
  try {
    await updateStaffingAssignment({ assignmentId, projectRole, startDate, endDate, allocationPercent, weeklyHours, note });
  } catch (error) {
    console.error("[staffing:update]", error instanceof Error ? error.message : "unknown");
    redirect(`/staffing?error=${error instanceof Error && error.message === "capacity" ? "capacity" : "unavailable"}`);
  }
  revalidatePath("/staffing"); revalidatePath("/planning"); revalidatePath("/timesheet");
  redirect("/staffing?updated=1");
}
