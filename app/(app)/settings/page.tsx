import { SettingsOverviewGrid } from "@/components/settings/settings-sections";
import { requireRouteAccess } from "@/lib/auth/server";

export default async function SettingsPage() {
  const auth = await requireRouteAccess("settings");

  return <SettingsOverviewGrid isAdmin={auth.role === "admin"} />;
}
