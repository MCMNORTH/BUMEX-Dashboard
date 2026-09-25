-- Route timesheet workflow events through the existing notification center.
alter type public.notification_entity_type add value if not exists 'timesheet';

begin;
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
      select 1 from public.documents d where d.id = target_entity_id
        and private.can_read_document(d.related_type, d.related_id, d.visibility, d.is_archived)
    )
    when target_entity_type = 'invoice' then private.can_read_invoice(target_entity_id)
    when target_entity_type = 'payment' then private.can_read_payment(target_entity_id)
    when target_entity_type = 'transfer' then private.can_read_transfer(target_entity_id)
    when target_entity_type = 'milestone' then exists (
      select 1 from public.milestones m where m.id = target_entity_id and private.can_read_project(m.project_id)
    )
    when target_entity_type = 'timesheet' then (
      target_entity_id = auth.uid()
      or private.is_admin()
      or exists (
        select 1 from public.profiles viewer, public.profiles subject
        where viewer.id = auth.uid() and subject.id = target_entity_id
          and viewer.role = 'manager' and viewer.entity_code = subject.entity_code
      )
    )
    else true
  end;
$$;
notify pgrst, 'reload schema';
commit;
