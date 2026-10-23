-- BUMEX VANGUARD — migration 0003: the accounting parameters of each company (cahier des charges v4).
-- Journals managed freely with usage controls · chart presented on N digits with auxiliary accounts under the
-- collectives · bank accounts with their own journal and duplicate controls · manual loan schedules and account
-- overrides · payroll regime (normal / GTA) with exemptions · third-party coding rules.
-- Applies on top of 0002_modules.sql. Every new table carrying entity_id is under row-level security.

-- =====================================================================
-- 1. JOURNALS: add, rename, retype and delete freely — as long as nothing posted depends on them
-- =====================================================================
create or replace function erp.journal_guard() returns trigger
language plpgsql as $$
declare v_posted int; v_drafts int; v_banks int; v_loans int;
begin
  if TG_OP = 'DELETE' then
    select count(*) filter (where status <> 'draft'), count(*) filter (where status = 'draft')
      into v_posted, v_drafts from erp.journal_entry where journal_id = OLD.id;
    if v_posted > 0 then
      raise exception 'journal % carries % posted entries and must be kept', OLD.code, v_posted using errcode = 'P0005';
    end if;
    if v_drafts > 0 then
      raise exception 'journal % carries % draft entries: delete or move them first', OLD.code, v_drafts using errcode = 'P0005';
    end if;
    select count(*) into v_banks from erp.bank_account where journal_id = OLD.id;
    if v_banks > 0 then
      raise exception 'journal % is the journal of % bank account(s)', OLD.code, v_banks using errcode = 'P0005';
    end if;
    select count(*) into v_loans from erp.loan where journal_id = OLD.id;
    if v_loans > 0 then
      raise exception 'journal % is the journal of % loan(s)', OLD.code, v_loans using errcode = 'P0005';
    end if;
    return OLD;
  end if;
  NEW.code := upper(trim(NEW.code));
  NEW.name := trim(NEW.name);
  if NEW.code !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'journal code must be 1 to 6 letters or digits' using errcode = 'P0005';
  end if;
  if NEW.name = '' then
    raise exception 'journal name is required' using errcode = 'P0005';
  end if;
  if TG_OP = 'UPDATE' then
    if NEW.entity_id <> OLD.entity_id then
      raise exception 'journal % cannot move to another entity', OLD.code using errcode = 'P0005';
    end if;
    if NEW.kind <> OLD.kind and exists (select 1 from erp.journal_entry where journal_id = OLD.id and status <> 'draft') then
      raise exception 'journal % carries posted entries: its kind is locked (code and name stay editable)', OLD.code
        using errcode = 'P0005';
    end if;
  end if;
  return NEW;
end $$;

create trigger journal_guard
  before insert or update or delete on erp.journal
  for each row execute function erp.journal_guard();

-- =====================================================================
-- 2. CHART PRESENTATION AND AUXILIARY ACCOUNTS
-- =====================================================================
-- The general ledger accounts are presented on N digits (6 by default); the referential's 2-digit roots keep their
-- form, groupings (prefix of a longer code) too, and auxiliary accounts carry the third party's code.
alter table erp.entity
  add column if not exists account_code_length smallint not null default 6 check (account_code_length between 4 and 8);

alter table erp.account
  add column if not exists is_auxiliary  boolean not null default false,
  add column if not exists collective_id uuid references erp.account(id);
alter table erp.account drop constraint account_code_check;
alter table erp.account add constraint account_code_check check (
  (not is_auxiliary and code ~ '^[0-9]{1,8}$') or (is_auxiliary and code ~ '^[A-Z0-9][A-Z0-9._-]{1,11}$'));
alter table erp.account add constraint account_auxiliary_collective check (is_auxiliary = (collective_id is not null));
create index on erp.account (collective_id);

