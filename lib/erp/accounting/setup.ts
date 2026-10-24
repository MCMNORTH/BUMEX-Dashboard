import "server-only";

import { randomUUID } from "node:crypto";

import { seedChart, type Entity, type State } from "@/lib/erp/engine";
import type { ErpTransaction } from "@/lib/erp/db";
import type { ChartTemplate, ErpEntity } from "@/lib/erp/accounting/model";

const ENGINE_ENTITY = "entity";

// An empty engine state holding one entity: the engine's chart functions (seedChart, validateChartImport) work on
// it, and their result is written to PostgreSQL. Nothing else of the engine's in-memory model is used.
export function engineState(entity: ErpEntity, template: ChartTemplate = entity.chartTemplate): State {
  const engineEntity: Entity = {
    id: ENGINE_ENTITY,
    code: entity.code,
    name: entity.name,
    activity: "",
    country: entity.country === "MA" ? "MA" : "MR",
    functionalCurrency: entity.currency as Entity["functionalCurrency"],
    coaTemplate: template,
    fxMethod: "conversion_accounts",
    cashThreshold: 0,
    floorOrder: 0,
    isHolding: false,
    staffPresent: 0,
    staffTotal: 0,
    accountCodeLength: entity.codeLength,
  };
  return {
    group: { id: "group", name: "Groupe BUMEX", presentationCurrency: "MRU" },
    session: { userId: "system", actorId: "system", actorName: "BUMEX One", role: "admin", entityIds: "*", modules: "*" },
    today: new Date().toISOString().slice(0, 10),
    entities: [engineEntity],
    fxRates: [], fiscalYears: [], periods: [], accounts: [], journals: [], mappings: [], taxCodes: [], taxRules: [],
    entries: [], chains: {}, counters: {}, customers: [], salesInvoices: [], creditNotes: [], customerPayments: [], allocations: [],
    suppliers: [], supplierInvoices: [], supplierPayments: [], loans: [], loanPayments: [], bankAccounts: [], bankTransactions: [], bankRules: [],
    engagements: [], assignments: [], assetCategories: [], assets: [], depreciationRuns: [], employees: [], payrollRules: [], payrollRuns: [],
    users: [], deletionRequests: [], tasks: [], archives: [], auditLog: [], seq: 0,
  };
}

export const ENGINE_ENTITY_ID = ENGINE_ENTITY;

export type SetupSummary = { accounts: number; journals: number; taxCodes: number; fiscalYears: number };

