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
  isFr = false,
}: {
  allowedTypes: ReportType[];
  value: ReportType;
  isFr?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="report-type" className="text-sm font-medium">{isFr ? "Type de rapport" : "Report type"}</label>
      <ModernSelect
        id="report-type"
        name="type"
        defaultValue={value}
        options={allowedTypes.map((type) => ({
          value: type,
          label: isFr ? frenchLabels[type] : labels[type],
        }))}
      />
    </div>
  );
}

export { labels as reportTypeLabels };

const frenchLabels: Record<ReportType, string> = {
  daily_individual: "Rapport individuel quotidien",
  weekly_individual: "Rapport individuel hebdomadaire",
  weekly_team: "Rapport d’équipe hebdomadaire",
  project_progress: "Rapport de progression du projet",
  project_status: "Rapport de statut du projet",
  finance_summary: "Rapport de synthèse financière",
  team_workload: "Rapport de charge de l’équipe",
  client_relationship: "Rapport de relation client",
  shareholder_executive: "Rapport exécutif actionnaires",
  shareholder_monthly: "Synthèse mensuelle actionnaires",
  shareholder_portfolio: "Rapport du portefeuille projets",
  shareholder_finance: "Rapport de synthèse financière",
  shareholder_risk: "Rapport roadmap et risques",
};

export { frenchLabels as frenchReportTypeLabels };
