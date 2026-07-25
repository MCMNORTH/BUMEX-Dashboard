import type { ReportType } from "@/types/report";
import { ModernSelect } from "@/components/ui/modern-select";

const labels: Record<ReportType, string> = {
  daily_individual: "Daily individual report",
  weekly_individual: "Weekly individual report",
  weekly_team: "Weekly team report",
  project_progress: "Project progress report",
  project_status: "Project status report",
  finance_summary: "Finance summary report",
  team_workload: "Team workload report",
  client_relationship: "Client relationship report",
  shareholder_executive: "Shareholder executive report",
  shareholder_monthly: "Monthly shareholder summary",
  shareholder_portfolio: "Project portfolio report",
  shareholder_finance: "Financial summary report",
  shareholder_risk: "Roadmap and risks report",
};

export function ReportTypeSelector({
  allowedTypes,
  value,
}: {
  allowedTypes: ReportType[];
  value: ReportType;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="report-type" className="text-sm font-medium">Report type</label>
      <ModernSelect
        id="report-type"
        name="type"
        defaultValue={value}
        options={allowedTypes.map((type) => ({
          value: type,
          label: labels[type],
        }))}
      />
    </div>
  );
}

export { labels as reportTypeLabels };
