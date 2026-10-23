-- BUMEX VANGUARD — migration 0002: security (accounts, invitations, deletion approvals), withholding on sales,
-- loans, fixed assets with year-end runs, HR and payroll, mission planning, Excel-importable charts.
-- Applies on top of 0001_init.sql. Every table carrying entity_id is under row-level security like the others.

-- =====================================================================
-- 1. ACCOUNTS AND ACCESS
-- =====================================================================
-- Roles: admin (manages access), partner, raf (finance & administration lead), manager, accountant, staff, intern.
-- 'readonly' is withdrawn: an account with no module is simply not invited.
alter table erp.app_user
  add column if not exists status        text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  add column if not exists invite_token  text unique,                   -- hashed token carried by the invitation link
  add column if not exists invited_at    date not null default current_date,
  add column if not exists activated_at  date,
  add column if not exists created_by    text not null default erp.actor_id(),
  add column if not exists employee_id   uuid;                          -- the HR record of the same person

-- Deletions of protected rows are requested with a reason; partners and the administrator execute them directly,
-- the other roles wait for an approval. The decision is never taken by the requester.
create table erp.deletion_request (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid references erp.entity(id),
  table_name         text not null,
  row_id             text not null,
  label              text not null,
  reason             text not null check (length(trim(reason)) >= 4),
  requested_by       text not null default erp.actor_id(),
  requested_at       timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by         text,
  decided_at         timestamptz,
  decision_note      text
);
create index on erp.deletion_request (status) where status = 'pending';

create or replace function erp.deletion_request_guard() returns trigger
language plpgsql as $$
begin
  if NEW.status <> 'pending' and OLD.status = 'pending' then
    if erp.actor_role() not in ('admin', 'partner', 'system') then
      raise exception 'only a partner or the administrator decides a deletion' using errcode = 'P0002';
    end if;
    if OLD.requested_by = erp.actor_id() then
      raise exception 'the requester cannot decide their own deletion request' using errcode = 'P0002';
    end if;
    NEW.decided_by := erp.actor_id();
    NEW.decided_at := now();
  elsif OLD.status <> 'pending' then
    raise exception 'deletion request % is already decided', OLD.id using errcode = 'P0002';
  end if;
  return NEW;
end $$;
create trigger deletion_request_guard before update on erp.deletion_request for each row execute function erp.deletion_request_guard();

-- =====================================================================
-- 2. WITHHOLDING ON SALES (RAS 7 % on services): the customer keeps it and remits it for us
-- =====================================================================
alter table erp.customer add column if not exists withholding_code_id uuid references erp.tax_code(id);
alter table erp.sales_invoice
  add column if not exists withholding_code_id  uuid references erp.tax_code(id),
  add column if not exists withholding_rate     numeric(7,4) not null default 0,
  add column if not exists withholding_amount   numeric(20,2) not null default 0,
  add column if not exists net_payable          numeric(20,2) not null default 0;   -- ttc - withholding, what the customer pays
-- a withholding code carries a receivable account (suffered, on sales) and/or a payable account (due, on purchases)
alter table erp.tax_code add column if not exists deductible_account_id uuid references erp.account(id);

-- =====================================================================
-- 3. SUPPLIERS: sheet fields, invoice header fields used by the approval circuit
-- =====================================================================
alter table erp.supplier
  add column if not exists phone               text,
  add column if not exists expense_account_id  uuid references erp.account(id);
alter table erp.supplier_invoice
  add column if not exists tax_code_id         uuid references erp.tax_code(id),
  add column if not exists expense_account_id  uuid references erp.account(id),
  add column if not exists description         text,
  add column if not exists approver_role       text check (approver_role in ('manager', 'partner')),
  add column if not exists amount_paid         numeric(20,2) not null default 0,
  add column if not exists paid_at             date;
