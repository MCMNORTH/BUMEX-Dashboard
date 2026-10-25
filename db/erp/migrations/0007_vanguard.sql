-- =====================================================================
--  BUMEX ERP — migration 0007: BUMEX Vanguard on the database (integration step 4)
--
--  - The fields Vanguard's screens keep that the schema did not have: what was paid on a sales invoice, its
--    dunning level and legal mention, a bank account's last statement balance, the invoice a supplier payment
--    settles, the bank line a customer payment came from, the service category of a credit note line, an entry's
--    source when it is not a document.
--  - Missions mirrored from BUMEX One's projects, customers linked to BUMEX One's clients.
--  - The service categories of the invoice lines (the tax rules follow them).
--  - Row-level security on the tables still open to every session: the lines and children of documents follow
--    their parent's entity, the remaining tables carrying an entity follow it.
-- =====================================================================
set search_path to erp, public;

-- 1. Fields of the screens
alter table erp.sales_invoice
  add column if not exists amount_paid_txn   numeric(20,2) not null default 0,
  add column if not exists dunning_level     smallint not null default 0,
  add column if not exists last_dunning_date date,
  add column if not exists legal_mention_fr  text;
alter table erp.credit_note_line
  add column if not exists service_category_id uuid references erp.service_category(id);
alter table erp.customer_payment
  add column if not exists bank_transaction_id uuid references erp.bank_transaction(id);
alter table erp.supplier_payment
  add column if not exists invoice_id uuid references erp.supplier_invoice(id);
alter table erp.bank_account
  add column if not exists statement_balance numeric(20,2) not null default 0,
  add column if not exists statement_date    date;
-- an entry's source that is not a document (a payroll's month)
alter table erp.journal_entry
  add column if not exists source_ref text;

-- Missions are BUMEX One's projects, mirrored here (lib/erp/vanguard/missions.ts) so that invoices, planning and
-- archive boxes can point to them; their customer is the ERP customer of the project's client, once there is one.
alter table erp.engagement
  add column if not exists bumex_project_id text unique,
  add column if not exists progress         smallint not null default 0 check (progress between 0 and 100),
  add column if not exists actual_hours     numeric(12,2) not null default 0,
  add column if not exists staff            text[] not null default '{}';
alter table erp.engagement alter column customer_id drop not null;
alter table erp.customer
  add column if not exists bumex_client_id text;
create unique index if not exists customer_bumex_client on erp.customer (entity_id, bumex_client_id) where bumex_client_id is not null;

-- 2. Service categories (the ones Vanguard's invoice and tax screens offer)
create unique index if not exists service_category_group_code on erp.service_category (group_id, code);
insert into erp.service_category (group_id, code, name_fr, name_en)
select g.id, c.code, c.name_fr, c.name_en
  from erp.org_group g
 cross join (values ('AUDIT', 'Audit', 'Audit'), ('TAX', 'Fiscal', 'Tax'), ('LEGAL', 'Juridique', 'Legal'),
                    ('ADVISORY', 'Conseil', 'Advisory'), ('IT', 'IT', 'IT'), ('OTHER', 'Autre', 'Other')) as c (code, name_fr, name_en)
on conflict (group_id, code) do nothing;

-- 3. Row-level security
do $$
declare t text;
begin
  -- tables carrying their entity
  foreach t in array array['depreciation_run', 'payroll_rules', 'dunning_run', 'approval', 'approval_policy', 'payment_run',
                           'cash_forecast_item', 'tax_return', 'filing_calendar'] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('alter table erp.%I force row level security', t);
    execute format('create policy by_entity on erp.%I using (erp.can_see_entity(entity_id))', t);
  end loop;
end $$;

-- children: through their parent
alter table erp.bank_transaction enable row level security;
alter table erp.bank_transaction force row level security;
create policy by_bank_account on erp.bank_transaction using (
  exists (select 1 from erp.bank_account b where b.id = bank_transaction.bank_account_id and erp.can_see_entity(b.entity_id)));

alter table erp.bank_statement enable row level security;
alter table erp.bank_statement force row level security;
create policy by_bank_account on erp.bank_statement using (
  exists (select 1 from erp.bank_account b where b.id = bank_statement.bank_account_id and erp.can_see_entity(b.entity_id)));

alter table erp.reconciliation_match enable row level security;
alter table erp.reconciliation_match force row level security;
create policy by_bank_transaction on erp.reconciliation_match using (
  exists (select 1 from erp.bank_transaction t join erp.bank_account b on b.id = t.bank_account_id
           where t.id = reconciliation_match.bank_transaction_id and erp.can_see_entity(b.entity_id)));

alter table erp.sales_invoice_line enable row level security;
alter table erp.sales_invoice_line force row level security;
create policy by_invoice on erp.sales_invoice_line using (
  exists (select 1 from erp.sales_invoice i where i.id = sales_invoice_line.invoice_id and erp.can_see_entity(i.entity_id)));

alter table erp.credit_note_line enable row level security;
alter table erp.credit_note_line force row level security;
create policy by_credit_note on erp.credit_note_line using (
  exists (select 1 from erp.credit_note c where c.id = credit_note_line.credit_note_id and erp.can_see_entity(c.entity_id)));

alter table erp.supplier_invoice_line enable row level security;
alter table erp.supplier_invoice_line force row level security;
create policy by_invoice on erp.supplier_invoice_line using (
  exists (select 1 from erp.supplier_invoice i where i.id = supplier_invoice_line.invoice_id and erp.can_see_entity(i.entity_id)));

alter table erp.depreciation_run_line enable row level security;
alter table erp.depreciation_run_line force row level security;
create policy by_run on erp.depreciation_run_line using (
  exists (select 1 from erp.depreciation_run r where r.id = depreciation_run_line.run_id and erp.can_see_entity(r.entity_id)));

alter table erp.depreciation_schedule enable row level security;
alter table erp.depreciation_schedule force row level security;
create policy by_asset on erp.depreciation_schedule using (
  exists (select 1 from erp.asset a where a.id = depreciation_schedule.asset_id and erp.can_see_entity(a.entity_id)));

alter table erp.asset_disposal enable row level security;
alter table erp.asset_disposal force row level security;
create policy by_asset on erp.asset_disposal using (
  exists (select 1 from erp.asset a where a.id = asset_disposal.asset_id and erp.can_see_entity(a.entity_id)));

alter table erp.dunning_item enable row level security;
alter table erp.dunning_item force row level security;
create policy by_run on erp.dunning_item using (
  exists (select 1 from erp.dunning_run r where r.id = dunning_item.run_id and erp.can_see_entity(r.entity_id)));

alter table erp.engagement_staff enable row level security;
alter table erp.engagement_staff force row level security;
create policy by_engagement on erp.engagement_staff using (
  exists (select 1 from erp.engagement e where e.id = engagement_staff.engagement_id and erp.can_see_entity(e.entity_id)));

alter table erp.numbering_counter enable row level security;
alter table erp.numbering_counter force row level security;
create policy by_policy on erp.numbering_counter using (
  exists (select 1 from erp.numbering_policy p where p.id = numbering_counter.policy_id and erp.can_see_entity(p.entity_id)));
