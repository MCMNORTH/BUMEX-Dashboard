-- =====================================================================
--  BUMEX ERP — migration 0009: permissions
--  Applies on top of 0001–0008.
--
--  - A person's parts (the ERP modules) can differ from one entity to the next: erp.user_access.entity_modules
--    holds, per entity code, the modules on that entity when they are not the person's usual ones (modules, null = the
--    role's). Group consolidation is the group's, never an entity's: it stays in modules.
--  - Access is changed by the system or by an administrator who manages access (manages_access, "role modifier"),
--    and by nobody else, whatever their role. The flag is an administrator's only; nobody removes their own.
--  - el.havedh@bumex.mr manages access (asked on 2026-10-26).
--  - Invitations: a person a role modifier adds chooses their password through a link sent to them (7 days, used once).
--  Which parts a person reaches is checked by the application (lib/erp/vanguard/visible.ts and replay.ts), as the
--  modules already were; the database keeps checking the entities (row-level security).
-- =====================================================================
set search_path to erp, public;

-- 1. The per-entity parts and the role modifier
alter table erp.user_access
  add column if not exists entity_modules jsonb,
  add column if not exists manages_access boolean not null default false;

alter table erp.user_access
  add constraint user_access_entity_modules_object check (entity_modules is null or jsonb_typeof(entity_modules) = 'object'),
  add constraint user_access_modifier_admin check (not manages_access or erp_role = 'admin');

-- 2. Who changes access: the system, or an administrator whose own row says they manage access
create or replace function erp.actor_manages_access() returns boolean
language sql stable as $$
  select erp.actor_role() = 'system'
      or (erp.actor_role() = 'admin'
          and exists (select 1 from erp.user_access u
                       where u.user_id = erp.actor_id() and u.erp_role = 'admin' and u.manages_access))
$$;

create or replace function erp.user_access_guard() returns trigger
language plpgsql as $$
declare
  v_unknown text;
  v_wrong   text;
begin
  if not erp.actor_manages_access() then
    raise exception 'only an ERP administrator who manages access may change it' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then
    if OLD.user_id = erp.actor_id() and erp.actor_role() <> 'system' then
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
  -- an entity's parts: an entity the person sees, a list of known modules (consolidation is not an entity's); anything
  -- but an object is the check constraint's to refuse
  select string_agg(k, ', ') into v_wrong
    from jsonb_each(case when jsonb_typeof(NEW.entity_modules) = 'object' then NEW.entity_modules else '{}'::jsonb end) j(k, v)
   where jsonb_typeof(v) <> 'array'
      or not exists (select 1 from erp.entity e where e.code = k)
      or (NEW.entity_codes is not null and not (k = any (NEW.entity_codes)))
      or exists (select 1 from jsonb_array_elements(v) m
                  where jsonb_typeof(m) <> 'string'
                     or not ((m #>> '{}') = any (array['accounting', 'clients', 'suppliers', 'bank', 'assets', 'hr', 'tax',
                                                        'archives', 'reports'])));
  if v_wrong is not null then
    raise exception 'wrong modules for entity(ies): %', v_wrong using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' then
    if NEW.user_id <> OLD.user_id then
      raise exception 'the person of an access row cannot change' using errcode = 'P0001';
    end if;
    if OLD.user_id = erp.actor_id() and erp.actor_role() <> 'system' and (NEW.erp_role <> 'admin' or not NEW.manages_access) then
      raise exception 'an ERP administrator cannot remove their own administrator role or access management' using errcode = 'P0001';
    end if;
    NEW.granted_by := OLD.granted_by;
    NEW.granted_at := OLD.granted_at;
    NEW.updated_by := erp.actor_id();
    NEW.updated_at := now();
  end if;
  return NEW;
end $$;

-- 3. The first role modifier
do $$
declare v_id text;
begin
  select id into v_id from work.person where lower(email) = 'el.havedh@bumex.mr';
  if v_id is null then
    raise notice 'el.havedh@bumex.mr has no person row: nobody manages access yet';
    return;
  end if;
  perform set_config('erp.actor_id', 'migration-0009', true);
  insert into erp.user_access (user_id, erp_role, manages_access) values (v_id, 'admin', true)
  on conflict (user_id) do update set erp_role = 'admin', manages_access = true;
end $$;

-- 4. Invitations (lib/erp/permissions.ts, app/invite): only the token's digest is kept; the server alone reads and
--    writes them (the system session), the link being the only proof the person brings.
create table work.invitation (
  id          uuid primary key default gen_random_uuid(),
  person_id   text not null references work.person (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  text not null default erp.actor_id(),
  created_at  timestamptz not null default now()
);
create index on work.invitation (person_id);
alter table work.invitation enable row level security;
alter table work.invitation force row level security;
create policy system on work.invitation for all using (erp.actor_role() = 'system');
grant select, insert, update, delete on work.invitation to erp_app;
