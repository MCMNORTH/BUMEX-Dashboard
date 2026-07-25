import { PlanningRiskPanelServer } from "@/components/alerts/planning-risk-panel-server";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { requireRouteAccess } from "@/lib/auth/server";
import { getOverviewDashboardData } from "@/lib/overview/service";

export default async function OverviewPage() {
  const auth = await requireRouteAccess("overview");
  const dashboardData = await getOverviewDashboardData(auth.role, auth.profile.id);

  return (
    <div className="space-y-8">
      <OverviewDashboard dashboardData={dashboardData} />
      <PlanningRiskPanelServer role={auth.role} profileId={auth.profile.id} />
    </div>
  );
}
