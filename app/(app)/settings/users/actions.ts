"use server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { updateSettingsUserEntity } from "@/lib/settings/users";

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

async function requireSuperAdminEditor() {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile.is_super_admin) {
    throw new Error("Only the super admin can change user roles.");
  }

  return auth;
}

// Roles are not changed here: a person's role is their Vanguard role (Settings › accounts).

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
