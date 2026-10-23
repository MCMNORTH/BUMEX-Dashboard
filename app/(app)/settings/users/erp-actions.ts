"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { isBumexEntityCode } from "@/lib/entities/config";
import { canManageErpAccess, getErpAccess, removeErpAccess, saveErpAccess } from "@/lib/erp/access";
import { isErpModuleKey, isErpRole } from "@/lib/erp/config";
import { erpErrorMessage } from "@/lib/erp/db";
import { createClient } from "@/lib/firebase/server";

export type ErpAccessActionState = {
  error?: string;
  success?: string;
};

async function profileExists(userId: string) {
  const db = await createClient();

  if (!db) {
    return false;
  }

  const { data } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  return Boolean(data);
}

// Grants, changes or removes one person's ERP access (erp_role "none" removes it). BUMEX One roles are untouched.
export async function saveErpAccessAction(
  _prevState: ErpAccessActionState,
  formData: FormData,
): Promise<ErpAccessActionState> {
  try {
    const auth = await requireAuthenticatedUser();

    if (!canManageErpAccess(auth.profile, await getErpAccess(auth.profile.id))) {
      return { error: "Only the super admin or an ERP administrator can change ERP access." };
    }

    const userId = String(formData.get("user_id") ?? "").trim();
    const role = String(formData.get("erp_role") ?? "").trim();

    if (!userId || !(await profileExists(userId))) {
      return { error: "This person does not exist." };
    }

    if (role === "none") {
      await removeErpAccess(auth.profile, userId);
      revalidatePath("/", "layout");
      return { success: "ERP access removed." };
    }

    if (!isErpRole(role)) {
      return { error: "Choose an ERP role." };
    }

    const chosenEntities = formData.getAll("entity_codes").map(String);
    const entityCodes = formData.get("entities_mode") === "some" ? chosenEntities.filter(isBumexEntityCode) : null;
    if (entityCodes && (!entityCodes.length || entityCodes.length !== chosenEntities.length)) {
      return { error: "Choose at least one entity." };
    }

    const chosenModules = formData.getAll("modules").map(String);
    const modules = formData.get("modules_mode") === "some" ? chosenModules.filter(isErpModuleKey) : null;
    if (modules && modules.length !== chosenModules.length) {
      return { error: "Unknown ERP module." };
    }

    await saveErpAccess(auth.profile, userId, { role, entityCodes, modules });
    // The person's sidebar (ERP tab) and every ERP page depend on it.
    revalidatePath("/", "layout");
    return { success: "ERP access saved." };
  } catch (error) {
    console.error("[erp:access-save]", error instanceof Error ? error.message : error);
    return { error: erpErrorMessage(error, "The ERP access could not be saved.") };
  }
}
