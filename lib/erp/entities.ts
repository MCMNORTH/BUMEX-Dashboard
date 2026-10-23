import "server-only";

import { withErpSession } from "@/lib/erp/db";
import type { BumexEntityCode } from "@/types/entity";

export type ErpEntitySummary = {
  code: BumexEntityCode;
  name: string;
  country: string;
  currency: string;
  chartTemplate: string;
  accounts: number;
  fiscalYears: number;
};

// The entities this person may see in the ERP (same rule as row-level security), with how far each is set up.
export async function getErpEntities(userId: string): Promise<ErpEntitySummary[]> {
  const rows = await withErpSession(userId, (tx) =>
    tx.query<{ code: BumexEntityCode; name: string; country: string; functional_currency: string; coa_template: string; accounts: number; fiscal_years: number }>(
      `select e.code, e.name, e.country, e.functional_currency, e.coa_template::text,
              (select count(*)::int from erp.account a where a.entity_id = e.id) as accounts,
              (select count(*)::int from erp.fiscal_year f where f.entity_id = e.id) as fiscal_years
         from erp.entity e
        where e.active and erp.can_see_entity(e.id)
        order by e.floor_order, e.name`,
    ),
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    country: row.country,
    currency: row.functional_currency,
    chartTemplate: row.coa_template,
    accounts: row.accounts,
    fiscalYears: row.fiscal_years,
  }));
}
