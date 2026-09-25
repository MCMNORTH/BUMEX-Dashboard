-- Admins can audit time across every Bumex entity. Other roles remain own-only.
begin;

drop policy if exists time_entries_select_admin_all on public.time_entries;
create policy time_entries_select_admin_all
on public.time_entries
for select
to authenticated
using (private.is_admin());

notify pgrst, 'reload schema';
commit;
