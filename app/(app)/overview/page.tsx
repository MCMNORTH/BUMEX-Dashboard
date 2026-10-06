import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getOverviewDashboardData } from "@/lib/overview/service";

export default async function OverviewPage() {
  const auth = await requireRouteAccess("overview");
  const [dashboardData, locale] = await Promise.all([
    getOverviewDashboardData(auth.role, auth.profile.id),
    getCurrentLocale(),
  ]);

  return <OverviewDashboard data={dashboardData} role={auth.role} locale={locale} />;
}
