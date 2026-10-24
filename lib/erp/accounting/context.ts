import "server-only";

import { withErpSession, type ErpTransaction } from "@/lib/erp/db";
import { requireErpAccess } from "@/lib/erp/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { PARTNER_ROLES, POSTING_ROLES, SETTINGS_ROLES, type ErpEntity, type FiscalYearOption } from "@/lib/erp/accounting/model";
import type { ErpModuleKey } from "@/types/erp";

type EntityRow = { id: string; code: ErpEntity["code"]; name: string; country: string; functional_currency: string; coa_template: ErpEntity["chartTemplate"]; account_code_length: number };

export async function listEntities(tx: ErpTransaction): Promise<ErpEntity[]> {
  const rows = await tx.query<EntityRow>(
    `select id, code, name, country, functional_currency, coa_template::text as coa_template, account_code_length
       from erp.entity where active and erp.can_see_entity(id) order by floor_order, name`,
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, country: r.country, currency: r.functional_currency, chartTemplate: r.coa_template, codeLength: r.account_code_length }));
}

export async function listFiscalYears(tx: ErpTransaction, entityId: string): Promise<FiscalYearOption[]> {
  return tx.query<FiscalYearOption>(
    `select id, label, start_date::text as start, end_date::text as "end", is_closed as "isClosed"
       from erp.fiscal_year where entity_id = $1 order by start_date desc`,
    [entityId],
  );
}

// The entity an action names, if the person may see it (row-level security decides, as for every query).
export async function entityByCode(tx: ErpTransaction, code: string): Promise<ErpEntity | null> {
  return (await listEntities(tx)).find((e) => e.code === code) ?? null;
}

export type AccountingSearchParams = { entity?: string; fy?: string };

// What every accounting page starts from: the person's access, the entity chosen (?entity=, else their BUMEX One
// entity, else the first they may see), the fiscal year (?fy=, else the one containing today, else the latest) and
// whether the entity's chart exists yet.
export async function getAccountingContext(params: AccountingSearchParams, modules: ErpModuleKey | ErpModuleKey[] = "accounting") {
  const { auth, access } = await requireErpAccess(modules);
  const locale = await getCurrentLocale();
  const today = new Date().toISOString().slice(0, 10);

  const data = await withErpSession(auth.profile.id, async (tx) => {
    const entities = await listEntities(tx);
    const preferred = params.entity ?? auth.activeEntityCode ?? auth.profile.entity_code;
    const entity = entities.find((e) => e.code === preferred) ?? entities[0] ?? null;
    if (!entity) {
      return { entities, entity: null, fiscalYears: [], accounts: 0 };
    }
    const fiscalYears = await listFiscalYears(tx, entity.id);
    const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from erp.account where entity_id = $1", [entity.id]);
    return { entities, entity, fiscalYears, accounts: n };
  });

  const fiscalYear =
    data.fiscalYears.find((f) => f.label === params.fy) ??
    data.fiscalYears.find((f) => today >= f.start && today <= f.end) ??
    data.fiscalYears[0] ??
    null;

  return {
    auth,
    access,
    locale,
    today,
    entities: data.entities,
    entity: data.entity,
    fiscalYears: data.fiscalYears,
    fiscalYear,
    hasChart: data.accounts > 0,
    can: {
      post: POSTING_ROLES.includes(access.role),
      settings: SETTINGS_ROLES.includes(access.role),
      lock: PARTNER_ROLES.includes(access.role),
      setUp: PARTNER_ROLES.includes(access.role),
    },
  };
}

export type AccountingContext = Awaited<ReturnType<typeof getAccountingContext>>;
