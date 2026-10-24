import "server-only";

import type { ErpTransaction } from "@/lib/erp/db";
import { AccountingError } from "@/lib/erp/accounting/errors";
import {
  PARTNER_ROLES,
  POSTING_ROLES,
  formatAmount,
  r2,
  type AccountOption,
  type Dimension,
  type EntryInput,
  type EntryStatus,
  type ErpEntity,
  type JournalOption,
  type JournalKind,
} from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";

const say = (locale: Locale, fr: string, en: string) => (locale === "fr" ? fr : en);

export async function listAccounts(tx: ErpTransaction, entityId: string): Promise<AccountOption[]> {
  const rows = await tx.query<{
    id: string; code: string; name: string; kind: AccountOption["kind"]; is_postable: boolean; active: boolean; is_auxiliary: boolean;
    requires_customer: boolean; requires_supplier: boolean; requires_engagement: boolean;
  }>(
    `select id, code, name_fr as name, kind::text as kind, is_postable, active, is_auxiliary, requires_customer, requires_supplier, requires_engagement
       from erp.account where entity_id = $1 order by is_auxiliary, code`,
    [entityId],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    isPostable: r.is_postable,
    active: r.active,
    isAuxiliary: r.is_auxiliary,
    dimension: (r.requires_customer ? "customer" : r.requires_supplier ? "supplier" : r.requires_engagement ? "engagement" : "") as Dimension,
  }));
}

export async function listJournals(tx: ErpTransaction, entityId: string): Promise<JournalOption[]> {
  return tx.query<JournalOption>("select id, code, name, kind::text as kind from erp.journal where entity_id = $1 and active order by code", [entityId]);
}

export type EntryListRow = {
  id: string;
  journalCode: string;
  entryNo: number | null;
  date: string;
  description: string;
  sourceType: string;
  status: EntryStatus;
  total: number;
  lines: number;
};

export async function listEntries(
  tx: ErpTransaction,
  entityId: string,
  filters: { fiscalYearId?: string; journalId?: string; status?: EntryStatus; limit?: number },
): Promise<EntryListRow[]> {
  return tx.query<EntryListRow>(
    `select e.id, j.code as "journalCode", e.entry_no as "entryNo", e.entry_date::text as date, e.description,
            e.source_type as "sourceType", e.status::text as status,
            coalesce(sum(l.debit), 0)::float8 as total, count(l.id)::int as lines
       from erp.journal_entry e
       join erp.journal j on j.id = e.journal_id
       left join erp.journal_line l on l.entry_id = e.id
      where e.entity_id = $1
        and ($2::uuid is null or e.fiscal_year_id = $2)
        and ($3::uuid is null or e.journal_id = $3)
        and ($4::text is null or e.status::text = $4)
      group by e.id, j.code
      order by (e.status = 'draft') desc, e.entry_date desc, e.chain_seq desc nulls first, e.created_at desc
      limit $5`,
    [entityId, filters.fiscalYearId ?? null, filters.journalId ?? null, filters.status ?? null, filters.limit ?? 300],
  );
}

export type EntryLineDetail = {
  lineNo: number;
  accountId: string;
  code: string;
  name: string;
  description: string;
  currency: string;
  fxRate: number;
  debitTxn: number;
  creditTxn: number;
  debit: number;
  credit: number;
};

export type EntryDetail = {
  id: string;
  entityId: string;
  journalId: string;
  journalCode: string;
  journalKind: JournalKind;
  fiscalYearLabel: string;
  periodNo: number;
  date: string;
  status: EntryStatus;
  description: string;
  currency: string;
  fxRate: number;
  entryNo: number | null;
  postedAt: string | null;
  postedBy: string | null;
  hash: string | null;
  sourceType: string;
  reversalOfId: string | null;
  reversedById: string | null;
  lines: EntryLineDetail[];
};

