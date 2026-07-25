-- ============================================================================
-- PART 2.2 - Enterprise RLS for Supabase / PostgreSQL
-- ----------------------------------------------------------------------------
-- Notes:
-- 1. Policies target authenticated application users. The Supabase service role
--    still bypasses RLS by design for trusted backend/admin operations.
-- 2. SECURITY DEFINER helper functions centralize access logic and keep
--    policies strict without repeating large EXISTS clauses.
-- 3. This layer assumes the schema from supabase/schema.sql has already run.
-- ============================================================================

create schema if not exists private;

-- Keep helper functions deterministic and isolated from caller search_path.
create or replace function private.current_app_role()
returns public.role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.current_app_role() = 'admin', false);
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.current_app_role() in ('manager', 'supervisor'), false);
$$;

create or replace function private.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.current_app_role() = 'employee', false);
$$;

create or replace function private.is_shareholder()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(private.current_app_role() = 'shareholder', false);
$$;

create or replace function private.is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_admin() or private.is_manager();
$$;

create or replace function private.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function private.can_manage_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or (
      private.is_manager()
      and exists (
        select 1
        from public.projects p
        where p.id = target_project_id
          and (
            p.owner_id = auth.uid()
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = p.id
                and pm.user_id = auth.uid()
            )
          )
      )
    );
$$;

create or replace function private.can_read_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or private.is_shareholder()
    or private.can_manage_project(target_project_id)
    or exists (
      select 1
      from public.tasks t
      where t.project_id = target_project_id
        and t.assignee_id = auth.uid()
    );
$$;

create or replace function private.can_read_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or private.is_shareholder()
    or exists (
      select 1
      from public.tasks t
      where t.id = target_task_id
        and (
          t.assignee_id = auth.uid()
          or private.can_manage_project(t.project_id)
        )
    );
$$;

create or replace function private.can_manage_milestones(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or (
      private.is_manager()
      and exists (
        select 1
        from public.projects p
        where p.id = target_project_id
          and p.owner_id = auth.uid()
      )
    );
$$;

create or replace function private.can_read_milestone(target_milestone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.milestones m
    where m.id = target_milestone_id
      and private.can_read_project(m.project_id)
  );
$$;

create or replace function private.can_read_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or private.is_shareholder()
    or (
      private.is_manager()
      and (
        exists (
          select 1
          from public.clients c
          where c.id = target_client_id
            and c.account_manager_id = auth.uid()
        )
        or exists (
          select 1
          from public.projects p
          where p.client_id = target_client_id
            and (
              p.owner_id = auth.uid()
              or exists (
                select 1
                from public.project_members pm
                where pm.project_id = p.id
                  and pm.user_id = auth.uid()
              )
            )
        )
      )
    )
    or (
      private.is_employee()
      and exists (
        select 1
        from public.tasks t
        join public.projects p on p.id = t.project_id
        where p.client_id = target_client_id
          and t.assignee_id = auth.uid()
      )
    );
$$;

create or replace function private.can_read_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.contracts c
      where c.id = target_contract_id
        and (
          private.is_admin()
          or private.is_shareholder()
          or (
            private.is_manager()
            and (
              private.can_read_client(c.client_id)
              or (c.project_id is not null and private.can_read_project(c.project_id))
            )
          )
        )
    );
$$;

create or replace function private.can_manage_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.contracts c
      left join public.clients cl on cl.id = c.client_id
      where c.id = target_contract_id
        and private.is_manager()
        and (
          cl.account_manager_id = auth.uid()
          or (c.project_id is not null and private.can_manage_project(c.project_id))
        )
  );
$$;

