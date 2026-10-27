-- =====================================================================
--  BUMEX ERP — migration 0010: the 3D building, a person's option
--  Applies on top of 0001–0009.
--
--  - Vanguard shows the group as a building in 3D, or as flat pages. The building is an option the role modifiers
--    give person by person in the permissions page (asked on 2026-10-27): off by default, for every role and for
--    everyone already there; without it the app opens flat and offers no 3D.
--  - It is a row of erp.user_access like the rest of a person's access, so 0009's guard keeps it: only the system or
--    a role modifier changes it. It shows the same data either way (what the browser receives does not depend on it).
-- =====================================================================
set search_path to erp, public;

alter table erp.user_access add column if not exists view_3d boolean not null default false;
