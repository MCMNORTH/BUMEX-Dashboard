"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getBumexEntity, isBumexEntityCode } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { asPerson } from "@/lib/work/db";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function assignEntityAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();

  if (auth.profile.entity_code) {
    redirect("/");
  }

  const entityCode = getString(formData, "entity_code");
  if (!isBumexEntityCode(entityCode)) {
    throw new Error("Invalid entity selection.");
  }

  const entity = getBumexEntity(entityCode);
  if (!entity?.available) {
    throw new Error("This entity cannot be selected from self-service onboarding.");
  }

  // set once, by the person (the database refuses a second time: 0008 work.person_guard)
  const assigned = await asPerson((tx) =>
    tx.run("update work.person set entity_code = $2 where id = $1 and entity_code is null", [auth.profile.id, entityCode]),
  ).catch((error: unknown) => {
    console.error("[select-entity:assign]", { message: error instanceof Error ? error.message : error, userId: auth.profile.id, requestedEntityCode: entityCode });
    return 0;
  });

  if (!assigned) {
    redirect(`/select-entity?error=${encodeURIComponent(normalizeEntityMutationError(null, entityCode, "The entity could not be assigned."))}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
