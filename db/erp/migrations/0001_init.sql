-- =====================================================================
--  BUMEX ERP — schema 0001_init
--  PostgreSQL 16+ (tested on PGlite). Everything lives in schema "erp".
--
--  Session context, set by the API on every request (never by users):
--    erp.actor_id     uuid (or 'system') of the acting user
--    erp.actor_role   partner | manager | accountant | staff | readonly | admin | system
--    erp.entity_ids   comma-separated entity uuids the session may see, or '*'
-- =====================================================================

create schema if not exists erp;
set search_path to erp, public;

-- ---------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------
create or replace function erp.actor_id() returns text language sql stable as $$
  select coalesce(nullif(current_setting('erp.actor_id', true), ''), 'system')
$$;

create or replace function erp.actor_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('erp.actor_role', true), ''), 'system')
$$;

create or replace function erp.can_see_entity(p_entity uuid) returns boolean
language plpgsql stable as $$
declare v_ids text := coalesce(nullif(current_setting('erp.entity_ids', true), ''), '');
begin
  if erp.actor_role() in ('partner', 'system') or v_ids = '*' then
    return true;
  end if;
  return p_entity::text = any (string_to_array(v_ids, ','));
end $$;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type erp.account_kind        as enum ('asset','liability','equity','income','expense','offbalance');
create type erp.coa_template        as enum ('PCM','CGNC');
create type erp.fx_method           as enum ('conversion_accounts','direct_to_income');
create type erp.period_status       as enum ('open','soft_closed','locked');
create type erp.entry_status        as enum ('draft','posted','reversed');
create type erp.journal_kind        as enum ('sales','purchases','bank','cash','misc','assets','payroll','intercompany','closing','consolidation');
create type erp.counterparty_regime as enum ('standard','exempt','gta','non_resident','public');
create type erp.tax_kind            as enum ('vat','withholding','stamp','other');
create type erp.revenue_tax_status  as enum ('taxable_standard','taxable_reduced','exempt_domestic','export_exempt','export_taxable');
create type erp.doc_status          as enum ('draft','validated','pending_approval','approved','rejected','posted','paid','cancelled');
create type erp.engagement_status   as enum ('planned','active','on_hold','completed','cancelled');
create type erp.depreciation_method as enum ('linear','declining');

-- =====================================================================
-- 1. ORGANISATION
-- =====================================================================
create table erp.org_group (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  presentation_currency  char(3) not null default 'MRU',
  created_at             timestamptz not null default now()
);

create table erp.currency (
  code         char(3) primary key,
  name         text not null,
  minor_units  smallint not null default 2
);

create table erp.fx_rate (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references erp.org_group(id),
  rate_date      date not null,
  from_currency  char(3) not null references erp.currency(code),
  to_currency    char(3) not null references erp.currency(code),
  rate           numeric(20,10) not null check (rate > 0),
  source         text not null default 'manual',          -- BCM, BAM, ECB, manual
  created_at     timestamptz not null default now(),
  created_by     text not null default erp.actor_id(),
  unique (group_id, rate_date, from_currency, to_currency, source)
);

create table erp.entity (
  id                        uuid primary key default gen_random_uuid(),
  group_id                  uuid not null references erp.org_group(id),
  code                      text not null,
  name                      text not null,
  legal_form                text,
  country                   char(2) not null,
  functional_currency       char(3) not null references erp.currency(code),
  coa_template              erp.coa_template not null,
  fx_method                 erp.fx_method not null default 'conversion_accounts',
  fiscal_year_start_month   smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  address_lines             text,
  phone                     text,
  fax                       text,
  email                     text,
  web                       text,
  nif                       text,
  rc                        text,
  capital_amount            numeric(20,2),
  capital_currency          char(3) references erp.currency(code),
  logo_url                  text,
  signature_url             text,
  cash_threshold            numeric(20,2) not null default 0,   -- vault light
  floor_order               smallint not null default 0,
  is_holding                boolean not null default false,
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (group_id, code)
);

create table erp.fiscal_year (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references erp.entity(id),
  label       text not null,
  start_date  date not null,
  end_date    date not null check (end_date > start_date),
  is_closed   boolean not null default false,   -- closed = no posting at all; open years accept entries whatever today's date
  closed_at   timestamptz,
  closed_by   text,
  unique (entity_id, label)
);

create table erp.period (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references erp.entity(id),
  fiscal_year_id  uuid not null references erp.fiscal_year(id),
  period_no       smallint not null check (period_no between 1 and 13),   -- 13 = closing period
  start_date      date not null,
  end_date        date not null check (end_date >= start_date),
  status          erp.period_status not null default 'open',
  locked_at       timestamptz,
  locked_by       text,
  unique (entity_id, fiscal_year_id, period_no)
);

create table erp.ownership (
  parent_entity_id  uuid not null references erp.entity(id),
  child_entity_id   uuid not null references erp.entity(id),
  percent           numeric(7,4) not null check (percent > 0 and percent <= 100),
  method            text not null default 'full',   -- full | equity
  effective_from    date not null,
  primary key (parent_entity_id, child_entity_id, effective_from)
);

-- =====================================================================
-- 2. CHART OF ACCOUNTS AND CONFIGURATION
-- =====================================================================
create table erp.account (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references erp.entity(id),
  code                  text not null check (code ~ '^[0-9]{1,8}$'),
  name_fr               text not null,
  name_en               text,
  class                 smallint not null check (class between 0 and 9),
  kind                  erp.account_kind not null,
  parent_id             uuid references erp.account(id),
  is_postable           boolean not null default true,
  is_statutory          boolean not null default false,   -- 2-digit roots of classes 1-8: locked
  currency_restriction  char(3) references erp.currency(code),
  requires_engagement   boolean not null default false,
  requires_counterparty boolean not null default false,
  requires_tax_code     boolean not null default false,
  is_blocked            boolean not null default false,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (entity_id, code)
);
create index on erp.account (entity_id, parent_id);

create table erp.group_account (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references erp.org_group(id),
  code       text not null,
  name_fr    text not null,
  name_en    text,
  kind       erp.account_kind not null,
  parent_id  uuid references erp.group_account(id),
  unique (group_id, code)
);

create table erp.account_group_map (
  account_id        uuid primary key references erp.account(id),
  group_account_id  uuid not null references erp.group_account(id)
);

create table erp.journal (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references erp.entity(id),
  code               text not null,
  name               text not null,
  kind               erp.journal_kind not null,
  active             boolean not null default true,
  unique (entity_id, code)
);

-- One row per mapping key and qualifier; the posting rules only know keys.
create table erp.account_mapping (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references erp.entity(id),
  key         text not null,              -- AR_CONTROL, VAT_COLLECTED, REVENUE, BANK ...
  qualifier   text not null default '',   -- tax code, service category:status, bank account id ...
  account_id  uuid not null references erp.account(id),
  unique (entity_id, key, qualifier)
);

create table erp.service_category (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references erp.org_group(id),
  code      text not null,                -- AUDIT, TAX, LEGAL, ADVISORY, IT, OTHER
  name_fr   text not null,
  name_en   text,
  unique (group_id, code)
);

create table erp.tax_code (
  id                     uuid primary key default gen_random_uuid(),
  entity_id              uuid not null references erp.entity(id),
  code                   text not null,
  name_fr                text not null,
  name_en                text,
  kind                   erp.tax_kind not null,
  rate                   numeric(7,4) not null default 0 check (rate >= 0),
  effective_from         date not null,
  effective_to           date,
  collected_account_id   uuid references erp.account(id),   -- VAT collected / withholding payable
  deductible_account_id  uuid references erp.account(id),   -- VAT deductible
  revenue_status         erp.revenue_tax_status,            -- picks the revenue sub-account
  legal_mention_fr       text,                              -- printed on the invoice
  is_exempt              boolean not null default false,
  active                 boolean not null default true,
  unique (entity_id, code)
);