export async function getEntry(tx: ErpTransaction, entryId: string): Promise<EntryDetail | null> {
  const [head] = await tx.query<Omit<EntryDetail, "lines">>(
    `select e.id, e.entity_id as "entityId", e.journal_id as "journalId", j.code as "journalCode", j.kind::text as "journalKind",
            fy.label as "fiscalYearLabel", p.period_no as "periodNo", e.entry_date::text as date, e.status::text as status,
            e.description, e.currency, e.fx_rate::float8 as "fxRate", e.entry_no as "entryNo",
            to_char(e.posted_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as "postedAt", e.posted_by as "postedBy",
            encode(e.hash, 'hex') as hash, e.source_type as "sourceType", e.reversal_of_id as "reversalOfId", e.reversed_by_id as "reversedById"
       from erp.journal_entry e
       join erp.journal j on j.id = e.journal_id
       join erp.fiscal_year fy on fy.id = e.fiscal_year_id
       join erp.period p on p.id = e.period_id
      where e.id = $1`,
    [entryId],
  );
  if (!head) {
    return null;
  }
  const lines = await tx.query<EntryLineDetail>(
    `select l.line_no as "lineNo", l.account_id as "accountId", a.code, a.name_fr as name, l.description, l.currency,
            l.fx_rate::float8 as "fxRate", l.debit_txn::float8 as "debitTxn", l.credit_txn::float8 as "creditTxn",
            l.debit::float8 as debit, l.credit::float8 as credit
       from erp.journal_line l join erp.account a on a.id = l.account_id
      where l.entry_id = $1 order by l.line_no`,
    [entryId],
  );
  return { ...head, lines };
}

type BuiltLine = { line_no: number; account_id: string; description: string; currency: string; fx_rate: number; debit_txn: number; credit_txn: number; debit: number; credit: number };

// Functional amounts are rounded line by line; when the transaction-currency entry balances, a cent of difference
// is pushed to the last line so the functional entry balances exactly too (the engine's squareRounding).
function squareRounding(lines: BuiltLine[]) {
  const diff = r2(lines.reduce((a, l) => a + l.debit, 0) - lines.reduce((a, l) => a + l.credit, 0));
  if (diff === 0 || Math.abs(diff) > 0.05) return lines;
  const last = lines[lines.length - 1];
  if (last.credit > 0) last.credit = r2(last.credit + diff);
  else last.debit = r2(last.debit - diff);
  return lines;
}

