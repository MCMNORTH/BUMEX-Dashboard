-- ============================================================================
-- Signup onboarding fix
-- ----------------------------------------------------------------------------
-- New self-service accounts are created before they have chosen a BUMEX entity.
-- The application onboarding flow therefore expects `public.profiles.entity_code`
-- to be nullable during signup, then assigned later from `/select-entity`.
--
-- If `entity_code` is forced to NOT NULL, Supabase auth signup fails when the
-- `handle_new_user()` trigger inserts the profile row.
-- ============================================================================

alter table public.profiles
  alter column entity_code drop not null;

alter table public.profiles
  drop constraint if exists profiles_entity_code_chk;

alter table public.profiles
  add constraint profiles_entity_code_chk check (
    entity_code is null or entity_code in (
      'bumex_holding',
      'bumex_sa',
      'bumex_audit',
      'bumex_mauritanie',
      'bumex_maroc',
      'bumex_advisory',
      'bumex_avocat',
      'bumex_it'
    )
  );