-- Resolution order at invoice time: document override > customer/supplier rule > entity default.
create table erp.tax_rule (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  counterparty_regime  erp.counterparty_regime,            -- null = any
  service_category_id  uuid references erp.service_category(id),  -- null = any
  tax_kind             erp.tax_kind not null,
  tax_code_id          uuid not null references erp.tax_code(id),
  effective_from       date not null,
  effective_to         date,
  priority             smallint not null default 100
);

create table erp.numbering_policy (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references erp.entity(id),
  scope      text not null,              -- journal_entry, sales_invoice, credit_note, supplier_invoice, payment ...
  scope_ref  uuid,                       -- e.g. the journal id; null = default for the scope
  pattern    text not null default '{SEQ6}',   -- tokens: {YYYY} {YY} {MM} {SEQ4} {SEQ5} {SEQ6}
  reset_on   text not null default 'year' check (reset_on in ('fiscal_year','year','month','never')),
  unique nulls not distinct (entity_id, scope, scope_ref)
);

create table erp.numbering_counter (
  policy_id    uuid not null references erp.numbering_policy(id),
  period_key   text not null default '',
  next_number  integer not null default 1,
  primary key (policy_id, period_key)
);

-- Gapless number for a scope. Row-locked: concurrent callers queue, no gaps.
create or replace function erp.next_number(p_entity uuid, p_scope text, p_scope_ref uuid, p_date date,
                                           out o_number text, out o_seq integer)
language plpgsql as $$
declare
  pol  erp.numbering_policy%rowtype;
  key  text;
  pat  text;
begin
  select * into pol from erp.numbering_policy
   where entity_id = p_entity and scope = p_scope and scope_ref is not distinct from p_scope_ref;
  if not found then
    select * into pol from erp.numbering_policy
     where entity_id = p_entity and scope = p_scope and scope_ref is null;
  end if;
  if not found then
    insert into erp.numbering_policy (entity_id, scope, scope_ref, pattern, reset_on)
    values (p_entity, p_scope, p_scope_ref, '{SEQ6}', case when p_scope = 'journal_entry' then 'fiscal_year' else 'year' end)
    returning * into pol;
  end if;
  key := case pol.reset_on
           when 'fiscal_year' then coalesce((select fy.label from erp.fiscal_year fy
                                              where fy.entity_id = p_entity and p_date between fy.start_date and fy.end_date
                                              limit 1), to_char(p_date, 'YYYY'))
           when 'year' then to_char(p_date, 'YYYY')
                           when 'month' then to_char(p_date, 'YYYY-MM') else '' end;
  insert into erp.numbering_counter (policy_id, period_key, next_number) values (pol.id, key, 1)
  on conflict (policy_id, period_key) do nothing;
  select next_number into o_seq from erp.numbering_counter
   where policy_id = pol.id and period_key = key for update;
  update erp.numbering_counter set next_number = o_seq + 1
   where policy_id = pol.id and period_key = key;
  pat := pol.pattern;
  pat := replace(pat, '{YYYY}', to_char(p_date, 'YYYY'));
  pat := replace(pat, '{YY}',   to_char(p_date, 'YY'));
  pat := replace(pat, '{MM}',   to_char(p_date, 'MM'));
  pat := replace(pat, '{SEQ4}', lpad(o_seq::text, 4, '0'));
  pat := replace(pat, '{SEQ5}', lpad(o_seq::text, 5, '0'));
  pat := replace(pat, '{SEQ6}', lpad(o_seq::text, 6, '0'));
  o_number := pat;
end $$;

-- =====================================================================
-- 3. LEDGER
-- =====================================================================
create table erp.journal_entry (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references erp.entity(id),
  journal_id      uuid not null references erp.journal(id),
  fiscal_year_id  uuid not null references erp.fiscal_year(id),
  period_id       uuid not null references erp.period(id),
  entry_no        integer,                                   -- assigned at posting, gapless per fiscal year
  chain_seq       integer,                                   -- position in the entity+journal hash chain (posting order)
  entry_date      date not null,
  status          erp.entry_status not null default 'draft',
  description     text not null default '',
  currency        char(3) not null references erp.currency(code),
  fx_rate         numeric(20,10) not null default 1,
  source_type     text not null default 'manual',            -- sales_invoice, customer_payment, ... reversal
  source_id       uuid,
  posting_rule    text,                                      -- e.g. sales_invoice.v1
  reversal_of_id  uuid references erp.journal_entry(id),
  reversed_by_id  uuid references erp.journal_entry(id),
  posted_at       timestamptz,
  posted_by       text,
  prev_hash       bytea,
  hash            bytea,
  created_at      timestamptz not null default now(),
  created_by      text not null default erp.actor_id(),
  updated_at      timestamptz not null default now(),
  unique (entity_id, journal_id, fiscal_year_id, entry_no),
  unique (entity_id, journal_id, chain_seq)
);
create index on erp.journal_entry (entity_id, period_id, status);
create index on erp.journal_entry (source_type, source_id);

create table erp.journal_line (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references erp.journal_entry(id) on delete cascade,
  line_no          smallint not null,
  account_id       uuid not null references erp.account(id),
  description      text not null default '',
  currency         char(3) not null references erp.currency(code),
  fx_rate          numeric(20,10) not null default 1,
  debit_txn        numeric(20,2) not null default 0 check (debit_txn >= 0),
  credit_txn       numeric(20,2) not null default 0 check (credit_txn >= 0),
  debit            numeric(20,2) not null default 0 check (debit >= 0),
  credit           numeric(20,2) not null default 0 check (credit >= 0),
  customer_id      uuid,
  supplier_id      uuid,
  engagement_id    uuid,
  tax_code_id      uuid references erp.tax_code(id),
  bank_account_id  uuid,
  asset_id         uuid,
  employee_id      uuid,
  unique (entry_id, line_no),
  check (not (debit > 0 and credit > 0)),
  check (not (debit_txn > 0 and credit_txn > 0))
);
create index on erp.journal_line (account_id);
create index on erp.journal_line (customer_id) where customer_id is not null;
create index on erp.journal_line (supplier_id) where supplier_id is not null;
create index on erp.journal_line (engagement_id) where engagement_id is not null;

-- Head of the hash chain, one per entity and journal.
create table erp.ledger_chain (
  entity_id      uuid not null references erp.entity(id),
  journal_id     uuid not null references erp.journal(id),
  last_hash      bytea not null default '\x'::bytea,
  last_entry_id  uuid,
  length         integer not null default 0,
  primary key (entity_id, journal_id)
);

-- Materialised balances, maintained at posting time.
create table erp.account_balance (
  entity_id   uuid not null references erp.entity(id),
  account_id  uuid not null references erp.account(id),
  period_id   uuid not null references erp.period(id),
  currency    char(3) not null,
  debit       numeric(20,2) not null default 0,
  credit      numeric(20,2) not null default 0,
  debit_txn   numeric(20,2) not null default 0,
  credit_txn  numeric(20,2) not null default 0,
  primary key (entity_id, account_id, period_id, currency)
);

