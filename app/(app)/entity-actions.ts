"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { canProfileSwitchEntities } from "@/lib/auth/permissions";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { activeEntityCookieName, isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { getAccessibleEntityCodes } from "@/lib/entities/server";
import { asPerson } from "@/lib/work/db";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export type SetActiveEntityActionResult =
  | { ok: true; entityCode: string; warning?: string }
  | { ok: false; error: string };

export async function setActiveEntityAction(formData: FormData): Promise<SetActiveEntityActionResult> {
  try {
    const auth = await requireAuthenticatedUser();
    const isSuperAdmin = auth.profile.is_super_admin;

    if (!canProfileSwitchEntities(auth.profile)) {
      throw new Error("Only admins can change the active entity.");
    }

    const entityCode = getString(formData, "entity_code");
    const redirectPath = getString(formData, "redirect_path");
    if (!isBumexEntityCode(entityCode) || !getAccessibleEntityCodes(auth.profile).includes(entityCode)) {
      throw new Error("Invalid entity selection.");
    }

    // The cookie is only read for the super admin (see getActiveEntityCodeForProfile);
    // for other admins the profile update below is the switch.
    if (isSuperAdmin) {
      const cookieStore = await cookies();
      cookieStore.set(activeEntityCookieName, entityCode, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    await asPerson((tx) => tx.query("update work.person set entity_code = $2 where id = $1", [auth.profile.id, entityCode]));

    if (redirectPath.startsWith("/")) {
      revalidatePath(redirectPath);
    }

    revalidatePath("/", "layout");
    return { ok: true, entityCode };
  } catch (error) {
    return {
      ok: false,
      error: normalizeEntityMutationError(error, getString(formData, "entity_code"), "The entity could not be updated."),
    };
  }
}
