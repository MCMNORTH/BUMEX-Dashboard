-- Allows a project lead to explicitly set its completion percentage.
-- Leaving the field NULL keeps the automatic calculation from tickets.
begin;

-- Internal BUMEX products and tools are not client engagements.
alter table public.projects
  alter column client_id drop not null;

alter table public.projects
  add column if not exists manual_progress integer;

alter table public.projects
  drop constraint if exists projects_manual_progress_range_check;

alter table public.projects
  add constraint projects_manual_progress_range_check
  check (manual_progress is null or manual_progress between 0 and 100);

notify pgrst, 'reload schema';
commit;