create or replace function private.can_manage_client_finance(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or (
      private.is_manager()
      and exists (
        select 1
        from public.clients c
        where c.id = target_client_id
          and c.account_manager_id = auth.uid()
      )
    );
$$;

create or replace function private.can_read_invoice(target_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.invoices i
      where i.id = target_invoice_id
        and private.is_shareholder()
        and (
          private.can_read_client(i.client_id)
          or (i.project_id is not null and private.can_read_project(i.project_id))
          or (i.contract_id is not null and private.can_read_contract(i.contract_id))
        )
    )
    or exists (
      select 1
      from public.invoices i
      where i.id = target_invoice_id
        and private.is_manager()
        and (
          private.can_manage_client_finance(i.client_id)
          or (i.project_id is not null and private.can_manage_project(i.project_id))
          or (i.contract_id is not null and private.can_manage_contract(i.contract_id))
        )
    );
$$;

create or replace function private.can_read_payment(target_payment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.payments p
      where p.id = target_payment_id
        and private.is_shareholder()
        and (
          private.can_read_client(p.client_id)
          or (p.project_id is not null and private.can_read_project(p.project_id))
          or (p.contract_id is not null and private.can_read_contract(p.contract_id))
          or (p.invoice_id is not null and private.can_read_invoice(p.invoice_id))
        )
    )
    or exists (
      select 1
      from public.payments p
      where p.id = target_payment_id
        and private.is_manager()
        and (
          private.can_manage_client_finance(p.client_id)
          or (p.project_id is not null and private.can_manage_project(p.project_id))
          or (p.contract_id is not null and private.can_manage_contract(p.contract_id))
          or (p.invoice_id is not null and private.can_read_invoice(p.invoice_id))
        )
    );
$$;

create or replace function private.can_read_transfer(target_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.transfers t
      where t.id = target_transfer_id
        and private.is_shareholder()
        and (
          (t.related_project_id is not null and private.can_read_project(t.related_project_id))
          or (t.related_client_id is not null and private.can_read_client(t.related_client_id))
        )
    )
    or exists (
      select 1
      from public.transfers t
      where t.id = target_transfer_id
        and private.is_manager()
        and (
          (t.related_project_id is not null and private.can_manage_project(t.related_project_id))
          or (t.related_client_id is not null and private.can_manage_client_finance(t.related_client_id))
        )
    );
$$;

create or replace function private.can_read_receipt(target_receipt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.receipts r
      where r.id = target_receipt_id
        and private.can_read_payment(r.payment_id)
    );
$$;

create or replace function private.can_manage_document(
  target_related_type public.document_related_type,
  target_related_id uuid,
  target_uploaded_by uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when target_related_type = 'archive' then private.is_manager()
    when target_related_type = 'project' then private.can_manage_project(target_related_id)
    when target_related_type = 'task' then exists (
      select 1
      from public.tasks t
      where t.id = target_related_id
        and private.can_manage_project(t.project_id)
    )
    when target_related_type = 'client' then exists (
      select 1
      from public.clients c
      where c.id = target_related_id
        and c.account_manager_id = auth.uid()
    )
    when target_related_type = 'contract' then private.can_manage_contract(target_related_id)
    when target_related_type = 'invoice' then private.can_read_invoice(target_related_id)
    when target_related_type = 'payment' then private.can_read_payment(target_related_id)
    when target_related_type = 'transfer' then private.can_read_transfer(target_related_id)
    else false
  end;
$$;

create or replace function private.can_read_document(
  target_related_type public.document_related_type,
  target_related_id uuid,
  target_visibility public.document_visibility,
  target_is_archived boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when target_related_type = 'archive' then case
      when target_visibility = 'shareholders' then private.is_shareholder() or private.is_admin_or_manager()
      when target_visibility = 'restricted' then private.is_admin_or_manager()
      when target_visibility = 'management' then private.is_admin_or_manager()
      else private.is_admin_or_manager()
    end
    when target_visibility = 'restricted' then private.can_manage_document(target_related_type, target_related_id, null)
    when target_visibility = 'management' then private.is_admin_or_manager()
      and (
        target_related_type = 'project' and private.can_read_project(target_related_id)
        or target_related_type = 'task' and private.can_read_task(target_related_id)
        or target_related_type = 'client' and private.can_read_client(target_related_id)
        or target_related_type = 'contract' and private.can_read_contract(target_related_id)
        or target_related_type = 'invoice' and private.can_read_invoice(target_related_id)
        or target_related_type = 'payment' and private.can_read_payment(target_related_id)
        or target_related_type = 'transfer' and private.can_read_transfer(target_related_id)
      )
    when target_visibility = 'shareholders' then private.is_shareholder()
      and target_related_type <> 'task'
      and (
        target_related_type = 'project' and private.can_read_project(target_related_id)
        or target_related_type = 'client' and private.can_read_client(target_related_id)
        or target_related_type = 'contract' and private.can_read_contract(target_related_id)
        or target_related_type = 'invoice' and private.can_read_invoice(target_related_id)
        or target_related_type = 'payment' and private.can_read_payment(target_related_id)
        or target_related_type = 'transfer' and private.can_read_transfer(target_related_id)
      )
    else case
      when private.is_manager() then (
        target_related_type = 'project' and private.can_read_project(target_related_id)
        or target_related_type = 'task' and private.can_read_task(target_related_id)
        or target_related_type = 'client' and private.can_read_client(target_related_id)
        or target_related_type = 'contract' and private.can_read_contract(target_related_id)
        or target_related_type = 'invoice' and private.can_read_invoice(target_related_id)
        or target_related_type = 'payment' and private.can_read_payment(target_related_id)
        or target_related_type = 'transfer' and private.can_read_transfer(target_related_id)
      )
      when private.is_employee() then (
        target_related_type = 'project' and private.can_read_project(target_related_id)
        or target_related_type = 'task' and private.can_read_task(target_related_id)
        or target_related_type = 'client' and private.can_read_client(target_related_id)
        or target_related_type = 'contract' and private.can_read_contract(target_related_id)
      )
      when private.is_shareholder() then false
      else false
    end
  end;
$$;

create or replace function private.can_read_activity_log(
  target_user_id uuid,
  target_entity_type public.activity_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when target_user_id = auth.uid() then true
    when private.is_manager() then case
      when target_entity_type = 'project' then private.can_read_project(target_entity_id)
      when target_entity_type = 'milestone' then private.can_read_milestone(target_entity_id)
      when target_entity_type = 'task' then private.can_read_task(target_entity_id)
      when target_entity_type = 'client' then private.can_read_client(target_entity_id)
      when target_entity_type = 'contract' then private.can_read_contract(target_entity_id)
      when target_entity_type = 'invoice' then private.can_read_invoice(target_entity_id)
      when target_entity_type = 'receipt' then private.can_read_receipt(target_entity_id)
      when target_entity_type = 'document' then exists (
        select 1
        from public.documents d
        where d.id = target_entity_id
          and private.can_read_document(d.related_type, d.related_id, d.visibility, d.is_archived)
      )
      when target_entity_type = 'payment' then private.can_read_payment(target_entity_id)
      when target_entity_type = 'team' then private.is_manager()
      when target_entity_type = 'profile' then target_user_id = auth.uid()
      when target_entity_type = 'transfer' then private.can_read_transfer(target_entity_id)
      else false
    end
    else false
  end;
  $$;

create or replace function private.can_read_comment_entity(
  target_entity_type public.comment_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when target_entity_type = 'project' then private.can_read_project(target_entity_id)
    when target_entity_type = 'ticket' then private.can_read_task(target_entity_id)
    when target_entity_type = 'client' then private.can_read_client(target_entity_id)
    when target_entity_type = 'contract' then private.can_read_contract(target_entity_id)
    when target_entity_type = 'document' then exists (
      select 1
      from public.documents d
      where d.id = target_entity_id
        and private.can_read_document(d.related_type, d.related_id, d.visibility, d.is_archived)
    )
    when target_entity_type = 'invoice' then private.can_read_invoice(target_entity_id)
    when target_entity_type = 'payment' then private.can_read_payment(target_entity_id)
    when target_entity_type = 'transfer' then private.can_read_transfer(target_entity_id)
    else false
  end;
$$;

create or replace function private.can_comment_on_entity(
  target_entity_type public.comment_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then private.can_read_comment_entity(target_entity_type, target_entity_id)
    when private.is_manager() then private.can_read_comment_entity(target_entity_type, target_entity_id)
    when private.is_employee() then (
      (target_entity_type = 'project' and private.can_read_project(target_entity_id))
      or (target_entity_type = 'ticket' and private.can_read_task(target_entity_id))
    )
    else false
  end;
$$;

create or replace function private.can_read_notification_entity(
  target_entity_type public.notification_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when target_entity_type = 'project' then private.can_read_project(target_entity_id)
    when target_entity_type = 'ticket' then private.can_read_task(target_entity_id)
    when target_entity_type = 'client' then private.can_read_client(target_entity_id)
    when target_entity_type = 'contract' then private.can_read_contract(target_entity_id)
    when target_entity_type = 'document' then exists (
      select 1
      from public.documents d
      where d.id = target_entity_id
        and private.can_read_document(d.related_type, d.related_id, d.visibility, d.is_archived)
    )
    when target_entity_type = 'invoice' then private.can_read_invoice(target_entity_id)
    when target_entity_type = 'payment' then private.can_read_payment(target_entity_id)
    when target_entity_type = 'transfer' then private.can_read_transfer(target_entity_id)
    when target_entity_type = 'milestone' then exists (
      select 1
      from public.milestones m
      where m.id = target_entity_id
        and private.can_read_project(m.project_id)
    )
    else true
  end;
$$;

create or replace function private.can_read_note_entity(
  target_entity_type public.note_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when target_entity_type = 'project' then private.can_read_project(target_entity_id)
    when target_entity_type = 'client' then private.can_read_client(target_entity_id)
    when target_entity_type = 'contract' then private.can_read_contract(target_entity_id)
    when target_entity_type = 'finance' then private.is_admin_or_manager() or private.is_shareholder()
    when target_entity_type = 'shareholder' then private.is_admin_or_manager() or private.is_shareholder()
    else false
  end;
$$;

create or replace function private.can_manage_note_entity(
  target_entity_type public.note_entity_type,
  target_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when private.is_manager() then private.can_read_note_entity(target_entity_type, target_entity_id)
    when private.is_employee() then (
      target_entity_type in ('project', 'client', 'contract')
      and private.can_read_note_entity(target_entity_type, target_entity_id)
    )
    else false
  end;
$$;

create or replace function private.can_read_note_visibility(
  target_visibility public.note_visibility,
  target_author_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when target_visibility = 'private' then target_author_id = auth.uid()
    when target_visibility = 'team' then private.is_manager() or private.is_employee()
    when target_visibility = 'management' then private.is_manager()
    when target_visibility = 'shareholders' then private.is_manager() or private.is_shareholder()
    else false
  end;
$$;

create or replace function private.can_use_note_visibility(
  target_visibility public.note_visibility
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin() then true
    when private.is_manager() then target_visibility in ('private', 'team', 'management', 'shareholders')
    when private.is_employee() then target_visibility in ('private', 'team')
    else false
  end;
$$;

-- ============================================================================
-- Enable RLS across the full application schema.
-- ============================================================================

-- Reinstall public policies from a clean slate. This makes the file safe to
-- re-run from the Supabase SQL Editor after earlier partial/manual setup.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'teams',
        'team_members',
        'clients',
        'projects',
        'project_members',
        'tasks',
        'task_dependencies',
        'milestones',
        'contracts',
        'invoices',
        'documents',
        'payments',
        'transfers',
        'receipts',
        'activity_logs',
        'comments',
        'comment_attachments',
        'mentions',
        'notifications',
        'internal_notes'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.milestones enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.documents enable row level security;
alter table public.payments enable row level security;
alter table public.transfers enable row level security;
alter table public.receipts enable row level security;
alter table public.activity_logs enable row level security;
alter table public.comments enable row level security;
alter table public.comment_attachments enable row level security;
alter table public.mentions enable row level security;
alter table public.notifications enable row level security;
alter table public.internal_notes enable row level security;

alter table public.profiles force row level security;
alter table public.teams force row level security;
alter table public.team_members force row level security;
alter table public.clients force row level security;
alter table public.projects force row level security;
alter table public.project_members force row level security;
alter table public.tasks force row level security;
alter table public.task_dependencies force row level security;
alter table public.milestones force row level security;
alter table public.contracts force row level security;
alter table public.invoices force row level security;
alter table public.documents force row level security;
alter table public.payments force row level security;
alter table public.transfers force row level security;
alter table public.receipts force row level security;
alter table public.activity_logs force row level security;
alter table public.comments force row level security;
alter table public.comment_attachments force row level security;
alter table public.mentions force row level security;
alter table public.notifications force row level security;
alter table public.internal_notes force row level security;

-- ============================================================================
-- PROFILES
-- Users can see/update themselves. Admin can manage all profiles.
-- ============================================================================

create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or private.is_admin()
  or private.is_manager()
  or private.is_employee()
  or exists (
      select 1
      from public.projects p
      where p.owner_id = public.profiles.id
        and private.can_read_project(p.id)
  )
  or exists (
    select 1
    from public.project_members pm
    where pm.user_id = public.profiles.id
      and private.can_read_project(pm.project_id)
  )
  or exists (
    select 1
    from public.tasks t
    where (
      t.assignee_id = public.profiles.id
      or t.reporter_id = public.profiles.id
    )
      and private.can_read_task(t.id)
  )
);

create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or private.is_admin()
  or private.is_manager()
)
with check (
  id = auth.uid()
  or private.is_admin()
  or private.is_manager()
);

create policy "profiles_insert_self_or_admin"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or private.is_admin()
);

create policy "profiles_delete_admin_only"
on public.profiles
for delete
to authenticated
using (private.is_admin());

-- ============================================================================
-- TEAMS / TEAM MEMBERS
-- Team data is limited to admins and real participants.
-- ============================================================================

create policy "teams_select_member_manager_admin"
on public.teams
for select
to authenticated
using (
  private.is_admin()
  or private.is_manager()
  or private.is_team_member(id)
);

create policy "teams_modify_admin_or_manager"
on public.teams
for all
to authenticated
using (
  private.is_admin()
  or private.is_manager()
)
with check (
  private.is_admin()
  or private.is_manager()
);

create policy "team_members_select_relevant"
on public.team_members
for select
to authenticated
using (
  private.is_admin()
  or private.is_manager()
  or user_id = auth.uid()
  or private.is_team_member(team_id)
);

create policy "team_members_modify_admin_or_manager"
on public.team_members
for all
to authenticated
using (
  private.is_admin()
  or private.is_manager()
)
with check (
  private.is_admin()
  or private.is_manager()
);

-- ============================================================================
-- CLIENTS
-- Admin/manager full access. Employees only when linked through assigned work.
-- Shareholders are read-only.
-- ============================================================================

create policy "clients_select_by_access"
on public.clients
for select
to authenticated
using (private.can_read_client(id));

create policy "clients_modify_admin_or_manager"
on public.clients
for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and account_manager_id = auth.uid()
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and account_manager_id = auth.uid()
  )
);

-- ============================================================================
-- PROJECTS
-- Admin full. Managers manage owned/member projects. Employees only related
-- projects via assigned tasks. Shareholders can read only.
-- ============================================================================

create policy "projects_select_by_access"
on public.projects
for select
to authenticated
using (private.can_read_project(id));

create policy "projects_insert_admin_or_manager"
on public.projects
for insert
to authenticated
with check (
  private.is_admin()
  or (
    private.is_manager()
    and owner_id = auth.uid()
  )
);

create policy "projects_update_manageable"
on public.projects
for update
to authenticated
using (private.can_manage_project(id))
with check (private.can_manage_project(id));

create policy "projects_delete_manageable"
on public.projects
for delete
to authenticated
using (private.can_manage_project(id));

-- ============================================================================
-- PROJECT MEMBERS
-- Visibility follows project visibility. Changes are limited to project managers
-- and admins to avoid privilege sprawl.
-- ============================================================================

create policy "project_members_select_by_project_access"
on public.project_members
for select
to authenticated
using (
  private.can_read_project(project_id)
);

create policy "project_members_modify_manageable_projects"
on public.project_members
for all
to authenticated
using (
  private.can_manage_project(project_id)
)
with check (
  private.can_manage_project(project_id)
);

-- ============================================================================
-- TASKS
-- Employees only assigned tasks. Managers only tasks within projects they
-- manage. Admin full. Shareholders read-only.
-- ============================================================================

create policy "tasks_select_by_access"
on public.tasks
for select
to authenticated
using (private.can_read_task(id));

create policy "tasks_insert_admin_or_project_manager"
on public.tasks
for insert
to authenticated
with check (
  private.is_admin()
  or private.can_manage_project(project_id)
);

create policy "tasks_update_by_access"
on public.tasks
for update
to authenticated
using (
  private.is_admin()
  or private.can_manage_project(project_id)
  or assignee_id = auth.uid()
)
with check (
  private.is_admin()
  or private.can_manage_project(project_id)
  or assignee_id = auth.uid()
);

create policy "tasks_delete_admin_or_project_manager"
on public.tasks
for delete
to authenticated
using (
  private.is_admin()
  or private.can_manage_project(project_id)
);

-- ============================================================================
-- TASK DEPENDENCIES
-- Read access requires visibility on both tasks. Mutations are restricted to
-- admins/managers who can manage the parent task's project.
-- ============================================================================

create policy "task_dependencies_select_by_task_visibility"
on public.task_dependencies
for select
to authenticated
using (
  private.can_read_task(task_id)
  and private.can_read_task(depends_on_task_id)
);

create policy "task_dependencies_modify_manageable"
on public.task_dependencies
for all
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and private.can_manage_project(t.project_id)
  )
)
with check (
  private.is_admin()
  or exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and private.can_manage_project(t.project_id)
  )
);

-- ============================================================================
-- MILESTONES
-- Visibility follows project access. Milestone management is limited to admins
-- and managers who own the linked project.
-- ============================================================================

create policy "milestones_select_by_project_access"
on public.milestones
for select
to authenticated
using (
  private.can_read_project(project_id)
);

create policy "milestones_insert_manageable_projects"
on public.milestones
for insert
to authenticated
with check (
  private.can_manage_milestones(project_id)
);

create policy "milestones_update_manageable_projects"
on public.milestones
for update
to authenticated
using (
  private.can_manage_milestones(project_id)
)
with check (
  private.can_manage_milestones(project_id)
);

create policy "milestones_delete_manageable_projects"
on public.milestones
for delete
to authenticated
using (
  private.can_manage_milestones(project_id)
);

-- ============================================================================
-- CONTRACTS
-- Contracts inherit client access. Write operations stay with admin/manager.
-- ============================================================================

create policy "contracts_select_by_client_access"
on public.contracts
for select
to authenticated
using (private.can_read_contract(id));

create policy "contracts_modify_admin_or_manager"
on public.contracts
for all
to authenticated
using (
  private.can_manage_contract(id)
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and (
      exists (
        select 1
        from public.clients c
        where c.id = client_id
          and c.account_manager_id = auth.uid()
      )
      or (project_id is not null and private.can_manage_project(project_id))
    )
  )
);

-- ============================================================================
-- INVOICES
-- Finance data is limited to admin and managers within assigned client/project/
-- contract scope. Employees and shareholders do not reach raw invoice rows.
-- ============================================================================

create policy "invoices_select_finance_only"
on public.invoices
for select
to authenticated
using (private.can_read_invoice(id));

create policy "invoices_modify_finance_only"
on public.invoices
for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and (
      private.can_manage_client_finance(client_id)
      or (project_id is not null and private.can_manage_project(project_id))
      or (contract_id is not null and private.can_manage_contract(contract_id))
    )
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and (
      private.can_manage_client_finance(client_id)
      or (project_id is not null and private.can_manage_project(project_id))
      or (contract_id is not null and private.can_manage_contract(contract_id))
    )
  )
);

