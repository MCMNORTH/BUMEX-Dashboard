import { AppearancePanel } from "@/components/settings/appearance-panel";
import { requireRouteAccess } from "@/lib/auth/server";

// Settings change only when this user saves them, which refreshes the page.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsAppearancePage() {
  await requireRouteAccess("settings");

  return <AppearancePanel />;
}
