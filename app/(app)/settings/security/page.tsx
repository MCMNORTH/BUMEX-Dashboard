import { redirect } from "next/navigation";

import { SecurityPanel } from "@/components/settings/security-panel";
import { requireAuthenticatedUser } from "@/lib/auth/server";

export default async function SettingsSecurityPage() {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile) {
    redirect("/login?error=profile-missing");
  }

  return <SecurityPanel email={auth.profile.email} />;
}