-- an auxiliary account sits under an active, non-auxiliary collective of the same entity and takes its kind
create or replace function erp.auxiliary_account_guard() returns trigger
language plpgsql as $$
declare c erp.account;
begin
  if not NEW.is_auxiliary then return NEW; end if;
  select * into c from erp.account where id = NEW.collective_id;
  if c.id is null or c.entity_id <> NEW.entity_id or c.is_auxiliary or not c.active then
    raise exception 'auxiliary account % needs an active collective account of the same entity', NEW.code
      using errcode = 'P0005';
  end if;
  NEW.kind := c.kind;
  NEW.class := c.class;
  NEW.is_postable := true;
  NEW.is_statutory := false;
  return NEW;
end $$;

create trigger auxiliary_account_guard
  before insert or update on erp.account
  for each row execute function erp.auxiliary_account_guard();

-- presentation of a code on N digits: digit codes longer than a root and shorter than N are right-padded with zeros
create or replace function erp.present_code(p_code text, p_length int) returns text
language sql immutable as $$
  select case when p_code ~ '^[0-9]+$' and length(p_code) > 2 and length(p_code) < p_length
              then rpad(p_code, p_length, '0') else p_code end
$$;

-- lookup tolerant of the short form: '6310' finds '631000' on a six-digit chart, '631000' finds '6310' on a short one
create or replace function erp.find_account(p_entity uuid, p_code text) returns uuid
language plpgsql stable as $$
declare v_len int; v_id uuid; v_code text := trim(p_code); v_stripped text;
begin
  if v_code = '' then return null; end if;
  select id into v_id from erp.account where entity_id = p_entity and code = v_code;
  if v_id is not null then return v_id; end if;
  select account_code_length into v_len from erp.entity where id = p_entity;
  select id into v_id from erp.account
   where entity_id = p_entity and not is_auxiliary and code = erp.present_code(v_code, coalesce(v_len, 6));
  if v_id is not null then return v_id; end if;
  v_stripped := regexp_replace(v_code, '0+$', '');
  if length(v_stripped) >= 3 and v_stripped <> v_code then
    select id into v_id from erp.account where entity_id = p_entity and not is_auxiliary and code = v_stripped;
  end if;
  return v_id;
end $$;

-- the chart as the screen shows it: 'moving' (accounts carrying posted entries, auxiliaries folded into their
-- collective), 'unused' (postable accounts without entries, groupings, roots, inactive), 'auxiliary', 'all'
create or replace function erp.chart_rows(p_entity uuid, p_view text default 'moving')
returns table (account_id uuid, code text, name_fr text, kind erp.account_kind, is_postable boolean, active boolean,
               is_auxiliary boolean, collective_code text, debit numeric, credit numeric, balance numeric, entries bigint)
language sql stable as $$
  with own as (
    select l.account_id, sum(l.debit) as d, sum(l.credit) as c, count(*) as n
      from erp.journal_line l join erp.journal_entry e on e.id = l.entry_id
     where e.entity_id = p_entity and e.status <> 'draft'
     group by l.account_id),
  mov as (
    select account_id, sum(d) as d, sum(c) as c, sum(n)::bigint as n from (
      select account_id, d, c, n from own
      union all
      select a.collective_id, o.d, o.c, o.n from own o join erp.account a on a.id = o.account_id where a.collective_id is not null
    ) x group by account_id)
  select a.id, a.code, a.name_fr, a.kind, a.is_postable, a.active, a.is_auxiliary, col.code,
         coalesce(m.d, 0), coalesce(m.c, 0), coalesce(m.d, 0) - coalesce(m.c, 0), coalesce(m.n, 0)
    from erp.account a
    left join mov m on m.account_id = a.id
    left join erp.account col on col.id = a.collective_id
   where a.entity_id = p_entity
     and case p_view
           when 'auxiliary' then a.is_auxiliary
           when 'all'       then not a.is_auxiliary
           when 'moving'    then not a.is_auxiliary and coalesce(m.n, 0) > 0 and a.is_postable
           else                  not a.is_auxiliary and (coalesce(m.n, 0) = 0 or not a.is_postable)
         end
   order by a.code
$$;

