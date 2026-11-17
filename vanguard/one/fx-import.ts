// [bumex-one] Reading an exchange-rate file for Réglages › Taux de change (asked on 2026-11-17).
// Two layouts, found by their header row (wherever it is in the sheet):
//  - the BCM's daily reference rates as it publishes them (bcm.mr › Historique des cours de change, one sheet per year):
//    "Date | Devise | Cours…", Excel dates, MRU per quoted quantity (MAD per 100, the others we use per 1). Before 2018
//    the BCM quotes old ouguiyas (MRO, 10 MRO = 1 MRU): those rows are left out rather than guessed.
//  - a plain table: "date | currency | rate" (optional "to" and "source"), per 1 unit, dates ISO, dd/mm/yyyy or Excel.
// Only the currencies the books know (EUR, USD, MAD, MRU) are kept; the rest of the BCM's list is skipped.

import type { Currency, FxRateInput } from '@bumex/domain';

export type FxSheet = { name: string; rows: unknown[][] };
export type ParsedFxFile = {
  format: 'bcm' | 'table' | null;
  rows: FxRateInput[];
  skipped: { reason: string; count: number }[];
};

const KNOWN: Currency[] = ['MRU', 'EUR', 'USD', 'MAD'];
const BCM_QUANTITY: Partial<Record<Currency, number>> = { MAD: 100 }; // the BCM's quoted quantity (EUR, USD: 1)
const REDENOMINATION = '2018-01-01'; // 10 MRO = 1 MRU

const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function isoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10); // Excel serial
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Columns = { date: number; currency: number; rate: number; to?: number; source?: number; format: 'bcm' | 'table' };

function header(row: unknown[]): Columns | null {
  const cells = row.map(fold);
  const date = cells.findIndex((c) => c === 'date');
  const currency = cells.findIndex((c) => c === 'devise' || c === 'currency' || c === 'from');
  if (date < 0 || currency < 0) return null;
  const bcmRate = cells.findIndex((c) => c.startsWith('cours'));
  if (bcmRate >= 0) return { date, currency, rate: bcmRate, format: 'bcm' };
  const rate = cells.findIndex((c) => c === 'rate' || c === 'taux');
  if (rate < 0) return null;
  const to = cells.findIndex((c) => c === 'to' || c === 'vers');
  const source = cells.findIndex((c) => c === 'source');
  return { date, currency, rate, to: to >= 0 ? to : undefined, source: source >= 0 ? source : undefined, format: 'table' };
}

export function parseFxSheets(sheets: FxSheet[], functional: Currency = 'MRU'): ParsedFxFile {
  const rows: FxRateInput[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const others = new Map<string, number>(); // the currencies the books do not keep, one line for them all
  let format: ParsedFxFile['format'] = null;
  for (const sheet of sheets) {
    const at = sheet.rows.findIndex((r) => Array.isArray(r) && header(r) !== null);
    if (at < 0) continue;
    const cols = header(sheet.rows[at])!;
    format ??= cols.format;
    for (const r of sheet.rows.slice(at + 1)) {
      if (!Array.isArray(r) || r.every((c) => c === '' || c === null || c === undefined)) continue;
      const code = String(r[cols.currency] ?? '').trim().toUpperCase();
      const date = isoDate(r[cols.date]);
      const value = num(r[cols.rate]);
      const blank = (v: unknown) => v === '' || v === null || v === undefined;
      if ((!code && !date) || (blank(r[cols.date]) && blank(r[cols.rate]))) continue; // an empty row of the template
      if (!date || value === null) { skip('ligne illisible (date ou taux)'); continue; }
      if (!KNOWN.includes(code as Currency)) { others.set(code || '—', (others.get(code || '—') ?? 0) + 1); continue; }
      const from = code as Currency;
      if (cols.format === 'bcm') {
        if (date < REDENOMINATION) { skip('avant 2018 : cours en anciennes ouguiyas (MRO)'); continue; }
        if (from === functional) continue;
        rows.push({ date, from, to: functional, rate: value / (BCM_QUANTITY[from] ?? 1), source: 'BCM' });
      } else {
        const to = cols.to !== undefined ? (String(r[cols.to] ?? '').trim().toUpperCase() || functional) : functional;
        const source = cols.source !== undefined ? String(r[cols.source] ?? '').trim() || undefined : undefined;
        rows.push({ date, from, to: to as Currency, rate: value, source });
      }
    }
  }
  const out = [...skipped].map(([reason, count]) => ({ reason, count }));
  if (others.size) out.unshift({ reason: `devises non tenues en comptabilité (${[...others.keys()].join(', ')})`, count: [...others.values()].reduce((a, b) => a + b, 0) });
  return { format, rows, skipped: out };
}
