"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getBumexEntity, isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function assignEntityAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();

  if (auth.profile.entity_code) {
    redirect("/overview");
  }

  const entityCode = getString(formData, "entity_code");
  if (!isBumexEntityCode(entityCode)) {
    throw new Error("Invalid entity selection.");
  }

  const entity = getBumexEntity(entityCode);
  if (!entity?.available) {
    throw new Error("This entity cannot be selected from self-service onboarding.");
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect("/select-entity?error=Supabase is not configured.");
  }

  const { data, error } = await supabase
    .rpc("assign_own_entity", { requested_entity_code: entityCode })
    .maybeSingle<{ id: string; entity_code: string | null }>();

  if (error || !data || data.id !== auth.profile.id || data.entity_code !== entityCode) {
    console.error("[select-entity:assign]", {
      code: error?.code,
      message: error?.message,
      userId: auth.profile.id,
      requestedEntityCode: entityCode,
    });
    redirect(`/select-entity?error=${encodeURIComponent(normalizeEntityMutationError(error, entityCode, "The entity could not be assigned."))}`);
  }

  revalidatePath("/", "layout");
  redirect("/overview");
}
