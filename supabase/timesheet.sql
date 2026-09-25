-- Run after schema.sql, rls.sql and entities-foundation.sql.
-- Then apply timesheet-participation.sql to enforce project eligibility.
-- Then apply timesheet-weekly.sql for the weekly mission calendar.
-- Personal timesheets: no user can read or change another person's entries.
begin;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  entity_code text not null,
  work_date date not null check (work_date >= date '2000-01-01'),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists time_entries_user_date_idx on public.time_entries(user_id, work_date);
create index if not exists time_entries_project_idx on public.time_entries(project_id);
alter table public.time_entries enable row level security;
revoke all on public.time_entries from anon;
grant select, insert, update on public.time_entries to authenticated;

drop policy if exists time_entries_select_own on public.time_entries;
create policy time_entries_select_own on public.time_entries for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.entity_code = time_entries.entity_code or p.is_super_admin)
));

drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own on public.time_entries for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.projects p where p.id = time_entries.project_id and p.entity_code = time_entries.entity_code
) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.entity_code = time_entries.entity_code or p.is_super_admin)
));

drop policy if exists time_entries_update_own on public.time_entries;
create policy time_entries_update_own on public.time_entries for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.projects p where p.id = time_entries.project_id and p.entity_code = time_entries.entity_code
) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.entity_code = time_entries.entity_code or p.is_super_admin)
));

-- Serialize writes per person, so concurrent requests cannot exceed 24h/day.
create or replace function public.validate_time_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.user_id <> old.user_id or new.entity_code <> old.entity_code or new.id <> old.id) then
    raise exception 'time_entry_identity_immutable';
  end if;
  if new.work_date > (now() at time zone 'UTC')::date then
    raise exception 'time_entry_future_date';
  end if;
  perform 1 from public.profiles where id = new.user_id for update;
  if new.duration_minutes + coalesce((
    select sum(duration_minutes) from public.time_entries
    where user_id = new.user_id and work_date = new.work_date and id <> new.id
  ), 0) > 1440 then
    raise exception 'time_entry_daily_limit';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.validate_time_entry() from public, anon, authenticated;
drop trigger if exists validate_time_entry on public.time_entries;
create trigger validate_time_entry before insert or update on public.time_entries
for each row execute function public.validate_time_entry();
notify pgrst, 'reload schema';
commit;
