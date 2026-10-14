"use server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { createClient } from "@/lib/firebase/server";
import { isLogoAppearance, isSidebarThemeId, type SidebarAppearance } from "@/lib/settings/appearance";

export async function updateSidebarAppearanceAction(
  appearance: SidebarAppearance,
): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();

  if (!isSidebarThemeId(appearance.sidebarTheme) || !isLogoAppearance(appearance.logoAppearance)) {
    return { error: "Unknown appearance option." };
  }

  const db = await createClient();

  if (!db) {
    return { error: "Firebase is not configured." };
  }

  // No revalidation: the shell already shows the new theme, and the layout reads
  // the profile again on the next full load.
  const { error } = await db
    .from("profiles")
    .update({
      sidebar_theme: appearance.sidebarTheme,
      logo_appearance: appearance.logoAppearance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.profile.id);

  return error ? { error: error.message } : {};
}
