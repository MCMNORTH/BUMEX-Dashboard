import { AppearancePanel } from "@/components/settings/appearance-panel";
import { requireRouteAccess } from "@/lib/auth/server";

export default async function SettingsAppearancePage() {
  await requireRouteAccess("settings");

  return <AppearancePanel />;
}
