-- ============================================================================
-- PART 3.2 - Tickets and tasks module schema extension
-- ----------------------------------------------------------------------------
-- Extends the original tasks table into a proper enterprise ticketing model.
-- Run after supabase/schema.sql and after any previous project module updates.
-- ============================================================================

alter type public.task_status add value if not exists 'review';
alter type public.task_status add value if not exists 'archived';

alter type public.priority add value if not exists 'urgent';

create type public.ticket_type as enum (
  'task',
  'bug',
  'feature',
  'support',
  'client_request',
  'internal'
);

alter table public.tasks
  add column if not exists reporter_id uuid references public.profiles (id) on delete set null,
  add column if not exists type public.ticket_type not null default 'task',
  add column if not exists estimated_hours numeric(8, 2),
  add column if not exists actual_hours numeric(8, 2),
  add column if not exists github_issue_url text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.tasks
  add constraint tasks_estimated_hours_positive_chk
  check (estimated_hours is null or estimated_hours >= 0);

alter table public.tasks
  add constraint tasks_actual_hours_positive_chk
  check (actual_hours is null or actual_hours >= 0);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on public.tasks;

create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create index if not exists idx_tasks_reporter_id on public.tasks (reporter_id);
create index if not exists idx_tasks_type on public.tasks (type);
create index if not exists idx_tasks_updated_at on public.tasks (updated_at desc);
create index if not exists idx_tasks_project_status_due on public.tasks (project_id, status, due_date);
