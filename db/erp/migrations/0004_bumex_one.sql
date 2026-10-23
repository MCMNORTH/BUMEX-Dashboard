-- =====================================================================
--  BUMEX ERP — migration 0004: the ERP inside BUMEX One
--  Applies on top of 0001–0003, which stay as the ERP team delivered them.
--
--  - People sign in with BUMEX One (Firebase). erp.user_access gives a person, by Firebase uid, an ERP role and the
--    entities and modules they may open. BUMEX One roles (profiles.role in Firestore) are not touched.
--  - erp.open_session() sets erp.actor_id / erp.actor_role / erp.entity_ids from that row, for the current
--    transaction only; erp.open_system_session() is the context of server tasks that act for everyone.
--  - Row-level security follows the entity list for every role: a partner given two entities sees two.
--  - The application works through role erp_app, which never bypasses row-level security.
--  - The eight entities carry BUMEX One's codes (types/entity.ts).
-- =====================================================================
set search_path to erp, public;

-- 1. The engine also offers the OHADA chart.
alter type erp.coa_template add value if not exists 'SYSCOHADA';

-- 2. Visibility follows the entity list whatever the role ('*' = every entity). Only the system context sees all;
--    0001 also let every partner through, which would ignore the entities the administrator chose for them.
create or replace function erp.can_see_entity(p_entity uuid) returns boolean
language plpgsql stable as $$
declare v_ids text := coalesce(nullif(current_setting('erp.entity_ids', true), ''), '');
begin
  if erp.actor_role() = 'system' or v_ids = '*' then
    return true;
  end if;
  return p_entity::text = any (string_to_array(v_ids, ','));
end $$;

-- 3. ERP access, one row per person who may open the ERP. No row = no ERP.
create table erp.user_access (
  user_id       text primary key check (length(trim(user_id)) > 0),   -- Firebase uid = BUMEX One profiles.id
  erp_role      text not null check (erp_role in ('admin', 'partner', 'raf', 'manager', 'accountant', 'staff', 'intern')),
  entity_codes  text[] check (entity_codes is null or cardinality(entity_codes) > 0),   -- null = every entity
  modules       text[] check (modules is null or modules <@ array['accounting', 'clients', 'suppliers', 'bank', 'assets',
                  'hr', 'tax', 'archives', 'reports', 'consolidation']),                -- null = the role's modules
  granted_by    text not null default erp.actor_id(),
  granted_at    timestamptz not null default now(),
  updated_by    text,
  updated_at    timestamptz not null default now()
);

create or replace function erp.user_access_guard() returns trigger
language plpgsql as $$
declare v_unknown text;
begin
  if erp.actor_role() not in ('admin', 'system') then
    raise exception 'only an ERP administrator may change ERP access' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then
    if OLD.user_id = erp.actor_id() and erp.actor_role() = 'admin' then
      raise exception 'an ERP administrator cannot remove their own access' using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  select string_agg(c, ', ') into v_unknown
    from unnest(coalesce(NEW.entity_codes, '{}'::text[])) c
   where not exists (select 1 from erp.entity e where e.code = c);
  if v_unknown is not null then
    raise exception 'unknown entity code(s): %', v_unknown using errcode = '23503';
  end if;
  if TG_OP = 'UPDATE' then
    if NEW.user_id <> OLD.user_id then
      raise exception 'the person of an access row cannot change' using errcode = 'P0001';
    end if;
    if OLD.user_id = erp.actor_id() and erp.actor_role() = 'admin' and NEW.erp_role <> 'admin' then
      raise exception 'an ERP administrator cannot remove their own administrator role' using errcode = 'P0001';
    end if;
    NEW.granted_by := OLD.granted_by;
    NEW.granted_at := OLD.granted_at;
    NEW.updated_by := erp.actor_id();
    NEW.updated_at := now();
  end if;
  return NEW;
end $$;

create trigger user_access_guard before insert or update or delete on erp.user_access
  for each row execute function erp.user_access_guard();
create trigger audit_user_access after insert or update or delete on erp.user_access
  for each row execute function erp.audit_row();

-- 4. Session context, set at the start of every transaction the application opens.
create or replace function erp.open_session(p_user_id text) returns text
language plpgsql as $$
declare
  v_access erp.user_access%rowtype;
  v_ids    text;
begin
  select * into v_access from erp.user_access where user_id = p_user_id;
  perform set_config('erp.actor_id', p_user_id, true);
  -- not FOUND: perform resets it, and an empty role would read as 'system' (erp.actor_role()'s default)
  if v_access.user_id is null then
    perform set_config('erp.actor_role', 'none', true);
    perform set_config('erp.entity_ids', '', true);
    return 'none';
  end if;
  if v_access.entity_codes is null then
    v_ids := '*';
  else
    select coalesce(string_agg(id::text, ','), '') into v_ids from erp.entity where code = any (v_access.entity_codes);
  end if;
  perform set_config('erp.actor_role', v_access.erp_role, true);
  perform set_config('erp.entity_ids', v_ids, true);
  return v_access.erp_role;
end $$;

create or replace function erp.open_system_session(p_actor_id text) returns void
language plpgsql as $$
begin
  perform set_config('erp.actor_id', p_actor_id, true);
  perform set_config('erp.actor_role', 'system', true);
  perform set_config('erp.entity_ids', '*', true);
end $$;

-- 5. The application role. Superusers and table owners can bypass row-level security; erp_app cannot, so the
--    application switches to it (set local role erp_app) whatever account it logs in with.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'erp_app') then
    create role erp_app nologin nobypassrls;
  end if;
end $$;
grant usage on schema erp to erp_app;
grant select, insert, update, delete on all tables in schema erp to erp_app;
grant usage, select on all sequences in schema erp to erp_app;
grant execute on all functions in schema erp to erp_app;
alter default privileges in schema erp grant select, insert, update, delete on tables to erp_app;
alter default privileges in schema erp grant usage, select on sequences to erp_app;
alter default privileges in schema erp grant execute on functions to erp_app;
-- The audit trail is written by triggers only.
revoke update, delete, truncate on erp.audit_log from erp_app;
grant erp_app to current_user;

-- 6. The group and its eight entities, with BUMEX One's codes and names.
insert into erp.org_group (name, presentation_currency)
select 'Groupe BUMEX', 'MRU' where not exists (select 1 from erp.org_group);

insert into erp.entity (group_id, code, name, country, functional_currency, coa_template, floor_order, is_holding)
select g.id, v.code, v.name, v.country, v.currency, v.template::erp.coa_template, v.floor_order, v.is_holding
  from (select id from erp.org_group order by created_at limit 1) g
 cross join (values
   ('bumex_holding',    'BUMEX Holding',    'MR', 'MRU', 'PCM',  0, true),
   ('bumex_sa',         'BUMEX SA',         'MR', 'MRU', 'PCM',  1, false),
   ('bumex_audit',      'BUMEX Audit',      'MR', 'MRU', 'PCM',  2, false),
   ('bumex_advisory',   'BUMEX Advisory',   'MR', 'MRU', 'PCM',  3, false),
   ('bumex_mauritanie', 'BUMEX Mauritanie', 'MR', 'MRU', 'PCM',  4, false),
   ('bumex_avocat',     'BUMEX Avocat',     'MR', 'MRU', 'PCM',  5, false),
   ('bumex_it',         'BUMEX IT',         'MR', 'MRU', 'PCM',  6, false),
   ('bumex_maroc',      'BUMEX Maroc',      'MA', 'MAD', 'CGNC', 7, false)
 ) as v(code, name, country, currency, template, floor_order, is_holding)
on conflict (group_id, code) do nothing;
