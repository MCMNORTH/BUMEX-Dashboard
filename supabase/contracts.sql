do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'contract_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.contract_type as enum (
      'development',
      'maintenance',
      'consulting',
      'support',
      'hosting',
      'audit',
      'other'
    );
  end if;
end $$;

alter type public.contract_status add value if not exists 'signed';
alter type public.contract_status add value if not exists 'cancelled';
alter type public.contract_status add value if not exists 'archived';

alter table public.contracts add column if not exists contract_number text;
alter table public.contracts add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.contracts add column if not exists contract_type public.contract_type not null default 'development';
alter table public.contracts add column if not exists start_date date;
alter table public.contracts add column if not exists end_date date;
alter table public.contracts add column if not exists renewal_date date;
alter table public.contracts add column if not exists amount numeric(14, 2);
alter table public.contracts add column if not exists currency text not null default 'USD';
alter table public.contracts add column if not exists payment_terms text;
alter table public.contracts add column if not exists responsible_user_id uuid references public.profiles (id) on delete set null;
alter table public.contracts add column if not exists notes text;
alter table public.contracts add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_amount_positive_chk'
  ) then
    alter table public.contracts
      add constraint contracts_amount_positive_chk check (amount is null or amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_currency_not_blank_chk'
  ) then
    alter table public.contracts
      add constraint contracts_currency_not_blank_chk check (length(trim(currency)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_schedule_chk'
  ) then
    alter table public.contracts
      add constraint contracts_schedule_chk check (
        end_date is null or start_date is null or end_date >= start_date
      );
  end if;
end $$;

create index if not exists idx_contracts_project_id on public.contracts (project_id);
create index if not exists idx_contracts_contract_type on public.contracts (contract_type);
create index if not exists idx_contracts_end_date on public.contracts (end_date);
create index if not exists idx_contracts_renewal_date on public.contracts (renewal_date);
create index if not exists idx_contracts_responsible_user_id on public.contracts (responsible_user_id);
create index if not exists idx_contracts_updated_at on public.contracts (updated_at desc);