create table erp.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    text not null,
  actor_role  text not null,
  table_name  text not null,
  row_id      text not null,
  entity_id   uuid,
  action      char(1) not null check (action in ('I','U','D')),
  before_row  jsonb,
  after_row   jsonb
);
create index on erp.audit_log (table_name, row_id);
create index on erp.audit_log (entity_id, at);

-- =====================================================================
-- 4. RECEIVABLES
-- =====================================================================
create table erp.customer (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references erp.entity(id),
  code                text not null,
  name                text not null,
  regime              erp.counterparty_regime not null default 'standard',
  country             char(2),
  address_lines       text,
  nif                 text,
  vat_number          text,
  ice                 text,                       -- Morocco
  email               text,
  phone               text,
  default_currency    char(3) references erp.currency(code),
  payment_terms_days  smallint not null default 30,
  payment_terms_label text,
  ar_account_id       uuid references erp.account(id),   -- override of AR_CONTROL
  group_entity_id     uuid references erp.entity(id),    -- set when the customer is a group company
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (entity_id, code)
);

create table erp.sales_invoice (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  customer_id          uuid not null references erp.customer(id),
  engagement_id        uuid,
  number               text,                              -- assigned at validation
  status               erp.doc_status not null default 'draft',
  invoice_date         date not null,
  due_date             date not null,
  currency             char(3) not null references erp.currency(code),
  fx_rate              numeric(20,10) not null default 1,
  payment_mode         text,
  payment_terms_label  text,
  bank_account_id      uuid,                              -- bank block printed on the PDF
  total_ht             numeric(20,2) not null default 0,
  total_tax            numeric(20,2) not null default 0,
  total_ttc            numeric(20,2) not null default 0,
  amount_in_words      text,
  qr_payload           text,
  notes                text,
  journal_entry_id     uuid references erp.journal_entry(id),
  created_at           timestamptz not null default now(),
  created_by           text not null default erp.actor_id(),
  unique (entity_id, number)
);

create table erp.sales_invoice_line (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references erp.sales_invoice(id) on delete cascade,
  line_no              smallint not null,
  description          text not null,
  quantity             numeric(14,3) not null default 1,
  unit_price           numeric(20,2) not null,
  discount_pct         numeric(5,2) not null default 0,
  service_category_id  uuid references erp.service_category(id),
  engagement_id        uuid,
  tax_code_id          uuid references erp.tax_code(id),
  tax_rate_snapshot    numeric(7,4) not null default 0,   -- frozen at validation
  line_ht              numeric(20,2) not null,
  tax_amount           numeric(20,2) not null default 0,
  line_ttc             numeric(20,2) not null,
  revenue_account_id   uuid references erp.account(id),   -- resolved at validation
  unique (invoice_id, line_no)
);

create table erp.credit_note (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  customer_id          uuid not null references erp.customer(id),
  original_invoice_id  uuid references erp.sales_invoice(id),
  number               text,
  status               erp.doc_status not null default 'draft',
  note_date            date not null,
  currency             char(3) not null references erp.currency(code),
  fx_rate              numeric(20,10) not null default 1,
  reason               text,
  total_ht             numeric(20,2) not null default 0,
  total_tax            numeric(20,2) not null default 0,
  total_ttc            numeric(20,2) not null default 0,
  journal_entry_id     uuid references erp.journal_entry(id),
  created_at           timestamptz not null default now(),
  unique (entity_id, number)
);

create table erp.credit_note_line (
  id                  uuid primary key default gen_random_uuid(),
  credit_note_id      uuid not null references erp.credit_note(id) on delete cascade,
  line_no             smallint not null,
  description         text not null,
  quantity            numeric(14,3) not null default 1,
  unit_price          numeric(20,2) not null,
  tax_code_id         uuid references erp.tax_code(id),
  tax_rate_snapshot   numeric(7,4) not null default 0,
  line_ht             numeric(20,2) not null,
  tax_amount          numeric(20,2) not null default 0,
  line_ttc            numeric(20,2) not null,
  revenue_account_id  uuid references erp.account(id),
  unique (credit_note_id, line_no)
);

create table erp.customer_payment (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  customer_id       uuid not null references erp.customer(id),
  number            text,
  status            erp.doc_status not null default 'draft',
  payment_date      date not null,
  currency          char(3) not null references erp.currency(code),
  amount_txn        numeric(20,2) not null check (amount_txn > 0),
  fx_rate           numeric(20,10) not null default 1,
  amount            numeric(20,2) not null,                 -- functional currency
  bank_account_id   uuid,
  method            text not null default 'transfer',       -- transfer, cheque, cash, card
  reference         text,
  journal_entry_id  uuid references erp.journal_entry(id),
  created_at        timestamptz not null default now(),
  unique (entity_id, number)
);

-- Settles a payment against an invoice (ar) or a supplier invoice (ap); realised FX computed here.
create table erp.allocation (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  side                 char(2) not null check (side in ('ar','ap')),
  payment_id           uuid not null,
  document_type        text not null,                      -- sales_invoice, credit_note, supplier_invoice
  document_id          uuid not null,
  amount_txn           numeric(20,2) not null check (amount_txn > 0),
  amount_at_doc_rate   numeric(20,2) not null,
  amount_at_pay_rate   numeric(20,2) not null,
  fx_difference        numeric(20,2) generated always as (amount_at_pay_rate - amount_at_doc_rate) stored,
  journal_entry_id     uuid references erp.journal_entry(id),
  created_at           timestamptz not null default now()
);
create index on erp.allocation (document_type, document_id);

create table erp.dunning_run (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references erp.entity(id),
  run_date    date not null,
  created_by  text not null default erp.actor_id()
);

create table erp.dunning_item (
  run_id        uuid not null references erp.dunning_run(id) on delete cascade,
  invoice_id    uuid not null references erp.sales_invoice(id),
  level         smallint not null check (level between 1 and 3),
  days_overdue  integer not null,
  amount_open   numeric(20,2) not null,
  sent_at       timestamptz,
  primary key (run_id, invoice_id)
);

-- =====================================================================
-- 5. PAYABLES
-- =====================================================================
create table erp.supplier (
  id                     uuid primary key default gen_random_uuid(),
  entity_id              uuid not null references erp.entity(id),
  code                   text not null,
  name                   text not null,
  regime                 erp.counterparty_regime not null default 'standard',
  country                char(2),
  address_lines          text,
  nif                    text,
  vat_number             text,
  ice                    text,
  email                  text,
  default_currency       char(3) references erp.currency(code),
  payment_terms_days     smallint not null default 30,
  withholding_code_id    uuid references erp.tax_code(id),   -- applied by default
  ap_account_id          uuid references erp.account(id),
  group_entity_id        uuid references erp.entity(id),
  iban                   text,
  bic                    text,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  unique (entity_id, code)
);

create table erp.supplier_invoice (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  supplier_id          uuid not null references erp.supplier(id),
  supplier_ref         text,
  number               text,
  status               erp.doc_status not null default 'draft',
  invoice_date         date not null,
  received_date        date,
  due_date             date not null,
  currency             char(3) not null references erp.currency(code),
  fx_rate              numeric(20,10) not null default 1,
  total_ht             numeric(20,2) not null default 0,
  total_tax            numeric(20,2) not null default 0,
  total_ttc            numeric(20,2) not null default 0,
  withholding_code_id  uuid references erp.tax_code(id),
  withholding_amount   numeric(20,2) not null default 0,
  net_payable          numeric(20,2) not null default 0,   -- ttc - withholding
  engagement_id        uuid,
  attachment_url       text,
  journal_entry_id     uuid references erp.journal_entry(id),
  created_at           timestamptz not null default now(),
  created_by           text not null default erp.actor_id(),
  unique (entity_id, number)
);

