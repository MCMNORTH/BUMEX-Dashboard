-- One reminder per person, week, and calendar day to prevent notification spam.
begin;
create table if not exists public.timesheet_reminders (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  sent_date date not null default current_date,
  entity_code text,
  sent_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, sent_date)
);
alter table public.timesheet_reminders enable row level security;
revoke all on public.timesheet_reminders from anon, authenticated;
grant select, insert on public.timesheet_reminders to authenticated;

drop policy if exists timesheet_reminders_select_reviewers on public.timesheet_reminders;
create policy timesheet_reminders_select_reviewers on public.timesheet_reminders for select to authenticated using (
  private.is_admin() or sent_by = auth.uid()
);
drop policy if exists timesheet_reminders_insert_reviewers on public.timesheet_reminders;
create policy timesheet_reminders_insert_reviewers on public.timesheet_reminders for insert to authenticated with check (
  sent_by = auth.uid() and (
    private.is_admin() or exists (
      select 1 from public.profiles viewer where viewer.id = auth.uid()
        and viewer.role = 'manager' and viewer.entity_code = timesheet_reminders.entity_code
    )
  )
);
notify pgrst, 'reload schema';
commit;
