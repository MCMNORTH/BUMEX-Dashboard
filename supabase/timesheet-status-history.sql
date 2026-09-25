-- Immutable audit trail for weekly timesheet workflow changes.
begin;

create table if not exists public.timesheet_week_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  entity_code text not null,
  status text not null check (status in ('submitted', 'approved', 'returned')),
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists timesheet_week_events_user_week_idx on public.timesheet_week_events(user_id, week_start, created_at desc);

alter table public.timesheet_week_events enable row level security;
revoke all on public.timesheet_week_events from anon, authenticated;
grant select on public.timesheet_week_events to authenticated;

drop policy if exists timesheet_week_events_select on public.timesheet_week_events;
create policy timesheet_week_events_select on public.timesheet_week_events for select to authenticated using (
  user_id = (select auth.uid())
  or private.is_admin()
  or exists (select 1 from public.profiles viewer where viewer.id = (select auth.uid()) and viewer.role = 'manager' and viewer.entity_code = timesheet_week_events.entity_code)
);

create or replace function public.record_timesheet_week_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.timesheet_week_events(user_id, week_start, entity_code, status, actor_id, note, created_at)
    values (new.user_id, new.week_start, new.entity_code, new.status, auth.uid(), new.review_note, now());
  end if;
  return new;
end;
$$;
revoke all on function public.record_timesheet_week_event() from public, anon, authenticated;
drop trigger if exists record_timesheet_week_event on public.timesheet_week_status;
create trigger record_timesheet_week_event after insert or update of status on public.timesheet_week_status
for each row execute function public.record_timesheet_week_event();

insert into public.timesheet_week_events(user_id, week_start, entity_code, status, actor_id, note, created_at)
select s.user_id, s.week_start, s.entity_code, s.status, coalesce(s.reviewed_by, s.user_id), s.review_note, coalesce(s.reviewed_at, s.submitted_at)
from public.timesheet_week_status s
where not exists (select 1 from public.timesheet_week_events e where e.user_id = s.user_id and e.week_start = s.week_start);

notify pgrst, 'reload schema';
commit;
