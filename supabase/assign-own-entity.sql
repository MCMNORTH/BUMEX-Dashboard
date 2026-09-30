-- Secure onboarding endpoint: an authenticated user may assign their own
-- entity once. Using a definer function avoids onboarding being blocked by
-- profile RLS while keeping the operation tightly scoped.
create or replace function public.assign_own_entity(requested_entity_code text)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if requested_entity_code not in (
    'bumex_sa',
    'bumex_audit',
    'bumex_mauritanie',
    'bumex_maroc',
    'bumex_advisory',
    'bumex_avocat',
    'bumex_it'
  ) then
    raise exception 'Invalid entity selection.' using errcode = '22023';
  end if;

  update public.profiles
  set entity_code = requested_entity_code,
      updated_at = timezone('utc', now())
  where id = auth.uid()
    and entity_code is null
  returning * into updated_profile;

  if updated_profile.id is null then
    select * into updated_profile
    from public.profiles
    where id = auth.uid();

    if updated_profile.id is null then
      raise exception 'Profile not found.' using errcode = 'P0002';
    end if;

    if updated_profile.entity_code is distinct from requested_entity_code then
      raise exception 'An entity is already assigned to this account.' using errcode = '23514';
    end if;
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.assign_own_entity(text) from public;
grant execute on function public.assign_own_entity(text) to authenticated;

notify pgrst, 'reload schema';
