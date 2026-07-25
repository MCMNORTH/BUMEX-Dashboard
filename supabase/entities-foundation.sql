-- ============================================================================
-- Entity foundation for multi-entity Bumex workspace
-- ----------------------------------------------------------------------------
-- Adds a fixed entity code to profiles, introduces a super admin flag, and
-- backfills existing records into BUMEX IT as the legacy default.
--
-- New self-service accounts intentionally start with `entity_code = null` so
-- the onboarding flow can force an explicit entity selection after signup.
-- ============================================================================

alter table public.profiles
  add column if not exists entity_code text,
  add column if not exists is_super_admin boolean not null default false;

update public.profiles
set entity_code = coalesce(entity_code, 'bumex_it'),
    updated_at = timezone('utc', now())
where entity_code is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_entity_code_chk'
  ) then
    alter table public.profiles
      add constraint profiles_entity_code_chk check (
        entity_code is null or
        entity_code in (
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
  end if;
end $$;

create index if not exists idx_profiles_entity_code on public.profiles (entity_code);
create index if not exists idx_profiles_super_admin on public.profiles (is_super_admin);

-- Existing operational data defaults to BUMEX IT.
alter table public.clients add column if not exists entity_code text;
alter table public.projects add column if not exists entity_code text;
alter table public.tasks add column if not exists entity_code text;
alter table public.contracts add column if not exists entity_code text;
alter table public.invoices add column if not exists entity_code text;
alter table public.documents add column if not exists entity_code text;
alter table public.payments add column if not exists entity_code text;
alter table public.transfers add column if not exists entity_code text;
alter table public.receipts add column if not exists entity_code text;
alter table public.activity_logs add column if not exists entity_code text;
alter table public.internal_notes add column if not exists entity_code text;
alter table public.comments add column if not exists entity_code text;

update public.clients set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.projects set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.tasks set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.contracts set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.invoices set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.documents set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.payments set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.transfers set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.receipts set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.activity_logs set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.internal_notes set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;
update public.comments set entity_code = coalesce(entity_code, 'bumex_it') where entity_code is null;

create index if not exists idx_clients_entity_code on public.clients (entity_code);
create index if not exists idx_projects_entity_code on public.projects (entity_code);
create index if not exists idx_tasks_entity_code on public.tasks (entity_code);
create index if not exists idx_contracts_entity_code on public.contracts (entity_code);
create index if not exists idx_invoices_entity_code on public.invoices (entity_code);
create index if not exists idx_documents_entity_code on public.documents (entity_code);
create index if not exists idx_payments_entity_code on public.payments (entity_code);
create index if not exists idx_transfers_entity_code on public.transfers (entity_code);
create index if not exists idx_receipts_entity_code on public.receipts (entity_code);

-- IMPORTANT:
-- Mark the owner account manually as super admin after review, for example:
-- update public.profiles
-- set is_super_admin = true
-- where email = 'your-email@bumex.mr';
