-- Personal favorite missions, shared across the user's devices.
begin;

create table if not exists public.time_mission_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_code text not null,
  mission text not null check (char_length(mission) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, project_id, mission)
);

create index if not exists time_mission_favorites_user_idx
  on public.time_mission_favorites(user_id, entity_code, created_at desc);

alter table public.time_mission_favorites enable row level security;
revoke all on public.time_mission_favorites from anon;
grant select, insert, delete on public.time_mission_favorites to authenticated;

drop policy if exists time_mission_favorites_select_own on public.time_mission_favorites;
create policy time_mission_favorites_select_own on public.time_mission_favorites
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists time_mission_favorites_insert_own on public.time_mission_favorites;
create policy time_mission_favorites_insert_own on public.time_mission_favorites
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.entity_code = time_mission_favorites.entity_code or p.is_super_admin)
  )
  and exists (
    select 1 from public.timesheet_projects p
    where p.id = time_mission_favorites.project_id
      and p.entity_code = time_mission_favorites.entity_code
  )
);

drop policy if exists time_mission_favorites_delete_own on public.time_mission_favorites;
create policy time_mission_favorites_delete_own on public.time_mission_favorites
for delete to authenticated
using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
commit;
