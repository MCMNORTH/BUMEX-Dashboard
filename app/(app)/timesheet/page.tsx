import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getAdminTimesheetOverview, getTimesheet } from "@/lib/timesheet/service";
import { weekBounds } from "@/lib/timesheet/validation";
import { TimesheetView } from "@/components/timesheet/timesheet-view";
import { AdminTimesheetOverview } from "@/components/timesheet/admin-timesheet-overview";

export default async function TimesheetPage({ searchParams }: {
  searchParams: Promise<{ week?: string; mode?: string; project?: string; mission?: string; date?: string }>;
}) {
  const auth = await requireRouteAccess("timesheet");
  const [params, locale] = await Promise.all([searchParams, getCurrentLocale()]);
  const today = new Date().toISOString().slice(0, 10);
  const bounds = (typeof params.week === "string" ? weekBounds(params.week) : null) ?? weekBounds(today)!;
  if ((auth.role === "admin" || auth.role === "manager") && params.mode !== "mine") {
    const { profiles, entries, statuses, events } = await getAdminTimesheetOverview(bounds.start);
    return <AdminTimesheetOverview profiles={profiles} entries={entries} statuses={statuses} events={events} week={bounds.start} days={bounds.days} today={today} locale={locale} companyWide={auth.role === "admin"} />;
  }
  const { entries, projects, missions, favorites, weekStatus, events } = await getTimesheet(bounds.start);
  return <TimesheetView key={bounds.start} entries={entries} projects={projects} missions={missions} favorites={favorites} weekStatus={weekStatus} events={events} week={bounds.start} days={bounds.days} today={today} locale={locale} weeklyCapacityHours={auth.profile.weekly_capacity_hours} initialProjectId={params.project} initialMission={params.mission} initialDate={params.date} />;
}
