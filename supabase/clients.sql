do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'client_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.client_status as enum (
      'prospect',
      'active',
      'inactive',
      'suspended',
      'archived'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'client_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.client_type as enum (
      'company',
      'public_institution',
      'ngo',
      'individual',
      'other'
    );
  end if;
end $$;

alter table public.clients add column if not exists legal_name text;
alter table public.clients add column if not exists type public.client_type not null default 'company';
alter table public.clients add column if not exists industry text;
alter table public.clients add column if not exists contact_phone text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists country text;
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists website text;
alter table public.clients add column if not exists tax_id text;
alter table public.clients add column if not exists status public.client_status not null default 'prospect';
alter table public.clients add column if not exists prospect_stage text;
alter table public.clients add column if not exists next_follow_up_at date;
alter table public.clients drop constraint if exists clients_prospect_stage_chk;
alter table public.clients add constraint clients_prospect_stage_chk check (
  prospect_stage is null or prospect_stage in ('initial_contact', 'qualification', 'negotiation', 'proposal_sent', 'pending_signature')
);
alter table public.clients add column if not exists account_manager_id uuid references public.profiles (id) on delete set null;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_website_format_chk'
  ) then
    alter table public.clients
      add constraint clients_website_format_chk check (
        website is null or website ~* '^https?://'
      );
  end if;
end $$;

create index if not exists idx_clients_status on public.clients (status);
create index if not exists idx_clients_type on public.clients (type);
create index if not exists idx_clients_account_manager_id on public.clients (account_manager_id);
create index if not exists idx_clients_updated_at on public.clients (updated_at desc);
