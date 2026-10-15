import { SettingsOverviewGrid } from "@/components/settings/settings-sections";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";

// Settings change only when this user saves them, which refreshes the page.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsPage() {
  const auth = await requireRouteAccess("settings");
  const locale = await getCurrentLocale();

  return <SettingsOverviewGrid isAdmin={auth.role === "admin"} locale={locale} />;
}
