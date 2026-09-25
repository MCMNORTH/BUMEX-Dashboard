alter table public.invoices
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.invoices
  drop constraint if exists invoices_approval_status_chk;

alter table public.invoices
  add constraint invoices_approval_status_chk
  check (approval_status in ('pending', 'approved'));

create index if not exists idx_invoices_approval_status
  on public.invoices (approval_status);

-- Existing invoices predate this workflow and remain usable.
update public.invoices
set approval_status = 'approved', approved_at = coalesce(approved_at, created_at)
where approval_status = 'pending' and created_at < timezone('utc', now());

create or replace function public.enforce_invoice_admin_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status = 'approved'
     and (
       tg_op = 'INSERT'
       or old.approval_status is distinct from new.approval_status
       or old.approved_by is distinct from new.approved_by
       or old.approved_at is distinct from new.approved_at
     )
     and not exists (
       select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
     ) then
    raise exception 'Only an administrator can approve an invoice.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invoice_admin_approval on public.invoices;
create trigger trg_enforce_invoice_admin_approval
before insert or update of approval_status, approved_by, approved_at
on public.invoices
for each row execute function public.enforce_invoice_admin_approval();
