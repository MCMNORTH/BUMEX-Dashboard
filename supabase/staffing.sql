-- Staffing assignments connect people, projects, capacity and timesheets.
create table if not exists public.staffing_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_code text not null,
  project_role text not null,
  start_date date not null,
  end_date date not null,
  allocation_percent integer not null check (allocation_percent between 1 and 100),
  weekly_hours numeric(6,2) not null check (weekly_hours > 0 and weekly_hours <= 168),
  status text not null default 'draft' check (status in ('draft', 'requested', 'confirmed', 'completed', 'cancelled')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staffing_assignments_dates_chk check (end_date >= start_date),
  constraint staffing_assignments_unique_period unique (project_id, user_id, start_date, end_date)
);

create index if not exists idx_staffing_assignments_project on public.staffing_assignments(project_id);
create index if not exists idx_staffing_assignments_user_period on public.staffing_assignments(user_id, start_date, end_date);
create index if not exists idx_staffing_assignments_entity on public.staffing_assignments(entity_code);
create index if not exists idx_staffing_assignments_status on public.staffing_assignments(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists staffing_assignments_set_updated_at on public.staffing_assignments;
create trigger staffing_assignments_set_updated_at before update on public.staffing_assignments
for each row execute function public.set_updated_at();

alter table public.staffing_assignments enable row level security;
alter table public.staffing_assignments force row level security;

drop policy if exists "staffing_assignments_select_scoped" on public.staffing_assignments;
create policy "staffing_assignments_select_scoped" on public.staffing_assignments for select to authenticated using (
  private.is_admin()
  or user_id = auth.uid()
  or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'manager' and me.entity_code = staffing_assignments.entity_code)
);

drop policy if exists "staffing_assignments_modify_management" on public.staffing_assignments;
create policy "staffing_assignments_modify_management" on public.staffing_assignments for all to authenticated using (
  private.is_admin()
  or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'manager' and me.entity_code = staffing_assignments.entity_code)
) with check (
  private.is_admin()
  or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'manager' and me.entity_code = staffing_assignments.entity_code)
);

drop policy if exists "project_members_staffing_manager_entity" on public.project_members;
create policy "project_members_staffing_manager_entity" on public.project_members for all to authenticated using (
  private.is_admin() or exists (
    select 1 from public.projects project, public.profiles me
    where project.id = project_members.project_id and me.id = auth.uid()
      and me.role = 'manager' and me.entity_code = project.entity_code
  )
) with check (
  private.is_admin() or exists (
    select 1 from public.projects project, public.profiles me
    where project.id = project_members.project_id and me.id = auth.uid()
      and me.role = 'manager' and me.entity_code = project.entity_code
  )
);
