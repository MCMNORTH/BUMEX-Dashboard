import "server-only";

import { randomUUID } from "node:crypto";

import { resolveErpModules } from "@/lib/erp/config";
import type { Account, AccountMapping, AppUser, DeletionRequest, Entity, FiscalYear, Journal, JournalEntry, Period, State, TaxCode, TaxRule } from "@/lib/erp/engine";
import type { ErpTransaction } from "@/lib/erp/db";
import { loadVanguardState, roomOf, type VanguardPerson } from "@/lib/erp/vanguard/load";
import { moduleTables, tableWriter } from "@/lib/erp/vanguard/tables";
import type { VanguardChange } from "@/lib/erp/vanguard/record";
import { replay } from "@/lib/erp/vanguard/replay";
import type { VanguardTicket } from "@/lib/erp/vanguard/tickets";
import { erpModuleKeys, type ErpAccess, type ErpModuleKey, type ErpRole } from "@/types/erp";

// Writes what a replayed change did (run.ts) to PostgreSQL, collection by collection, in the person's ERP session:
// row-level security and the schema's guards check every row again. Numbers, hashes, chains, counters, stamps (who
// and when) and the history are the database's own: the engine's values for them are not written.

// A refusal worded for the person.
export class VanguardSaveError extends Error {}

type Changes<T> = { added: T[]; changed: [T, T][]; removed: T[] };

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function changes<T>(before: T[], after: T[], key: (row: T) => string): Changes<T> | null {
  if (before === after) return null;
  const old = new Map(before.map((row) => [key(row), row]));
  const kept = new Set<string>();
  const added: T[] = [];
  const changed: [T, T][] = [];
  for (const row of after) {
    const k = key(row);
    kept.add(k);
    const previous = old.get(k);
    if (!previous) added.push(row);
    else if (previous !== row && !same(previous, row)) changed.push([previous, row]);
  }
  const removed = before.filter((row) => !kept.has(key(row)));
  return added.length || changed.length || removed.length ? { added, changed, removed } : null;
}

type Writer<T> = {
  key: (row: T) => string;
  add?: (tx: ErpTransaction, row: T, after: State) => Promise<unknown>;
  change?: (tx: ErpTransaction, before: T, after: T, state: State) => Promise<unknown>;
  remove?: (tx: ErpTransaction, row: T) => Promise<unknown>;
};

const byId = <T extends { id: string }>(row: T) => row.id;
const nil = <T,>(value: T | undefined) => value ?? null;

const entities: Writer<Entity> = {
  key: byId,
  change: async (tx, before, after) => {
    // entities have no row-level security (every floor is listed): the visibility check is here
    const updated = await tx.query(
      `update erp.entity set name = $2, nif = $3, address_lines = $4, cash_threshold = $5, account_code_length = $6,
              coa_template = $7::erp.coa_template, fx_method = $8::erp.fx_method
        where id = $1 and erp.can_see_entity(id) returning id`,
      [after.id, after.name, nil(after.nif), nil(after.address), after.cashThreshold, after.accountCodeLength ?? 6, after.coaTemplate, after.fxMethod],
    );
    if (!updated.length) throw new VanguardSaveError("Entité non autorisée.");
    const rules = after.thirdPartyRules;
    if (rules && !same(rules, before.thirdPartyRules)) {
      await tx.query(
        `insert into erp.third_party_rules (entity_id, customer_prefix, supplier_prefix, digits, customer_collective_id, supplier_collective_id)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (entity_id) do update set customer_prefix = excluded.customer_prefix, supplier_prefix = excluded.supplier_prefix,
           digits = excluded.digits, customer_collective_id = excluded.customer_collective_id,
           supplier_collective_id = excluded.supplier_collective_id, updated_at = now(), updated_by = erp.actor_id()`,
        [after.id, rules.customerPrefix, rules.supplierPrefix, rules.digits, nil(rules.customerCollectiveId), nil(rules.supplierCollectiveId)],
      );
    }
  },
};

const fiscalYears: Writer<FiscalYear> = {
  key: byId,
  add: (tx, fy) =>
    tx.query("insert into erp.fiscal_year (id, entity_id, label, start_date, end_date) values ($1, $2, $3, $4, $5)", [fy.id, fy.entityId, fy.label, fy.start, fy.end]),
  change: (tx, _, fy) => tx.query("update erp.fiscal_year set is_closed = $2 where id = $1", [fy.id, fy.isClosed]),
};