-- ============================================================================
-- DOCUMENTS
-- Access only when the user is genuinely linked to the referenced entity.
-- Shareholders are intentionally excluded unless their document is exposed
-- through a readable linked entity.
-- ============================================================================

create policy "documents_select_by_related_access"
on public.documents
for select
to authenticated
using (
  private.can_read_document(related_type, related_id, visibility, is_archived)
);

create policy "documents_insert_by_related_access"
on public.documents
for insert
to authenticated
with check (
  private.can_manage_document(related_type, related_id, uploaded_by)
  and uploaded_by = auth.uid()
);

create policy "documents_update_admin_or_uploader"
on public.documents
for update
to authenticated
using (
  private.can_manage_document(related_type, related_id, uploaded_by)
)
with check (
  private.can_manage_document(related_type, related_id, uploaded_by)
);

create policy "documents_delete_manageable"
on public.documents
for delete
to authenticated
using (private.can_manage_document(related_type, related_id, uploaded_by));

drop policy if exists "documents_bucket_select_scoped" on storage.objects;
drop policy if exists "documents_bucket_insert_authenticated" on storage.objects;
drop policy if exists "documents_bucket_update_scoped" on storage.objects;
drop policy if exists "documents_bucket_delete_scoped" on storage.objects;

create policy "documents_bucket_select_scoped"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_url = name
      and private.can_read_document(d.related_type, d.related_id, d.visibility, d.is_archived)
  )
);

