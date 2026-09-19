-- Project classification: external delivery vs BUMEX internal products.
-- Run after supabase/schema.sql and supabase/projects.sql.

do $$
begin
  create type public.project_kind as enum (
    'client_mission',
    'institutional_partnership',
    'internal_product',
    'internal_tool'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.projects
  add column if not exists project_kind public.project_kind not null default 'client_mission';

create index if not exists idx_projects_project_kind on public.projects (project_kind);
