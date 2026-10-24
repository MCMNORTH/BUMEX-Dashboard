// Reading a chart-of-accounts sheet (pure functions, tested in sheet.test.ts).
import type { ChartRow } from "@/lib/erp/engine";

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// Which sheet column is which, from its title (the columns of the export, in French or English, in any order).
export function columnOf(title: string): keyof ChartRow | null {
  const t = fold(title);
  if (/^(intitule|libelle|nom)\s*\(en\)|^name/.test(t)) return "nameEn";
  if (/^(numero|n°|no\b|code|compte|account)/.test(t)) return "code";
  if (/^(intitule|libelle|nom|label)/.test(t)) return "nameFr";
  if (/^(classe|class)/.test(t)) return "cls";
  if (/^(type|nature|kind)/.test(t)) return "kind";
  if (/^(imputable|postable)/.test(t)) return "postable";
  if (/^dimension/.test(t)) return "dimension";
  if (/^(actif|active)/.test(t)) return "active";
  return null;
}

// CSV as Excel writes it in French (semicolons) or English (commas) settings, or tab-separated; quotes and BOM handled.
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Header + rows → the engine's ChartRow; null when the two required columns are missing.
export function tableToChartRows(table: string[][]): ChartRow[] | null {
  const [header, ...rows] = table;
  const columns = (header ?? []).map(columnOf);
  if (!columns.includes("code") || !columns.includes("nameFr")) return null;
  return rows.map((cells) => {
    const out: ChartRow = { code: "", nameFr: "" };
    columns.forEach((key, i) => {
      if (key) out[key] = String(cells[i] ?? "").trim();
    });
    return out;
  });
}
