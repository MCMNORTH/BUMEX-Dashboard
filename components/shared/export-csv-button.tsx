"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadCSV, exportToCSV, type CsvRow } from "@/lib/export/csv";

export function ExportCsvButton({
  filename,
  rows,
  disabled,
}: {
  filename: string;
  rows: CsvRow[];
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  return (
    <Button
      type="button"
      variant="secondary"
      className="rounded-full px-4"
      disabled={disabled || rows.length === 0}
      onClick={() => {
        try {
          const { filename: resolvedFilename, csvContent } = exportToCSV(filename, rows);
          downloadCSV(resolvedFilename, csvContent);
          setStatus("success");
          window.setTimeout(() => setStatus("idle"), 1800);
        } catch {
          setStatus("error");
          window.setTimeout(() => setStatus("idle"), 1800);
        }
      }}
    >
      <Download className="mr-2 size-4" />
      {status === "success" ? "Exported" : status === "error" ? "Export failed" : "Export CSV"}
    </Button>
  );
}
