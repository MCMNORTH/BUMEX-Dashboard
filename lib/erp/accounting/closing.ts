import "server-only";

import type { ErpTransaction } from "@/lib/erp/db";
import { AccountingError } from "@/lib/erp/accounting/errors";
import { PARTNER_ROLES, POSTING_ROLES, SETTINGS_ROLES, type PeriodStatus } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";

const say = (locale: Locale, fr: string, en: string) => (locale === "fr" ? fr : en);

export type PeriodRow = { id: string; periodNo: number; start: string; end: string; status: PeriodStatus; drafts: number };
export type YearRow = { id: string; label: string; isClosed: boolean; drafts: number; locked: number; periods: PeriodRow[] };

export async function listYears(tx: ErpTransaction, entityId: string): Promise<YearRow[]> {
  const years = await tx.query<Omit<YearRow, "periods" | "locked">>(
    `select fy.id, fy.label, fy.is_closed as "isClosed",
            (select count(*)::int from erp.journal_entry e where e.fiscal_year_id = fy.id and e.status = 'draft') as drafts
       from erp.fiscal_year fy where fy.entity_id = $1 order by fy.start_date desc`,
    [entityId],
  );
  const periods = await tx.query<PeriodRow & { fiscalYearId: string }>(
    `select p.id, p.fiscal_year_id as "fiscalYearId", p.period_no as "periodNo", p.start_date::text as start, p.end_date::text as "end",
            p.status::text as status,
            (select count(*)::int from erp.journal_entry e where e.period_id = p.id and e.status = 'draft') as drafts
       from erp.period p where p.entity_id = $1 and p.period_no <= 12 order by p.start_date`,
    [entityId],
  );
  return years.map((y) => {
    const own = periods.filter((p) => p.fiscalYearId === y.id);
    return { ...y, locked: own.filter((p) => p.status === "locked").length, periods: own };
  });
}

// Locking and unlocking are partner-level (the database checks too, with zero drafts to lock); a soft close only
// lets partner-level roles post in the period, and the posting roles may set or lift it.
export async function setPeriodStatus(tx: ErpTransaction, entityId: string, periodId: string, status: PeriodStatus, role: ErpRole, locale: Locale) {
  const [period] = await tx.query<{ status: PeriodStatus }>("select status::text as status from erp.period where id = $1 and entity_id = $2", [periodId, entityId]);
  if (!period) {
    throw new AccountingError(say(locale, "Période introuvable.", "Period not found."));
  }
  if ((status === "locked" || period.status === "locked") && !PARTNER_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Verrouiller ou déverrouiller une période : associés, RAF et administrateur.", "Locking or unlocking a period: partners, finance lead and administrator."));
  }
  if (!POSTING_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas de changer une période.", "Your ERP role cannot change a period."));
  }
  await tx.query("update erp.period set status = $2::erp.period_status where id = $1", [periodId, status]);
}

export async function setYearClosed(tx: ErpTransaction, entityId: string, yearId: string, closed: boolean, role: ErpRole, locale: Locale) {
  if (!PARTNER_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Clôturer ou rouvrir un exercice : associés, RAF et administrateur.", "Closing or reopening a fiscal year: partners, finance lead and administrator."));
  }
  const updated = await tx.query("update erp.fiscal_year set is_closed = $3 where id = $1 and entity_id = $2 returning id", [yearId, entityId, closed]);
  if (!updated.length) {
    throw new AccountingError(say(locale, "Exercice introuvable.", "Fiscal year not found."));
  }
}

export async function createYear(tx: ErpTransaction, entityId: string, year: number, role: ErpRole, locale: Locale) {
  if (!SETTINGS_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas de créer un exercice.", "Your ERP role cannot create a fiscal year."));
  }
  if (!Number.isInteger(year)) {
    throw new AccountingError(say(locale, "Année invalide.", "Invalid year."));
  }
  await tx.query("select erp.create_fiscal_year($1, $2::int)", [entityId, year]);
}
