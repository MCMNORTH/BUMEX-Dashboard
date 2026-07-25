import { PrintButton } from "@/components/export/print-button";
import { PrintableReportWrapper } from "@/components/export/printable-report-wrapper";
import { SectionCard } from "@/components/layout/section-card";
import { CopyReportButton } from "@/components/reports/copy-report-button";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ReportSection } from "@/components/reports/report-section";
import type { ReportDocument } from "@/types/report";

export function ReportPreview({ report }: { report: ReportDocument }) {
  return (
    <SectionCard className="printable-surface print:border-0 print:bg-white print:shadow-none" contentClassName="space-y-5 px-6 py-6 print:px-0 print:py-0">
        <PrintableReportWrapper
          title={report.title}
          subtitle={`${report.scopeLabel} / ${report.subtitle}`}
          generatedAt={report.generatedAt}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase print:text-black/60">{report.scopeLabel}</p>
              <h2 className="text-2xl font-semibold tracking-tight print:text-black">{report.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground print:text-black/70">{report.subtitle}</p>
              <p className="text-sm leading-7 text-foreground/90 print:text-black">{report.summary}</p>
            </div>
            <div className="print-hidden flex items-center gap-2">
              <PrintButton />
              {report.csvRows?.length ? (
                <ExportCsvButton filename={report.csvFilename ?? `${report.type}.csv`} rows={report.csvRows} />
              ) : null}
              <CopyReportButton text={report.text} filename={`${report.type}-${report.generatedAt.slice(0, 10)}.txt`} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-1">
            {report.sections.map((section) => (
              <div key={section.key} className="print-break-inside-avoid">
                <ReportSection section={section} />
              </div>
            ))}
          </div>
        </PrintableReportWrapper>
    </SectionCard>
  );
}
