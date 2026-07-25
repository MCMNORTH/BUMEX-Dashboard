-- ============================================================================
-- PART 7.1 - Team management profile enrichment
-- ----------------------------------------------------------------------------
-- Extends profiles with operational team fields used by the Team module.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'availability_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.availability_status as enum (
      'available',
      'busy',
      'overloaded',
      'away',
      'inactive'
    );
  end if;
end
$$;

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists department text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists phone text,
  add column if not exists availability_status public.availability_status not null default 'available',
  add column if not exists weekly_capacity_hours integer not null default 40,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.profiles
set
  skills = coalesce(skills, '{}'),
  availability_status = coalesce(availability_status, 'available'::public.availability_status),
  weekly_capacity_hours = coalesce(weekly_capacity_hours, 40),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

create index if not exists idx_profiles_availability_status on public.profiles (availability_status);
create index if not exists idx_profiles_department on public.profiles (department);
create index if not exists idx_profiles_updated_at on public.profiles (updated_at desc);
