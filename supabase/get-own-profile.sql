-- Read-only auth fallback for the current user's own profile. This avoids
-- onboarding loops if a broader profiles SELECT policy becomes unavailable.
create or replace function public.get_own_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select profile
  from public.profiles profile
  where profile.id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_own_profile() from public;
grant execute on function public.get_own_profile() to authenticated;

notify pgrst, 'reload schema';
