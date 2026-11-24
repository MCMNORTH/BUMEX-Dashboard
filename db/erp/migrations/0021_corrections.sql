-- =====================================================================
--  BUMEX ERP — migration 0021: Sidaty's corrections of 2026-11-23
--  Applies on top of 0001–0020.
--
--  - Small settlement differences (4.1): an invoice left open by a few ouguiyas, or a client who paid a little more, is
--    proposed to the administrator, who books it — without a fake bank movement — or keeps it open (asked on
--    2026-11-24). The tolerance is the entity's (settlement_tolerance, functional currency: 500 MRU asked); what is
--    written off is kept on the invoice (underpaid → SETTLEMENT_LOSS) or on the receipt (overpaid → SETTLEMENT_GAIN),
--    with the entry that did it; write_off_refused: kept open.
--  - Supplier invoices (5.1): an entity where one accountant prepares and approves (preparer_may_approve, off by
--    default: the separation of tasks stays the rule).
--  - Fixed assets (5.4): a category that does not depreciate (land), said rather than guessed from its name.
--  - Lettering (2): an allocation carries a label, so the history says which receipt went to which invoice.
--  - The accounts the new operations post to, mapped where BUMEX SA's chart has them: 580001 Virements de fonds (an
--    internal transfer between two currencies goes through it), 635102 Commission cession devise, 638001 Charges
--    diverses (an invoice underpaid within the tolerance), 748000 Autres produits exceptionnels (overpaid). Another
--    entity sets them in Comptabilité › Journaux · tiers › Comptes de paramétrage.
-- =====================================================================
set search_path to erp, public;

alter table erp.entity
  add column if not exists settlement_tolerance numeric(20,2) not null default 500 check (settlement_tolerance >= 0),
  add column if not exists preparer_may_approve boolean not null default false;

alter table erp.sales_invoice
  add column if not exists write_off_txn      numeric(20,2) not null default 0 check (write_off_txn >= 0),
  add column if not exists write_off_entry_id uuid references erp.journal_entry(id),
  add column if not exists write_off_refused  boolean not null default false;

alter table erp.customer_payment
  add column if not exists write_off_txn      numeric(20,2) not null default 0 check (write_off_txn >= 0),
  add column if not exists write_off_entry_id uuid references erp.journal_entry(id),
  add column if not exists write_off_refused  boolean not null default false;

alter table erp.asset_category add column if not exists non_depreciable boolean not null default false;
update erp.asset_category set non_depreciable = true
 where not non_depreciable
   and (lower(code) in ('land', 'terrain', 'terrains') or lower(name_fr) like 'terrain%' or lower(name_fr) like '%non amortissable%');

alter table erp.allocation add column if not exists label text;

insert into erp.account_mapping (entity_id, key, qualifier, account_id)
select a.entity_id, m.key, '', a.id
  from (values ('TRANSFER_TRANSIT', '580001'), ('FX_SALE_FEE', '635102'), ('SETTLEMENT_LOSS', '638001'), ('SETTLEMENT_GAIN', '748000')) as m(key, code)
  join erp.account a on a.code = m.code and a.is_postable and a.active
 where not exists (select 1 from erp.account_mapping x where x.entity_id = a.entity_id and x.key = m.key and x.qualifier = '');