create table erp.supplier_invoice_line (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references erp.supplier_invoice(id) on delete cascade,
  line_no             smallint not null,
  description         text not null,
  quantity            numeric(14,3) not null default 1,
  unit_price          numeric(20,2) not null,
  expense_account_id  uuid not null references erp.account(id),
  tax_code_id         uuid references erp.tax_code(id),
  tax_rate_snapshot   numeric(7,4) not null default 0,
  line_ht             numeric(20,2) not null,
  tax_amount          numeric(20,2) not null default 0,
  line_ttc            numeric(20,2) not null,
  engagement_id       uuid,
  asset_id            uuid,                                 -- set when capitalised
  unique (invoice_id, line_no)
);

create table erp.approval_policy (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  document_type  text not null,                              -- supplier_invoice, payment_run
  min_amount     numeric(20,2) not null default 0,
  required_role  text not null,                              -- manager, partner
  steps          smallint not null default 1
);

create table erp.approval (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  document_type  text not null,
  document_id    uuid not null,
  step_no        smallint not null default 1,
  requested_by   text not null,
  approver_id    text,
  decision       text not null default 'pending' check (decision in ('pending','approved','rejected')),
  decided_at     timestamptz,
  comment        text,
  check (approver_id is null or approver_id <> requested_by)   -- preparer and approver differ
);
create index on erp.approval (document_type, document_id);

create table erp.payment_run (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references erp.entity(id),
  run_date         date not null,
  bank_account_id  uuid,
  status           erp.doc_status not null default 'draft',
  total            numeric(20,2) not null default 0,
  created_by       text not null default erp.actor_id()
);

create table erp.supplier_payment (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  supplier_id       uuid not null references erp.supplier(id),
  payment_run_id    uuid references erp.payment_run(id),
  number            text,
  status            erp.doc_status not null default 'draft',
  payment_date      date not null,
  currency          char(3) not null references erp.currency(code),
  amount_txn        numeric(20,2) not null check (amount_txn > 0),
  fx_rate           numeric(20,10) not null default 1,
  amount            numeric(20,2) not null,
  bank_account_id   uuid,
  method            text not null default 'transfer',
  reference         text,
  journal_entry_id  uuid references erp.journal_entry(id),
  created_at        timestamptz not null default now(),
  unique (entity_id, number)
);

-- =====================================================================
-- 6. BANK AND CASH
-- =====================================================================
create table erp.bank_account (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references erp.entity(id),
  name               text not null,
  bank_name          text,
  account_holder     text,
  iban               text,
  bic                text,
  account_number     text,
  currency           char(3) not null references erp.currency(code),
  gl_account_id      uuid not null references erp.account(id),
  is_cash            boolean not null default false,
  show_on_invoices   boolean not null default false,
  active             boolean not null default true,
  unique (entity_id, name)
);

create table erp.bank_statement (
  id               uuid primary key default gen_random_uuid(),
  bank_account_id  uuid not null references erp.bank_account(id),
  statement_date   date not null,
  opening_balance  numeric(20,2) not null,
  closing_balance  numeric(20,2) not null,
  imported_from    text,                                    -- csv, xlsx, manual
  imported_at      timestamptz not null default now(),
  imported_by      text not null default erp.actor_id()
);

create table erp.bank_transaction (
  id                uuid primary key default gen_random_uuid(),
  bank_account_id   uuid not null references erp.bank_account(id),
  statement_id      uuid references erp.bank_statement(id),
  txn_date          date not null,
  value_date        date,
  amount            numeric(20,2) not null,                 -- signed, bank currency
  description       text,
  reference         text,
  counterparty      text,
  status            text not null default 'unmatched' check (status in ('unmatched','matched','booked')),
  journal_entry_id  uuid references erp.journal_entry(id),
  import_hash       text,                                   -- de-duplication of re-imports
  unique (bank_account_id, import_hash)
);
create index on erp.bank_transaction (bank_account_id, status);

create table erp.reconciliation_match (
  id                   uuid primary key default gen_random_uuid(),
  bank_transaction_id  uuid not null references erp.bank_transaction(id),
  journal_line_id      uuid not null references erp.journal_line(id),
  matched_amount       numeric(20,2) not null,
  matched_by           text not null default erp.actor_id(),
  matched_at           timestamptz not null default now(),
  unique (bank_transaction_id, journal_line_id)
);

create table erp.cash_forecast_item (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  forecast_date  date not null,
  direction      char(3) not null check (direction in ('in','out')),
  source_type    text not null,                             -- sales_invoice, supplier_invoice, payroll, manual
  source_id      uuid,
  amount         numeric(20,2) not null,
  currency       char(3) not null references erp.currency(code),
  confidence     smallint not null default 100 check (confidence between 0 and 100)
);

-- =====================================================================
-- 7. ENGAGEMENTS (the Workroom)
-- =====================================================================
create table erp.engagement_stage (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references erp.org_group(id),
  kind      text not null,                                  -- audit, legal, advisory, tax, it
  stage_no  smallint not null,
  name_fr   text not null,
  name_en   text,
  unique (group_id, kind, stage_no)
);

create table erp.engagement (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references erp.entity(id),
  customer_id      uuid not null references erp.customer(id),
  code             text not null,
  name             text not null,
  kind             text not null,
  stage_id         uuid references erp.engagement_stage(id),
  status           erp.engagement_status not null default 'planned',
  start_date       date,
  deadline         date,
  fee_type         text not null default 'fixed' check (fee_type in ('fixed','time')),
  fixed_fee        numeric(20,2),
  currency         char(3) references erp.currency(code),
  budget_hours     numeric(10,2),
  budget_cost      numeric(20,2),
  partner_user_id  uuid,
  manager_user_id  uuid,
  created_at       timestamptz not null default now(),
  unique (entity_id, code)
);

-- Tasks: the work items behind the command bar. A task belongs to a module (room) and optionally to an engagement.
create type erp.task_status as enum ('todo','in_progress','done');
create type erp.task_priority as enum ('low','normal','high');
create table erp.task (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  title          text not null check (length(trim(title)) > 0),
  module         text not null,                          -- accounting | bank | clients | suppliers | missions | assets | closing | archives | tax | hr | penthouse
  engagement_id  uuid references erp.engagement(id),
  customer_id    uuid references erp.customer(id),
  assignee       text not null,
  due_date       date not null,
  status         erp.task_status not null default 'todo',
  priority       erp.task_priority not null default 'normal',
  notes          text,
  created_at     date not null default current_date,
  completed_at   date,
  check ((status = 'done') = (completed_at is not null))
);
create index task_open_idx on erp.task (entity_id, due_date) where status <> 'done';

-- Physical archive: every boxed engagement file has one row and one slot on the rack of the clients room.
-- Reference ARC-YYYY-0001 is gapless per entity and year (numbering scope 'archive', reset 'year').
create type erp.archive_status as enum ('archived','retrieved','pending_destruction','destroyed');
create type erp.archive_kind as enum ('box','binder');
create table erp.archive_record (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references erp.entity(id),
  engagement_id    uuid not null references erp.engagement(id),
  reference        text not null,
  archived_at      date not null default current_date,
  retention_until  date not null,
  status           erp.archive_status not null default 'archived',
  bay              smallint not null check (bay between 1 and 3),
  shelf            smallint not null check (shelf between 1 and 5),
  slot             smallint not null check (slot between 1 and 4),
  kind             erp.archive_kind not null default 'box',
  label            text not null,
  box_count        smallint not null default 1 check (box_count > 0),
  notes            text,
  retrieved_by     text,
  retrieved_at     date,
  unique (entity_id, reference),
  check (retention_until > archived_at),
  check ((status = 'retrieved') = (retrieved_at is not null))
);
-- one live box per slot and one live box per engagement; a destroyed box frees both
create unique index archive_slot_live_uq on erp.archive_record (entity_id, bay, shelf, slot) where status <> 'destroyed';
create unique index archive_engagement_live_uq on erp.archive_record (engagement_id) where status <> 'destroyed';