-- the preparer never approves: enforced on the approval row
create or replace function erp.approval_segregation() returns trigger
language plpgsql as $$
declare v_creator text;
begin
  select created_by into v_creator from erp.supplier_invoice where id = NEW.document_id;
  if v_creator is not null and v_creator = erp.actor_id() and NEW.decision = 'approved' then
    raise exception 'the preparer of a supplier invoice cannot approve it' using errcode = 'P0002';
  end if;
  return NEW;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'erp' and table_name = 'approval' and column_name = 'document_id')
     and exists (select 1 from information_schema.columns where table_schema = 'erp' and table_name = 'approval' and column_name = 'decision') then
    execute 'create trigger approval_segregation before insert on erp.approval for each row execute function erp.approval_segregation()';
  end if;
end $$;

-- =====================================================================
-- 4. LOANS
-- =====================================================================
create table erp.loan (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references erp.entity(id),
  lender              text not null,
  reference           text not null,
  currency            char(3) not null references erp.currency(code),
  principal           numeric(20,2) not null check (principal > 0),
  annual_rate         numeric(7,4) not null check (annual_rate >= 0 and annual_rate <= 1),
  months              smallint not null check (months between 1 and 480),
  start_date          date not null,
  frequency           text not null default 'monthly' check (frequency in ('monthly', 'quarterly')),
  method              text not null default 'annuity' check (method in ('annuity', 'linear')),
  fee_per_instalment  numeric(20,2) not null default 0,
  bank_account_id     uuid not null references erp.bank_account(id),
  status              text not null default 'active' check (status in ('active', 'closed')),
  drawdown_entry_id   uuid references erp.journal_entry(id),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          text not null default erp.actor_id(),
  unique (entity_id, reference),
  check (frequency <> 'quarterly' or months % 3 = 0)
);

create table erp.loan_payment (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  loan_id           uuid not null references erp.loan(id),
  instalment_no     smallint not null check (instalment_no >= 1),
  paid_on           date not null,
  capital           numeric(20,2) not null check (capital >= 0),
  interest          numeric(20,2) not null default 0 check (interest >= 0),
  fees              numeric(20,2) not null default 0 check (fees >= 0),
  total             numeric(20,2) generated always as (capital + interest + fees) stored,
  bank_account_id   uuid not null references erp.bank_account(id),
  journal_entry_id  uuid references erp.journal_entry(id),
  unique (loan_id, instalment_no)
);

-- instalments are recorded in order, never beyond the outstanding capital, and the loan closes on the last one
create or replace function erp.loan_payment_guard() returns trigger
language plpgsql as $$
declare v_loan erp.loan; v_paid numeric; v_n int;
begin
  select * into v_loan from erp.loan where id = NEW.loan_id;
  if v_loan.status <> 'active' then
    raise exception 'loan % is closed', v_loan.reference using errcode = 'P0002';
  end if;
  if NEW.instalment_no > 1 and not exists (select 1 from erp.loan_payment where loan_id = NEW.loan_id and instalment_no = NEW.instalment_no - 1) then
    raise exception 'instalment % of loan % must be paid first', NEW.instalment_no - 1, v_loan.reference using errcode = 'P0002';
  end if;
  select coalesce(sum(capital), 0) into v_paid from erp.loan_payment where loan_id = NEW.loan_id;
  if v_paid + NEW.capital > v_loan.principal + 0.01 then
    raise exception 'capital repaid exceeds the principal of loan %', v_loan.reference using errcode = 'P0002';
  end if;
  v_n := case when v_loan.frequency = 'monthly' then v_loan.months else v_loan.months / 3 end;
  if NEW.instalment_no = v_n then
    update erp.loan set status = 'closed' where id = NEW.loan_id;
  end if;
  NEW.entity_id := v_loan.entity_id;
  return NEW;
end $$;
create trigger loan_payment_guard before insert on erp.loan_payment for each row execute function erp.loan_payment_guard();

-- =====================================================================
-- 5. FIXED ASSETS: the sheet, the automatic plan, the year-end run
-- =====================================================================
alter table erp.asset_category
  add column if not exists asset_account_id     uuid references erp.account(id),
  add column if not exists acc_depr_account_id  uuid references erp.account(id);
alter table erp.asset
  add column if not exists serial              text,
  add column if not exists rate                numeric(7,2),                          -- annual linear rate, 1200 / life_months
  add column if not exists start_date          date,                                  -- commissioning = start of depreciation
  add column if not exists end_date            date,
  add column if not exists accumulated         numeric(20,2) not null default 0,      -- depreciation posted to date
  add column if not exists supplier_id         uuid references erp.supplier(id),
  add column if not exists acquisition_entry_id uuid references erp.journal_entry(id),
  add column if not exists notes               text;