-- =====================================================================
-- 3. THIRD PARTIES: coding rules, unique codes, auxiliary accounts under the collectives
-- =====================================================================
create table erp.third_party_rules (
  entity_id               uuid primary key references erp.entity(id),
  customer_prefix         text not null default 'C' check (customer_prefix ~ '^[A-Z0-9]{0,4}$'),
  supplier_prefix         text not null default 'F' check (supplier_prefix ~ '^[A-Z0-9]{0,4}$'),
  digits                  smallint not null default 3 check (digits between 2 and 6),
  customer_collective_id  uuid references erp.account(id),    -- default: the AR_CONTROL mapping
  supplier_collective_id  uuid references erp.account(id),    -- default: the AP_CONTROL mapping
  updated_at              timestamptz not null default now(),
  updated_by              text not null default erp.actor_id()
);

create or replace function erp.third_party_rules_guard() returns trigger
language plpgsql as $$
declare a erp.account; v_id uuid;
begin
  NEW.customer_prefix := upper(NEW.customer_prefix);
  NEW.supplier_prefix := upper(NEW.supplier_prefix);
  NEW.updated_at := now();
  NEW.updated_by := erp.actor_id();
  foreach v_id in array array_remove(array[NEW.customer_collective_id, NEW.supplier_collective_id], null) loop
    select * into a from erp.account where id = v_id;
    if a.entity_id <> NEW.entity_id or a.is_auxiliary or not a.active then
      raise exception 'collective account % must be an active, non-auxiliary account of the entity', a.code
        using errcode = 'P0005';
    end if;
  end loop;
  return NEW;
end $$;

create trigger third_party_rules_guard
  before insert or update on erp.third_party_rules
  for each row execute function erp.third_party_rules_guard();

-- the collective of a kind of third party: the configured one, else the AR_CONTROL / AP_CONTROL mapping
create or replace function erp.collective_for(p_entity uuid, p_kind text, p_group boolean default false) returns uuid
language plpgsql stable as $$
declare v_id uuid;
begin
  if not p_group then
    select case p_kind when 'customer' then customer_collective_id else supplier_collective_id end
      into v_id from erp.third_party_rules where entity_id = p_entity;
    if v_id is not null and exists (select 1 from erp.account where id = v_id and active) then return v_id; end if;
  end if;
  select account_id into v_id from erp.account_mapping
   where entity_id = p_entity and qualifier = ''
     and key = case when p_kind = 'customer' then case when p_group then 'AR_GROUP' else 'AR_CONTROL' end
                    else case when p_group then 'AP_GROUP' else 'AP_CONTROL' end end;
  return v_id;
end $$;

-- next free code of a third party: prefix + zero-padded sequence, skipping codes already taken
create or replace function erp.next_third_party_code(p_entity uuid, p_kind text) returns text
language plpgsql stable as $$
declare r erp.third_party_rules; v_prefix text; v_digits int; v_code text; n int := 1;
begin
  select * into r from erp.third_party_rules where entity_id = p_entity;
  v_prefix := coalesce(case p_kind when 'customer' then r.customer_prefix else r.supplier_prefix end,
                       case p_kind when 'customer' then 'C' else 'F' end);
  v_digits := coalesce(r.digits, 3);
  loop
    v_code := v_prefix || lpad(n::text, v_digits, '0');
    if p_kind = 'customer' then
      exit when not exists (select 1 from erp.customer where entity_id = p_entity and upper(code) = v_code);
    else
      exit when not exists (select 1 from erp.supplier where entity_id = p_entity and upper(code) = v_code);
    end if;
    n := n + 1;
    if n >= power(10, v_digits) then
      raise exception 'no third-party code left: raise the number of digits' using errcode = 'P0005';
    end if;
  end loop;
  return v_code;
end $$;

-- the auxiliary account of a third party, created under the collective, named after the party, carrying its code
create or replace function erp.ensure_auxiliary_account(p_entity uuid, p_kind text, p_code text, p_name text,
                                                        p_collective uuid default null, p_group boolean default false)