const periods: Writer<Period> = {
  key: byId,
  add: (tx, p) =>
    tx.query("insert into erp.period (id, entity_id, fiscal_year_id, period_no, start_date, end_date, status) values ($1, $2, $3, $4, $5, $6, $7::erp.period_status)", [
      p.id, p.entityId, p.fiscalYearId, p.periodNo, p.start, p.end, p.status,
    ]),
  change: (tx, _, p) => tx.query("update erp.period set status = $2::erp.period_status where id = $1", [p.id, p.status]),
};

const accounts: Writer<Account> = {
  key: byId,
  // an auxiliary account (named by its third party's code) takes its collective's class
  add: (tx, a) =>
    tx.query(
      `insert into erp.account (id, entity_id, code, name_fr, name_en, class, kind, is_postable, is_statutory, requires_customer, requires_supplier,
                                requires_engagement, active, is_auxiliary, collective_id)
       values ($1, $2, $3, $4, $5, coalesce((select c.class from erp.account c where c.id = $14::uuid), nullif(regexp_replace(left($3, 1), '[^0-9]', ''), '')::smallint), $6::erp.account_kind,
               $7, $8, $9, $10, $11, $12, $13, $14)`,
      [a.id, a.entityId, a.code, a.nameFr, nil(a.nameEn), a.kind, a.isPostable, a.isStatutory, Boolean(a.requiresCustomer), Boolean(a.requiresSupplier),
        Boolean(a.requiresEngagement), a.active, Boolean(a.isAuxiliary), nil(a.collectiveId)],
    ),
  change: (tx, _, a) =>
    tx.query(
      `update erp.account set code = $2, name_fr = $3, name_en = $4, kind = $5::erp.account_kind, is_postable = $6, requires_customer = $7,
              requires_supplier = $8, requires_engagement = $9, active = $10, collective_id = $11
        where id = $1`,
      [a.id, a.code, a.nameFr, nil(a.nameEn), a.kind, a.isPostable, Boolean(a.requiresCustomer), Boolean(a.requiresSupplier), Boolean(a.requiresEngagement), a.active, nil(a.collectiveId)],
    ),
  remove: (tx, a) => tx.query("delete from erp.account where id = $1", [a.id]),
};

const journals: Writer<Journal> = {
  key: byId,
  add: (tx, j) => tx.query("insert into erp.journal (id, entity_id, code, name, kind) values ($1, $2, $3, $4, $5::erp.journal_kind)", [j.id, j.entityId, j.code, j.name, j.kind]),
  change: (tx, _, j) => tx.query("update erp.journal set code = $2, name = $3, kind = $4::erp.journal_kind where id = $1", [j.id, j.code, j.name, j.kind]),
  remove: (tx, j) => tx.query("delete from erp.journal where id = $1", [j.id]),
};

const mappings: Writer<AccountMapping> = {
  key: (m) => `${m.entityId}|${m.key}|${m.qualifier}`,
  add: (tx, m) => tx.query("insert into erp.account_mapping (entity_id, key, qualifier, account_id) values ($1, $2, $3, $4)", [m.entityId, m.key, m.qualifier, m.accountId]),
  change: (tx, _, m) => tx.query("update erp.account_mapping set account_id = $4 where entity_id = $1 and key = $2 and qualifier = $3", [m.entityId, m.key, m.qualifier, m.accountId]),
  remove: (tx, m) => tx.query("delete from erp.account_mapping where entity_id = $1 and key = $2 and qualifier = $3", [m.entityId, m.key, m.qualifier]),
};

const taxCodes: Writer<TaxCode> = {
  key: byId,
  add: (tx, t) =>
    tx.query(
      `insert into erp.tax_code (id, entity_id, code, name_fr, kind, rate, effective_from, collected_account_id, deductible_account_id, revenue_status,
                                 legal_mention_fr, is_exempt)
       values ($1, $2, $3, $4, $5::erp.tax_kind, $6::numeric, date '2000-01-01', $7, $8, $9::erp.revenue_tax_status, $10, $5::text = 'vat' and $6::numeric = 0)`,
      [t.id, t.entityId, t.code, t.nameFr, t.kind, t.rate, nil(t.collectedAccountId), nil(t.deductibleAccountId), nil(t.revenueStatus), nil(t.legalMentionFr)],
    ),
  change: (tx, _, t) =>
    tx.query(
      `update erp.tax_code set code = $2, name_fr = $3, kind = $4::erp.tax_kind, rate = $5::numeric, collected_account_id = $6, deductible_account_id = $7,
              revenue_status = $8::erp.revenue_tax_status, legal_mention_fr = $9, is_exempt = $4::text = 'vat' and $5::numeric = 0
        where id = $1`,
      [t.id, t.code, t.nameFr, t.kind, t.rate, nil(t.collectedAccountId), nil(t.deductibleAccountId), nil(t.revenueStatus), nil(t.legalMentionFr)],
    ),
  remove: (tx, t) => tx.query("delete from erp.tax_code where id = $1", [t.id]),
};

