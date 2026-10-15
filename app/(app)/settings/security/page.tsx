import { redirect } from "next/navigation";

import { SecurityPanel } from "@/components/settings/security-panel";
import { requireAuthenticatedUser } from "@/lib/auth/server";

// Settings change only when this user saves them, which refreshes the page.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsSecurityPage() {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile) {
    redirect("/login?error=profile-missing");
  }

  return <SecurityPanel email={auth.profile.email} />;
}
