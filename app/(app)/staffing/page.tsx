import { StaffingWorkspace } from "@/components/staffing/staffing-workspace";
import { requireRouteAccess } from "@/lib/auth/server";
import { movedToVanguard } from "@/lib/erp/vanguard/retired";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getStaffingWorkspace } from "@/lib/staffing/service";
import { getTickets } from "@/lib/tickets/service";
import { PageRefresh } from "@/components/layout/page-refresh";

// Cached for 5 minutes, revalidated when staffing, projects or people change.
export const unstable_dynamicStaleTime = 300;

export default async function StaffingPage({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string; project?: string; person?: string }> }) {
  await movedToVanguard("staffing");
  const auth = await requireRouteAccess("staffing");
  const [data, locale, params, tickets] = await Promise.all([
    getStaffingWorkspace(),
    getCurrentLocale(),
    searchParams,
    getTickets(auth.role),
  ]);
  return (
    <>
      <PageRefresh tables={["staffing_assignments", "projects", "profiles", "tasks"]} />
      <StaffingWorkspace {...data} tickets={tickets} locale={locale} created={params.created === "1"} updated={params.updated === "1"} error={params.error ?? ""} initialProjectId={params.project ?? ""} initialPersonId={params.person ?? ""} />
    </>
  );
}