const taxRuleWhere = `entity_id = $1 and counterparty_regime is not distinct from $2::erp.counterparty_regime and tax_code_id = $4
  and service_category_id is not distinct from (select id from erp.service_category where code = $3)`;
const taxRules: Writer<TaxRule> = {
  key: (r) => `${r.entityId}|${r.regime ?? ""}|${r.serviceCategory ?? ""}|${r.taxCodeId}`,
  add: async (tx, r) => {
    const [category] = r.serviceCategory ? await tx.query("select id from erp.service_category where code = $1", [r.serviceCategory]) : [null];
    if (r.serviceCategory && !category) throw new VanguardSaveError(`Catégorie de prestation inconnue de la base : ${r.serviceCategory}.`);
    await tx.query(
      `insert into erp.tax_rule (entity_id, counterparty_regime, service_category_id, tax_kind, tax_code_id, effective_from, priority)
       select $1, $2::erp.counterparty_regime, (select id from erp.service_category where code = $3), t.kind, t.id, date '2000-01-01', $5
         from erp.tax_code t where t.id = $4`,
      [r.entityId, r.regime, r.serviceCategory, r.taxCodeId, r.priority],
    );
  },
  change: (tx, _, r) => tx.query(`update erp.tax_rule set priority = $5 where ${taxRuleWhere}`, [r.entityId, r.regime, r.serviceCategory, r.taxCodeId, r.priority]),
  remove: (tx, r) => tx.query(`delete from erp.tax_rule where ${taxRuleWhere}`, [r.entityId, r.regime, r.serviceCategory, r.taxCodeId]),
};

async function writeLines(tx: ErpTransaction, e: JournalEntry) {
  await tx.query("delete from erp.journal_line where entry_id = $1", [e.id]);
  await tx.query(
    `insert into erp.journal_line (entry_id, line_no, account_id, description, currency, fx_rate, debit_txn, credit_txn, debit, credit,
                                   customer_id, supplier_id, engagement_id, tax_code_id, bank_account_id, asset_id, employee_id)
     select $1, l."lineNo", l."accountId", coalesce(l.description, ''), l.currency, l."fxRate", l."debitTxn", l."creditTxn", l.debit, l.credit,
            l."customerId", l."supplierId", l."engagementId", l."taxCodeId", l."bankAccountId", l."assetId", l."employeeId"
       from jsonb_to_recordset($2::jsonb) as l("lineNo" smallint, "accountId" uuid, description text, currency char(3), "fxRate" numeric,
            "debitTxn" numeric, "creditTxn" numeric, debit numeric, credit numeric, "customerId" uuid, "supplierId" uuid, "engagementId" uuid,
            "taxCodeId" uuid, "bankAccountId" uuid, "assetId" uuid, "employeeId" uuid)`,
    [e.id, JSON.stringify(e.lines)],
  );
}

// a document's id, or a reference (the month of a payroll)
const isUuid = (value: string | undefined) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
const headerFields = (e: JournalEntry) => [e.id, e.journalId, e.fiscalYearId, e.periodId, e.date, e.description, e.currency, e.fxRate];

