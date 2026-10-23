-- =====================================================================
--  BUMEX ERP — migration 0005: no session, no data
--
--  Found against the live instance: a connection that has not called erp.open_session() read as 'system'
--  (0001's default), the context that sees every entity; and the app's login inherited erp_app's table rights, so
--  it could query the schema without switching role. The application always opens a session, but the database
--  now refuses on its own:
--  - erp_app without a session acts as 'none': row-level security shows nothing and the role checks refuse.
--    Administrators running migrations or support queries keep the 'system' default.
--  - Logins that are members of erp_app reach the schema only through `set role erp_app`, never directly.
-- =====================================================================
set search_path to erp, public;

create or replace function erp.actor_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('erp.actor_role', true), ''),
                  case when current_user = 'erp_app' then 'none' else 'system' end)
$$;

-- Every member of erp_app except the account running this migration (which owns the schema) may switch to the role
-- but no longer inherits its rights. A login added later: grant erp_app to <login> with inherit false;
do $$
declare r record;
begin
  for r in
    select m.rolname
      from pg_auth_members am
      join pg_roles g on g.oid = am.roleid
      join pg_roles m on m.oid = am.member
     where g.rolname = 'erp_app' and m.rolname <> current_user
  loop
    execute format('grant erp_app to %I with inherit false, set true', r.rolname);
  end loop;
end $$;
