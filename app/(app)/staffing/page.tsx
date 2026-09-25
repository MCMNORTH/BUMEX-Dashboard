import { StaffingWorkspace } from "@/components/staffing/staffing-workspace";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getStaffingWorkspace } from "@/lib/staffing/service";
import { getTickets } from "@/lib/tickets/service";

export default async function StaffingPage({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string; project?: string; person?: string }> }) {
  const auth = await requireRouteAccess("staffing");
  const [data, locale, params, tickets] = await Promise.all([
    getStaffingWorkspace(),
    getCurrentLocale(),
    searchParams,
    getTickets(auth.role),
  ]);
  return <StaffingWorkspace {...data} tickets={tickets} locale={locale} created={params.created === "1"} updated={params.updated === "1"} error={params.error ?? ""} initialProjectId={params.project ?? ""} initialPersonId={params.person ?? ""} />;
}
