import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { requireRouteAccess } from "@/lib/auth/server";

// Settings change only when this user saves them, which refreshes the page.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsPreferencesPage() {
  const auth = await requireRouteAccess("settings");

  return (
    <PreferencesPanel
      emailNotifications={auth.profile.email_notifications !== false}
      email={auth.profile.email}
    />
  );
}