create unique index if not exists asset_serial_unique on erp.asset (entity_id, lower(serial)) where serial is not null;

-- the plan is locked once something is posted: duration, method and start date no longer move
create or replace function erp.asset_guard() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and OLD.accumulated > 0
     and (NEW.life_months <> OLD.life_months or NEW.method <> OLD.method or NEW.start_date is distinct from OLD.start_date or NEW.cost <> OLD.cost or NEW.residual_value <> OLD.residual_value) then
    raise exception 'asset % has posted depreciation: its plan is locked', OLD.code using errcode = 'P0002';
  end if;
  if NEW.residual_value < 0 or NEW.residual_value >= NEW.cost then
    raise exception 'residual value must be between 0 and the cost' using errcode = 'P0002';
  end if;
  if NEW.life_months < 6 or NEW.life_months > 600 then
    raise exception 'useful life between 6 and 600 months' using errcode = 'P0002';
  end if;
  if NEW.rate is null then NEW.rate := round(1200.0 / NEW.life_months, 2); end if;
  if NEW.start_date is null then NEW.start_date := coalesce(NEW.in_service_date, NEW.acquisition_date); end if;
  if NEW.end_date is null then NEW.end_date := (NEW.start_date + (NEW.life_months || ' months')::interval - interval '1 day')::date; end if;
  return NEW;
end $$;
create trigger asset_guard before insert or update on erp.asset for each row execute function erp.asset_guard();

-- year-end run: one posted entry per fiscal year, lines per asset; the asset's accumulated figure follows
alter table erp.depreciation_run
  add column if not exists fiscal_year_id uuid references erp.fiscal_year(id),
  add column if not exists total          numeric(20,2) not null default 0;
alter table erp.depreciation_run alter column period_id drop not null;
create unique index if not exists depreciation_run_year on erp.depreciation_run (entity_id, fiscal_year_id) where fiscal_year_id is not null and status = 'posted';

create table erp.depreciation_run_line (
  run_id    uuid not null references erp.depreciation_run(id) on delete cascade,
  asset_id  uuid not null references erp.asset(id),
  amount    numeric(20,2) not null check (amount > 0),
  primary key (run_id, asset_id)
);
create or replace function erp.depreciation_line_apply() returns trigger
language plpgsql as $$
declare v_cost numeric; v_res numeric; v_acc numeric;
begin
  select cost, residual_value, accumulated into v_cost, v_res, v_acc from erp.asset where id = NEW.asset_id;
  if v_acc + NEW.amount > v_cost - v_res + 0.01 then
    raise exception 'depreciation of asset % would exceed its depreciable base', NEW.asset_id using errcode = 'P0002';
  end if;
  update erp.asset set accumulated = accumulated + NEW.amount where id = NEW.asset_id;
  return NEW;
end $$;
create trigger depreciation_line_apply after insert on erp.depreciation_run_line for each row execute function erp.depreciation_line_apply();

-- =====================================================================
-- 6. HR AND PAYROLL
-- =====================================================================
alter table erp.employee
  add column if not exists first_name     text,
  add column if not exists last_name      text,
  add column if not exists initials       text,
  add column if not exists job_title      text,
  add column if not exists department     text,
  add column if not exists category       text check (category in ('partner', 'manager', 'senior', 'assistant', 'intern', 'support')),
  add column if not exists contract_type  text,
  add column if not exists email          text,
  add column if not exists phone          text,
  add column if not exists gross_salary   numeric(20,2) not null default 0 check (gross_salary >= 0),
  add column if not exists allowances     numeric(20,2) not null default 0 check (allowances >= 0);
alter table erp.app_user add constraint app_user_employee_fk foreign key (employee_id) references erp.employee(id);

