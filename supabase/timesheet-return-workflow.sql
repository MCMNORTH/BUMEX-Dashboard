-- Allow reviewers to return a submitted week with a correction note.
begin;

alter table public.timesheet_week_status
  add column if not exists review_note text;

alter table public.timesheet_week_status
  drop constraint if exists timesheet_week_status_status_check;
alter table public.timesheet_week_status
  add constraint timesheet_week_status_status_check
  check (status in ('submitted', 'approved', 'returned'));

drop policy if exists timesheet_week_status_update_reviewer on public.timesheet_week_status;
create policy timesheet_week_status_update_reviewer on public.timesheet_week_status
for update to authenticated using (
  private.is_admin()
  or user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.role = 'manager'
      and viewer.entity_code = timesheet_week_status.entity_code
  )
) with check (
  (status in ('approved', 'returned') and reviewed_by = (select auth.uid()) and reviewed_at is not null)
  or (user_id = (select auth.uid()) and status = 'submitted' and reviewed_by is null and reviewed_at is null and review_note is null)
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

notify pgrst, 'reload schema';
commit;
