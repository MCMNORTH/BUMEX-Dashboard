import type { Locale } from "@/lib/i18n/config";

export const bumexEntityCodes = [
  "bumex_holding",
  "bumex_sa",
  "bumex_audit",
  "bumex_mauritanie",
  "bumex_maroc",
  "bumex_advisory",
  "bumex_avocat",
  "bumex_it",
] as const;

export type BumexEntityCode = (typeof bumexEntityCodes)[number];

// The test floor (BUMEX Testing, the basement; migration 0011): an ERP entity nobody belongs to, given apart in the
// permissions page. It is not a BUMEX entity a person chooses as theirs.
export const bumexTestEntityCode = "bumex_testing";
export type ErpEntityCode = BumexEntityCode | typeof bumexTestEntityCode;

export const DEFAULT_BUMEX_ENTITY_CODE: BumexEntityCode = "bumex_it";

export type LocalizedEntityCopy = Record<Locale, string>;

export type BumexEntity = {
  code: BumexEntityCode;
  shortLabel: string;
  name: string;
  logoPath: string | null;
  billingName?: string;
  title: LocalizedEntityCopy;
  description: LocalizedEntityCopy;
  primaryColor: string;
  secondaryColor: string;
  available: boolean;
};
