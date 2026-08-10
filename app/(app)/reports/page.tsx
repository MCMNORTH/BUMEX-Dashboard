import { FileText, FolderKanban, ShieldCheck, UsersRound } from "lucide-react";

import { StatCard } from "@/components/layout/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { ReportBuilder } from "@/components/reports/report-builder";
import { ReportPreview } from "@/components/reports/report-preview";
import { Badge } from "@/components/ui/badge";
import { requireRouteAccess } from "@/lib/auth/server";
import { formatNumber } from "@/lib/formatters";
import { getCurrentLocale } from "@/lib/i18n/server";
import { generateReport, getDefaultDateRange, getReportBuilderData } from "@/lib/reports/service";
import { frenchReportTypeLabels, reportTypeLabels } from "@/components/reports/report-type-selector";
import type { ReportBuilderFilters, ReportType } from "@/types/report";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeReportType(value: string | undefined, allowedTypes: ReportType[]): ReportType {
  if (value && allowedTypes.includes(value as ReportType)) {
    return value as ReportType;
  }

  return allowedTypes[0];
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("reports");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  const builderData = await getReportBuilderData(auth.role, auth.profile.id);
  const params = (await searchParams) ?? {};

  const type = normalizeReportType(getString(params.type), builderData.allowedTypes);
  const defaults = getDefaultDateRange(type);
  const filters: ReportBuilderFilters = {
    type,
    startDate: getString(params.start) ?? defaults.startDate,
    endDate: getString(params.end) ?? defaults.endDate,
    userId: auth.role === "employee" ? auth.profile.id : getString(params.user) ?? "",
    projectId: getString(params.project) ?? (type === "project_progress" ? builderData.projects[0]?.id ?? "" : ""),
    clientId: getString(params.client) ?? (type === "client_relationship" ? builderData.clients[0]?.id ?? "" : ""),
  };

  const targetUserId = auth.role === "employee" ? auth.profile.id : filters.userId || auth.profile.id;
  const projectId = type === "project_progress" || type === "project_status" ? filters.projectId : undefined;
  const clientId = type === "client_relationship" ? filters.clientId : undefined;
  const report = await generateReport(type, {
    role: auth.role,
    currentUserId: auth.profile.id,
    targetUserId,
    projectId,
    clientId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  return (
    <div className="space-y-6">
      <div className="print-hidden">
        <PageHeader
          eyebrow={isFr ? "Rapports" : "Reports"}
          title={
            auth.role === "shareholder"
              ? (isFr ? "Une surface structurée de reporting exécutif pour les synthèses delivery et portefeuille." : "A structured executive reporting surface for delivery and portfolio summaries.")
              : auth.role === "employee"
                ? (isFr ? "Un espace de reporting déterministe pour les synthèses quotidiennes et hebdomadaires." : "A deterministic reporting workspace for daily and weekly work summaries.")
                : (isFr ? "Un espace interne de reporting pour les synthèses quotidiennes, hebdomadaires, projet et exécutives." : "An internal reporting workspace for daily, weekly, project, and executive summaries.")
          }
          subtitle={
            auth.role === "shareholder"
              ? (isFr ? "Générez des synthèses actionnaires de haut niveau à partir de la progression delivery visible, des blocages et de la santé projet sans exposer les détails internes." : "Generate high-level shareholder summaries from visible delivery progress, blockers, and project health without exposing internal detail.")
              : auth.role === "employee"
                ? (isFr ? "Construisez vos propres synthèses delivery à partir du travail terminé, du focus actuel, des blocages, des éléments en retard et des priorités de court terme." : "Build your own delivery summaries from completed work, current focus, blockers, overdue items, and near-term priorities.")
                : (isFr ? "Générez des synthèses de travail fiables et répétables à partir des tickets, du planning, des projets et de l’historique d’activité grâce à des modèles déterministes." : "Generate fair, repeatable work summaries from tickets, planning, projects, and activity history using deterministic templates.")
          }
          badge={
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
              {auth.role === "shareholder" ? (isFr ? "Mode synthèse exécutive" : "Executive summary mode") : (isFr ? "Reporting basé sur des modèles" : "Template-based reporting")}
            </Badge>
          }
        />
      </div>

      <div className="print-hidden grid gap-4 xl:grid-cols-4">
        {[
          {
            icon: FileText,
            label: isFr ? "Rapport sélectionné" : "Selected report",
            value: isFr ? frenchReportTypeLabels[type] : reportTypeLabels[type],
            detail: isFr ? "Modèle actuellement affiché" : "Current template in preview",
          },
          {
            icon: UsersRound,
            label: isFr ? "Modèles autorisés" : "Allowed templates",
            value: formatNumber(builderData.allowedTypes.length),
            detail: isFr ? "Types de rapports disponibles pour ce rôle" : "Report types available for this role",
          },
          {
            icon: FolderKanban,
            label: isFr ? "Options projet" : "Project options",
            value: formatNumber(builderData.projects.length),
            detail: isFr ? "Périmètres projet visibles dans le générateur" : "Visible project scopes in builder",
          },
          {
            icon: ShieldCheck,
            label: isFr ? "Mode de génération" : "Generation mode",
            value: isFr ? "Déterministe" : "Deterministic",
            detail: isFr ? "Aucune IA payante ni service externe de génération" : "No paid AI or external generation service",
          },
        ].map(({ icon: Icon, label, value, detail }) => (
          <StatCard key={label} icon={Icon} label={label} value={value} detail={detail} />
        ))}
      </div>

      <div className="print-hidden">
        <ReportBuilder builderData={builderData} filters={filters} role={auth.role} isFr={isFr} />
      </div>
      <ReportPreview report={report} isFr={isFr} />
    </div>
  );
}
