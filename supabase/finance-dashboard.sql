-- ============================================================================
-- PART 6.5 - Finance dashboard shareholder aggregates
-- ----------------------------------------------------------------------------
-- Exposes high-level finance aggregates for summarized shareholder reporting
-- without exposing row-level bank, reference, or note data.
-- ============================================================================

create or replace function public.get_shareholder_finance_summary()
returns table (
  revenue numeric,
  expenses numeric,
  expected_collections numeric,
  overdue_exposure numeric,
  paid_invoices bigint,
  unpaid_invoices bigint,
  confirmed_transfers bigint,
  net_estimate numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with payment_stats as (
    select
      coalesce(sum(case when p.payment_date >= date_trunc('month', current_date)
        and p.status in ('received', 'reconciled') then p.amount else 0 end), 0) as revenue,
      coalesce(sum(case when p.due_date >= date_trunc('month', current_date)
        and p.status in ('expected', 'late') then p.amount else 0 end), 0) as expected_collections
    from public.payments p
  ),
  invoice_stats as (
    select
      coalesce(sum(case when i.status = 'overdue' then i.amount_ttc else 0 end), 0) as overdue_exposure,
      count(*) filter (where i.status = 'paid') as paid_invoices,
      count(*) filter (where i.status not in ('paid', 'cancelled', 'archived')) as unpaid_invoices
    from public.invoices i
  ),
  transfer_stats as (
    select
      coalesce(sum(case when t.transfer_date >= date_trunc('month', current_date)
        and t.status in ('sent', 'confirmed') then t.amount else 0 end), 0) as expenses,
      count(*) filter (where t.status = 'confirmed') as confirmed_transfers
    from public.transfers t
  )
  select
    payment_stats.revenue,
    transfer_stats.expenses,
    payment_stats.expected_collections,
    invoice_stats.overdue_exposure,
    invoice_stats.paid_invoices,
    invoice_stats.unpaid_invoices,
    transfer_stats.confirmed_transfers,
    payment_stats.revenue - transfer_stats.expenses as net_estimate
  from payment_stats, invoice_stats, transfer_stats;
$$;

create or replace function public.get_shareholder_monthly_finance()
returns table (
  month text,
  inflow numeric,
  outflow numeric,
  expected numeric,
  received numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with months as (
    select generate_series(
      date_trunc('month', current_date) - interval '5 months',
      date_trunc('month', current_date),
      interval '1 month'
    )::date as month_start
  ),
  payment_rollup as (
    select
      date_trunc('month', coalesce(payment_date, due_date))::date as month_start,
      sum(case when payment_date is not null and status in ('received', 'reconciled') then amount else 0 end) as inflow,
      sum(case when due_date is not null and status in ('expected', 'late') then amount else 0 end) as expected,
      sum(case when payment_date is not null and status in ('received', 'reconciled') then amount else 0 end) as received
    from public.payments
    group by 1
  ),
  transfer_rollup as (
    select
      date_trunc('month', transfer_date)::date as month_start,
      sum(case when status in ('sent', 'confirmed') then amount else 0 end) as outflow
    from public.transfers
    group by 1
  )
  select
    to_char(months.month_start, 'Mon') as month,
    coalesce(payment_rollup.inflow, 0) as inflow,
    coalesce(transfer_rollup.outflow, 0) as outflow,
    coalesce(payment_rollup.expected, 0) as expected,
    coalesce(payment_rollup.received, 0) as received
  from months
  left join payment_rollup on payment_rollup.month_start = months.month_start
  left join transfer_rollup on transfer_rollup.month_start = months.month_start
  order by months.month_start;
$$;

create or replace function public.get_shareholder_invoice_status_summary()
returns table (
  status public.invoice_status,
  count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.status, count(*)::bigint
  from public.invoices i
  group by i.status
  order by count desc;
$$;

create or replace function public.get_shareholder_overdue_clients()
returns table (
  client_id uuid,
  client_name text,
  overdue_amount numeric,
  overdue_count bigint,
  late_payment_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id as client_id,
    c.name as client_name,
    coalesce(sum(case when i.status = 'overdue' then i.amount_ttc else 0 end), 0) as overdue_amount,
    count(*) filter (where i.status = 'overdue')::bigint as overdue_count,
    (
      select count(*)::bigint
      from public.payments p
      where p.client_id = c.id
        and p.status = 'late'
    ) as late_payment_count
  from public.clients c
  join public.invoices i on i.client_id = c.id
  group by c.id, c.name
  having count(*) filter (where i.status = 'overdue') > 0
  order by overdue_amount desc, overdue_count desc;
$$;

create or replace function public.get_shareholder_finance_deadlines()
returns table (
  kind text,
  label text,
  due_date date,
  amount numeric,
  currency text,
  status text,
  client_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with invoice_deadlines as (
    select
      'invoice_due'::text as kind,
      i.invoice_number as label,
      i.due_date,
      i.amount_ttc as amount,
      i.currency,
      i.status::text as status,
      c.name as client_name
    from public.invoices i
    left join public.clients c on c.id = i.client_id
    where i.status not in ('paid', 'cancelled', 'archived')
      and i.due_date >= current_date
      and i.due_date <= current_date + interval '14 days'
  ),
  payment_deadlines as (
    select
      'payment_due'::text as kind,
      coalesce(p.reference, c.name, 'Payment due') as label,
      p.due_date,
      p.amount,
      p.currency,
      p.status::text as status,
      c.name as client_name
    from public.payments p
    left join public.clients c on c.id = p.client_id
    where p.status in ('expected', 'late')
      and p.due_date is not null
      and p.due_date >= current_date
      and p.due_date <= current_date + interval '14 days'
  )
  select * from (
    select * from invoice_deadlines
    union all
    select * from payment_deadlines
  ) items
  order by due_date asc
  limit 12;
$$;

grant execute on function public.get_shareholder_finance_summary() to authenticated;
grant execute on function public.get_shareholder_monthly_finance() to authenticated;
grant execute on function public.get_shareholder_invoice_status_summary() to authenticated;
grant execute on function public.get_shareholder_overdue_clients() to authenticated;
grant execute on function public.get_shareholder_finance_deadlines() to authenticated;
