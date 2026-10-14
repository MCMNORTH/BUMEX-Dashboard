import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { requireRouteAccess } from "@/lib/auth/server";

export default async function SettingsPreferencesPage() {
  const auth = await requireRouteAccess("settings");

  return (
    <PreferencesPanel
      emailNotifications={auth.profile.email_notifications !== false}
      email={auth.profile.email}
    />
  );
}
