import { redirect } from "next/navigation";

import { RolesOverview } from "@/components/settings/roles-overview";
import { requireRouteAccess } from "@/lib/auth/server";

// A fixed description of the roles.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsRolesPage() {
  const auth = await requireRouteAccess("settings");
  if (auth.role !== "admin") {
    redirect("/settings");
  }

  return <RolesOverview />;
}
