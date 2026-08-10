import { PrintButton } from "@/components/export/print-button";
import { PrintableReportWrapper } from "@/components/export/printable-report-wrapper";
import { SectionCard } from "@/components/layout/section-card";
import { CopyReportButton } from "@/components/reports/copy-report-button";
import { ReportSection } from "@/components/reports/report-section";
import type { ReportDocument } from "@/types/report";

function localizeReportText(value: string, isFr: boolean) {
  if (!isFr) return value;

  return [
    ["Daily individual report", "Rapport individuel quotidien"],
    ["Weekly individual report", "Rapport individuel hebdomadaire"],
    ["Delivery summary for", "Synthèse de livraison du"],
    ["Completed work", "Travail terminé"],
    ["Ongoing work", "Travail en cours"],
    ["Upcoming priorities", "Priorités à venir"],
    ["No notable items in this section.", "Aucun élément notable dans cette section."],
    ["ticket(s) completed", "ticket(s) terminé(s)"],
    ["active update(s)", "mise(s) à jour active(s)"],
    ["blocker(s)", "blocage(s)"],
    ["upcoming priority item(s)", "priorité(s) à venir"],
    ["Generated from existing tickets, projects, planning, and activity history using deterministic templates.", "Généré à partir des tickets, projets, plannings et activités existantes à l’aide de modèles déterministes."],
  ].reduce((text, [from, to]) => text.replaceAll(from, to), value);
}

export function ReportPreview({ report, isFr = false }: { report: ReportDocument; isFr?: boolean }) {
  const title = localizeReportText(report.title, isFr);
  const subtitle = localizeReportText(report.subtitle, isFr);
  const scopeLabel = localizeReportText(report.scopeLabel, isFr);
  const summary = localizeReportText(report.summary, isFr);
  return (
    <SectionCard className="printable-surface print:border-0 print:bg-white print:shadow-none" contentClassName="space-y-5 px-6 py-6 print:px-0 print:py-0">
        <PrintableReportWrapper
          title={title}
          subtitle={`${scopeLabel} / ${subtitle}`}
          generatedAt={report.generatedAt}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase print:text-black/60">{scopeLabel}</p>
              <h2 className="text-2xl font-semibold tracking-tight print:text-black">{title}</h2>
              <p className="text-sm leading-6 text-muted-foreground print:text-black/70">{subtitle}</p>
              <p className="text-sm leading-7 text-foreground/90 print:text-black">{summary}</p>
            </div>
            <div className="print-hidden flex items-center gap-2">
              <PrintButton />
              <CopyReportButton text={report.text} filename={`${report.type}-${report.generatedAt.slice(0, 10)}.txt`} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-1">
            {report.sections.map((section) => (
              <div key={section.key} className="print-break-inside-avoid">
                <ReportSection section={{ ...section, title: localizeReportText(section.title, isFr), items: section.items.map((item) => localizeReportText(item, isFr)) }} />
              </div>
            ))}
          </div>
        </PrintableReportWrapper>
    </SectionCard>
  );
}
