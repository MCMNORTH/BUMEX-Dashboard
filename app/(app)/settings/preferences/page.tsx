import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { requireRouteAccess } from "@/lib/auth/server";

export default async function SettingsPreferencesPage() {
  await requireRouteAccess("settings");

  return <PreferencesPanel />;
}
