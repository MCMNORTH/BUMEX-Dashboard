"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { activeEntityCookieName, isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { createClient } from "@/lib/supabase/server";

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

    if (!auth.profile.is_super_admin) {
      throw new Error("Only the super admin can change the active entity.");
    }

    const entityCode = getString(formData, "entity_code");
    const redirectPath = getString(formData, "redirect_path");
    if (!isBumexEntityCode(entityCode)) {
      throw new Error("Invalid entity selection.");
    }

    const cookieStore = await cookies();
    cookieStore.set(activeEntityCookieName, entityCode, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    const supabase = await createClient();
    if (!supabase) {
      if (redirectPath.startsWith("/")) {
        revalidatePath(redirectPath);
      }
      revalidatePath("/", "layout");
      return {
        ok: true,
        entityCode,
        warning: "The workspace entity was applied for this session, but the database profile could not be synchronized.",
      };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        entity_code: entityCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.profile.id);

    if (error) {
      const normalizedError = normalizeEntityMutationError(error, entityCode, "The entity could not be updated.");

      if (normalizedError.toLowerCase().includes("does not yet allow")) {
        if (redirectPath.startsWith("/")) {
          revalidatePath(redirectPath);
        }
        revalidatePath("/", "layout");
        return {
          ok: true,
          entityCode,
          warning: `${entityCode} was applied for your super admin workspace. The live database profile assignment for this entity is still pending.`,
        };
      }

      throw new Error(normalizedError);
    }

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
