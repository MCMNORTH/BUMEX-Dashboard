"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getTeamMemberById, updateTeamMember } from "@/lib/team/service";
import type { AppRole, AvailabilityStatus } from "@/types/auth";
import type { TeamMemberFormValues } from "@/types/team";

export type TeamActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseTeamFormData(formData: FormData): TeamMemberFormValues {
  return {
    full_name: getString(formData, "full_name"),
    avatar_url: getString(formData, "avatar_url"),
    job_title: getString(formData, "job_title"),
    department: getString(formData, "department"),
    role: getString(formData, "role") as AppRole,
    skills: getString(formData, "skills"),
    phone: getString(formData, "phone"),
    availability_status: getString(formData, "availability_status") as AvailabilityStatus,
    weekly_capacity_hours: getString(formData, "weekly_capacity_hours"),
  };
}

function validate(values: TeamMemberFormValues) {
  if (!values.full_name) {
    return "Full name is required.";
  }

  if (!values.availability_status) {
    return "Availability status is required.";
  }

  const capacity = Number(values.weekly_capacity_hours);
  if (!Number.isFinite(capacity) || capacity < 0 || capacity > 80) {
    return "Weekly capacity must be between 0 and 80 hours.";
  }

  return null;
}

export async function updateTeamMemberAction(
  _prevState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const auth = await requireRouteAccess("team");
  const memberId = getString(formData, "member_id");

  if (!memberId) {
    return { error: "Missing team member identifier." };
  }

  const values = parseTeamFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  const target = await getTeamMemberById(memberId, auth.role);

  if (!target) {
    return { error: "Team member not found." };
  }

  const isSelf = auth.profile.id === memberId;
  const isAdmin = auth.role === "admin";
  const isManager = isManagerLikeRole(auth.role);
  const isEmployee = auth.role === "employee";

  if (!isAdmin && !isManager && !(isEmployee && isSelf)) {
    return { error: "You do not have permission to update this profile." };
  }

  if (!isAdmin) {
    values.role = target.member.role;
  }

  if (isManager && !isSelf) {
    values.full_name = target.member.full_name;
    values.avatar_url = target.member.avatar_url ?? "";
    values.phone = target.member.phone ?? "";
  }

  await updateTeamMember(memberId, values, {
    id: auth.profile.id,
    role: auth.role,
  });

  revalidatePath("/team");
  revalidatePath(`/team/${memberId}`);
  redirect(`/team/${memberId}?toast=team-updated`);
}
