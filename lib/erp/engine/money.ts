// Money helpers: amounts are JS numbers rounded to 2 decimals in the prototype
// (PostgreSQL numeric(20,2) in production). Every arithmetic result passes through r2().

export const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

export const sum = (xs: number[]): number => r2(xs.reduce((a, b) => a + b, 0));

export function fmt(x: number, decimals = 2): string {
  const neg = x < 0;
  const s = Math.abs(x).toFixed(decimals);
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−' : '') + grouped + (decimals ? ',' + dec : '');
}

export function parseAmount(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? r2(n) : null;
}

// Dates are ISO strings (YYYY-MM-DD) everywhere in the engine.
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

export const yearOf = (iso: string) => iso.slice(0, 4);
export const monthOf = (iso: string) => Number(iso.slice(5, 7));
export const endOfMonth = (iso: string) => addDays(addMonths(iso.slice(0, 8) + '01', 1), -1);

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
