-- =====================================================================
--  BUMEX ERP — migration 0006: accounting in BUMEX One (integration step 2)
--
--  - Accounts say which third party a line needs (the engine's "client" / "fournisseur" dimension); the posting
--    guard's requires_counterparty follows them.
--  - Posting is for the roles that may post in the engine (admin, partner, RAF, manager, accountant), checked by the
--    database as well, with the customer / supplier each account requires.
--  - Fiscal years are created with their twelve monthly periods in one call.
--  - The last ledger tables carrying an entity get row-level security like the others.
-- =====================================================================
set search_path to erp, public;

-- 1. Third party required by an account
alter table erp.account
  add column if not exists requires_customer boolean not null default false,
  add column if not exists requires_supplier boolean not null default false;

create or replace function erp.account_counterparty_sync() returns trigger
language plpgsql as $$
begin
  NEW.requires_counterparty := NEW.requires_counterparty or NEW.requires_customer or NEW.requires_supplier;
  return NEW;
end $$;

create trigger account_counterparty_sync before insert or update on erp.account
  for each row execute function erp.account_counterparty_sync();

-- 2. Who posts, and with which third parties. Runs after journal_entry_guard (alphabetical order of BEFORE
--    triggers); a refusal rolls the whole posting back, numbering included.
create or replace function erp.journal_entry_post_guard() returns trigger
language plpgsql as $$
declare v_bad integer;
begin
  if OLD.status = 'draft' and NEW.status = 'posted' then
    if erp.actor_role() not in ('admin', 'partner', 'raf', 'manager', 'accountant', 'system') then
      raise exception 'your ERP role cannot post entries' using errcode = '42501';
    end if;
    select count(*) into v_bad
      from erp.journal_line l join erp.account a on a.id = l.account_id
     where l.entry_id = NEW.id
       and ((a.requires_customer and l.customer_id is null) or (a.requires_supplier and l.supplier_id is null));
    if v_bad > 0 then
      raise exception 'journal_entry %: % line(s) miss their customer or supplier', NEW.id, v_bad using errcode = 'P0004';
    end if;
  end if;
  return NEW;
end $$;

create trigger journal_entry_post_guard before update on erp.journal_entry
  for each row execute function erp.journal_entry_post_guard();

-- 3. A calendar fiscal year and its twelve periods (idempotent: an existing year is returned as is)
create or replace function erp.create_fiscal_year(p_entity uuid, p_year integer) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  m    integer;
begin
  if p_year < 1990 or p_year > 2100 then
    raise exception 'fiscal year % is out of range', p_year using errcode = 'P0002';
  end if;
  select id into v_id from erp.fiscal_year where entity_id = p_entity and label = p_year::text;
  if v_id is not null then
    return v_id;
  end if;
  insert into erp.fiscal_year (entity_id, label, start_date, end_date)
  values (p_entity, p_year::text, make_date(p_year, 1, 1), make_date(p_year, 12, 31))
  returning id into v_id;
  for m in 1..12 loop
    insert into erp.period (entity_id, fiscal_year_id, period_no, start_date, end_date)
    values (p_entity, v_id, m, make_date(p_year, m, 1), (make_date(p_year, m, 1) + interval '1 month' - interval '1 day')::date);
  end loop;
  return v_id;
end $$;

-- 4. Row-level security on the ledger tables 0001 left open
do $$
declare t text;
begin
  foreach t in array array['fiscal_year', 'tax_rule', 'ledger_chain', 'numbering_policy'] loop
    execute format('alter table erp.%I enable row level security', t);
    execute format('alter table erp.%I force row level security', t);
    execute format('create policy by_entity on erp.%I using (erp.can_see_entity(entity_id))', t);
  end loop;
end $$;
