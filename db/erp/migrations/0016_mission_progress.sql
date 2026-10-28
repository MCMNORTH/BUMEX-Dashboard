-- =====================================================================
--  BUMEX ERP — migration 0016: a mission's progress is its tickets'
--  Applies on top of 0001–0015.
--
--  A manual progress set in BUMEX One (100 % on BUMEX Dashboard) hid open tickets (11 of 14 done). Asked on
--  2026-10-28: the progress says what is done. A completed mission is at 100 %; a mission with tickets is at its share
--  of tickets done (archived ones apart); the manual progress counts only for a mission without tickets.
-- =====================================================================
set search_path to erp, public;

create or replace function work.mission_progress(p_engagement uuid) returns integer
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when e.status = 'completed' then 100
    when exists (select 1 from erp.task t where t.engagement_id = e.id and t.status <> 'archived')
      then (select round(100.0 * count(*) filter (where t.status = 'done') / count(*))::integer
              from erp.task t where t.engagement_id = e.id and t.status <> 'archived')
    else coalesce(e.manual_progress, 0)
  end
  from erp.engagement e where e.id = p_engagement and work.sees_mission(p_engagement) $$;

alter function work.mission_progress(uuid) owner to work_reader;
