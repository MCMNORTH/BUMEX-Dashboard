-- Apply after timesheet.sql. Admins keep full access; others must participate.
begin;
create or replace view public.timesheet_projects
with (security_invoker = true) as
select p.id, p.name, p.entity_code
from public.projects p
where exists (
     select 1 from public.profiles viewer where viewer.id = (select auth.uid())
       and (viewer.role = 'admin' or viewer.is_super_admin)
   )
   or p.owner_id = (select auth.uid())
   or exists (
     select 1 from public.project_members m
     where m.project_id = p.id and m.user_id = (select auth.uid())
   )
   or exists (
     select 1 from public.tasks t
     where t.project_id = p.id and t.assignee_id = (select auth.uid())
   );
revoke all on public.timesheet_projects from anon;
grant select on public.timesheet_projects to authenticated;

drop policy if exists time_entries_insert_participating on public.time_entries;
create policy time_entries_insert_participating on public.time_entries
as restrictive for insert to authenticated
with check (exists (
  select 1 from public.timesheet_projects p
  where p.id = time_entries.project_id and p.entity_code = time_entries.entity_code
));

drop policy if exists time_entries_update_participating on public.time_entries;
create policy time_entries_update_participating on public.time_entries
as restrictive for update to authenticated
using (exists (
  select 1 from public.timesheet_projects p
  where p.id = time_entries.project_id and p.entity_code = time_entries.entity_code
))
with check (exists (
  select 1 from public.timesheet_projects p
  where p.id = time_entries.project_id and p.entity_code = time_entries.entity_code
));
notify pgrst, 'reload schema';
commit;
