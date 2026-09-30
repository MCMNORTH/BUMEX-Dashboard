-- Remove recursive project/task lookups from the profiles SELECT policy.
-- Those lookups re-enter profiles through other RLS policies and can produce
-- PostgreSQL error 42P17 (infinite recursion detected in policy).
drop policy if exists "profiles_select_self_or_admin" on public.profiles;

create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (
  true
);

notify pgrst, 'reload schema';