create table erp.payroll_rules (
  entity_id            uuid primary key references erp.entity(id),
  social_employee_rate numeric(7,4) not null default 0.01,
  social_employer_rate numeric(7,4) not null default 0.15,
  social_ceiling       numeric(20,2) not null default 0,         -- monthly base ceiling, 0 = none
  health_employee_rate numeric(7,4) not null default 0.04,
  health_employer_rate numeric(7,4) not null default 0.05,
  tax_abatement        numeric(20,2) not null default 6000,      -- monthly, before the brackets
  tax_brackets         jsonb not null default '[{"upTo":9000,"rate":0.15},{"upTo":21000,"rate":0.25},{"upTo":null,"rate":0.40}]',
  label_social         text not null default 'CNSS',
  label_health         text not null default 'CNAM',
  label_tax            text not null default 'ITS',
  updated_at           timestamptz not null default now(),
  updated_by           text not null default erp.actor_id()
);

create table erp.payroll_run (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references erp.entity(id),
  month             char(7) not null check (month ~ '^\d{4}-\d{2}$'),
  run_date          date not null,
  status            text not null default 'simulated' check (status in ('simulated', 'posted')),
  gross             numeric(20,2) not null default 0,
  social_employee   numeric(20,2) not null default 0,
  health_employee   numeric(20,2) not null default 0,
  tax               numeric(20,2) not null default 0,
  net               numeric(20,2) not null default 0,
  social_employer   numeric(20,2) not null default 0,
  health_employer   numeric(20,2) not null default 0,
  employer_cost     numeric(20,2) generated always as (gross + social_employer + health_employer) stored,
  journal_entry_id  uuid references erp.journal_entry(id),
  created_by        text not null default erp.actor_id(),
  created_at        timestamptz not null default now()
);
create unique index payroll_run_posted_month on erp.payroll_run (entity_id, month) where status = 'posted';

create table erp.payroll_line (
  run_id           uuid not null references erp.payroll_run(id) on delete cascade,
  employee_id      uuid not null references erp.employee(id),
  gross            numeric(20,2) not null,
  social_employee  numeric(20,2) not null default 0,
  health_employee  numeric(20,2) not null default 0,
  taxable          numeric(20,2) not null default 0,
  tax              numeric(20,2) not null default 0,
  net              numeric(20,2) not null,
  social_employer  numeric(20,2) not null default 0,
  health_employer  numeric(20,2) not null default 0,
  primary key (run_id, employee_id),
  check (round(gross - social_employee - health_employee - tax, 2) = net)
);

-- a posted payroll is never recalculated: lines and totals freeze with the entry
create or replace function erp.payroll_run_guard() returns trigger
language plpgsql as $$
begin
  if OLD.status = 'posted' and (NEW.status <> 'posted' or NEW.gross <> OLD.gross or NEW.net <> OLD.net or NEW.journal_entry_id is distinct from OLD.journal_entry_id) then
    raise exception 'payroll % is posted and cannot change', OLD.month using errcode = 'P0002';
  end if;
  if NEW.status = 'posted' and NEW.journal_entry_id is null then
    raise exception 'a posted payroll carries its journal entry' using errcode = 'P0002';
  end if;
  return NEW;
end $$;
create trigger payroll_run_guard before update on erp.payroll_run for each row execute function erp.payroll_run_guard();

-- =====================================================================
-- 7. MISSION PLANNING
-- =====================================================================
create table erp.assignment (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  engagement_id  uuid not null references erp.engagement(id) on delete cascade,
  employee_id    uuid not null references erp.employee(id),
  start_date     date not null,
  end_date       date not null,
  load           numeric(4,2) not null default 1 check (load > 0 and load <= 1),
  role           text,
  created_by     text not null default erp.actor_id(),
  created_at     timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on erp.assignment (employee_id, start_date, end_date);
create index on erp.assignment (engagement_id);

-- the same person on the same engagement twice over overlapping dates is a duplicate, not a second assignment
create or replace function erp.assignment_guard() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from erp.assignment a where a.id <> NEW.id and a.engagement_id = NEW.engagement_id and a.employee_id = NEW.employee_id and a.start_date <= NEW.end_date and a.end_date >= NEW.start_date) then
    raise exception 'employee already assigned to this engagement over these dates' using errcode = 'P0002';
  end if;
  if not exists (select 1 from erp.employee e where e.id = NEW.employee_id and e.active) then
    raise exception 'employee is not active' using errcode = 'P0002';
  end if;
  return NEW;
