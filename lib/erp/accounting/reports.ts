import "server-only";

import type { ErpTransaction } from "@/lib/erp/db";
import type { AccountKind } from "@/lib/erp/accounting/model";

export type TrialBalanceRow = { accountId: string; code: string; name: string; kind: AccountKind; debit: number; credit: number; balance: number };

// Posted lines of the fiscal year (reversed entries and their reversals both count, and cancel out). Auxiliary
// accounts fold into their collective unless asked otherwise (the engine's trialBalance).
export async function trialBalance(tx: ErpTransaction, entityId: string, fiscalYearId: string, auxiliaries: boolean): Promise<TrialBalanceRow[]> {
  return tx.query<TrialBalanceRow>(
    `with lines as (
       select case when not $3 and a.is_auxiliary then a.collective_id else a.id end as account_id, l.debit, l.credit
         from erp.journal_line l
         join erp.journal_entry e on e.id = l.entry_id
         join erp.account a on a.id = l.account_id
        where e.entity_id = $1 and e.fiscal_year_id = $2 and e.status <> 'draft')
     select x.id as "accountId", x.code, x.name_fr as name, x.kind::text as kind,
            sum(lines.debit)::float8 as debit, sum(lines.credit)::float8 as credit, (sum(lines.debit) - sum(lines.credit))::float8 as balance
       from lines join erp.account x on x.id = lines.account_id
      group by x.id
      order by x.code`,
    [entityId, fiscalYearId, auxiliaries],
  );
}

export type LedgerRow = { entryId: string; date: string; journalCode: string; entryNo: number | null; description: string; debit: number; credit: number; running: number };

// One account over the fiscal year, its auxiliary accounts included when it is a collective, in date and posting order.
export async function generalLedger(tx: ErpTransaction, entityId: string, accountId: string, fiscalYearId: string): Promise<LedgerRow[]> {
  return tx.query<LedgerRow>(
    `select e.id as "entryId", e.entry_date::text as date, j.code as "journalCode", e.entry_no as "entryNo", l.description,
            l.debit::float8 as debit, l.credit::float8 as credit,
            (sum(l.debit - l.credit) over (order by e.entry_date, e.posted_at, e.chain_seq, l.line_no rows unbounded preceding))::float8 as running
       from erp.journal_line l
       join erp.journal_entry e on e.id = l.entry_id
       join erp.journal j on j.id = e.journal_id
       join erp.account a on a.id = l.account_id
      where e.entity_id = $1 and e.fiscal_year_id = $3 and e.status <> 'draft'
        and (a.id = $2 or a.collective_id = $2)
      order by e.entry_date, e.posted_at, e.chain_seq, l.line_no`,
    [entityId, accountId, fiscalYearId],
  );
}

export type ChainRow = { journalId: string; code: string; name: string; sealed: number; verified: number; lastHash: string | null };

// Every posted entry is hashed with the previous one of its journal (SHA-256); a change made directly in the
// database breaks the chain from that entry on.
export async function integrity(tx: ErpTransaction, entityId: string): Promise<ChainRow[]> {
  return tx.query<ChainRow>(
    `select j.id as "journalId", j.code, j.name,
            (select count(*)::int from erp.verify_chain($1, j.id)) as sealed,
            (select count(*)::int from erp.verify_chain($1, j.id) v where v.ok) as verified,
            encode(c.last_hash, 'hex') as "lastHash"
       from erp.journal j
       left join erp.ledger_chain c on c.entity_id = j.entity_id and c.journal_id = j.id
      where j.entity_id = $1
      order by j.code`,
    [entityId],
  );
}
