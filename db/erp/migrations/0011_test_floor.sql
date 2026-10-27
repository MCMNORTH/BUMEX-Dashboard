-- =====================================================================
--  BUMEX ERP — migration 0011: the test floor (BUMEX Testing, the basement)
--  Applies on top of 0001–0010.
--
--  An entity where anyone, whatever their role, tries the app without touching anything else (asked on 2026-10-27):
--  - erp.entity.is_test marks it; "every entity" (entity_codes null) no longer includes it. A person sees it only
--    when a role modifier gives it to them (erp.user_access.test_floor, off by default), like a floor, with its parts.
--  - The books are by entity already (row-level security). The work's rules let administrators and shareholders read
--    every mission, ticket and client: a test record is now hidden from whoever does not see the test floor, whatever
--    their role. Its clients are the floor's own (work.client.is_test): a test customer never links to a real client
--    nor renames one, and a mission or contract never mixes a test client with a real one.
--  - Nothing is e-mailed about a test record (the in-app notification stays). Time entered on a test mission never
--    counts in the person's real week: a sent week does not lock it, and the screens keep it apart.
--  - The group's figures leave it out (the engine, lib/erp/engine/signals.ts).
-- =====================================================================
set search_path to erp, public;

-- 1. The floor, and who sees it
alter table erp.entity add column if not exists is_test boolean not null default false;
alter table erp.user_access add column if not exists test_floor boolean not null default false;
alter table work.client add column if not exists is_test boolean not null default false;
-- a test client may bear a real client's name
drop index if exists work.client_name_uq;
create unique index client_name_uq on work.client (lower(name), is_test);

insert into erp.entity (group_id, code, name, country, functional_currency, coa_template, floor_order, is_holding, is_test)
select g.id, 'bumex_testing', 'BUMEX Testing', 'MR', 'MRU', 'PCM', 8, false, true
  from (select id from erp.org_group order by created_at limit 1) g
on conflict (group_id, code) do nothing;

create or replace function erp.is_test_entity(p_entity uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select e.is_test from erp.entity e where e.id = p_entity), false) $$;

-- every entity (null) is every real one; the test floor is given apart. Nobody but the system reads '*' any more.
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
  select coalesce(string_agg(id::text, ','), '') into v_ids
    from erp.entity
   where case when is_test then v_access.test_floor
              else v_access.entity_codes is null or code = any (v_access.entity_codes) end;
  perform set_config('erp.actor_role', v_access.erp_role, true);
  perform set_config('erp.entity_ids', v_ids, true);
  return v_access.erp_role;
end $$;

-- 0009's guard, with the test floor: never in entity_codes (test_floor gives it), its parts only with it
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
   where not exists (select 1 from erp.entity e where e.code = c and not e.is_test);
  if v_unknown is not null then
    raise exception 'unknown entity code(s): % (the test floor is given by test_floor)', v_unknown using errcode = '23503';
  end if;
  -- an entity's parts: an entity the person sees, a list of known modules (consolidation is not an entity's); anything
  -- but an object is the check constraint's to refuse
  select string_agg(k, ', ') into v_wrong
    from jsonb_each(case when jsonb_typeof(NEW.entity_modules) = 'object' then NEW.entity_modules else '{}'::jsonb end) j(k, v)
   where jsonb_typeof(v) <> 'array'
      or not exists (select 1 from erp.entity e
                      where e.code = k
                        and case when e.is_test then NEW.test_floor
                                 else NEW.entity_codes is null or k = any (NEW.entity_codes) end)
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

-- 2. What is a test record, and who does not see one. (Read from the session's own entity list: erp.can_see_entity
--    lets a helper see every entity.)
create or replace function work.sees_test() returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select erp.actor_role() = 'system' or coalesce(current_setting('erp.entity_ids', true), '') = '*'
      or exists (select 1 from erp.entity e
                  where e.is_test and e.id::text = any (string_to_array(coalesce(current_setting('erp.entity_ids', true), ''), ','))) $$;

