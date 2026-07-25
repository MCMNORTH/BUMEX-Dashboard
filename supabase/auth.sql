-- ============================================================================
-- PART 2.3 - Auth/profile integration
-- ----------------------------------------------------------------------------
-- Creates a profile row automatically whenever a new auth.users record is
-- inserted. Self-signup defaults to the employee role.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.role;
begin
  -- Never trust signup metadata for privilege assignment. Self-service account
  -- creation always starts as employee and elevated access must be granted
  -- later by an existing administrator.
  requested_role := 'employee'::public.role;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    requested_role,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