// Creates or updates a draft. Its period and fiscal year come from the date: any open fiscal year accepts entries,
// whatever today's date (past years are keyed in from the ERP).
export async function saveDraft(tx: ErpTransaction, entity: ErpEntity, input: EntryInput, locale: Locale): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new AccountingError(say(locale, "Date invalide.", "Invalid date."));
  }
  const [period] = await tx.query<{ id: string; fiscal_year_id: string }>(
    `select id, fiscal_year_id from erp.period
      where entity_id = $1 and $2::date between start_date and end_date and period_no <= 12 order by period_no limit 1`,
    [entity.id, input.date],
  );
  if (!period) {
    const year = input.date.slice(0, 4);
    throw new AccountingError(say(locale, `Aucun exercice ${year} pour ${entity.name} : créez-le d'abord (onglet Clôture).`, `No ${year} fiscal year for ${entity.name}: create it first (Closing tab).`));
  }
  const [journal] = await tx.query("select id from erp.journal where id = $1 and entity_id = $2", [input.journalId, entity.id]);
  if (!journal) {
    throw new AccountingError(say(locale, "Journal inconnu.", "Unknown journal."));
  }
  const currency = input.currency.trim().toUpperCase();
  const rate = currency === entity.currency ? 1 : Number(input.fxRate);
  if (!/^[A-Z]{3}$/.test(currency) || !(rate > 0)) {
    throw new AccountingError(say(locale, "Devise ou taux de change invalide.", "Invalid currency or exchange rate."));
  }

  const kept = input.lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
  if (!kept.length) {
    throw new AccountingError(say(locale, "Aucune ligne avec un compte et un montant.", "No line with an account and an amount."));
  }
  for (const l of kept) {
    if (l.debit < 0 || l.credit < 0 || (l.debit > 0 && l.credit > 0)) {
      throw new AccountingError(say(locale, "Une ligne porte soit un débit, soit un crédit, positif.", "A line carries either a debit or a credit, positive."));
    }
  }
  const accountIds = [...new Set(kept.map((l) => l.accountId))];
  const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from erp.account where entity_id = $1 and id = any($2::uuid[])", [entity.id, accountIds]);
  if (n !== accountIds.length) {
    throw new AccountingError(say(locale, "Un compte n'appartient pas au plan de cette entité.", "An account is not in this entity's chart."));
  }

  const description = input.description.trim() || "Écriture manuelle";
  const lines = squareRounding(
    kept.map((l, i) => {
      const debitTxn = r2(l.debit);
      const creditTxn = r2(l.credit);
      return {
        line_no: i + 1,
        account_id: l.accountId,
        description: l.description.trim() || description,
        currency,
        fx_rate: rate,
        debit_txn: debitTxn,
        credit_txn: creditTxn,
        debit: r2(debitTxn * rate),
        credit: r2(creditTxn * rate),
      };
    }),
  );

  let entryId = input.entryId;
  if (entryId) {
    const [existing] = await tx.query<{ status: EntryStatus; entity_id: string }>("select status::text as status, entity_id from erp.journal_entry where id = $1", [entryId]);
    if (!existing || existing.entity_id !== entity.id) {
      throw new AccountingError(say(locale, "Écriture introuvable.", "Entry not found."));
    }
    if (existing.status !== "draft") {
      throw new AccountingError(say(locale, "Écriture comptabilisée : elle ne change plus (passer par une extourne).", "Posted entry: it no longer changes (reverse it instead)."));
    }
    await tx.query(
      `update erp.journal_entry set journal_id = $2, fiscal_year_id = $3, period_id = $4, entry_date = $5, description = $6, currency = $7, fx_rate = $8
        where id = $1`,
      [entryId, input.journalId, period.fiscal_year_id, period.id, input.date, description, currency, rate],
    );
    await tx.query("delete from erp.journal_line where entry_id = $1", [entryId]);
  } else {
    [{ id: entryId }] = await tx.query<{ id: string }>(
      `insert into erp.journal_entry (entity_id, journal_id, fiscal_year_id, period_id, entry_date, description, currency, fx_rate, source_type)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'manual') returning id`,
      [entity.id, input.journalId, period.fiscal_year_id, period.id, input.date, description, currency, rate],
    );
  }
  await tx.query(
    `insert into erp.journal_line (entry_id, line_no, account_id, description, currency, fx_rate, debit_txn, credit_txn, debit, credit)
     select $1, r.line_no, r.account_id, r.description, r.currency, r.fx_rate, r.debit_txn, r.credit_txn, r.debit, r.credit
       from jsonb_to_recordset($2::jsonb) as r(line_no smallint, account_id uuid, description text, currency text, fx_rate numeric,
                                               debit_txn numeric, credit_txn numeric, debit numeric, credit numeric)`,
    [entryId, JSON.stringify(lines)],
  );
  return entryId!;
}

