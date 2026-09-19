-- ============================================================================
-- PART 3.1 - Projects module schema extension
-- ----------------------------------------------------------------------------
-- Adds project-specific fields required by the working Projects module UI.
-- Run after supabase/schema.sql.
-- ============================================================================

alter table public.projects
  add column if not exists description text,
  add column if not exists budget_amount numeric(14, 2),
  add column if not exists priority public.priority default 'medium';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_budget_amount_positive_chk'
  ) then
    alter table public.projects
      add constraint projects_budget_amount_positive_chk
      check (budget_amount is null or budget_amount >= 0);
  end if;
end $$;

create index if not exists idx_projects_priority on public.projects (priority);
