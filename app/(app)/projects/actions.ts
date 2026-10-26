"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { deleteProject } from "@/lib/projects/service";

/** Deleting a mission from BUMEX Vanguard (vanguard/one/Mission.tsx). */
export async function removeProjectAction(projectId: string): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireRouteAccess("projects");
  const fr = (await getCurrentLocale()) === "fr";
  if (!projectId || (auth.role !== "admin" && !isManagerLikeRole(auth.role))) {
    return { error: fr ? "Vous ne pouvez pas supprimer ce projet." : "You cannot delete this project." };
  }
  try {
    await deleteProject(String(projectId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (message === "invoiced") {
      return { error: fr ? "Cette mission est facturée ou comptabilisée : elle reste (annulez-la plutôt)." : "This mission is invoiced or posted: it stays (cancel it instead)." };
    }
    if (code === "23503") {
      return { error: fr ? "Cette mission a du temps saisi ou des archives : elle reste (annulez-la plutôt)." : "This mission has time entries or archives: it stays (cancel it instead)." };
    }
    return { error: fr ? "Vous ne pouvez pas supprimer ce projet." : "You cannot delete this project." };
  }
  return { success: true };
}
