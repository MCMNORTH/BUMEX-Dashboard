-- =====================================================================
--  BUMEX ERP — migration 0015: a person's default entity; a mission's team works on it from any floor
--  Applies on top of 0001–0014.
--
--  Asked on 2026-10-28:
--  - Each person has a default entity: the app opens on it, and the logo comes back to it. work.person.
--    default_entity_code, chosen by the person (their home entity, entity_code, when they chose none). A preference,
--    not a right: what they see stays erp.user_access's.
--  - A mission's team may hold people of other entities. A member works on the mission: they read it and its tickets
--    (its board, milestones and time follow, 0008/0014's rules read work.can_read_project), are given its tickets and
--    log time on it, wherever their home is. Until now an employee read a mission only through a ticket of theirs.
-- =====================================================================
set search_path to erp, public;

alter table work.person add column if not exists default_entity_code text;

-- a member of the mission's team (its staff), whatever their entity
create or replace function work.is_mission_member(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from erp.engagement_staff s where s.engagement_id = p_engagement and s.user_id = erp.actor_id()) $$;

create or replace function work.can_read_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.engagement_is_test(p_engagement)) and case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' or p_engagement is null then false
    else work.can_manage_project(p_engagement)
      or work.is_mission_member(p_engagement)
      or exists (select 1 from erp.task t where t.engagement_id = p_engagement and work.works_on(t.id, t.assignee_id))
  end $$;

create or replace function work.can_read_task_row(p_task uuid, p_engagement uuid, p_assignee text, p_reporter text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.task_is_test(p_task) or work.engagement_is_test(p_engagement)) and case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' then false
    else work.works_on(p_task, p_assignee) or coalesce(p_reporter = erp.actor_id(), false) or work.can_manage_project(p_engagement)
      or work.is_mission_member(p_engagement)
  end $$;

alter function work.is_mission_member(uuid) owner to work_reader;
alter function work.can_read_project(uuid) owner to work_reader;
alter function work.can_read_task_row(uuid, uuid, text, text) owner to work_reader;
grant execute on function work.is_mission_member(uuid) to erp_app;
revoke execute on function work.is_mission_member(uuid) from public;