create policy "documents_bucket_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and auth.role() = 'authenticated'
);

create policy "documents_bucket_update_scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_url = name
      and private.can_manage_document(d.related_type, d.related_id, d.uploaded_by)
  )
)
with check (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_url = name
      and private.can_manage_document(d.related_type, d.related_id, d.uploaded_by)
  )
);

create policy "documents_bucket_delete_scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_url = name
      and private.can_manage_document(d.related_type, d.related_id, d.uploaded_by)
  )
);

-- ============================================================================
-- PAYMENTS / TRANSFERS
-- Finance is intentionally restricted to admin + manager only.
-- Managers are still scoped to projects they manage for payments.
-- Transfers stay admin/manager only without employee/shareholder visibility.
-- ============================================================================

create policy "payments_select_finance_only"
on public.payments
for select
to authenticated
using (private.can_read_payment(id));

create policy "payments_modify_finance_only"
on public.payments
for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and (
      private.can_manage_client_finance(client_id)
      or (project_id is not null and private.can_manage_project(project_id))
      or (contract_id is not null and private.can_manage_contract(contract_id))
      or (invoice_id is not null and private.can_read_invoice(invoice_id))
    )
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and (
      private.can_manage_client_finance(client_id)
      or (project_id is not null and private.can_manage_project(project_id))
      or (contract_id is not null and private.can_manage_contract(contract_id))
      or (invoice_id is not null and private.can_read_invoice(invoice_id))
    )
  )
);

