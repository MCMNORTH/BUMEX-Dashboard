-- Weekly submission and approval workflow for timesheets.
begin;

create table if not exists public.timesheet_week_status (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  entity_code text not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, week_start)
);

create index if not exists timesheet_week_status_entity_week_idx
  on public.timesheet_week_status(entity_code, week_start, status);

alter table public.timesheet_week_status enable row level security;
revoke all on public.timesheet_week_status from anon;
grant select, insert, update on public.timesheet_week_status to authenticated;

drop policy if exists timesheet_week_status_select on public.timesheet_week_status;
create policy timesheet_week_status_select on public.timesheet_week_status
for select to authenticated using (
  user_id = (select auth.uid())
  or private.is_admin()
  or exists (
    select 1 from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.role = 'manager'
      and viewer.entity_code = timesheet_week_status.entity_code
  )
);

drop policy if exists timesheet_week_status_insert_own on public.timesheet_week_status;
create policy timesheet_week_status_insert_own on public.timesheet_week_status
for insert to authenticated with check (
  user_id = (select auth.uid())
  and status = 'submitted'
  and reviewed_at is null
  and reviewed_by is null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.entity_code = timesheet_week_status.entity_code or p.is_super_admin)
  )
);

drop policy if exists timesheet_week_status_update_reviewer on public.timesheet_week_status;
create policy timesheet_week_status_update_reviewer on public.timesheet_week_status
for update to authenticated using (
  private.is_admin()
  or exists (
    select 1 from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.role = 'manager'
      and viewer.entity_code = timesheet_week_status.entity_code
  )
) with check (
  status = 'approved'
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
);

create or replace function public.ensure_timesheet_week_editable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.timesheet_week_status s
    where s.user_id = new.user_id
      and s.week_start = date_trunc('week', new.work_date::timestamp)::date
      and s.status in ('submitted', 'approved')
  ) then
    raise exception 'timesheet_week_locked';
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_timesheet_week_editable() from public, anon, authenticated;
drop trigger if exists ensure_timesheet_week_editable on public.time_entries;
create trigger ensure_timesheet_week_editable before insert or update on public.time_entries
for each row execute function public.ensure_timesheet_week_editable();

notify pgrst, 'reload schema';
commit;
