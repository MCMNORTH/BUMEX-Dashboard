-- ============================================================================
-- PART 6.6 - Bank statements and reconciliation
-- ----------------------------------------------------------------------------
-- Adds a lightweight banking layer used by the finance workspace to import
-- statement lines and validate client collections / supplier payments.
-- ============================================================================

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  account_label text not null,
  statement_label text not null,
  statement_date date not null,
  currency text not null default 'USD',
  raw_content text not null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bank_statements_account_label_not_blank_chk check (length(trim(account_label)) > 0),
  constraint bank_statements_statement_label_not_blank_chk check (length(trim(statement_label)) > 0),
  constraint bank_statements_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint bank_statements_raw_content_not_blank_chk check (length(trim(raw_content)) > 0)
);

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  line_date date not null,
  description text not null,
  reference text,
  credit_amount numeric(14, 2) not null default 0,
  debit_amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  match_status text not null default 'unmatched',
  matched_entity_type text,
  matched_entity_id uuid,
  match_confidence integer,
  match_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint bank_statement_lines_description_not_blank_chk check (length(trim(description)) > 0),
  constraint bank_statement_lines_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint bank_statement_lines_credit_non_negative_chk check (credit_amount >= 0),
  constraint bank_statement_lines_debit_non_negative_chk check (debit_amount >= 0),
  constraint bank_statement_lines_not_both_zero_chk check (credit_amount > 0 or debit_amount > 0),
  constraint bank_statement_lines_match_status_chk check (match_status in ('matched', 'review', 'unmatched')),
  constraint bank_statement_lines_entity_type_chk check (matched_entity_type is null or matched_entity_type in ('invoice', 'payment', 'transfer')),
  constraint bank_statement_lines_match_confidence_chk check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 100))
);

create index if not exists idx_bank_statements_statement_date on public.bank_statements (statement_date desc);
create index if not exists idx_bank_statements_created_by on public.bank_statements (created_by);
create index if not exists idx_bank_statement_lines_statement_id on public.bank_statement_lines (statement_id);
create index if not exists idx_bank_statement_lines_line_date on public.bank_statement_lines (line_date desc);
create index if not exists idx_bank_statement_lines_match_status on public.bank_statement_lines (match_status);
create index if not exists idx_bank_statement_lines_matched_entity on public.bank_statement_lines (matched_entity_type, matched_entity_id);

alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.bank_statements force row level security;
alter table public.bank_statement_lines force row level security;

drop policy if exists "bank_statements_select_finance_only" on public.bank_statements;
drop policy if exists "bank_statements_modify_finance_only" on public.bank_statements;
drop policy if exists "bank_statement_lines_select_finance_only" on public.bank_statement_lines;
drop policy if exists "bank_statement_lines_modify_finance_only" on public.bank_statement_lines;

create policy "bank_statements_select_finance_only"
on public.bank_statements
for select
to authenticated
using (private.is_admin() or private.is_manager());

create policy "bank_statements_modify_finance_only"
on public.bank_statements
for all
to authenticated
using (private.is_admin() or private.is_manager())
with check (private.is_admin() or private.is_manager());

create policy "bank_statement_lines_select_finance_only"
on public.bank_statement_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.bank_statements s
    where s.id = statement_id
      and (private.is_admin() or private.is_manager())
  )
);

create policy "bank_statement_lines_modify_finance_only"
on public.bank_statement_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.bank_statements s
    where s.id = statement_id
      and (private.is_admin() or private.is_manager())
  )
)
with check (
  exists (
    select 1
    from public.bank_statements s
    where s.id = statement_id
      and (private.is_admin() or private.is_manager())
  )
);
