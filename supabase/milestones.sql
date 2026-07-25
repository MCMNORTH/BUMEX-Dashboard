do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'milestone_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.milestone_status as enum (
      'planned',
      'in_progress',
      'completed',
      'delayed',
      'cancelled'
    );
  end if;
end $$;

alter type public.activity_entity_type add value if not exists 'milestone';

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  status public.milestone_status not null default 'planned',
  due_date date not null,
  completed_at timestamptz,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint milestones_title_not_blank_chk check (length(trim(title)) > 0),
  constraint milestones_completed_status_chk check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create index if not exists idx_milestones_project_id on public.milestones (project_id);
create index if not exists idx_milestones_owner_id on public.milestones (owner_id);
create index if not exists idx_milestones_status on public.milestones (status);
create index if not exists idx_milestones_due_date on public.milestones (due_date);
create index if not exists idx_milestones_project_due_date on public.milestones (project_id, due_date);
