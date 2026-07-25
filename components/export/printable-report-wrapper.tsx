import type { ReactNode } from "react";

import { ReportPrintHeader } from "@/components/export/report-print-header";

export function PrintableReportWrapper({
  title,
  subtitle,
  generatedAt,
  children,
}: {
  title: string;
  subtitle?: string | null;
  generatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="printable-report space-y-5 print:space-y-6">
      <ReportPrintHeader title={title} subtitle={subtitle} generatedAt={generatedAt} />
      {children}
    </div>
  );
}
