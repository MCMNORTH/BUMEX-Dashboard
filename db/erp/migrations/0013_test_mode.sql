-- =====================================================================
--  BUMEX ERP — migration 0013: the test floor, sealed (test mode)
--  Applies on top of 0001–0012.
--
--  0011 hid test records only from whoever does not have the test floor; a tester saw them mixed into everything (My
--  day, My work, the search, notifications, the team's load). Asked on 2026-10-28: test data shows only while the
--  person is on the test floor, and then only test data.
--  - The session has a mode. erp.open_session(user, test_mode) turns test mode on only for a person who has the floor
--    (erp.user_access.test_floor); the one-argument form is the normal mode.
--  - The session's entities follow the mode: the test floor alone in test mode, the real floors otherwise. Everything
--    read by entity (the books, missions, tickets) follows.
--  - work.hidden(is_test) is "not the session's mode": in normal mode test records are hidden from everyone, testers
--    included; in test mode, the real ones. Every rule of 0011 and 0012 goes through it. The system sees everything.
--  - The app asks for test mode with a cookie (lib/erp/db.ts); the database decides.
--  - Time, made simpler (same day): a person removes their own line (a cleared cell of the week), unless the week is sent.
-- =====================================================================
set search_path to erp, public;

create or replace function erp.open_session(p_user_id text, p_test_mode boolean) returns text
language plpgsql as $$
declare
  v_access erp.user_access%rowtype;
  v_ids    text;
  v_test   boolean;
begin
  select * into v_access from erp.user_access where user_id = p_user_id;
  perform set_config('erp.actor_id', p_user_id, true);
  -- not FOUND: perform resets it, and an empty role would read as 'system' (erp.actor_role()'s default)
  if v_access.user_id is null then
    perform set_config('erp.actor_role', 'none', true);
    perform set_config('erp.entity_ids', '', true);
    perform set_config('erp.test_mode', 'off', true);
    return 'none';
  end if;
  v_test := coalesce(p_test_mode, false) and v_access.test_floor and exists (select 1 from erp.entity where is_test);
  select coalesce(string_agg(id::text, ','), '') into v_ids
    from erp.entity
   where case when is_test then v_test
              else not v_test and (v_access.entity_codes is null or code = any (v_access.entity_codes)) end;
  perform set_config('erp.actor_role', v_access.erp_role, true);
  perform set_config('erp.entity_ids', v_ids, true);
  perform set_config('erp.test_mode', case when v_test then 'on' else 'off' end, true);
  return v_access.erp_role;
end $$;

create or replace function erp.open_session(p_user_id text) returns text
language sql as $$ select erp.open_session(p_user_id, false) $$;

-- the session's mode: on only when open_session granted it
create or replace function work.in_test() returns boolean
language sql stable as $$ select coalesce(current_setting('erp.test_mode', true), '') = 'on' $$;

create or replace function work.sees_test() returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select erp.actor_role() = 'system' or work.in_test() $$;

create or replace function work.hidden(p_test boolean) returns boolean
language sql stable as $$ select erp.actor_role() <> 'system' and coalesce(p_test, false) <> work.in_test() $$;

-- time: a person's own lines follow the mode too (0011 let them read their own whatever the floor)
drop policy if exists read on erp.time_entry;
create policy read on erp.time_entry for select
  using (work.inside() or ((user_id = erp.actor_id() or work.actor_class() = 'admin' or work.is_entity_manager(entity_id))
                           and not work.hidden(erp.is_test_entity(entity_id))));
drop policy if exists add on erp.time_entry;
create policy add on erp.time_entry for insert
  with check (work.inside() or (user_id = erp.actor_id() and not work.hidden(erp.is_test_entity(entity_id))
                                and (work.works_in_entity(entity_id) or work.is_timesheet_project(engagement_id))));
drop policy if exists edit on erp.time_entry;
create policy edit on erp.time_entry for update
  using (work.inside() or (user_id = erp.actor_id() and not work.hidden(erp.is_test_entity(entity_id))))
  with check (work.inside() or (user_id = erp.actor_id() and not work.hidden(erp.is_test_entity(entity_id))
                                and (work.works_in_entity(entity_id) or work.is_timesheet_project(engagement_id))));

-- a person removes their own line of a week that is not sent (a test line whatever the week: 0011)
create or replace function erp.time_entry_delete_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if erp.actor_role() <> 'system' and not erp.is_test_entity(old.entity_id) and exists (
       select 1 from work.timesheet_week w
        where w.user_id = old.user_id and w.status in ('submitted', 'approved')
          and w.week_start = date_trunc('week', old.work_date::timestamp)::date) then
    raise exception 'timesheet_week_locked';
  end if;
  return old;
end $$;
drop trigger if exists time_entry_delete_guard on erp.time_entry;
create trigger time_entry_delete_guard before delete on erp.time_entry for each row execute function erp.time_entry_delete_guard();
alter function erp.time_entry_delete_guard() owner to work_reader;
revoke execute on function erp.time_entry_delete_guard() from public, erp_app;
drop policy if exists remove on erp.time_entry;
create policy remove on erp.time_entry for delete
  using (work.inside() or (user_id = erp.actor_id() and not work.hidden(erp.is_test_entity(entity_id))));

grant execute on function erp.open_session(text, boolean) to erp_app;
grant execute on function work.in_test() to erp_app, work_reader;
revoke execute on function work.in_test() from public;