create or replace function erp.archive_record_defaults() returns trigger language plpgsql as $$
declare seq integer; eng erp.engagement%rowtype;
begin
  select * into eng from erp.engagement where id = NEW.engagement_id;
  if eng.status <> 'completed' then raise exception 'not_completed: only a completed engagement can be archived'; end if;
  if NEW.reference is null then
    select o_seq into seq from erp.next_number(NEW.entity_id, 'archive', null, NEW.archived_at);
    NEW.reference := 'ARC-' || to_char(NEW.archived_at, 'YYYY') || '-' || lpad(seq::text, 4, '0');
  end if;
  if NEW.retention_until is null then NEW.retention_until := NEW.archived_at + interval '10 years'; end if;
  -- next free slot reads like a page: shelf by shelf, bay by bay, left to right
  if NEW.bay is null then
    select s.shelf, b.bay, sl.slot into NEW.shelf, NEW.bay, NEW.slot
    from generate_series(1,5) s(shelf) cross join generate_series(1,3) b(bay) cross join generate_series(1,4) sl(slot)
    where not exists (select 1 from erp.archive_record a where a.entity_id = NEW.entity_id and a.status <> 'destroyed'
                      and a.bay = b.bay and a.shelf = s.shelf and a.slot = sl.slot)
    order by s.shelf, b.bay, sl.slot limit 1;
    if NEW.bay is null then raise exception 'rack_full: no free slot on the rack'; end if;
  end if;
  return NEW;
end $$;
create trigger archive_record_defaults before insert on erp.archive_record
  for each row execute function erp.archive_record_defaults();

create table erp.engagement_staff (
  engagement_id  uuid not null references erp.engagement(id) on delete cascade,
  user_id        uuid not null,
  role           text not null,                             -- partner, manager, senior, assistant
  planned_hours  numeric(10,2),
  primary key (engagement_id, user_id)
);

create table erp.rate_card (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references erp.entity(id),
  grade           text not null,
  cost_rate       numeric(20,2) not null,
  bill_rate       numeric(20,2) not null,
  currency        char(3) not null references erp.currency(code),
  effective_from  date not null,
  unique (entity_id, grade, effective_from)
);

create table erp.time_entry (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references erp.entity(id),
  engagement_id       uuid not null references erp.engagement(id),
  user_id             uuid not null,
  work_date           date not null,
  hours               numeric(6,2) not null check (hours > 0 and hours <= 24),
  billable            boolean not null default true,
  description         text,
  bill_rate_snapshot  numeric(20,2),
  cost_rate_snapshot  numeric(20,2),
  invoice_line_id     uuid references erp.sales_invoice_line(id),
  created_at          timestamptz not null default now()
);
create index on erp.time_entry (engagement_id, work_date);

create table erp.wip_snapshot (
  id               uuid primary key default gen_random_uuid(),
  engagement_id    uuid not null references erp.engagement(id),
  as_of            date not null,
  hours            numeric(10,2) not null,
  cost             numeric(20,2) not null,
  billable_value   numeric(20,2) not null,
  invoiced_to_date numeric(20,2) not null,
  wip_balance      numeric(20,2) generated always as (billable_value - invoiced_to_date) stored,
  unique (engagement_id, as_of)
);

-- =====================================================================
-- 8. FIXED ASSETS
-- =====================================================================
create table erp.asset_category (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references erp.entity(id),
  code                 text not null,                       -- qualifier of ASSET / ACC_DEPR / DEPR_EXPENSE
  name_fr              text not null,
  method               erp.depreciation_method not null default 'linear',
  default_life_months  smallint not null,
  unique (entity_id, code)
);

create table erp.asset (
  id                        uuid primary key default gen_random_uuid(),
  entity_id                 uuid not null references erp.entity(id),
  category_id               uuid not null references erp.asset_category(id),
  code                      text not null,
  name                      text not null,
  acquisition_date          date not null,
  in_service_date           date,
  cost                      numeric(20,2) not null,
  currency                  char(3) not null references erp.currency(code),
  residual_value            numeric(20,2) not null default 0,
  life_months               smallint not null,
  method                    erp.depreciation_method not null default 'linear',
  location                  text,
  status                    text not null default 'in_service' check (status in ('wip','in_service','disposed')),
  supplier_invoice_line_id  uuid references erp.supplier_invoice_line(id),
  created_at                timestamptz not null default now(),
  unique (entity_id, code)
);

create table erp.depreciation_run (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  period_id         uuid not null references erp.period(id),
  run_date          date not null,
  status            erp.doc_status not null default 'draft',
  journal_entry_id  uuid references erp.journal_entry(id),
  unique (entity_id, period_id)
);

create table erp.depreciation_schedule (
  id                 uuid primary key default gen_random_uuid(),
  asset_id           uuid not null references erp.asset(id),
  period_id          uuid not null references erp.period(id),
  amount             numeric(20,2) not null,
  accumulated_after  numeric(20,2) not null,
  run_id             uuid references erp.depreciation_run(id),
  unique (asset_id, period_id)
);

create table erp.asset_disposal (
  id                uuid primary key default gen_random_uuid(),
  asset_id          uuid not null references erp.asset(id),
  disposal_date     date not null,
  proceeds          numeric(20,2) not null default 0,
  currency          char(3) not null references erp.currency(code),
  nbv_at_disposal   numeric(20,2) not null,
  gain_loss         numeric(20,2) generated always as (proceeds - nbv_at_disposal) stored,
  journal_entry_id  uuid references erp.journal_entry(id)
);

-- =====================================================================
-- 9. INTERCOMPANY AND CONSOLIDATION
-- =====================================================================
create table erp.intercompany_document (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references erp.org_group(id),
  from_entity_id  uuid not null references erp.entity(id),   -- the one that invoices
  to_entity_id    uuid not null references erp.entity(id),   -- the one that pays
  doc_date        date not null,
  kind            text not null,                             -- management_fee, recharge, loan, dividend
  description     text not null,
  currency        char(3) not null references erp.currency(code),
  amount_ht       numeric(20,2) not null,
  tax_code_id     uuid references erp.tax_code(id),
  tax_amount      numeric(20,2) not null default 0,
  from_entry_id   uuid references erp.journal_entry(id),     -- mirrored entries
  to_entry_id     uuid references erp.journal_entry(id),
  status          erp.doc_status not null default 'draft',
  check (from_entity_id <> to_entity_id)
);

create table erp.consolidation_run (
  id                     uuid primary key default gen_random_uuid(),
  group_id               uuid not null references erp.org_group(id),
  period_end             date not null,
  presentation_currency  char(3) not null references erp.currency(code),
  version                smallint not null default 1,
  status                 erp.doc_status not null default 'draft',
  run_at                 timestamptz,
  run_by                 text,
  unique (group_id, period_end, version)
);

create table erp.translation_rate (
  run_id           uuid not null references erp.consolidation_run(id) on delete cascade,
  entity_id        uuid not null references erp.entity(id),
  closing_rate     numeric(20,10) not null,
  average_rate     numeric(20,10) not null,
  historical_rate  numeric(20,10),
  primary key (run_id, entity_id)
);