// An entry is written as a draft with its lines, then posted: the database numbers it, chains it and seals it.
const entries: Writer<JournalEntry> = {
  key: byId,
  add: async (tx, e) => {
    await tx.query(
      `insert into erp.journal_entry (id, journal_id, fiscal_year_id, period_id, entry_date, description, currency, fx_rate, entity_id, source_type,
                                      source_id, posting_rule, reversal_of_id, source_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [...headerFields(e), e.entityId, e.sourceType, isUuid(e.sourceId) ? e.sourceId : null, nil(e.postingRule), nil(e.reversalOfId), isUuid(e.sourceId) ? null : nil(e.sourceId)],
    );
    await writeLines(tx, e);
    if (e.status !== "draft") await tx.query("update erp.journal_entry set status = 'posted' where id = $1", [e.id]);
  },
  change: async (tx, before, after) => {
    if (before.status === "draft") {
      await tx.query(
        `update erp.journal_entry set journal_id = $2, fiscal_year_id = $3, period_id = $4, entry_date = $5, description = $6, currency = $7, fx_rate = $8
          where id = $1`,
        headerFields(after),
      );
      if (!same(before.lines, after.lines)) await writeLines(tx, after);
      if (after.status !== "draft") await tx.query("update erp.journal_entry set status = 'posted' where id = $1", [after.id]);
      return;
    }
    // a posted entry only changes when it is reversed (the guard refuses anything else)
    await tx.query("update erp.journal_entry set status = $2::erp.entry_status, reversed_by_id = $3 where id = $1", [after.id, after.status, nil(after.reversedById)]);
  },
  remove: (tx, e) => tx.query("delete from erp.journal_entry where id = $1", [e.id]),
};

const deletionRequests: Writer<DeletionRequest> = {
  key: byId,
  add: (tx, r) =>
    tx.query("insert into erp.deletion_request (id, entity_id, table_name, row_id, label, reason) values ($1, $2, $3, $4, $5, $6)", [
      r.id, nil(r.entityId), r.table, r.rowId, r.label, r.reason,
    ]),
  change: (tx, _, r) => tx.query("update erp.deletion_request set status = $2, decision_note = $3 where id = $1", [r.id, r.status, nil(r.decisionNote)]),
};

// ERP access (Vanguard's Settings › accounts): a person of BUMEX One, found by e-mail, gets an ERP role, entities
// and modules; disabling or deleting the account removes the access. Names and e-mails stay BUMEX One's.
function users(people: VanguardPerson[], codeOf: Map<string, string>): Writer<AppUser> {
  const codes = (u: AppUser) => (u.entityIds === "*" ? null : u.entityIds.map((e) => codeOf.get(e) ?? e));
  const modules = (u: AppUser) => {
    if (u.modules === "*") return null;
    const chosen = erpModuleKeys.filter((key) => u.modules.includes(roomOf[key]));
    const defaults = resolveErpModules(u.role, null);
    return chosen.length === defaults.length && chosen.every((m) => defaults.includes(m)) ? null : chosen;
  };
  return {
    key: byId,
    add: async (tx, u) => {
      const person = people.find((p) => p.email.toLowerCase() === u.email.trim().toLowerCase());
      if (!person) throw new VanguardSaveError("Aucune personne de BUMEX One n'a cette adresse : créez-la d'abord dans BUMEX One (Paramètres › Utilisateurs).");
      if (u.status === "disabled") return;
      await tx.query("insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)", [person.id, u.role, codes(u), modules(u)]);
    },
    change: (tx, _, u) =>
      u.status === "disabled"
        ? tx.query("delete from erp.user_access where user_id = $1", [u.id])
        : tx.query(
            `insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)
             on conflict (user_id) do update set erp_role = excluded.erp_role, entity_codes = excluded.entity_codes, modules = excluded.modules`,
            [u.id, u.role, codes(u), modules(u)],
          ),
    remove: (tx, u) => tx.query("delete from erp.user_access where user_id = $1", [u.id]),
  };
}

const table = (collection: keyof State) => tableWriter(moduleTables.find((t) => t.collection === collection)!) as unknown as Writer<never>;

// In the order rows can be written (what a row refers to comes first); removals go the other way.
const writersFor = (people: VanguardPerson[], codeOf: Map<string, string>) =>
  [
    ["entities", entities],
    ["fiscalYears", fiscalYears],
    ["periods", periods],
    ["accounts", accounts],
    ["journals", journals],
    ["mappings", mappings],
    ["taxCodes", taxCodes],
    ["taxRules", taxRules],
    ["customers", table("customers")],
    ["suppliers", table("suppliers")],
    ["bankAccounts", table("bankAccounts")],
    ["employees", table("employees")],
    ["payrollRules", table("payrollRules")],
    ["assetCategories", table("assetCategories")],
    ["engagements", table("engagements")],
    ["entries", entries],
    ["salesInvoices", table("salesInvoices")],
    ["creditNotes", table("creditNotes")],
    ["bankTransactions", table("bankTransactions")],
    ["customerPayments", table("customerPayments")],
    ["allocations", table("allocations")],
    ["supplierInvoices", table("supplierInvoices")],
    ["supplierPayments", table("supplierPayments")],
    ["loans", table("loans")],
    ["loanPayments", table("loanPayments")],
    ["assets", table("assets")],
    ["depreciationRuns", table("depreciationRuns")],
    ["payrollRuns", table("payrollRuns")],
    ["assignments", table("assignments")],
    ["archives", table("archives")],
    ["deletionRequests", deletionRequests],
    ["users", users(people, codeOf)],
  ] as [keyof State, Writer<never>][];

// Kept by the database, derived, or the person's own context: never written from the engine.
const notWritten = new Set<keyof State>(["group", "session", "today", "seq", "chains", "auditLog", "bankRules", "fxRates"]);

// The documents' numbers (invoices, receipts, assets, archive boxes) follow the engine's counters; the entries'
// numbers are given by the database when they are posted.
async function saveCounters(tx: ErpTransaction, before: State, after: State) {
  for (const [key, last] of Object.entries(after.counters)) {
    if (before.counters[key] === last) continue;
    const [entityId, scope, scopeRef, period] = key.split("|");
    if (scope === "journal_entry") continue;
    // two statements: a policy inserted by a statement is not yet visible to that statement's row-level security
    const [policy] = await tx.query<{ id: string }>(
      `insert into erp.numbering_policy (entity_id, scope, scope_ref, pattern, reset_on) values ($1, $2, nullif($3, '')::uuid, '{SEQ4}', $4)
       on conflict (entity_id, scope, scope_ref) do update set scope = excluded.scope returning id`,
      [entityId, scope, scopeRef, period.length === 7 ? "month" : period.length === 4 ? "year" : "fiscal_year"],
    );
    await tx.query(
      `insert into erp.numbering_counter (policy_id, period_key, next_number) values ($1, $2, $3)
       on conflict (policy_id, period_key) do update set next_number = greatest(erp.numbering_counter.next_number, excluded.next_number)`,
      [policy.id, period, last + 1],
    );
  }
}

export async function saveVanguardChange(tx: ErpTransaction, before: State, after: State, people: VanguardPerson[] = []): Promise<void> {
  const codeOf = new Map((await tx.query<{ id: string; code: string }>("select id, code from erp.entity")).map((e) => [e.id, e.code]));
  const writers = writersFor(people, codeOf);
  for (const name of Object.keys(after) as (keyof State)[]) {
    if (notWritten.has(name) || name === "counters" || before[name] === after[name] || writers.some(([w]) => w === name)) continue;
    if (same(before[name], after[name])) continue;
    throw new VanguardSaveError(
      name === "tasks"
        ? "Les tâches sont les tickets de BUMEX One : elles se créent et avancent depuis la salle Tâches."
        : "Cette modification touche des données que Vanguard n'enregistre pas encore.",
    );
  }

  const planned = writers.map(([name, writer]) => ({ writer: writer as Writer<unknown>, found: changes(before[name] as unknown[], after[name] as unknown[], (writer as Writer<unknown>).key) }));

  for (const { writer, found } of [...planned].reverse()) {
    for (const row of found?.removed ?? []) {
      if (!writer.remove) throw new VanguardSaveError("Cette suppression n'est pas prévue.");
      await writer.remove(tx, row);
    }
  }
  for (const { writer, found } of planned) {
    if (!found) continue;
    for (const row of found.added) {
      if (!writer.add) throw new VanguardSaveError("Cet ajout n'est pas prévu.");
      await writer.add(tx, row, after);
    }
    for (const [previous, row] of found.changed) {
      if (!writer.change) throw new VanguardSaveError("Cette modification n'est pas prévue.");
      await writer.change(tx, previous, row, after);
    }
  }
  await saveCounters(tx, before, after);
}

// One change of the browser, in the person's session: the engine calls replayed on the database's state, the result
// written, and the database's state read again (with the numbers, hashes and stamps it gave, and the person's access
// as it now is).
export async function applyVanguardChange(
  tx: ErpTransaction,
  person: { id: string; name: string },
  access: ErpAccess,
  people: VanguardPerson[],
  change: VanguardChange,
  tickets: VanguardTicket[] = [],
) {
  // replayed on everything the person's entities hold: the engine's checks see what the database has
  const { state: before } = await loadVanguardState(tx, person, access, people, { checkChains: false, tickets, full: true });
  const after = replay(before, change, randomUUID);
  await saveVanguardChange(tx, before, after, people);
  const [row] = await tx.query<{ erp_role: ErpRole; entity_codes: ErpAccess["entityCodes"]; modules: ErpModuleKey[] | null }>(
    "select erp_role, entity_codes, modules from erp.user_access where user_id = $1",
    [person.id],
  );
  const now = row ? { role: row.erp_role, entityCodes: row.entity_codes, modules: resolveErpModules(row.erp_role, row.modules) } : access;
  return loadVanguardState(tx, person, now, people, { tickets });
}