// Writes the template's chart, account mappings, tax codes and rules and journals for the entity, then the fiscal
// years asked for. What exists already is kept (same code = same account), so the call also completes a chart with
// a template. Runs in the caller's transaction and session: row-level security and the guards apply.
export async function applyChartTemplate(tx: ErpTransaction, entity: ErpEntity, template: ChartTemplate, years: number[]): Promise<SetupSummary> {
  const seeded = seedChart(engineState(entity, template), ENGINE_ENTITY, template);
  const [{ n: before }] = await tx.query<{ n: number }>("select count(*)::int as n from erp.account where entity_id = $1", [entity.id]);

  const accounts = await tx.query<{ id: string }>(
    `insert into erp.account (id, entity_id, code, name_fr, class, kind, is_postable, is_statutory, requires_customer, requires_supplier, active)
     select r.id, $1, r.code, r.name_fr, left(r.code, 1)::smallint, r.kind::erp.account_kind, r.is_postable, r.is_statutory,
            r.requires_customer, r.requires_supplier, true
       from jsonb_to_recordset($2::jsonb) as r(id uuid, code text, name_fr text, kind text, is_postable boolean,
                                               is_statutory boolean, requires_customer boolean, requires_supplier boolean)
     on conflict (entity_id, code) do nothing
     returning id`,
    [
      entity.id,
      JSON.stringify(
        seeded.accounts.map((a) => ({
          id: randomUUID(),
          code: a.code,
          name_fr: a.nameFr,
          kind: a.kind,
          is_postable: a.isPostable,
          is_statutory: a.isStatutory,
          requires_customer: Boolean(a.requiresCustomer),
          requires_supplier: Boolean(a.requiresSupplier),
        })),
      ),
    ],
  );

  // engine ids → database ids, through the codes (an account the entity already had keeps its id)
  const byCode = new Map((await tx.query<{ id: string; code: string }>("select id, code from erp.account where entity_id = $1", [entity.id])).map((r) => [r.code, r.id]));
  const accountId = new Map(seeded.accounts.map((a) => [a.id, byCode.get(a.code)]));

  await tx.query(
    `insert into erp.account_mapping (entity_id, key, qualifier, account_id)
     select $1, r.key, r.qualifier, r.account_id from jsonb_to_recordset($2::jsonb) as r(key text, qualifier text, account_id uuid)
     on conflict (entity_id, key, qualifier) do nothing`,
    [entity.id, JSON.stringify(seeded.mappings.map((m) => ({ key: m.key, qualifier: m.qualifier, account_id: accountId.get(m.accountId) })))],
  );

  const taxCodes = await tx.query<{ id: string }>(
    `insert into erp.tax_code (entity_id, code, name_fr, kind, rate, effective_from, collected_account_id, deductible_account_id,
                               revenue_status, legal_mention_fr, is_exempt)
     select $1, r.code, r.name_fr, r.kind::erp.tax_kind, r.rate, date '2000-01-01', r.collected, r.deductible,
            r.revenue_status::erp.revenue_tax_status, r.mention, r.kind = 'vat' and r.rate = 0
       from jsonb_to_recordset($2::jsonb) as r(code text, name_fr text, kind text, rate numeric, collected uuid, deductible uuid,
                                               revenue_status text, mention text)
     on conflict (entity_id, code) do nothing
     returning id`,
    [
      entity.id,
      JSON.stringify(
        seeded.taxCodes.map((t) => ({
          code: t.code,
          name_fr: t.nameFr,
          kind: t.kind,
          rate: t.rate,
          collected: t.collectedAccountId ? accountId.get(t.collectedAccountId) : null,
          deductible: t.deductibleAccountId ? accountId.get(t.deductibleAccountId) : null,
          revenue_status: t.revenueStatus ?? null,
          mention: t.legalMentionFr ?? null,
        })),
      ),
    ],
  );

  // the tax rules come with a first setup only: once an entity has its own, a template does not add more
  const taxCodeId = new Map((await tx.query<{ id: string; code: string }>("select id, code from erp.tax_code where entity_id = $1", [entity.id])).map((r) => [r.code, r.id]));
  await tx.query(
    `insert into erp.tax_rule (entity_id, counterparty_regime, tax_kind, tax_code_id, effective_from, priority)
     select $1, r.regime::erp.counterparty_regime, r.kind::erp.tax_kind, r.tax_code_id, date '2000-01-01', r.priority
       from jsonb_to_recordset($2::jsonb) as r(regime text, kind text, tax_code_id uuid, priority smallint)
      where not exists (select 1 from erp.tax_rule where entity_id = $1)`,
    [
      entity.id,
      JSON.stringify(
        seeded.taxRules.map((rule) => {
          const code = seeded.taxCodes.find((t) => t.id === rule.taxCodeId)!;
          return { regime: rule.regime, kind: code.kind, tax_code_id: taxCodeId.get(code.code), priority: rule.priority };
        }),
      ),
    ],
  );

  const journals = await tx.query<{ id: string }>(
    `insert into erp.journal (entity_id, code, name, kind)
     select $1, r.code, r.name, r.kind::erp.journal_kind from jsonb_to_recordset($2::jsonb) as r(code text, name text, kind text)
     on conflict (entity_id, code) do nothing
     returning id`,
    [entity.id, JSON.stringify(seeded.journals.map((j) => ({ code: j.code, name: j.name, kind: j.kind })))],
  );

  if (before === 0) {
    await tx.query("update erp.entity set coa_template = $2::erp.coa_template where id = $1", [entity.id, template]);
  }

  let fiscalYears = 0;
  for (const year of years) {
    const existing = await tx.query("select 1 from erp.fiscal_year where entity_id = $1 and label = $2", [entity.id, String(year)]);
    if (!existing.length) {
      await tx.query("select erp.create_fiscal_year($1, $2::int)", [entity.id, year]);
      fiscalYears++;
    }
  }

  return { accounts: accounts.length, journals: journals.length, taxCodes: taxCodes.length, fiscalYears };
}
