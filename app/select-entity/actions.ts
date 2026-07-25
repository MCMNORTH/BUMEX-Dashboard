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

  const { error } = await supabase
    .from("profiles")
    .update({
      entity_code: entityCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.profile.id)
    .is("entity_code", null);

  if (error) {
    redirect(`/select-entity?error=${encodeURIComponent(normalizeEntityMutationError(error, entityCode, "The entity could not be assigned."))}`);
  }

  revalidatePath("/", "layout");
  redirect("/overview");
}
