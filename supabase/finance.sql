-- ============================================================================
-- PART 6.1 - Finance foundation
-- ----------------------------------------------------------------------------
-- Creates invoices and upgrades legacy payments/transfers into scoped finance
-- records for internal operational tracking.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'invoice_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.invoice_status as enum (
      'draft',
      'sent',
      'partially_paid',
      'paid',
      'overdue',
      'cancelled',
      'archived'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'payment_method'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.payment_method as enum (
      'cash',
      'bank_transfer',
      'check',
      'mobile_money',
      'card',
      'other'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'transfer_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.transfer_status as enum (
      'planned',
      'pending',
      'sent',
      'confirmed',
      'failed',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'transfer_category'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.transfer_category as enum (
      'supplier',
      'salary',
      'subcontractor',
      'software',
      'hosting',
      'taxes',
      'rent',
      'other'
    );
  end if;
end
$$;

alter type public.activity_entity_type add value if not exists 'invoice';

alter type public.payment_status rename to payment_status_legacy;

create type public.payment_status as enum (
  'expected',
  'received',
  'late',
  'cancelled',
  'reconciled'
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  contract_id uuid references public.contracts (id) on delete set null,
  issue_date date not null,
  due_date date not null,
  amount_ht numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null default 0,
  amount_ttc numeric(14, 2) not null,
  currency text not null default 'USD',
  status public.invoice_status not null default 'draft',
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoices_amount_ht_non_negative_chk check (amount_ht >= 0),
  constraint invoices_tax_amount_non_negative_chk check (tax_amount >= 0),
  constraint invoices_amount_ttc_non_negative_chk check (amount_ttc >= 0),
  constraint invoices_amount_consistency_chk check (amount_ttc = amount_ht + tax_amount),
  constraint invoices_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint invoices_schedule_chk check (due_date >= issue_date)
);

alter table public.payments
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null,
  add column if not exists client_id uuid references public.clients (id) on delete restrict,
  alter column project_id drop not null,
  add column if not exists contract_id uuid references public.contracts (id) on delete set null,
  add column if not exists currency text not null default 'USD',
  add column if not exists payment_date date,
  add column if not exists method public.payment_method not null default 'bank_transfer',
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists created_by uuid references public.profiles (id) on delete restrict,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.payments p
set
  client_id = proj.client_id,
  currency = coalesce(nullif(trim(p.currency), ''), 'USD'),
  payment_date = coalesce(p.payment_date, p.paid_date),
  created_by = coalesce(p.created_by, proj.owner_id)
from public.projects proj
where proj.id = p.project_id
  and (
    p.client_id is null
    or p.created_by is null
    or p.payment_date is null
  );

alter table public.payments
  drop constraint if exists payments_status_paid_date_chk;

alter table public.payments
  alter column client_id set not null,
  alter column created_by set not null;

alter table public.payments
  alter column status type public.payment_status
  using (
    case status::text
      when 'draft' then 'expected'::public.payment_status
      when 'pending' then 'expected'::public.payment_status
      when 'overdue' then 'late'::public.payment_status
      when 'paid' then 'received'::public.payment_status
      when 'cancelled' then 'cancelled'::public.payment_status
      else 'expected'::public.payment_status
    end
  );

drop type public.payment_status_legacy;

alter table public.payments
  drop column if exists paid_date;

alter table public.transfers
  rename column date to transfer_date;

alter table public.transfers
  add column if not exists transfer_reference text,
  add column if not exists beneficiary_name text,
  add column if not exists beneficiary_bank text,
  add column if not exists beneficiary_account text,
  add column if not exists currency text not null default 'USD',
  add column if not exists status public.transfer_status not null default 'planned',
  add column if not exists category public.transfer_category not null default 'other',
  add column if not exists related_project_id uuid references public.projects (id) on delete set null,
  add column if not exists related_client_id uuid references public.clients (id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_by uuid references public.profiles (id) on delete restrict,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.transfers
set
  transfer_reference = coalesce(transfer_reference, 'TRF-' || substring(id::text, 1, 8)),
  beneficiary_name = coalesce(beneficiary_name, 'Pending beneficiary'),
  created_by = coalesce(created_by, sender, receiver)
where transfer_reference is null
   or beneficiary_name is null
   or created_by is null;

alter table public.transfers
  alter column transfer_reference set not null,
  alter column beneficiary_name set not null,
  alter column created_by set not null;

alter table public.transfers
  drop constraint if exists transfers_sender_receiver_chk,
  drop column if exists sender,
  drop column if exists receiver;

create index if not exists idx_invoices_client_id on public.invoices (client_id);
create index if not exists idx_invoices_project_id on public.invoices (project_id);
create index if not exists idx_invoices_contract_id on public.invoices (contract_id);
create index if not exists idx_invoices_due_date on public.invoices (due_date);
create index if not exists idx_invoices_status on public.invoices (status);
create index if not exists idx_invoices_created_at on public.invoices (created_at desc);
create index if not exists idx_invoices_created_by on public.invoices (created_by);

create index if not exists idx_payments_invoice_id on public.payments (invoice_id);
create index if not exists idx_payments_client_id on public.payments (client_id);
create index if not exists idx_payments_project_id on public.payments (project_id);
create index if not exists idx_payments_contract_id on public.payments (contract_id);
create index if not exists idx_payments_due_date on public.payments (due_date);
create index if not exists idx_payments_status on public.payments (status);
create index if not exists idx_payments_created_at on public.payments (created_at desc);
create index if not exists idx_payments_created_by on public.payments (created_by);
create index if not exists idx_payments_client_status on public.payments (client_id, status);

create index if not exists idx_transfers_related_project_id on public.transfers (related_project_id);
create index if not exists idx_transfers_related_client_id on public.transfers (related_client_id);
create index if not exists idx_transfers_status on public.transfers (status);
create index if not exists idx_transfers_transfer_date on public.transfers (transfer_date);
create index if not exists idx_transfers_created_at on public.transfers (created_at desc);
create index if not exists idx_transfers_created_by on public.transfers (created_by);
