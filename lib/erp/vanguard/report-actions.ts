"use server";

import { requireRouteAccess } from "@/lib/auth/server";
import { generateReport, getDefaultDateRange, getReportBuilderData } from "@/lib/reports/service";
import type { ReportBuilderData, ReportBuilderFilters, ReportDocument, ReportType } from "@/types/report";

// The activity reports in Vanguard's Reports room (vanguard/one/ActivityReports.tsx): BUMEX One's work summaries,
// built with BUMEX One's report code and the person's rights (an employee reports on their own work). The finance
// templates are left out: BUMEX One's finance records are an archive and the ERP has its own reports.
const ARCHIVED_FINANCE_REPORTS: ReportType[] = ["finance_summary", "shareholder_finance"];

export async function activityReportOptionsAction(): Promise<ReportBuilderData & { me: string; canChoosePerson: boolean }> {
  const auth = await requireRouteAccess("reports");
  const data = await getReportBuilderData(auth.role, auth.profile.id);
  return {
    ...data,
    allowedTypes: data.allowedTypes.filter((type) => !ARCHIVED_FINANCE_REPORTS.includes(type)),
    me: auth.profile.id,
    canChoosePerson: auth.role !== "employee",
  };
}

export async function defaultReportRangeAction(type: ReportType) {
  return getDefaultDateRange(type);
}

export async function activityReportAction(filters: ReportBuilderFilters): Promise<ReportDocument | { error: string }> {
  const auth = await requireRouteAccess("reports");
  const data = await getReportBuilderData(auth.role, auth.profile.id);
  if (!data.allowedTypes.includes(filters.type) || ARCHIVED_FINANCE_REPORTS.includes(filters.type)) {
    return { error: "This report is not available." };
  }
  return generateReport(filters.type, {
    role: auth.role,
    currentUserId: auth.profile.id,
    targetUserId: auth.role === "employee" ? auth.profile.id : filters.userId || auth.profile.id,
    projectId: filters.type === "project_progress" || filters.type === "project_status" ? filters.projectId : undefined,
    clientId: filters.type === "client_relationship" ? filters.clientId : undefined,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });
}