end $$;
create trigger assignment_guard before insert or update on erp.assignment for each row execute function erp.assignment_guard();

-- week-by-week load of a person: who is free, who is assigned, where two engagements overlap
create or replace function erp.planning_load(p_entity uuid, p_from date, p_weeks int)
returns table (employee_id uuid, week_start date, load numeric, engagements int)
language sql stable as $$
  with weeks as (
    select (date_trunc('week', p_from)::date + (g * 7)) as week_start from generate_series(0, p_weeks - 1) g
  )
  select e.id, w.week_start, coalesce(sum(a.load), 0), count(distinct a.engagement_id)::int
  from erp.employee e
  cross join weeks w
  left join erp.assignment a on a.employee_id = e.id and a.start_date <= w.week_start + 6 and a.end_date >= w.week_start
  where e.entity_id = p_entity and e.active
  group by e.id, w.week_start
  order by e.id, w.week_start
$$;

-- =====================================================================
-- 8. CHART IMPORT: a staging table so a spreadsheet is checked before any account changes
-- =====================================================================
create table erp.chart_import (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references erp.entity(id),
  file_name    text,
  rows         jsonb not null,                  -- [{code, nameFr, nameEn, class, kind, postable, dimension, active}]
  errors       jsonb not null default '[]',
  warnings     jsonb not null default '[]',
  status       text not null default 'validated' check (status in ('validated', 'applied', 'discarded')),
  created_by   text not null default erp.actor_id(),
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- 9. ROW-LEVEL SECURITY ON THE NEW TABLES
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['loan', 'loan_payment', 'employee', 'payroll_run', 'assignment', 'chart_import', 'asset_category'] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('alter table erp.%I force row level security', t);
    execute format('create policy by_entity on erp.%I using (erp.can_see_entity(entity_id))', t);
  end loop;
end $$;
alter table erp.deletion_request enable row level security;
alter table erp.deletion_request force row level security;
create policy by_entity on erp.deletion_request using (entity_id is null or erp.can_see_entity(entity_id));
alter table erp.payroll_line enable row level security;
alter table erp.payroll_line force row level security;
create policy by_run on erp.payroll_line using (exists (select 1 from erp.payroll_run r where r.id = run_id and erp.can_see_entity(r.entity_id)));

-- =====================================================================
-- 10. PARTNER-LEVEL GUARDS NOW ACCEPT THE ADMINISTRATOR AND THE RAF (same bodies as 0001, wider role list)
-- =====================================================================
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
  if v_period.status = 'soft_closed' and erp.actor_role() not in ('partner', 'admin', 'raf', 'system') then
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

create or replace function erp.fiscal_year_guard() returns trigger
language plpgsql as $$
begin
  if NEW.is_closed and not OLD.is_closed then
    if erp.actor_role() not in ('partner', 'admin', 'raf', 'system') then
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
    if erp.actor_role() not in ('partner', 'admin', 'raf', 'system') then
      raise exception 'only a partner may reopen fiscal year %', OLD.label using errcode = 'P0002';
    end if;
    NEW.closed_at := null;
    NEW.closed_by := null;
  end if;
  return NEW;
end $$;

create or replace function erp.period_guard() returns trigger
language plpgsql as $$
begin
  if NEW.status = 'locked' and OLD.status <> 'locked' then
    if erp.actor_role() not in ('partner', 'admin', 'raf', 'system') then
      raise exception 'only a partner may lock period %', OLD.id using errcode = 'P0002';
    end if;
    if exists (select 1 from erp.journal_entry where period_id = OLD.id and status = 'draft') then
      raise exception 'period % still has draft entries', OLD.id using errcode = 'P0002';
    end if;
    NEW.locked_at := now();
    NEW.locked_by := erp.actor_id();
  elsif OLD.status = 'locked' and NEW.status <> 'locked' then
    if erp.actor_role() not in ('partner', 'admin', 'raf', 'system') then
      raise exception 'only a partner may unlock period %', OLD.id using errcode = 'P0002';
    end if;
    NEW.locked_at := null;
    NEW.locked_by := null;
  end if;
  return NEW;
end $$;