// What would stop the posting, in words (the engine's checkPostable). The database checks all of it again.
export async function postChecks(tx: ErpTransaction, entryId: string, role: ErpRole, locale: Locale): Promise<string[]> {
  const [e] = await tx.query<{
    status: EntryStatus; entity_id: string; entry_date: string; start_date: string; end_date: string; period_status: string; period_no: number;
    fy_closed: boolean; fy_label: string; currency: string;
  }>(
    `select e.status::text as status, e.entity_id, e.entry_date::text as entry_date, p.start_date::text as start_date, p.end_date::text as end_date,
            p.status::text as period_status, p.period_no, fy.is_closed as fy_closed, fy.label as fy_label, e.currency
       from erp.journal_entry e join erp.period p on p.id = e.period_id join erp.fiscal_year fy on fy.id = e.fiscal_year_id
      where e.id = $1`,
    [entryId],
  );
  if (!e) return [say(locale, "Écriture introuvable.", "Entry not found.")];
  const lines = await tx.query<{
    line_no: number; debit: string; credit: string; debit_txn: string; credit_txn: string; customer_id: string | null; supplier_id: string | null;
    engagement_id: string | null; code: string; entity_id: string; is_postable: boolean; active: boolean; is_blocked: boolean;
    requires_customer: boolean; requires_supplier: boolean; requires_engagement: boolean; requires_counterparty: boolean;
  }>(
    `select l.line_no, l.debit, l.credit, l.debit_txn, l.credit_txn, l.customer_id, l.supplier_id, l.engagement_id, a.code, a.entity_id,
            a.is_postable, a.active, a.is_blocked, a.requires_customer, a.requires_supplier, a.requires_engagement, a.requires_counterparty
       from erp.journal_line l join erp.account a on a.id = l.account_id where l.entry_id = $1 order by l.line_no`,
    [entryId],
  );

  const out: string[] = [];
  if (e.status !== "draft") out.push(say(locale, "Déjà comptabilisée.", "Already posted."));
  const d = r2(lines.reduce((a, l) => a + Number(l.debit), 0));
  const c = r2(lines.reduce((a, l) => a + Number(l.credit), 0));
  if (!lines.length || (d === 0 && c === 0)) out.push(say(locale, "Aucune ligne.", "No line."));
  if (d !== c) out.push(say(locale, `Déséquilibrée : débit ${formatAmount(d, locale)} / crédit ${formatAmount(c, locale)}.`, `Unbalanced: debit ${formatAmount(d, locale)} / credit ${formatAmount(c, locale)}.`));
  const dt = r2(lines.reduce((a, l) => a + Number(l.debit_txn), 0));
  const ct = r2(lines.reduce((a, l) => a + Number(l.credit_txn), 0));
  if (dt !== ct) out.push(say(locale, `Déséquilibrée en ${e.currency}.`, `Unbalanced in ${e.currency}.`));
  for (const l of lines) {
    const at = say(locale, `Ligne ${l.line_no} · ${l.code}`, `Line ${l.line_no} · ${l.code}`);
    if (l.entity_id !== e.entity_id) out.push(say(locale, `${at} : compte d'une autre entité.`, `${at}: account of another entity.`));
    if (!l.is_postable) out.push(say(locale, `${at} : compte de regroupement, non imputable.`, `${at}: grouping account, not postable.`));
    if (!l.active || l.is_blocked) out.push(say(locale, `${at} : compte désactivé.`, `${at}: inactive account.`));
    if (l.requires_customer && !l.customer_id) out.push(say(locale, `${at} : exige un client (saisie depuis le module Clients).`, `${at}: needs a customer (entered from the Customers module).`));
    else if (l.requires_supplier && !l.supplier_id) out.push(say(locale, `${at} : exige un fournisseur (saisie depuis le module Fournisseurs).`, `${at}: needs a supplier (entered from the Suppliers module).`));
    else if (l.requires_counterparty && !l.customer_id && !l.supplier_id) out.push(say(locale, `${at} : exige un tiers.`, `${at}: needs a third party.`));
    if (l.requires_engagement && !l.engagement_id) out.push(say(locale, `${at} : exige une mission.`, `${at}: needs an engagement.`));
  }
  if (e.entry_date < e.start_date || e.entry_date > e.end_date) out.push(say(locale, "Date hors de la période.", "Date outside the period."));
  if (e.period_status === "locked") out.push(say(locale, `Période ${e.period_no}/${e.fy_label} verrouillée.`, `Period ${e.period_no}/${e.fy_label} is locked.`));
  if (e.period_status === "soft_closed" && !PARTNER_ROLES.includes(role)) out.push(say(locale, `Période ${e.period_no}/${e.fy_label} en clôture douce : associés, RAF et administrateur uniquement.`, `Period ${e.period_no}/${e.fy_label} is soft-closed: partners, finance lead and administrator only.`));
  if (e.fy_closed) out.push(say(locale, `Exercice ${e.fy_label} clôturé.`, `Fiscal year ${e.fy_label} is closed.`));
  if (!POSTING_ROLES.includes(role)) out.push(say(locale, "Votre rôle ERP ne permet pas de comptabiliser.", "Your ERP role cannot post entries."));
  return out;
}

