import { redirect } from "next/navigation";

import { RolesOverview } from "@/components/settings/roles-overview";
import { requireRouteAccess } from "@/lib/auth/server";

export default async function SettingsRolesPage() {
  const auth = await requireRouteAccess("settings");
  if (auth.role !== "admin") {
    redirect("/settings");
  }

  return <RolesOverview />;
}
