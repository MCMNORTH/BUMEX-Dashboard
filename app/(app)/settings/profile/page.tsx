import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { requireAuthenticatedUser } from "@/lib/auth/server";

// Settings change only when this user saves them, which refreshes the page.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsProfilePage() {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile) {
    redirect("/login?error=profile-missing");
  }

  return <ProfileSettingsForm profile={auth.profile} />;
}
