-- ============================================================================
-- PART 6.4 - Receipts tracking
-- ----------------------------------------------------------------------------
-- Adds receipt records linked to payments for operational finance visibility.
-- ============================================================================

alter type public.activity_entity_type add value if not exists 'receipt';

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  payment_id uuid not null references public.payments (id) on delete cascade,
  issue_date date not null,
  amount numeric(14, 2) not null,
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint receipts_amount_positive_chk check (amount > 0)
);

create index if not exists idx_receipts_payment_id on public.receipts (payment_id);
create index if not exists idx_receipts_issue_date on public.receipts (issue_date);
create index if not exists idx_receipts_document_id on public.receipts (document_id);
create index if not exists idx_receipts_created_at on public.receipts (created_at desc);
create index if not exists idx_receipts_created_by on public.receipts (created_by);
