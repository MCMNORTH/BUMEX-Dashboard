"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { getOverviewDashboardData, type OverviewDashboardData } from "@/lib/overview/service";

// Vanguard's "My day" panel (vanguard/one/MyDay.tsx): BUMEX One's overview for the signed-in person, without its
// finance figures (the ERP keeps the books now).
export type MyDayData = Pick<OverviewDashboardData, "unavailable" | "attentionProjects" | "attentionTickets" | "myTickets" | "signOff" | "upcoming" | "workload"> & {
  kpis: Pick<OverviewDashboardData["kpis"], "openTickets" | "attentionTickets" | "atRiskProjects" | "activeProjects">;
  me: string;
};

export async function myDayAction(): Promise<MyDayData> {
  const auth = await requireRouteAccess("overview");
  const data = await getOverviewDashboardData(auth.role, auth.profile.id);
  return {
    unavailable: data.unavailable,
    kpis: {
      openTickets: data.kpis.openTickets,
      attentionTickets: data.kpis.attentionTickets,
      atRiskProjects: data.kpis.atRiskProjects,
      activeProjects: data.kpis.activeProjects,
    },
    attentionProjects: data.attentionProjects,
    attentionTickets: data.attentionTickets,
    myTickets: data.myTickets,
    signOff: data.signOff,
    upcoming: data.upcoming.filter((item) => item.kind === "project" || item.kind === "ticket"),
    workload: data.workload,
    me: auth.profile.id,
  };
}