create policy "transfers_select_finance_only"
on public.transfers
for select
to authenticated
using (private.can_read_transfer(id));

create policy "transfers_modify_finance_only"
on public.transfers
for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and (
      (related_project_id is not null and private.can_manage_project(related_project_id))
      or (related_client_id is not null and private.can_manage_client_finance(related_client_id))
    )
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and (
      (related_project_id is not null and private.can_manage_project(related_project_id))
      or (related_client_id is not null and private.can_manage_client_finance(related_client_id))
    )
  )
);

create policy "receipts_select_finance_only"
on public.receipts
for select
to authenticated
using (private.can_read_receipt(id));

create policy "receipts_modify_finance_only"
on public.receipts
for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and private.can_read_payment(payment_id)
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and private.can_read_payment(payment_id)
  )
);

-- ============================================================================
-- ACTIVITY LOGS
-- Admin full. Managers get scoped read access. All authenticated users may
-- record their own actions. Non-admins cannot rewrite or remove audit history.
-- ============================================================================

create policy "activity_logs_select_scoped"
on public.activity_logs
for select
to authenticated
using (
  private.can_read_activity_log(user_id, entity_type, entity_id)
);

create policy "activity_logs_insert_self_or_admin"
on public.activity_logs
for insert
to authenticated
with check (
  private.is_admin()
  or user_id = auth.uid()
);

