import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { PageRefresh } from "@/components/layout/page-refresh";
import { requireRouteAccess } from "@/lib/auth/server";
import { movedToVanguard } from "@/lib/erp/vanguard/retired";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getOverviewDashboardData } from "@/lib/overview/service";

// Shown again from the browser's cache for 2 minutes; it revalidates in the
// background when the tickets, projects or finances it summarizes change.
export const unstable_dynamicStaleTime = 120;

export default async function OverviewPage() {
  await movedToVanguard("overview");
  const auth = await requireRouteAccess("overview");
  const [dashboardData, locale] = await Promise.all([
    getOverviewDashboardData(auth.role, auth.profile.id),
    getCurrentLocale(),
  ]);

  return (
    <>
      <PageRefresh tables={["tasks", "subtasks", "projects", "project_members", "project_workflows", "milestones", "invoices", "payments", "contracts", "profiles"]} />
      <OverviewDashboard data={dashboardData} role={auth.role} locale={locale} />
    </>
  );
}