returns uuid language plpgsql as $$
declare v_col uuid; c erp.account; v_id uuid;
begin
  v_col := coalesce(p_collective, erp.collective_for(p_entity, p_kind, p_group));
  if v_col is null then
    raise exception 'no % collective account configured for this entity', p_kind using errcode = 'P0005';
  end if;
  select * into c from erp.account where id = v_col;
  if c.id is null or c.entity_id <> p_entity or c.is_auxiliary or not c.active then
    raise exception 'collective account unknown or inactive' using errcode = 'P0005';
  end if;
  insert into erp.account (entity_id, code, name_fr, class, kind, is_postable, is_statutory, requires_counterparty,
                           is_auxiliary, collective_id)
  values (p_entity, upper(p_code), p_name, c.class, c.kind, true, false, true, true, c.id)
  returning id into v_id;
  return v_id;
end $$;

-- a third party's code: 2 to 12 characters, unique among the customers, the suppliers and the auxiliary accounts of
-- the entity; generated from the rules when missing; the auxiliary account follows the code and the name
create or replace function erp.third_party_guard() returns trigger
language plpgsql as $$
declare v_kind text := case TG_TABLE_NAME when 'customer' then 'customer' else 'supplier' end;
        v_acc uuid; v_other uuid;
begin
  if NEW.code is null or trim(NEW.code) = '' then
    NEW.code := erp.next_third_party_code(NEW.entity_id, v_kind);
  end if;
  NEW.code := upper(trim(NEW.code));
  if NEW.code !~ '^[A-Z0-9][A-Z0-9._-]{1,11}$' then
    raise exception 'third-party code %: 2 to 12 characters (letters, digits, . _ -)', NEW.code using errcode = 'P0005';
  end if;
  if v_kind = 'customer' then
    v_acc := NEW.ar_account_id;
    perform 1 from erp.customer where entity_id = NEW.entity_id and upper(code) = NEW.code and id <> NEW.id;
  else
    v_acc := NEW.ap_account_id;
    perform 1 from erp.supplier where entity_id = NEW.entity_id and upper(code) = NEW.code and id <> NEW.id;
  end if;
  if found then
    raise exception 'code % already used by another %', NEW.code, v_kind using errcode = 'P0005';
  end if;
  select id into v_other from erp.account
   where entity_id = NEW.entity_id and is_auxiliary and code = NEW.code and id is distinct from v_acc;
  if v_other is not null then
    raise exception 'an auxiliary account % already exists', NEW.code using errcode = 'P0005';
  end if;
  if TG_OP = 'INSERT' and v_acc is null then
    v_acc := erp.ensure_auxiliary_account(NEW.entity_id, v_kind, NEW.code, NEW.name, null, NEW.group_entity_id is not null);
  elsif TG_OP = 'UPDATE' and v_acc is not null and (NEW.code <> OLD.code or NEW.name <> OLD.name) then
    update erp.account set code = NEW.code, name_fr = NEW.name where id = v_acc and is_auxiliary;
  end if;
  if v_kind = 'customer' then NEW.ar_account_id := v_acc; else NEW.ap_account_id := v_acc; end if;
  return NEW;
end $$;

create trigger third_party_guard before insert or update on erp.customer for each row execute function erp.third_party_guard();
create trigger third_party_guard before insert or update on erp.supplier for each row execute function erp.third_party_guard();

-- =====================================================================
-- 4. BANK ACCOUNTS: as many as needed, each with its journal, no duplicates, a live postable ledger account
-- =====================================================================
alter table erp.bank_account
  add column if not exists rib          text,
  add column if not exists bank_address text,
  add column if not exists journal_id   uuid references erp.journal(id);
create unique index bank_account_number_uq on erp.bank_account (entity_id, regexp_replace(account_number, '\s', '', 'g'))
  where account_number is not null and account_number <> '';
create unique index bank_account_iban_uq on erp.bank_account (entity_id, upper(regexp_replace(iban, '\s', '', 'g')))
  where iban is not null and iban <> '';
create unique index bank_account_gl_uq on erp.bank_account (entity_id, gl_account_id);
create unique index bank_account_name_uq on erp.bank_account (entity_id, lower(trim(name)));

