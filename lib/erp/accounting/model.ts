// Accounting types and rules shared by the server and the pages (no server-only imports here).
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";
import type { BumexEntityCode } from "@/types/entity";

// Who does what, as in the ERP engine (core.ts / chart.ts / ledger.ts). The database checks posting, locking and
// closing again (0002, 0006); the rest is checked here.
export const POSTING_ROLES: readonly ErpRole[] = ["admin", "partner", "raf", "manager", "accountant"];
export const PARTNER_ROLES: readonly ErpRole[] = ["admin", "partner", "raf"];
// Chart, journals and fiscal years: the engine's [...PARTNER_ROLES, 'accountant', 'manager']
export const SETTINGS_ROLES: readonly ErpRole[] = POSTING_ROLES;

export type ChartTemplate = "PCM" | "CGNC" | "SYSCOHADA";
export type AccountKind = "asset" | "liability" | "equity" | "income" | "expense";
export type JournalKind = "sales" | "purchases" | "bank" | "cash" | "misc" | "assets" | "closing";
export type EntryStatus = "draft" | "posted" | "reversed";
export type PeriodStatus = "open" | "soft_closed" | "locked";
export type Dimension = "" | "customer" | "supplier" | "engagement";

export const CURRENCIES = ["MRU", "EUR", "USD", "MAD"] as const;

export type ErpEntity = {
  id: string;
  code: BumexEntityCode;
  name: string;
  country: string;
  currency: string;
  chartTemplate: ChartTemplate;
  codeLength: number;
};

export type FiscalYearOption = { id: string; label: string; start: string; end: string; isClosed: boolean };

export type AccountOption = {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  isPostable: boolean;
  active: boolean;
  isAuxiliary: boolean;
  dimension: Dimension;
};

export type JournalOption = { id: string; code: string; name: string; kind: JournalKind };

export type EntryLineInput = { accountId: string; description: string; debit: number; credit: number };

export type EntryInput = {
  entityCode: string;
  entryId?: string;
  journalId: string;
  date: string;
  description: string;
  currency: string;
  fxRate: number;
  lines: EntryLineInput[];
};

export type ActionResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

export const chartTemplateLabels: Record<ChartTemplate, Record<Locale, string>> = {
  PCM: { fr: "Plan comptable mauritanien", en: "Mauritanian chart (PCM)" },
  CGNC: { fr: "Plan comptable marocain (CGNC)", en: "Moroccan chart (CGNC)" },
  SYSCOHADA: { fr: "SYSCOHADA révisé", en: "Revised SYSCOHADA" },
};

export const accountKindLabels: Record<AccountKind, Record<Locale, string>> = {
  asset: { fr: "Actif", en: "Asset" },
  liability: { fr: "Passif", en: "Liability" },
  equity: { fr: "Capitaux propres", en: "Equity" },
  income: { fr: "Produit", en: "Income" },
  expense: { fr: "Charge", en: "Expense" },
};

export const journalKindLabels: Record<JournalKind, Record<Locale, string>> = {
  sales: { fr: "Ventes", en: "Sales" },
  purchases: { fr: "Achats", en: "Purchases" },
  bank: { fr: "Banque", en: "Bank" },
  cash: { fr: "Caisse", en: "Cash" },
  misc: { fr: "Opérations diverses", en: "Miscellaneous" },
  assets: { fr: "Immobilisations", en: "Fixed assets" },
  closing: { fr: "Clôture", en: "Closing" },
};

export const entryStatusLabels: Record<EntryStatus, Record<Locale, string>> = {
  draft: { fr: "Brouillon", en: "Draft" },
  posted: { fr: "Comptabilisée", en: "Posted" },
  reversed: { fr: "Extournée", en: "Reversed" },
};

export const periodStatusLabels: Record<PeriodStatus, Record<Locale, string>> = {
  open: { fr: "Ouverte", en: "Open" },
  soft_closed: { fr: "Clôture douce", en: "Soft-closed" },
  locked: { fr: "Verrouillée", en: "Locked" },
};

export const dimensionLabels: Record<Exclude<Dimension, "">, Record<Locale, string>> = {
  customer: { fr: "client", en: "customer" },
  supplier: { fr: "fournisseur", en: "supplier" },
  engagement: { fr: "mission", en: "engagement" },
};

// Amounts are numeric(20,2) in the database; every computed amount goes through r2, as in the engine.
export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function formatAmount(value: number, locale: Locale, decimals = 2) {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatDate(iso: string, locale: Locale) {
  const [y, m, d] = iso.split("-");
  return locale === "fr" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

// "1 234,50", "1234.5", "1 234" → 1234.5; empty → 0; anything else → null
export function parseAmount(text: string): number | null {
  const t = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "" || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? r2(n) : null;
}

// A short number is presented on the entity's length ("4100" → "410000"); roots (2 digits) are not padded.
export function presentCode(code: string, length: number) {
  const c = code.trim();
  if (!/^\d+$/.test(c) || c.length <= 2 || c.length >= length) return c;
  return c.padEnd(length, "0");
}

// "6310", "631000" or "631000 Honoraires" all find the same account on a six-digit chart
export function findAccount(accounts: AccountOption[], typed: string, codeLength: number) {
  const code = typed.trim().split(/\s/)[0] ?? "";
  if (!code) return undefined;
  const exact = accounts.find((a) => a.code === code);
  if (exact) return exact;
  const padded = presentCode(code, codeLength);
  const byPadded = accounts.find((a) => a.code === padded && !a.isAuxiliary);
  if (byPadded) return byPadded;
  const stripped = code.replace(/0+$/, "");
  return stripped.length >= 3 && stripped !== code ? accounts.find((a) => a.code === stripped && !a.isAuxiliary) : undefined;
}

export function canPost(role: ErpRole) {
  return POSTING_ROLES.includes(role);
}

// Accounting links carry the entity and fiscal year being looked at.
export function accountingHref(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
