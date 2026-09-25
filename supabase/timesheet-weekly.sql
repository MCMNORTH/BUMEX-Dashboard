-- Apply after timesheet.sql and timesheet-participation.sql.
-- Existing dates, durations and notes remain unchanged. Empty mission = legacy entry.
begin;
alter table public.time_entries add column if not exists mission text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.time_entries'::regclass and conname = 'time_entries_mission_length') then
    alter table public.time_entries add constraint time_entries_mission_length check (char_length(mission) <= 200);
  end if;
end $$;
create or replace view public.timesheet_missions with (security_invoker = true) as
select distinct project_id, entity_code, mission from public.time_entries where mission <> '';
revoke all on public.timesheet_missions from anon;
grant select on public.timesheet_missions to authenticated;
notify pgrst, 'reload schema';
commit;