create or replace function erp.bank_account_guard() returns trigger
language plpgsql as $$
declare a erp.account; j erp.journal; v_used boolean;
begin
  NEW.name := trim(NEW.name);
  if NEW.name = '' then raise exception 'bank account name is required' using errcode = 'P0005'; end if;
  if not NEW.is_cash and coalesce(trim(NEW.bank_name), '') = '' then
    raise exception 'bank name is required' using errcode = 'P0005';
  end if;
  select * into a from erp.account where id = NEW.gl_account_id;
  if a.id is null or a.entity_id <> NEW.entity_id then
    raise exception 'ledger account unknown for this entity' using errcode = 'P0005';
  end if;
  if not a.active or not a.is_postable or a.is_auxiliary then
    raise exception 'ledger account % is not postable or no longer active', a.code using errcode = 'P0005';
  end if;
  if NEW.journal_id is not null then
    select * into j from erp.journal where id = NEW.journal_id;
    if j.id is null or j.entity_id <> NEW.entity_id then
      raise exception 'journal unknown for this entity' using errcode = 'P0005';
    end if;
    if j.kind not in ('bank', 'cash') then
      raise exception 'journal % is not a bank or cash journal', j.code using errcode = 'P0005';
    end if;
  end if;
  if TG_OP = 'UPDATE' then
    if NEW.entity_id <> OLD.entity_id then
      raise exception 'bank account % cannot move to another entity', OLD.name using errcode = 'P0005';
    end if;
    v_used := exists (select 1 from erp.bank_transaction where bank_account_id = OLD.id)
           or exists (select 1 from erp.loan where bank_account_id = OLD.id)
           or exists (select 1 from erp.customer_payment where bank_account_id = OLD.id)
           or exists (select 1 from erp.supplier_payment where bank_account_id = OLD.id);
    if v_used and (NEW.currency <> OLD.currency or NEW.gl_account_id <> OLD.gl_account_id) then
      raise exception 'bank account % carries operations: its currency and ledger account are locked', OLD.name
        using errcode = 'P0005';
    end if;
    if OLD.active and not NEW.active then
      if exists (select 1 from erp.bank_transaction where bank_account_id = OLD.id and status = 'unmatched') then
        raise exception 'bank account % still has statement lines to reconcile', OLD.name using errcode = 'P0005';
      end if;
      if exists (select 1 from erp.loan where bank_account_id = OLD.id and status = 'active') then
        raise exception 'an active loan is domiciled on bank account %', OLD.name using errcode = 'P0005';
      end if;
    end if;
  end if;
  return NEW;
end $$;

create trigger bank_account_guard
  before insert or update on erp.bank_account
  for each row execute function erp.bank_account_guard();

-- the journal used for a bank account's operations: its own, else the entity's cash or bank journal
create or replace function erp.bank_journal_for(p_bank uuid) returns uuid
language sql stable as $$
  select coalesce(b.journal_id,
                  (select j.id from erp.journal j
                    where j.entity_id = b.entity_id and j.active and j.kind = case when b.is_cash then 'cash' else 'bank' end::erp.journal_kind
                    order by j.code limit 1))
    from erp.bank_account b where b.id = p_bank
$$;

-- an inactive bank account takes no new operation
create or replace function erp.bank_operation_guard() returns trigger
language plpgsql as $$
declare v_active boolean; v_name text;
begin
  if NEW.bank_account_id is null then return NEW; end if;
  select active, name into v_active, v_name from erp.bank_account where id = NEW.bank_account_id;
  if v_active is null then
    raise exception 'bank account unknown' using errcode = 'P0005';
  end if;
  if not v_active then
    raise exception 'bank account % is inactive: no new operation on it', v_name using errcode = 'P0005';
  end if;
  return NEW;
end $$;

create trigger bank_operation_guard before insert on erp.bank_transaction for each row execute function erp.bank_operation_guard();
create trigger bank_operation_guard before insert on erp.customer_payment for each row execute function erp.bank_operation_guard();
create trigger bank_operation_guard before insert on erp.supplier_payment for each row execute function erp.bank_operation_guard();

