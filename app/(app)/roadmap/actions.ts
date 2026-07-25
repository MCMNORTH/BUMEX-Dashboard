"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getProjectById } from "@/lib/projects/service";
import {
  completeMilestone,
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/lib/roadmap/service";
import type { MilestoneFormValues, MilestoneStatus } from "@/types/milestone";

export type MilestoneActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseMilestoneFormData(formData: FormData): MilestoneFormValues {
  return {
    project_id: getString(formData, "project_id"),
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    status: getString(formData, "status") as MilestoneStatus,
    due_date: getString(formData, "due_date"),
    owner_id: getString(formData, "owner_id"),
  };
}

function validate(values: MilestoneFormValues) {
  if (!values.project_id || !values.title || !values.status || !values.due_date) {
    return "Project, title, status, and due date are required.";
  }

  return null;
}

function getRedirectTarget(formData: FormData) {
  const target = getString(formData, "redirect_to");

  if (!target.startsWith("/")) {
    return "/roadmap";
  }

  return target;
}

async function canManageRoadmapProject(projectId: string, userId: string, role: "admin" | "manager" | "supervisor" | "employee" | "shareholder") {
  if (role === "admin") {
    return true;
  }

  if (!isManagerLikeRole(role)) {
    return false;
  }

  const project = await getProjectById(projectId);

  return project?.owner_id === userId;
}

export async function createMilestoneAction(
  _prevState: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const auth = await requireRouteAccess("roadmap");

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    return { error: "You do not have permission to create milestones." };
  }

  const values = parseMilestoneFormData(formData);
  const redirectTo = getRedirectTarget(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageRoadmapProject(values.project_id, auth.profile.id, auth.role))) {
    return { error: "Only entity-level leads can manage milestones for projects they own." };
  }

  const milestone = await createMilestone(values, auth.profile.id);
  revalidatePath("/roadmap");
  revalidatePath(`/projects/${milestone.project_id}`);
  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-created`);
}

export async function updateMilestoneAction(
  _prevState: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const auth = await requireRouteAccess("roadmap");
  const milestoneId = getString(formData, "milestone_id");

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    return { error: "You do not have permission to edit milestones." };
  }

  if (!milestoneId) {
    return { error: "Missing milestone identifier." };
  }

  const values = parseMilestoneFormData(formData);
  const redirectTo = getRedirectTarget(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageRoadmapProject(values.project_id, auth.profile.id, auth.role))) {
    return { error: "Only entity-level leads can manage milestones for projects they own." };
  }

  const projectId = await updateMilestone(milestoneId, values, auth.profile.id);
  revalidatePath("/roadmap");
  revalidatePath(`/projects/${projectId}`);
  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-updated`);
}

export async function deleteMilestoneAction(formData: FormData) {
  const auth = await requireRouteAccess("roadmap");
  const milestoneId = getString(formData, "milestone_id");
  const projectId = getString(formData, "project_id");
  const redirectTo = getRedirectTarget(formData);

  if (!milestoneId || !projectId) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-delete-error`);
  }

  if (!(await canManageRoadmapProject(projectId, auth.profile.id, auth.role))) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-delete-error`);
  }

  const relatedProjectId = await deleteMilestone(milestoneId);
  revalidatePath("/roadmap");

  if (relatedProjectId) {
    revalidatePath(`/projects/${relatedProjectId}`);
  }

  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-deleted`);
}

export async function completeMilestoneAction(formData: FormData) {
  const auth = await requireRouteAccess("roadmap");
  const milestoneId = getString(formData, "milestone_id");
  const projectId = getString(formData, "project_id");
  const redirectTo = getRedirectTarget(formData);

  if (!milestoneId || !projectId) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-update-error`);
  }

  if (!(await canManageRoadmapProject(projectId, auth.profile.id, auth.role))) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-update-error`);
  }

  const relatedProjectId = await completeMilestone(milestoneId, auth.profile.id);
  revalidatePath("/roadmap");
  revalidatePath(`/projects/${relatedProjectId}`);
  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}toast=milestone-completed`);
}
