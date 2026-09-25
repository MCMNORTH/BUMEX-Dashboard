-- Managers can review time entries for people in their own entity.
begin;

drop policy if exists time_entries_select_manager_entity on public.time_entries;
create policy time_entries_select_manager_entity
on public.time_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles viewer
    where viewer.id = auth.uid()
      and viewer.role = 'manager'
      and viewer.entity_code = public.time_entries.entity_code
  )
);

notify pgrst, 'reload schema';
commit;