-- =====================================================================
-- 5. LOANS: automatic or manual schedule, accounts and journal of the postings
-- =====================================================================
alter table erp.loan
  add column if not exists schedule_mode       text not null default 'auto' check (schedule_mode in ('auto', 'manual')),
  add column if not exists loan_account_id     uuid references erp.account(id),   -- default: the LOAN mapping
  add column if not exists interest_account_id uuid references erp.account(id),   -- default: the LOAN_INTEREST mapping
  add column if not exists journal_id          uuid references erp.journal(id);   -- default: the bank account's journal

-- the schedule typed from the bank's table: one row per instalment, in order, capital within the principal
create table erp.loan_instalment (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references erp.entity(id),
  loan_id        uuid not null references erp.loan(id) on delete cascade,
  instalment_no  smallint not null check (instalment_no >= 1),
  due_date       date not null,
  capital        numeric(20,2) not null check (capital >= 0),
  interest       numeric(20,2) not null default 0 check (interest >= 0),
  fees           numeric(20,2) not null default 0 check (fees >= 0),
  total          numeric(20,2) generated always as (capital + interest + fees) stored,
  unique (loan_id, instalment_no)
);

create or replace function erp.loan_instalment_guard() returns trigger
language plpgsql as $$
declare l erp.loan; v_cap numeric; v_prev date; v_next date;
begin
  if TG_OP = 'DELETE' then
    if exists (select 1 from erp.loan_payment where loan_id = OLD.loan_id and instalment_no = OLD.instalment_no) then
      raise exception 'instalment % of the loan is paid: it is frozen', OLD.instalment_no using errcode = 'P0005';
    end if;
    return OLD;
  end if;
  select * into l from erp.loan where id = NEW.loan_id;
  if l.schedule_mode <> 'manual' then
    raise exception 'loan % has an automatic schedule: switch it to manual first', l.reference using errcode = 'P0005';
  end if;
  NEW.entity_id := l.entity_id;
  if TG_OP = 'UPDATE' and exists (select 1 from erp.loan_payment where loan_id = OLD.loan_id and instalment_no = OLD.instalment_no) then
    raise exception 'instalment % of loan % is paid: it is frozen', OLD.instalment_no, l.reference using errcode = 'P0005';
  end if;
  select coalesce(sum(capital), 0) into v_cap from erp.loan_instalment
   where loan_id = NEW.loan_id and id <> NEW.id;
  if v_cap + NEW.capital > l.principal + 0.01 then
    raise exception 'the capital of the schedule (%) exceeds the amount borrowed (%)', v_cap + NEW.capital, l.principal
      using errcode = 'P0005';
  end if;
  select max(due_date) into v_prev from erp.loan_instalment where loan_id = NEW.loan_id and instalment_no < NEW.instalment_no and id <> NEW.id;
  select min(due_date) into v_next from erp.loan_instalment where loan_id = NEW.loan_id and instalment_no > NEW.instalment_no and id <> NEW.id;
  if v_prev is not null and NEW.due_date < v_prev then
    raise exception 'instalment % is dated before the previous one', NEW.instalment_no using errcode = 'P0005';
  end if;
  if v_next is not null and NEW.due_date > v_next then
    raise exception 'instalment % is dated after the next one', NEW.instalment_no using errcode = 'P0005';
  end if;
  return NEW;
end $$;

create trigger loan_instalment_guard
  before insert or update or delete on erp.loan_instalment
  for each row execute function erp.loan_instalment_guard();

-- the loan's own accounts and journal must belong to the entity and be usable
create or replace function erp.loan_parameters_guard() returns trigger
language plpgsql as $$
declare a erp.account; j erp.journal; v_id uuid;
begin
  foreach v_id in array array_remove(array[NEW.loan_account_id, NEW.interest_account_id], null) loop
    select * into a from erp.account where id = v_id;
    if a.entity_id <> NEW.entity_id or not a.active or not a.is_postable or a.is_auxiliary then
      raise exception 'account % is not a postable active account of the entity', a.code using errcode = 'P0005';
    end if;
  end loop;
  if NEW.journal_id is not null then
    select * into j from erp.journal where id = NEW.journal_id;
    if j.id is null or j.entity_id <> NEW.entity_id or not j.active then
      raise exception 'journal unknown or inactive for this entity' using errcode = 'P0005';
    end if;
  end if;
  if TG_OP = 'UPDATE' and NEW.schedule_mode <> OLD.schedule_mode
     and exists (select 1 from erp.loan_payment where loan_id = OLD.id) then
    raise exception 'loan % has paid instalments: its schedule mode is locked', OLD.reference using errcode = 'P0005';
  end if;
  return NEW;
