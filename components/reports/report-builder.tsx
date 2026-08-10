import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { SectionCard } from "@/components/layout/section-card";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ReportTypeSelector } from "@/components/reports/report-type-selector";
import type { ReportBuilderData, ReportBuilderFilters } from "@/types/report";

export function ReportBuilder({
  builderData,
  filters,
  role,
  isFr = false,
}: {
  builderData: ReportBuilderData;
  filters: ReportBuilderFilters;
  role: "admin" | "manager" | "supervisor" | "employee" | "shareholder";
  isFr?: boolean;
}) {
  const showUserSelector = role !== "shareholder";
  const showProjectSelector =
    (role === "admin" || role === "manager" || role === "supervisor")
    && (filters.type === "project_progress" || filters.type === "project_status");
  const showClientSelector = (role === "admin" || role === "manager") && filters.type === "client_relationship";

  return (
    <SectionCard
      eyebrow={isFr ? "Générateur de rapports" : "Report builder"}
      title={isFr ? "Espace de génération de rapports" : "Deterministic reporting workspace"}
      description={isFr ? "Créez des synthèses quotidiennes, hebdomadaires, projet et exécutives à partir des données visibles." : "Build daily, weekly, project, and shareholder-safe executive summaries from visible tickets, projects, planning, and approved activity history."}
      contentClassName="space-y-4 px-5 py-5"
    >
      <form className="grid gap-4 xl:grid-cols-2">
          <ReportTypeSelector allowedTypes={builderData.allowedTypes} value={filters.type} isFr={isFr} />
          <DateRangePicker startDate={filters.startDate} endDate={filters.endDate} isFr={isFr} />

          {showUserSelector ? (
            <div className="space-y-2">
              <label htmlFor="report-user" className="text-sm font-medium">{isFr ? "Personne" : "Person"}</label>
              <ModernSelect
                id="report-user"
                name="user"
                defaultValue={filters.userId}
                placeholder={isFr ? "Périmètre par défaut" : "Default scope"}
                options={[
                  { value: "", label: isFr ? "Périmètre par défaut" : "Default scope" },
                  ...builderData.users.map((user) => ({
                    value: user.id,
                    label: user.full_name,
                  })),
                ]}
              />
            </div>
          ) : (
            <input type="hidden" name="user" value={filters.userId} />
          )}

          {showProjectSelector ? (
            <div className="space-y-2">
              <label htmlFor="report-project" className="text-sm font-medium">{isFr ? "Projet" : "Project"}</label>
              <ModernSelect
                id="report-project"
                name="project"
                defaultValue={filters.projectId}
                placeholder={isFr ? "Périmètre par défaut" : "Default scope"}
                options={[
                  { value: "", label: isFr ? "Périmètre par défaut" : "Default scope" },
                  ...builderData.projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
                ]}
              />
            </div>
          ) : (
            <input type="hidden" name="project" value={filters.projectId} />
          )}

          {showClientSelector ? (
            <div className="space-y-2">
              <label htmlFor="report-client" className="text-sm font-medium">Client</label>
              <ModernSelect
                id="report-client"
                name="client"
                defaultValue={filters.clientId}
                placeholder={isFr ? "Périmètre par défaut" : "Default scope"}
                options={[
                  { value: "", label: isFr ? "Périmètre par défaut" : "Default scope" },
                  ...builderData.clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  })),
                ]}
              />
            </div>
          ) : (
            <input type="hidden" name="client" value={filters.clientId} />
          )}

          <div className="xl:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" className="rounded-2xl px-5">
              {isFr ? "Générer le rapport" : "Generate report"}
            </Button>
            <div className="rounded-[22px] border border-dashed border-border/70 bg-background/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {isFr ? "La rédaction assistée par IA sera proposée dans une prochaine version et n’est pas activée actuellement." : "AI-assisted report drafting is reserved as a future enhancement and is intentionally not enabled."}
            </div>
          </div>
        </form>
    </SectionCard>
  );
}
