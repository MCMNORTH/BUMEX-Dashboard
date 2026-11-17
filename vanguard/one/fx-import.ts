// [bumex-one] Reading an exchange-rate file for Réglages › Taux de change (asked on 2026-11-17).
// Three layouts, found by their header row (wherever it is in the sheet):
//  - the BCM's daily reference rates as it publishes them (bcm.mr › Historique des cours de change, one sheet per year):
//    "Date | Devise | Cours…", Excel dates, MRU per quoted quantity (MAD per 100, the others we use per 1);
//  - the BCM site's export (the same page's "Télécharger"): "date | … | weight | … | currency | value | key | …", the
//    value MRU per `weight` units, the reference rate's rows ("coursChangeReference") kept, dates month first (1/30/24);
//  - a plain table: "date | currency | rate" (optional "to" and "source"), per 1 unit.
// Dates: Excel dates, ISO, or day/month/year — the order read from the file itself (a first number above 12: day first;
// a second above 12: month first). Before 2018 the BCM quotes old ouguiyas (MRO, 10 MRO = 1 MRU): its rows before then
// are left out rather than guessed. Only the currencies the books know (EUR, USD, MAD, MRU) are kept.

import type { Currency, FxRateInput } from '@bumex/domain';

export type FxSheet = { name: string; rows: unknown[][] };
export type FxFormat = 'bcm' | 'bcm-export' | 'table';
export type ParsedFxFile = {
  format: FxFormat | null;
  rows: FxRateInput[];
  skipped: { reason: string; count: number }[];
};

const KNOWN: Currency[] = ['MRU', 'EUR', 'USD', 'MAD'];
const BCM_QUANTITY: Partial<Record<Currency, number>> = { MAD: 100 }; // the BCM's quoted quantity in its yearly file (EUR, USD: 1)
const REDENOMINATION = '2018-01-01'; // 10 MRO = 1 MRU
const REFERENCE_KEY = 'courschangereference';

const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const blank = (v: unknown) => v === '' || v === null || v === undefined;

type Order = 'dmy' | 'mdy';
const TEXT_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

function isoDate(v: unknown, order: Order): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10); // Excel serial
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(TEXT_DATE);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const [day, month] = order === 'dmy' ? [a, b] : [b, a];
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// the order of a sheet's text dates, from the dates themselves
function orderOf(values: unknown[], fallback: Order): Order {
  for (const v of values) {
    const m = String(v ?? '').trim().match(TEXT_DATE);
    if (!m) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  return fallback;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Columns = { date: number; currency: number; rate: number; to?: number; source?: number; weight?: number; key?: number; format: FxFormat };

function header(row: unknown[]): Columns | null {
  const cells = row.map(fold);
  const at = (...names: string[]) => { const i = cells.findIndex((c) => names.includes(c)); return i >= 0 ? i : undefined; };
  const date = at('date');
  const currency = at('devise', 'currency', 'from');
  if (date === undefined || currency === undefined) return null;
  const bcmRate = cells.findIndex((c) => c.startsWith('cours'));
  if (bcmRate >= 0) return { date, currency, rate: bcmRate, format: 'bcm' };
  const weight = at('weight', 'quantite', 'quantity'), key = at('key');
  const value = at('value');
  if (value !== undefined && (weight !== undefined || key !== undefined)) return { date, currency, rate: value, weight, key, format: 'bcm-export' };
  const rate = at('rate', 'taux', 'value');
  if (rate === undefined) return null;
  return { date, currency, rate, to: at('to', 'vers'), source: at('source'), format: 'table' };
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
    const body = sheet.rows.slice(at + 1).filter((r): r is unknown[] => Array.isArray(r));
    const order = orderOf(body.map((r) => r[cols.date]), cols.format === 'bcm-export' ? 'mdy' : 'dmy');
    // the export holds the reference rate's rows among others: those only, when it has them
    const referenceOnly = cols.key !== undefined && body.some((r) => fold(r[cols.key!]) === REFERENCE_KEY);
    for (const r of body) {
      if (r.every(blank)) continue;
      const code = String(r[cols.currency] ?? '').trim().toUpperCase();
      if ((!code && blank(r[cols.date])) || (blank(r[cols.date]) && blank(r[cols.rate]))) continue; // an empty row of the template
      const date = isoDate(r[cols.date], order);
      const value = num(r[cols.rate]);
      if (!date || value === null) { skip('ligne illisible (date ou taux)'); continue; }
      if (referenceOnly && fold(r[cols.key!]) !== REFERENCE_KEY) { skip(`autre cours que le cours de référence (${String(r[cols.key!] ?? '').trim()})`); continue; }
      if (!KNOWN.includes(code as Currency)) { others.set(code || '—', (others.get(code || '—') ?? 0) + 1); continue; }
      const from = code as Currency;
      if (cols.format === 'table') {
        const to = cols.to !== undefined ? (String(r[cols.to] ?? '').trim().toUpperCase() || functional) : functional;
        const source = cols.source !== undefined ? String(r[cols.source] ?? '').trim() || undefined : undefined;
        rows.push({ date, from, to: to as Currency, rate: value, source });
        continue;
      }
      if (date < REDENOMINATION) { skip('avant 2018 : cours en anciennes ouguiyas (MRO)'); continue; }
      if (from === functional) continue;
      const quantity = cols.format === 'bcm-export' ? num(cols.weight !== undefined ? r[cols.weight] : 1) || 1 : BCM_QUANTITY[from] ?? 1;
      rows.push({ date, from, to: functional, rate: value / quantity, source: 'BCM' });
    }
  }
  const out = [...skipped].map(([reason, count]) => ({ reason, count }));
  if (others.size) out.unshift({ reason: `devises non tenues en comptabilité (${[...others.keys()].join(', ')})`, count: [...others.values()].reduce((a, b) => a + b, 0) });
  return { format, rows, skipped: out };
}