end $$;

create trigger loan_parameters_guard
  before insert or update on erp.loan
  for each row execute function erp.loan_parameters_guard();

-- the amounts of a manual instalment are those of the typed schedule
create or replace function erp.loan_payment_manual_guard() returns trigger
language plpgsql as $$
declare l erp.loan; i erp.loan_instalment;
begin
  select * into l from erp.loan where id = NEW.loan_id;
  if l.schedule_mode = 'manual' then
    select * into i from erp.loan_instalment where loan_id = NEW.loan_id and instalment_no = NEW.instalment_no;
    if i.id is null then
      raise exception 'instalment % is not in the typed schedule of loan %', NEW.instalment_no, l.reference using errcode = 'P0005';
    end if;
    if NEW.capital <> i.capital or NEW.interest <> i.interest or NEW.fees <> i.fees then
      raise exception 'instalment % of loan %: amounts differ from the typed schedule', NEW.instalment_no, l.reference using errcode = 'P0005';
    end if;
  end if;
  return NEW;
end $$;

create trigger loan_payment_manual_guard
  before insert on erp.loan_payment
  for each row execute function erp.loan_payment_manual_guard();

-- =====================================================================
-- 6. PAYROLL REGIME PER COMPANY
-- =====================================================================
alter table erp.payroll_rules
  add column if not exists regime        text not null default 'normal' check (regime in ('normal', 'gta')),
  add column if not exists social_exempt boolean,     -- null = follows the regime
  add column if not exists health_exempt boolean,
  add column if not exists tax_exempt    boolean;

-- the deductions actually due under the company's regime: GTA exempts everything unless a flag says otherwise
create or replace function erp.payroll_exemptions(p_entity uuid)
returns table (social boolean, health boolean, tax boolean)
language sql stable as $$
  select coalesce(r.social_exempt, r.regime = 'gta'), coalesce(r.health_exempt, r.regime = 'gta'), coalesce(r.tax_exempt, r.regime = 'gta')
    from erp.payroll_rules r where r.entity_id = p_entity
  union all
  select false, false, false where not exists (select 1 from erp.payroll_rules where entity_id = p_entity)
$$;

-- a payroll line never carries a deduction the company's regime exempts
create or replace function erp.payroll_line_regime_guard() returns trigger
language plpgsql as $$
declare v_entity uuid; ex record;
begin
  select entity_id into v_entity from erp.payroll_run where id = NEW.run_id;
  select * into ex from erp.payroll_exemptions(v_entity);
  if (ex.social and (NEW.social_employee <> 0 or NEW.social_employer <> 0))
     or (ex.health and (NEW.health_employee <> 0 or NEW.health_employer <> 0))
     or (ex.tax and NEW.tax <> 0) then
    raise exception 'payroll line carries a deduction the company''s regime exempts' using errcode = 'P0005';
  end if;
  return NEW;
end $$;

create trigger payroll_line_regime_guard
  before insert or update on erp.payroll_line
  for each row execute function erp.payroll_line_regime_guard();

-- =====================================================================
-- 7. ROW-LEVEL SECURITY AND AUDIT ON THE NEW TABLES
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['third_party_rules', 'loan_instalment'] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('alter table erp.%I force row level security', t);
    execute format('create policy by_entity on erp.%I using (erp.can_see_entity(entity_id))', t);
    execute format('create trigger audit_%1$s after insert or update or delete on erp.%1$I
                    for each row execute function erp.audit_row()', t);
  end loop;
end $$;