-- Translated balances, eliminations and adjustments of one run, by group account.
create table erp.consolidation_line (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references erp.consolidation_run(id) on delete cascade,
  entity_id         uuid references erp.entity(id),           -- null for group-level eliminations
  group_account_id  uuid not null references erp.group_account(id),
  source            text not null check (source in ('translated','elimination','adjustment')),
  elimination_kind  text,                                     -- ic_services, ic_balances, investment, dividend
  debit             numeric(20,2) not null default 0,
  credit            numeric(20,2) not null default 0
);

create table erp.intercompany_match (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references erp.consolidation_run(id) on delete cascade,
  from_entity_id  uuid not null references erp.entity(id),
  to_entity_id    uuid not null references erp.entity(id),
  from_balance    numeric(20,2) not null,
  to_balance      numeric(20,2) not null,
  difference      numeric(20,2) generated always as (from_balance - to_balance) stored,
  explanation     text
);

-- =====================================================================
-- 10. ACCESS
-- =====================================================================
create table erp.app_user (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references erp.org_group(id),
  email          text not null unique,
  name           text not null,
  password_hash  text,
  mfa_secret     text,
  locale         char(2) not null default 'fr',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table erp.app_role (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references erp.org_group(id),
  code       text not null,                                  -- partner, manager, accountant, staff, readonly, admin
  name       text not null,
  is_system  boolean not null default false,
  unique (group_id, code)
);

-- A grant = user + entity (null = every entity) + role + modules (null = every module) + hidden pages.
create table erp.access_grant (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references erp.app_user(id),
  entity_id     uuid references erp.entity(id),
  role_id       uuid not null references erp.app_role(id),
  modules       text[],
  hidden_pages  text[],
  granted_by    text not null default erp.actor_id(),
  granted_at    timestamptz not null default now(),
  unique nulls not distinct (user_id, entity_id)
);

create table erp.user_session (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references erp.app_user(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ip          inet,
  user_agent  text
);

create table erp.api_token (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references erp.app_user(id),
  name        text not null,
  token_hash  text not null unique,
  scopes      text[] not null default '{}',
  expires_at  timestamptz
);

-- =====================================================================
-- 11. PHASE 2 SHELLS (HR, tax filings) — columns kept minimal on purpose
-- =====================================================================
create table erp.employee (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references erp.entity(id),
  user_id     uuid references erp.app_user(id),
  code        text not null,
  name        text not null,
  grade       text,
  hired_on    date,
  left_on     date,
  active      boolean not null default true,
  unique (entity_id, code)
);

create table erp.tax_return (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  kind              text not null,                           -- vat, withholding, corporate_tax
  period_start      date not null,
  period_end        date not null,
  due_date          date not null,
  status            text not null default 'open' check (status in ('open','prepared','filed','paid')),
  amount_due        numeric(20,2),
  filed_at          timestamptz,
  journal_entry_id  uuid references erp.journal_entry(id)
);

create table erp.filing_calendar (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references erp.entity(id),
  kind       text not null,
  frequency  text not null check (frequency in ('monthly','quarterly','yearly')),
  due_day    smallint not null,
  note       text
);

-- =====================================================================
-- 12. GUARANTEES — triggers
-- =====================================================================

-- 12.1 Canonical text of an entry, the input of its hash. Status is left out on purpose:
--      the reversed flag may change later without breaking the chain.
create or replace function erp.entry_payload(e erp.journal_entry) returns text
language sql stable as $$
  select concat_ws('|', e.entity_id, e.journal_id, e.chain_seq, e.entry_no, to_char(e.entry_date, 'YYYY-MM-DD'), e.currency, e.fx_rate,
                   e.description, e.source_type, coalesce(e.source_id::text, ''),
                   to_char(e.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), e.posted_by)
         || '#' ||
         coalesce((select string_agg(concat_ws('|', l.line_no, a.code, l.debit, l.credit, l.currency,
                                                l.debit_txn, l.credit_txn, l.fx_rate,
                                                coalesce(l.customer_id::text, ''), coalesce(l.supplier_id::text, ''),
                                                coalesce(l.engagement_id::text, ''), coalesce(l.tax_code_id::text, '')),
                                      ';' order by l.line_no)
                   from erp.journal_line l join erp.account a on a.id = l.account_id
                   where l.entry_id = e.id), '')
$$;

create or replace function erp.entry_hash(e erp.journal_entry) returns bytea
language sql stable as $$
  select sha256(convert_to(encode(coalesce(e.prev_hash, '\x'::bytea), 'hex') || erp.entry_payload(e), 'UTF8'))
$$;

-- 12.2 Lines of a non-draft entry are immutable.
create or replace function erp.journal_line_guard() returns trigger
language plpgsql as $$
declare v_status erp.entry_status;
begin
  if TG_OP in ('UPDATE', 'DELETE') then
    select status into v_status from erp.journal_entry where id = OLD.entry_id;
    if v_status <> 'draft' then
      raise exception 'journal_entry % is %: its lines are immutable', OLD.entry_id, v_status
        using errcode = 'P0001';
    end if;
  end if;
  if TG_OP in ('INSERT', 'UPDATE') then
    select status into v_status from erp.journal_entry where id = NEW.entry_id;
    if v_status is null then
      raise exception 'journal_entry % does not exist', NEW.entry_id;
    end if;
    if v_status <> 'draft' then
      raise exception 'journal_entry % is %: its lines are immutable', NEW.entry_id, v_status
        using errcode = 'P0001';
    end if;
    return NEW;
  end if;
  return OLD;
end $$;

create trigger journal_line_guard
  before insert or update or delete on erp.journal_line
  for each row execute function erp.journal_line_guard();

-- 12.3 Posting: balance, accounts, dimensions, period, gapless number, hash chain. Posted = immutable.
create or replace function erp.journal_entry_guard() returns trigger
language plpgsql as $$
declare
  v_debit   numeric(20,2);
  v_credit  numeric(20,2);
  v_bad     integer;
  v_period  erp.period%rowtype;
  v_chain   erp.ledger_chain%rowtype;
  v_seq     integer;
  v_number  text;
begin
  if TG_OP = 'DELETE' then
    if OLD.status <> 'draft' then
      raise exception 'journal_entry % is %: it cannot be deleted', OLD.id, OLD.status using errcode = 'P0001';
    end if;
    return OLD;
  end if;

  NEW.updated_at := now();

  -- posted: only the reversed flag may change
  if OLD.status = 'posted' then
    if not (NEW.status = 'reversed' and NEW.reversed_by_id is not null and OLD.reversed_by_id is null) then
      raise exception 'journal_entry % is posted and immutable', OLD.id using errcode = 'P0001';
    end if;
    if (to_jsonb(NEW) - 'status' - 'reversed_by_id' - 'updated_at')
       <> (to_jsonb(OLD) - 'status' - 'reversed_by_id' - 'updated_at') then
      raise exception 'journal_entry % is posted: only the reversed flag may change', OLD.id using errcode = 'P0001';
    end if;
    return NEW;
  end if;

  if OLD.status = 'reversed' then
    raise exception 'journal_entry % is reversed and immutable', OLD.id using errcode = 'P0001';
  end if;

  -- draft -> draft: free
  if NEW.status = 'draft' then
    return NEW;
  end if;
  if NEW.status = 'reversed' then
    raise exception 'a draft cannot be reversed; delete it instead';
  end if;

  -- draft -> posted
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
    from erp.journal_line where entry_id = NEW.id;
  if v_debit = 0 and v_credit = 0 then
    raise exception 'journal_entry % has no lines', NEW.id using errcode = 'P0003';
  end if;
  if v_debit <> v_credit then
    raise exception 'journal_entry % is unbalanced: debit % / credit %', NEW.id, v_debit, v_credit
      using errcode = 'P0003';
  end if;
  if exists (select 1 from erp.journal_line where entry_id = NEW.id
             group by currency having sum(debit_txn) <> sum(credit_txn)) then
    raise exception 'journal_entry % is unbalanced in transaction currency', NEW.id using errcode = 'P0003';
  end if;

  select count(*) into v_bad
    from erp.journal_line l join erp.account a on a.id = l.account_id
   where l.entry_id = NEW.id
     and (a.entity_id <> NEW.entity_id or not a.is_postable or a.is_blocked or not a.active);
  if v_bad > 0 then
    raise exception 'journal_entry % uses % account(s) that are not postable for this entity', NEW.id, v_bad
      using errcode = 'P0004';
  end if;

  select count(*) into v_bad
    from erp.journal_line l join erp.account a on a.id = l.account_id
   where l.entry_id = NEW.id
     and ((a.requires_engagement and l.engagement_id is null)
       or (a.requires_counterparty and l.customer_id is null and l.supplier_id is null)
       or (a.requires_tax_code and l.tax_code_id is null));
  if v_bad > 0 then
    raise exception 'journal_entry %: % line(s) miss a required dimension', NEW.id, v_bad using errcode = 'P0004';
  end if;

  select * into v_period from erp.period where id = NEW.period_id;
  if not found or v_period.entity_id <> NEW.entity_id then
    raise exception 'journal_entry %: period missing or of another entity', NEW.id using errcode = 'P0002';
  end if;
  if v_period.fiscal_year_id <> NEW.fiscal_year_id then
    raise exception 'journal_entry %: period belongs to another fiscal year', NEW.id using errcode = 'P0002';
  end if;
  -- Any OPEN fiscal year accepts entries, whatever today's date: past years are keyed in from the ERP.
  if exists (select 1 from erp.fiscal_year fy where fy.id = NEW.fiscal_year_id and fy.is_closed) then
    raise exception 'fiscal year of entry % is closed', NEW.id using errcode = 'P0002';
  end if;
  if NEW.entry_date < v_period.start_date or NEW.entry_date > v_period.end_date then
    raise exception 'entry date % is outside period %', NEW.entry_date, v_period.id using errcode = 'P0002';
  end if;
  if v_period.status = 'locked' then
    raise exception 'period % is locked', v_period.id using errcode = 'P0002';
  end if;
  if v_period.status = 'soft_closed' and erp.actor_role() not in ('partner', 'system') then
    raise exception 'period % is soft-closed: only a partner may post', v_period.id using errcode = 'P0002';
  end if;

  select o_number, o_seq into v_number, v_seq
    from erp.next_number(NEW.entity_id, 'journal_entry', NEW.journal_id, NEW.entry_date);
  NEW.entry_no  := v_seq;
  NEW.posted_at := now();
  NEW.posted_by := erp.actor_id();

  select * into v_chain from erp.ledger_chain
   where entity_id = NEW.entity_id and journal_id = NEW.journal_id for update;
  if not found then
    insert into erp.ledger_chain (entity_id, journal_id) values (NEW.entity_id, NEW.journal_id)
    returning * into v_chain;
  end if;
  NEW.prev_hash := v_chain.last_hash;
  NEW.chain_seq := v_chain.length + 1;
  NEW.hash      := erp.entry_hash(NEW);
  update erp.ledger_chain
     set last_hash = NEW.hash, last_entry_id = NEW.id, length = length + 1
   where entity_id = NEW.entity_id and journal_id = NEW.journal_id;
  return NEW;
end $$;

create trigger journal_entry_guard
  before update or delete on erp.journal_entry
  for each row execute function erp.journal_entry_guard();

-- 12.4 Balances are refreshed the moment an entry is posted.
create or replace function erp.journal_entry_after_post() returns trigger
language plpgsql as $$
begin
  if OLD.status = 'draft' and NEW.status = 'posted' then
    insert into erp.account_balance (entity_id, account_id, period_id, currency, debit, credit, debit_txn, credit_txn)
    select NEW.entity_id, l.account_id, NEW.period_id, l.currency,
           sum(l.debit), sum(l.credit), sum(l.debit_txn), sum(l.credit_txn)
      from erp.journal_line l where l.entry_id = NEW.id
     group by l.account_id, l.currency
    on conflict (entity_id, account_id, period_id, currency) do update
       set debit = erp.account_balance.debit + excluded.debit,
           credit = erp.account_balance.credit + excluded.credit,
           debit_txn = erp.account_balance.debit_txn + excluded.debit_txn,
           credit_txn = erp.account_balance.credit_txn + excluded.credit_txn;
  end if;
  return NEW;
end $$;

create trigger journal_entry_after_post
  after update on erp.journal_entry
  for each row execute function erp.journal_entry_after_post();

-- 12.5 Belt and braces: at commit, every non-draft entry must still balance.
create or replace function erp.journal_entry_balance_check() returns trigger
language plpgsql as $$
declare v_debit numeric(20,2); v_credit numeric(20,2);
begin
  if NEW.status <> 'draft' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
      from erp.journal_line where entry_id = NEW.id;
    if v_debit <> v_credit then
      raise exception 'journal_entry % unbalanced at commit', NEW.id using errcode = 'P0003';
    end if;
  end if;
  return null;
end $$;

create constraint trigger journal_entry_balance_check
  after insert or update on erp.journal_entry
  deferrable initially deferred
  for each row execute function erp.journal_entry_balance_check();

-- 12.6 Reversal: the only correction. Mirrors the lines into a new posted entry and flags the original.
create or replace function erp.reverse_entry(p_entry uuid, p_date date, p_reason text) returns uuid
language plpgsql as $$
declare
  v_old     erp.journal_entry%rowtype;
  v_new_id  uuid;
  v_period  uuid;
  v_fy      uuid;
begin
  select * into v_old from erp.journal_entry where id = p_entry for update;
  if not found then raise exception 'journal_entry % not found', p_entry; end if;
  if v_old.status <> 'posted' then
    raise exception 'journal_entry % is %, only posted entries can be reversed', p_entry, v_old.status;
  end if;
  select p.id, p.fiscal_year_id into v_period, v_fy from erp.period p
   where p.entity_id = v_old.entity_id and p_date between p.start_date and p.end_date and p.period_no <= 12
   order by p.period_no limit 1;
  if v_period is null then raise exception 'no period for %', p_date; end if;

  insert into erp.journal_entry (entity_id, journal_id, fiscal_year_id, period_id, entry_date, description,
                                 currency, fx_rate, source_type, source_id, posting_rule, reversal_of_id)
  values (v_old.entity_id, v_old.journal_id, v_fy, v_period, p_date,
          'Reversal of ' || coalesce(v_old.entry_no::text, '') || ': ' || coalesce(p_reason, ''),
          v_old.currency, v_old.fx_rate, 'reversal', v_old.id, 'reversal.v1', v_old.id)
  returning id into v_new_id;

  insert into erp.journal_line (entry_id, line_no, account_id, description, currency, fx_rate,
                                debit_txn, credit_txn, debit, credit,
                                customer_id, supplier_id, engagement_id, tax_code_id, bank_account_id, asset_id, employee_id)
  select v_new_id, line_no, account_id, description, currency, fx_rate,
         credit_txn, debit_txn, credit, debit,
         customer_id, supplier_id, engagement_id, tax_code_id, bank_account_id, asset_id, employee_id
    from erp.journal_line where entry_id = v_old.id;

  update erp.journal_entry set status = 'posted' where id = v_new_id;
  update erp.journal_entry set status = 'reversed', reversed_by_id = v_new_id where id = v_old.id;
  return v_new_id;
end $$;

-- 12.7 Verify the hash chain of one entity and journal, in posting order (chain_seq), which may
--      interleave fiscal years when past years are keyed in later. Returns one row per posted entry.
create or replace function erp.verify_chain(p_entity uuid, p_journal uuid)
returns table (entry_id uuid, chain_seq integer, entry_no integer, ok boolean)
language plpgsql stable as $$
declare
  r         erp.journal_entry%rowtype;
  v_prev    bytea := '\x'::bytea;
  v_expect  integer := 1;
begin
  for r in select * from erp.journal_entry
            where entity_id = p_entity and journal_id = p_journal and status <> 'draft'
            order by chain_seq
  loop
    entry_id  := r.id;
    chain_seq := r.chain_seq;
    entry_no  := r.entry_no;
    ok := (r.chain_seq = v_expect) and (r.prev_hash = v_prev) and (r.hash = erp.entry_hash(r));
    v_prev := r.hash;
    v_expect := v_expect + 1;
    return next;
  end loop;
end $$;

-- 12.8a Fiscal years: closing needs every period locked, no drafts and a partner; reopening needs a partner.
create or replace function erp.fiscal_year_guard() returns trigger
language plpgsql as $$
begin
  if NEW.is_closed and not OLD.is_closed then
    if erp.actor_role() not in ('partner', 'system') then
      raise exception 'only a partner may close fiscal year %', OLD.label using errcode = 'P0002';
    end if;
    if exists (select 1 from erp.period where fiscal_year_id = OLD.id and status <> 'locked') then
      raise exception 'fiscal year % still has unlocked periods', OLD.label using errcode = 'P0002';
    end if;
    if exists (select 1 from erp.journal_entry where fiscal_year_id = OLD.id and status = 'draft') then
      raise exception 'fiscal year % still has draft entries', OLD.label using errcode = 'P0002';
    end if;
    NEW.closed_at := now();
    NEW.closed_by := erp.actor_id();
  elsif OLD.is_closed and not NEW.is_closed then
    if erp.actor_role() not in ('partner', 'system') then
      raise exception 'only a partner may reopen fiscal year %', OLD.label using errcode = 'P0002';
    end if;
    NEW.closed_at := null;
    NEW.closed_by := null;
  end if;
  return NEW;
end $$;

create trigger fiscal_year_guard
  before update on erp.fiscal_year
  for each row execute function erp.fiscal_year_guard();

-- 12.8 Periods: locking needs zero drafts and a partner; unlocking needs a partner.
create or replace function erp.period_guard() returns trigger
language plpgsql as $$
begin
  if NEW.status = 'locked' and OLD.status <> 'locked' then
    if erp.actor_role() not in ('partner', 'system') then
      raise exception 'only a partner may lock period %', OLD.id using errcode = 'P0002';
    end if;
    if exists (select 1 from erp.journal_entry where period_id = OLD.id and status = 'draft') then
      raise exception 'period % still has draft entries', OLD.id using errcode = 'P0002';
    end if;
    NEW.locked_at := now();
    NEW.locked_by := erp.actor_id();
  elsif OLD.status = 'locked' and NEW.status <> 'locked' then
    if erp.actor_role() not in ('partner', 'system') then
      raise exception 'only a partner may unlock period %', OLD.id using errcode = 'P0002';
    end if;
    NEW.locked_at := null;
    NEW.locked_by := null;
  end if;
  return NEW;
end $$;

create trigger period_guard
  before update on erp.period
  for each row execute function erp.period_guard();

-- 12.9 Statutory accounts (two-digit roots) keep their code, class, kind and place; names stay editable.
create or replace function erp.account_guard() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.is_statutory then
      raise exception 'account % is statutory and cannot be deleted', OLD.code using errcode = 'P0005';
    end if;
    return OLD;
  end if;
  if NEW.entity_id <> OLD.entity_id then
    raise exception 'account % cannot move to another entity', OLD.code using errcode = 'P0005';
  end if;
  if OLD.is_statutory and (NEW.code <> OLD.code or NEW.class <> OLD.class or NEW.kind <> OLD.kind
                           or NEW.parent_id is distinct from OLD.parent_id or not NEW.is_statutory) then
    raise exception 'account % is statutory: code, class, kind and parent are locked', OLD.code
      using errcode = 'P0005';
  end if;
  return NEW;
end $$;

create trigger account_guard
  before update or delete on erp.account
  for each row execute function erp.account_guard();

-- 12.10 Audit log on every business table: who, when, before and after.
create or replace function erp.audit_row() returns trigger
language plpgsql as $$
declare v_before jsonb; v_after jsonb; v_row text; v_entity uuid;
begin
  if TG_OP in ('UPDATE', 'DELETE') then v_before := to_jsonb(OLD); end if;
  if TG_OP in ('INSERT', 'UPDATE') then v_after := to_jsonb(NEW); end if;
  v_row := coalesce(v_after ->> 'id', v_before ->> 'id', '');
  begin
    v_entity := coalesce(v_after ->> 'entity_id', v_before ->> 'entity_id')::uuid;
  exception when others then v_entity := null;
  end;
  insert into erp.audit_log (actor_id, actor_role, table_name, row_id, entity_id, action, before_row, after_row)
  values (erp.actor_id(), erp.actor_role(), TG_TABLE_NAME, v_row, v_entity, left(TG_OP, 1), v_before, v_after);
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'entity','fiscal_year','period','account','journal','account_mapping','tax_code','tax_rule',
    'numbering_policy','journal_entry','journal_line','customer','sales_invoice','sales_invoice_line',
    'credit_note','customer_payment','allocation','supplier','supplier_invoice','supplier_invoice_line',
    'approval','payment_run','supplier_payment','bank_account','bank_transaction','reconciliation_match',
    'engagement','time_entry','asset','depreciation_run','asset_disposal','intercompany_document',
    'consolidation_run','app_user','app_role','access_grant','fx_rate','task','archive_record'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on erp.%1$I
                    for each row execute function erp.audit_row()', t);
  end loop;
end $$;

-- 12.11 Row-level security: a session sees only its entities, whatever the client sends.
do $$
declare t text;
begin
  foreach t in array array[
    'journal_entry','account','journal','account_mapping','tax_code','period','customer','sales_invoice',
    'credit_note','customer_payment','allocation','supplier','supplier_invoice','supplier_payment',
    'bank_account','engagement','time_entry','asset','account_balance','task','archive_record'
  ] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('alter table erp.%I force row level security', t);
    execute format('create policy by_entity on erp.%I using (erp.can_see_entity(entity_id))', t);
  end loop;
end $$;

alter table erp.journal_line enable row level security;
alter table erp.journal_line force row level security;
create policy by_entry on erp.journal_line
  using (exists (select 1 from erp.journal_entry e where e.id = entry_id and erp.can_see_entity(e.entity_id)));

-- =====================================================================
-- 13. REFERENCE DATA
-- =====================================================================
insert into erp.currency (code, name, minor_units) values
  ('MRU', 'Ouguiya mauritanien', 2),
  ('EUR', 'Euro', 2),
  ('USD', 'Dollar américain', 2),
  ('MAD', 'Dirham marocain', 2);