create policy "activity_logs_update_admin_only"
on public.activity_logs
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "activity_logs_delete_admin_only"
on public.activity_logs
for delete
to authenticated
using (private.is_admin());

-- ============================================================================
-- COMMENTS
-- Reusable collaboration comments across projects, tickets, clients, contracts,
-- documents, and finance entities. Shareholders only see non-internal comments.
-- ============================================================================

create policy "comments_select_scoped"
on public.comments
for select
to authenticated
using (
  private.can_read_comment_entity(entity_type, entity_id)
  and (not private.is_shareholder() or not is_internal)
);

create policy "comments_insert_scoped"
on public.comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_comment_on_entity(entity_type, entity_id)
  and (not private.is_shareholder())
);

create policy "comments_update_owner_or_admin"
on public.comments
for update
to authenticated
using (
  private.is_admin()
  or author_id = auth.uid()
)
with check (
  private.is_admin()
  or author_id = auth.uid()
);

create policy "comments_delete_admin_only"
on public.comments
for delete
to authenticated
using (private.is_admin());

create policy "comment_attachments_select_scoped"
on public.comment_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and private.can_read_comment_entity(c.entity_type, c.entity_id)
      and (not private.is_shareholder() or not c.is_internal)
  )
);

create policy "comment_attachments_insert_owner_or_admin"
on public.comment_attachments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and (
        private.is_admin()
        or c.author_id = auth.uid()
      )
  )
);

