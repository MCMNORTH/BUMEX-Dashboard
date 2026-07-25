export type CsvRow = Record<string, string | number | boolean | null | undefined>;

export function formatCSVValue(value: CsvRow[string]) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replaceAll('"', '""');
  return `"${normalized}"`;
}

export function exportToCSV(filename: string, rows: CsvRow[]) {
  const safeFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;

  if (!rows.length) {
    return {
      filename: safeFilename,
      csvContent: "",
    };
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((header) => formatCSVValue(header)).join(","),
    ...rows.map((row) => headers.map((header) => formatCSVValue(row[header])).join(",")),
  ];

  return {
    filename: safeFilename,
    csvContent: lines.join("\n"),
  };
}

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