export async function postEntry(tx: ErpTransaction, entryId: string, role: ErpRole, locale: Locale): Promise<{ entryNo: number; journalCode: string }> {
  const problems = await postChecks(tx, entryId, role, locale);
  if (problems.length) {
    throw new AccountingError(problems.join(" · "));
  }
  const [posted] = await tx.query<{ entry_no: number; code: string }>(
    `update erp.journal_entry e set status = 'posted' from erp.journal j
      where e.id = $1 and e.status = 'draft' and j.id = e.journal_id returning e.entry_no, j.code`,
    [entryId],
  );
  if (!posted) {
    throw new AccountingError(say(locale, "Écriture introuvable ou déjà comptabilisée.", "Entry not found or already posted."));
  }
  return { entryNo: posted.entry_no, journalCode: posted.code };
}

export async function deleteDraft(tx: ErpTransaction, entryId: string, locale: Locale) {
  const deleted = await tx.query("delete from erp.journal_entry where id = $1 and status = 'draft' returning id", [entryId]);
  if (!deleted.length) {
    throw new AccountingError(say(locale, "Seul un brouillon peut être supprimé.", "Only a draft can be deleted."));
  }
}

// The only correction of a posted entry: a mirror entry, posted on the chosen date, and the original flagged
// "reversed" (the guards allow nothing else to change on it). Recorded in French, like every accounting label.
export async function reverseEntry(tx: ErpTransaction, entryId: string, date: string, reason: string, role: ErpRole, locale: Locale): Promise<{ entryNo: number; journalCode: string }> {
  if (reason.trim().length < 3) {
    throw new AccountingError(say(locale, "Indiquez le motif de l'extourne.", "Give the reason for the reversal."));
  }
  const [original] = await tx.query<{ entity_id: string; journal_id: string; entry_no: number | null; status: EntryStatus; currency: string; fx_rate: string }>(
    "select entity_id, journal_id, entry_no, status::text as status, currency, fx_rate from erp.journal_entry where id = $1 for update",
    [entryId],
  );
  if (!original || original.status !== "posted") {
    throw new AccountingError(say(locale, "Seule une écriture comptabilisée (non extournée) peut être extournée.", "Only a posted, not yet reversed, entry can be reversed."));
  }
  const [period] = await tx.query<{ id: string; fiscal_year_id: string }>(
    `select id, fiscal_year_id from erp.period
      where entity_id = $1 and $2::date between start_date and end_date and period_no <= 12 order by period_no limit 1`,
    [original.entity_id, date],
  );
  if (!period) {
    throw new AccountingError(say(locale, `Aucun exercice pour le ${date}.`, `No fiscal year for ${date}.`));
  }
  const [{ id: reversalId }] = await tx.query<{ id: string }>(
    `insert into erp.journal_entry (entity_id, journal_id, fiscal_year_id, period_id, entry_date, description, currency, fx_rate,
                                    source_type, source_id, posting_rule, reversal_of_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'reversal', $9, 'reversal.v1', $9) returning id`,
    [original.entity_id, original.journal_id, period.fiscal_year_id, period.id, date, `Extourne de ${original.entry_no ?? ""} : ${reason.trim()}`, original.currency, original.fx_rate, entryId],
  );
  await tx.query(
    `insert into erp.journal_line (entry_id, line_no, account_id, description, currency, fx_rate, debit_txn, credit_txn, debit, credit,
                                   customer_id, supplier_id, engagement_id, tax_code_id, bank_account_id, asset_id, employee_id)
     select $1, line_no, account_id, description, currency, fx_rate, credit_txn, debit_txn, credit, debit,
            customer_id, supplier_id, engagement_id, tax_code_id, bank_account_id, asset_id, employee_id
       from erp.journal_line where entry_id = $2`,
    [reversalId, entryId],
  );
  const posted = await postEntry(tx, reversalId, role, locale);
  await tx.query("update erp.journal_entry set status = 'reversed', reversed_by_id = $2 where id = $1", [entryId, reversalId]);
  return posted;
}
