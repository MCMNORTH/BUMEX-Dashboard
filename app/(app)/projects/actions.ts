"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { parseFormattedNumber } from "@/lib/formatters";
import { createProject, deleteProject, updateProject } from "@/lib/projects/service";
import type { ProjectFormValues, ProjectKind, ProjectPriority, ProjectStatus } from "@/types/project";

export type ProjectActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseProjectFormData(formData: FormData): ProjectFormValues {
  return {
    name: getString(formData, "name"),
    client_id: getString(formData, "client_id"),
    description: getString(formData, "description"),
    owner_id: getString(formData, "owner_id"),
    status: getString(formData, "status") as ProjectStatus,
    start_date: getString(formData, "start_date"),
    end_date: getString(formData, "end_date"),
    budget_amount: getString(formData, "budget_amount"),
    priority: getString(formData, "priority") as ProjectPriority | "",
    project_kind: getString(formData, "project_kind") as ProjectKind,
    manual_progress: getString(formData, "manual_progress"),
  };
}

function validate(values: ProjectFormValues) {
  if (!values.name || !values.client_id || !values.owner_id || !values.status || !values.project_kind) {
    return "Project name, entity, owner, status, and project type are required.";
  }

  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    return "End date must be after start date.";
  }

  if (values.budget_amount && parseFormattedNumber(values.budget_amount) === null) {
    return "Budget amount must be a valid number.";
  }

  if (values.manual_progress) {
    const progress = Number(values.manual_progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return "Project progress must be a whole number between 0 and 100.";
    }
  }

  return null;
}

export async function createProjectAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const auth = await requireRouteAccess("projects");

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    return { error: "You do not have permission to create projects." };
  }

  const values = parseProjectFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (isManagerLikeRole(auth.role) && values.owner_id !== auth.profile.id) {
    return { error: "Only entity-level leads can create projects they own." };
  }

  await createProject(values, auth.profile.id);
  revalidatePath("/projects");
  redirect("/projects?toast=project-created");
}

export async function updateProjectAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const auth = await requireRouteAccess("projects");

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    return { error: "You do not have permission to edit projects." };
  }

  const projectId = getString(formData, "project_id");
  const values = parseProjectFormData(formData);
  const validationError = validate(values);

  if (!projectId) {
    return { error: "Missing project identifier." };
  }

  if (validationError) {
    return { error: validationError };
  }

  if (isManagerLikeRole(auth.role) && values.owner_id !== auth.profile.id) {
    return { error: "Only entity-level leads can update projects they own." };
  }

  await updateProject(projectId, values, auth.profile.id);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?toast=project-updated`);
}

export async function deleteProjectAction(formData: FormData) {
  const auth = await requireRouteAccess("projects");
  const projectId = getString(formData, "project_id");

  if (!projectId) {
    redirect("/projects?toast=project-delete-error");
  }

  if (auth.role !== "admin" && !isManagerLikeRole(auth.role)) {
    redirect(`/projects/${projectId}?toast=project-delete-error`);
  }

  await deleteProject(projectId);
  revalidatePath("/projects");
  redirect("/projects?toast=project-deleted");
}
