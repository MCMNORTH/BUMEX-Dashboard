"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

// CSV that Excel opens as is in French settings: UTF-8 with BOM, semicolons, decimal commas left to the cells.
export function toCsv(rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const text = typeof value === "number" ? String(value).replace(".", ",") : value;
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}

export function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function CsvButton({ label, fileName, rows }: { label: string; fileName: string; rows: (string | number)[][] }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => downloadCsv(fileName, rows)}>
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
