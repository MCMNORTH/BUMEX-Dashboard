"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { updateSettingsUserEntity, updateSettingsUserRole } from "@/lib/settings/users";
import type { AppRole } from "@/types/auth";

const roleOptions: AppRole[] = ["admin", "manager", "employee"];

export type SettingsUsersInlineActionState = {
  error?: string;
  success?: string;
  value?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInlineError(error: unknown, fallback: string) {
  return normalizeEntityMutationError(error, null, fallback);
}

function buildSettingsUsersRedirect(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const query = searchParams.toString();
  return query ? `/settings/users?${query}` : "/settings/users";
}

async function requireSuperAdminEditor() {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile.is_super_admin) {
    throw new Error("Only the super admin can change user roles.");
  }

  return auth;
}

export async function updateSettingsUserRoleInlineAction(
  _prevState: SettingsUsersInlineActionState,
  formData: FormData,
): Promise<SettingsUsersInlineActionState> {
  try {
    const auth = await requireSuperAdminEditor();

    const userId = getString(formData, "user_id");
    const role = getString(formData, "role") as AppRole;

    if (!userId) {
      throw new Error("Missing user identifier.");
    }

    if (!roleOptions.includes(role)) {
      throw new Error("This role is not available in the current production database.");
    }

    if (userId === auth.profile.id) {
      throw new Error("The super admin cannot change their own role from this screen.");
    }

    await updateSettingsUserRole(userId, role);
    revalidatePath("/settings/users");

    return {
      success: "Role updated",
      value: role,
    };
  } catch (error) {
    return {
      error: normalizeInlineError(error, "The role could not be updated."),
    };
  }
}

export async function updateSettingsUserRoleAction(formData: FormData) {
  const result = await updateSettingsUserRoleInlineAction({}, formData);

  if (result.error) {
    redirect(buildSettingsUsersRedirect({ error: result.error }));
  }

  redirect(buildSettingsUsersRedirect({ success: result.success ?? "User role updated." }));
}

export async function updateSettingsUserEntityInlineAction(
  _prevState: SettingsUsersInlineActionState,
  formData: FormData,
): Promise<SettingsUsersInlineActionState> {
  try {
    await requireSuperAdminEditor();

    const userId = getString(formData, "user_id");
    const entityCode = getString(formData, "entity_code");

    if (!userId) {
      throw new Error("Missing user identifier.");
    }

    if (!isBumexEntityCode(entityCode)) {
      throw new Error("Invalid entity selection.");
    }

    await updateSettingsUserEntity(userId, entityCode);
    revalidatePath("/settings/users");

    return {
      success: "Entity updated",
      value: entityCode,
    };
  } catch (error) {
    return {
      error: normalizeInlineError(error, "The entity could not be updated."),
    };
  }
}

export async function updateSettingsUserEntityAction(formData: FormData) {
  const result = await updateSettingsUserEntityInlineAction({}, formData);

  if (result.error) {
    redirect(buildSettingsUsersRedirect({ error: result.error }));
  }

  redirect(buildSettingsUsersRedirect({ success: result.success ?? "User entity updated." }));
}