create policy "comment_attachments_update_admin_only"
on public.comment_attachments
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "comment_attachments_delete_admin_or_comment_owner"
on public.comment_attachments
for delete
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and c.author_id = auth.uid()
  )
);

-- ============================================================================
-- MENTIONS / NOTIFICATIONS
-- Users see only their own notifications. Admin can audit. Mentions are scoped
-- to recipients, authors, and admins.
-- ============================================================================

create policy "mentions_select_recipient_author_admin"
on public.mentions
for select
to authenticated
using (
  private.is_admin()
  or mentioned_user_id = auth.uid()
  or mentioned_by = auth.uid()
);

create policy "mentions_insert_scoped"
on public.mentions
for insert
to authenticated
with check (
  mentioned_by = auth.uid()
  and private.can_comment_on_entity(entity_type, entity_id)
);

create policy "mentions_delete_admin_only"
on public.mentions
for delete
to authenticated
using (private.is_admin());

create policy "notifications_select_own_or_admin"
on public.notifications
for select
to authenticated
using (
  private.is_admin()
  or (
    user_id = auth.uid()
    and private.can_read_notification_entity(entity_type, entity_id)
  )
);

create policy "notifications_insert_scoped"
on public.notifications
for insert
to authenticated
with check (
  private.is_admin()
  or private.is_admin_or_manager()
  or private.can_read_notification_entity(entity_type, entity_id)
);

