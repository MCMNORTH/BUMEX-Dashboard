-- ============================================================================
-- Supervisor role compatibility fix
-- ----------------------------------------------------------------------------
-- The application already exposes and uses the `supervisor` role, but older
-- Supabase environments may still have:
-- 1. a `public.role` enum without `supervisor`
-- 2. RLS helpers that only treat `manager` as the manager-like role
--
-- This patch makes the database match the application model.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.role'::regtype
      and enumlabel = 'supervisor'
  ) then
    alter type public.role add value 'supervisor' after 'manager';
  end if;
end
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.current_app_role() in ('manager', 'supervisor'), false);
$$;