create or replace function work.hidden(p_test boolean) returns boolean
language sql stable as $$ select coalesce(p_test, false) and not work.sees_test() $$;

create or replace function work.engagement_is_test(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select x.is_test from erp.engagement e join erp.entity x on x.id = e.entity_id where e.id = p_engagement), false) $$;

create or replace function work.task_is_test(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select x.is_test from erp.task t join erp.entity x on x.id = t.entity_id where t.id = p_task), false) $$;

create or replace function work.client_is_test(p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select c.is_test from work.client c where c.id = p_client), false) $$;

create or replace function work.contract_is_test(p_contract uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select work.client_is_test(c.client_id) or work.engagement_is_test(c.engagement_id) from work.contract c where c.id = p_contract), false) $$;

-- a document's record
create or replace function work.related_is_test(p_type text, p_related uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case p_type
    when 'project' then work.engagement_is_test(p_related)
    when 'task' then work.task_is_test(p_related)
    when 'client' then work.client_is_test(p_related)
    when 'contract' then work.contract_is_test(p_related)
    else false
  end $$;

-- the subject of a notification, comment or activity line
create or replace function work.subject_is_test(p_type text, p_subject text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when p_type = 'project' then work.engagement_is_test(work.uuid_or_null(p_subject))
    when p_type in ('ticket', 'task') then work.task_is_test(work.uuid_or_null(p_subject))
    when p_type = 'milestone' then work.engagement_is_test((select m.engagement_id from work.milestone m where m.id = work.uuid_or_null(p_subject)))
    when p_type = 'client' then work.client_is_test(work.uuid_or_null(p_subject))
    when p_type = 'contract' then work.contract_is_test(work.uuid_or_null(p_subject))
    when p_type = 'document' then coalesce((select work.related_is_test(d.related_type, d.related_id) from work.document d where d.id = work.uuid_or_null(p_subject)), false)
    else false
  end $$;

-- 3. 0008's rules, each first leaving out the test records of whoever does not see the floor
create or replace function work.can_manage_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from erp.engagement e
       where e.id = p_engagement
         and (e.owner_id = erp.actor_id()
              or exists (select 1 from erp.engagement_staff s where s.engagement_id = e.id and s.user_id = erp.actor_id())))
    else false
  end $$;

create or replace function work.can_read_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' or p_engagement is null then false
    else work.can_manage_project(p_engagement)
      or exists (select 1 from erp.task t where t.engagement_id = p_engagement and work.works_on(t.id, t.assignee_id))
  end $$;

create or replace function work.can_read_task_row(p_task uuid, p_engagement uuid, p_assignee text, p_reporter text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.task_is_test(p_task) or work.engagement_is_test(p_engagement)) and case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' then false
    else work.works_on(p_task, p_assignee) or coalesce(p_reporter = erp.actor_id(), false) or work.can_manage_project(p_engagement)
  end $$;

create or replace function work.can_read_task(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.task_is_test(p_task)) and (
         work.actor_class() in ('admin', 'shareholder')
      or coalesce((select work.can_read_task_row(t.id, t.engagement_id, t.assignee_id, t.reporter_id) from erp.task t where t.id = p_task), false)) $$;

create or replace function work.can_edit_subtasks_of(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.task_is_test(p_task)) and (
         work.actor_class() = 'admin'
      or coalesce((select work.can_manage_project(t.engagement_id) or coalesce(t.assignee_id = erp.actor_id(), false)
                     from erp.task t where t.id = p_task), false)) $$;

create or replace function work.can_manage_milestones(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (select 1 from erp.engagement e where e.id = p_engagement and e.owner_id = erp.actor_id())
    else false
  end $$;

create or replace function work.can_read_client(p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.client_is_test(p_client)) and case work.actor_class()
    when 'admin' then true
    when 'shareholder' then true
    when 'manager' then p_client is not null and (
         exists (select 1 from work.client c where c.id = p_client and c.account_manager_id = erp.actor_id())
      or exists (select 1 from erp.engagement e
                  where e.client_id = p_client
                    and (e.owner_id = erp.actor_id()
                         or exists (select 1 from erp.engagement_staff s where s.engagement_id = e.id and s.user_id = erp.actor_id()))))
    when 'employee' then p_client is not null and exists (
      select 1 from erp.task t join erp.engagement e on e.id = t.engagement_id
       where e.client_id = p_client and work.works_on(t.id, t.assignee_id))
    else false
  end $$;

create or replace function work.can_manage_client_finance(p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.client_is_test(p_client)) and case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (select 1 from work.client c where c.id = p_client and c.account_manager_id = erp.actor_id())
    else false
  end $$;

create or replace function work.can_read_contract_row(p_client uuid, p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.client_is_test(p_client) or work.engagement_is_test(p_engagement))
     and (work.can_read_client(p_client) or (p_engagement is not null and work.can_read_project(p_engagement))) $$;

create or replace function work.can_manage_contract_row(p_client uuid, p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.client_is_test(p_client) or work.engagement_is_test(p_engagement)) and case work.actor_class()
    when 'admin' then true
    when 'manager' then work.can_manage_client_finance(p_client) or (p_engagement is not null and work.can_manage_project(p_engagement))
    else false
  end $$;

create or replace function work.can_manage_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.contract_is_test(p_contract)) and (
         work.actor_class() = 'admin'
      or coalesce((select work.can_manage_contract_row(c.client_id, c.engagement_id) from work.contract c where c.id = p_contract), false)) $$;

create or replace function work.can_manage_document(p_type text, p_related uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.related_is_test(p_type, p_related)) and case
    when work.actor_class() = 'admin' then true
    when p_type = 'archive' then work.actor_class() = 'manager'
    when p_type = 'project' then work.can_manage_project(p_related)
    when p_type = 'task' then coalesce((select work.can_manage_project(t.engagement_id) from erp.task t where t.id = p_related), false)
    when p_type = 'client' then exists (select 1 from work.client c where c.id = p_related and c.account_manager_id = erp.actor_id())
    when p_type = 'contract' then work.can_manage_contract(p_related)
    when p_type = 'payment' then work.can_read_payment(p_related)
    else false
  end $$;

create or replace function work.can_read_document_row(p_type text, p_related uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.related_is_test(p_type, p_related)) and case
    when work.actor_class() = 'admin' then true
    when p_type = 'archive' then
      case when p_visibility = 'shareholders' then work.actor_class() in ('shareholder', 'manager') else work.actor_class() = 'manager' end
    when p_visibility = 'restricted' then work.can_manage_document(p_type, p_related)
    when p_visibility = 'management' then work.actor_class() = 'manager'
                                          and work.can_read_related(p_type, p_related, array['project','task','client','contract','payment'])
    when p_visibility = 'shareholders' then work.actor_class() = 'shareholder'
                                            and work.can_read_related(p_type, p_related, array['project','client','contract','payment'])
    when work.actor_class() = 'manager' then work.can_read_related(p_type, p_related, array['project','task','client','contract','payment'])
    when work.actor_class() = 'employee' then work.can_read_related(p_type, p_related, array['project','task','client','contract'])
    else false
  end $$;

create or replace function work.can_read_activity(p_user text, p_type text, p_subject text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.subject_is_test(p_type, p_subject)) and case
    when work.actor_class() = 'admin' or p_user = erp.actor_id() then true
    when work.actor_class() <> 'manager' then false
    when p_type = 'project' then work.can_read_project(work.uuid_or_null(p_subject))
    when p_type = 'milestone' then work.can_read_milestone(work.uuid_or_null(p_subject))
    when p_type = 'task' then work.can_read_task(work.uuid_or_null(p_subject))
    when p_type = 'client' then work.can_read_client(work.uuid_or_null(p_subject))
    when p_type = 'contract' then work.can_read_contract(work.uuid_or_null(p_subject))
    when p_type = 'invoice' then work.can_read_invoice(work.uuid_or_null(p_subject))
    when p_type = 'receipt' then work.can_read_receipt(work.uuid_or_null(p_subject))
    when p_type = 'document' then work.can_read_document(work.uuid_or_null(p_subject))
    when p_type = 'payment' then work.can_read_payment(work.uuid_or_null(p_subject))
    when p_type = 'transfer' then work.can_read_transfer(work.uuid_or_null(p_subject))
    when p_type = 'team' then true
    else false
  end $$;

create or replace function work.is_staffing_manager(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and (
         work.actor_class() = 'admin'
      or coalesce((select work.is_entity_manager(e.entity_id) from erp.engagement e where e.id = p_engagement), false)) $$;

create or replace function work.sees_mission(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and (
         work.actor_class() in ('admin', 'shareholder')
      or exists (select 1 from erp.engagement e
                  where e.id = p_engagement
                    and (coalesce(current_setting('erp.entity_ids', true), '') = '*'
                         or e.entity_id::text = any (string_to_array(coalesce(current_setting('erp.entity_ids', true), ''), ','))))
      or work.can_read_project(p_engagement)) $$;

-- the rules that let an administrator through on their own
drop policy if exists add on erp.engagement;
create policy add on erp.engagement for insert
  with check (work.inside() or (work.actor_class() = 'admin' and not work.hidden(erp.is_test_entity(entity_id)))
              or (work.actor_class() = 'manager' and owner_id = erp.actor_id() and erp.can_see_entity(entity_id)));

drop policy if exists add on erp.task;
create policy add on erp.task for insert
  with check (work.inside() or (work.actor_class() = 'admin' and not work.hidden(work.engagement_is_test(engagement_id)))
              or work.can_manage_project(engagement_id));

-- (this one reads too: an administrator reads every client but the test floor's)
drop policy if exists manage on work.client;
create policy manage on work.client for all
  using (work.inside() or ((work.actor_class() = 'admin' or (work.actor_class() = 'manager' and account_manager_id = erp.actor_id()))
                           and not work.hidden(is_test)));

drop policy if exists read on work.notification;
create policy read on work.notification for select
  using (work.inside() or ((work.actor_class() = 'admin' or user_id = erp.actor_id())
                           and not work.hidden(work.subject_is_test(subject_type, subject_id))
                           and (work.actor_class() = 'admin' or work.can_read_notification_subject(subject_type, subject_id))));

drop policy if exists read on erp.time_entry;
create policy read on erp.time_entry for select
  using (work.inside() or user_id = erp.actor_id()
         or ((work.actor_class() = 'admin' or work.is_entity_manager(entity_id)) and not work.hidden(erp.is_test_entity(entity_id))));

-- 4. Test clients stay the test floor's: a test customer links to (and renames) a test client only, a real one a real
--    one; a mission or a contract never mixes the two
create or replace function erp.customer_to_client() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_client uuid;
  v_test   boolean := erp.is_test_entity(new.entity_id);
begin
  if new.group_entity_id is not null then return new; end if;
  -- its client deleted: the customer stays without one
  if tg_op = 'UPDATE' and new.client_id is null and old.client_id is not null then return new; end if;
  -- a customer without its client: linked to the one of the same name (left as it is), or to a new one
  if new.client_id is null then
    select id into v_client from work.client where lower(name) = lower(new.name) and is_test = v_test;
    if v_client is null then
      insert into work.client (name, contact_email, tax_id, country, type, status, is_test)
      values (new.name, case when position('@' in coalesce(new.email, '')) > 0 then new.email end, new.nif, new.country, 'company', 'active', v_test)
      returning id into v_client;
    end if;
    if not exists (select 1 from erp.customer where entity_id = new.entity_id and client_id = v_client) then
      update erp.customer set client_id = v_client where id = new.id;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.name, new.email, new.nif) is distinct from (old.name, old.email, old.nif)
     and not exists (select 1 from work.client k where lower(k.name) = lower(new.name) and k.id <> new.client_id) then
    update work.client k
       set name = new.name, contact_email = case when position('@' in coalesce(new.email, '')) > 0 then new.email else k.contact_email end,
           tax_id = new.nif
     where k.id = new.client_id and k.is_test = v_test
       and (k.name, k.contact_email, k.tax_id)
           is distinct from (new.name, case when position('@' in coalesce(new.email, '')) > 0 then new.email else k.contact_email end, new.nif);
  end if;
  return new;
end $$;

create or replace function erp.engagement_test_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.client_id is not null and work.client_is_test(new.client_id) <> erp.is_test_entity(new.entity_id) then
    raise exception 'test_client_mismatch' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger engagement_test_guard before insert or update of client_id, entity_id on erp.engagement
  for each row execute function erp.engagement_test_guard();

create or replace function work.contract_test_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.client_id is not null and new.engagement_id is not null
     and work.client_is_test(new.client_id) <> work.engagement_is_test(new.engagement_id) then
    raise exception 'test_client_mismatch' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger contract_test_guard before insert or update of client_id, engagement_id on work.contract
  for each row execute function work.contract_test_guard();

-- 5. No e-mail about a test record (the notification itself stays, for the testers)
create or replace function work.queue_notification_email() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into work.notification_email (notification_id, user_id, recipient_email, subject, body, subject_type, subject_id)
  select new.id, new.user_id, trim(p.email), new.title, new.body, new.subject_type, new.subject_id
    from work.person p
   where p.id = new.user_id and not new.skip_email and p.email_notifications and trim(p.email) <> ''
     and not work.subject_is_test(new.subject_type, new.subject_id)
  on conflict (notification_id) do nothing;
  return new;
end $$;

-- 6. Time on a test mission is apart from the person's real week: a sent week does not lock it
create or replace function erp.time_entry_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  -- a person's own lines only (the rules say so too, but this guard reads before them: it must reveal nothing of
  -- someone else's days or weeks)
  if erp.actor_role() <> 'system' and new.user_id is distinct from erp.actor_id() then
    raise exception 'new row violates row-level security policy for table "time_entry"' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.entity_id := coalesce((select entity_id from erp.engagement where id = new.engagement_id), new.entity_id);
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.entity_id <> old.entity_id or new.id <> old.id
                           or (select entity_id from erp.engagement where id = new.engagement_id) <> old.entity_id) then
    raise exception 'time_entry_identity_immutable';
  end if;
  -- the person's writes are serialised (and with their weeks' submissions: work.week_guard)
  perform 1 from work.person where id = new.user_id for update;
  if not erp.is_test_entity(new.entity_id) and exists (
       select 1 from work.timesheet_week w
        where w.user_id = new.user_id and w.status in ('submitted', 'approved')
          and (w.week_start = date_trunc('week', new.work_date::timestamp)::date
               or (tg_op = 'UPDATE' and w.week_start = date_trunc('week', old.work_date::timestamp)::date))) then
    raise exception 'timesheet_week_locked';
  end if;
  if new.work_date > (now() at time zone 'UTC')::date then
    raise exception 'time_entry_future_date';
  end if;
  if new.minutes + coalesce((select sum(minutes) from erp.time_entry
                              where user_id = new.user_id and work_date = new.work_date and id <> new.id), 0) > 1440 then
    raise exception 'time_entry_daily_limit';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- 7. Rights, as 0008 left them: the helpers and triggers are work_reader's; the application runs the helpers, never
--    the triggers' functions
grant execute on all functions in schema erp, work to work_reader;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.prosecdef and p.pronamespace in ('work'::regnamespace, 'erp'::regnamespace) loop
    execute format('alter function %s owner to work_reader', f);
  end loop;
end $$;
grant execute on all functions in schema work to erp_app;
revoke execute on all functions in schema work from public;
revoke execute on function erp.engagement_test_guard() from public, erp_app;
revoke execute on function work.contract_test_guard() from public, erp_app;
revoke execute on function work.person_guard(), work.week_guard(), work.record_week_event(), work.queue_notification_email(),
  work.client_to_customers() from erp_app;