create policy "notifications_update_own_or_admin"
on public.notifications
for update
to authenticated
using (
  private.is_admin()
  or user_id = auth.uid()
)
with check (
  private.is_admin()
  or user_id = auth.uid()
);

create policy "notifications_delete_admin_only"
on public.notifications
for delete
to authenticated
using (private.is_admin());

create policy "internal_notes_select_scoped"
on public.internal_notes
for select
to authenticated
using (
  private.can_read_note_entity(entity_type, entity_id)
  and private.can_read_note_visibility(visibility, author_id)
  and archived_at is null
);

create policy "internal_notes_insert_scoped"
on public.internal_notes
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_manage_note_entity(entity_type, entity_id)
  and private.can_use_note_visibility(visibility)
);

create policy "internal_notes_update_scoped"
on public.internal_notes
for update
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and private.can_manage_note_entity(entity_type, entity_id)
  )
  or (
    author_id = auth.uid()
    and private.can_manage_note_entity(entity_type, entity_id)
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and private.can_manage_note_entity(entity_type, entity_id)
    and private.can_use_note_visibility(visibility)
  )
  or (
    author_id = auth.uid()
    and private.can_manage_note_entity(entity_type, entity_id)
    and private.can_use_note_visibility(visibility)
  )
);

create policy "internal_notes_delete_admin_only"
on public.internal_notes
for delete
to authenticated
using (private.is_admin());
