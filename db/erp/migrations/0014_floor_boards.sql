-- =====================================================================
--  BUMEX ERP — migration 0014: one board per floor
--  Applies on top of 0001–0013.
--
--  Every mission had its own board (work.board, 0008), so a view mixing missions (My work, the floor's board) mixed
--  boards that could differ. Asked on 2026-10-28: the board belongs to the floor (the entity), all its missions follow
--  it, and it is changed in one place with BUMEX One's settings (stages, categories, completed stage, default stage,
--  moves backward / skipping / reopening, reasons, custom transitions).
--  - work.floor_board: one row per entity, the same columns as work.board. Read by whoever sees the floor or works on
--    one of its missions; changed by the administrators and the floor's managers.
--  - Each floor starts from a model: BUMEX Audit from the audit one, BUMEX IT from the development one, every other
--    floor from the standard one (lib/tickets/workflow-models.ts). The first stage of each category keeps the built-in
--    id (todo, in_progress, review, blocked, done), so a ticket that never had a stage lands where its status says.
--    A floor whose tickets are in the backlog or blocked while its model has no such stage gets one, so no ticket
--    changes status.
--  - Every ticket moves to its floor's stage of the same name and the same status, otherwise to the first stage of its
--    status: its status, and so its completion, never change. Stage moves are not field changes (no history line).
--  - A new entity gets the standard board.
--  - work.board stays as it was (the way back) and is no longer read.
-- =====================================================================
set search_path to erp, public;

create table work.floor_board (
  entity_id                  uuid primary key references erp.entity(id) on delete cascade,
  stages                     jsonb not null default '[]',
  transitions                jsonb not null default '{}',
  allow_backward             boolean not null default false,
  allow_skip_forward         boolean not null default false,
  allow_reopen               boolean not null default false,
  require_reason             boolean not null default false,
  custom_transitions_enabled boolean not null default false,
  updated_by                 text references work.person(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create trigger touch before update on work.floor_board for each row execute function work.touch();

alter table work.floor_board enable row level security;
alter table work.floor_board force row level security;
-- the floor's people, and whoever works on one of its missions from another floor (a ticket of theirs follows it)
create policy read on work.floor_board for select using (
  work.inside() or (not work.hidden(erp.is_test_entity(entity_id)) and (
    erp.can_see_entity(entity_id)
    or exists (select 1 from erp.engagement g where g.entity_id = floor_board.entity_id and work.can_read_project(g.id)))));
create policy manage on work.floor_board for all
  using (work.inside() or (not work.hidden(erp.is_test_entity(entity_id)) and (work.actor_class() = 'admin' or work.is_entity_manager(entity_id))))
  with check (work.inside() or (not work.hidden(erp.is_test_entity(entity_id)) and (work.actor_class() = 'admin' or work.is_entity_manager(entity_id))));
grant select, insert, update, delete on work.floor_board to erp_app, work_reader;

-- the models, as their first save writes them
create or replace function work.floor_model(p_code text) returns jsonb
language sql immutable as $$
  select case p_code
    when 'bumex_audit' then jsonb_build_array(
      jsonb_build_object('id', 'todo', 'name', 'Planification', 'category', 'todo', 'is_default', true, 'is_completed', false),
      jsonb_build_object('id', 'in_progress', 'name', 'Terrain', 'category', 'in_progress', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'review', 'name', 'Revue', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'aud_report', 'name', 'Rapport', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'done', 'name', 'Terminé', 'category', 'in_progress', 'is_default', false, 'is_completed', true))
    when 'bumex_it' then jsonb_build_array(
      jsonb_build_object('id', 'todo', 'name', 'To Do', 'category', 'todo', 'is_default', true, 'is_completed', false),
      jsonb_build_object('id', 'dev_ready', 'name', 'Ready to implement', 'category', 'todo', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'blocked', 'name', 'Pending', 'category', 'blocked', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'in_progress', 'name', 'In progress', 'category', 'in_progress', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'review', 'name', 'Code review', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'dev_ready_test', 'name', 'Ready for test', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'dev_test', 'name', 'Test', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'dev_merge', 'name', 'To merge', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'done', 'name', 'Done', 'category', 'in_progress', 'is_default', false, 'is_completed', true))
    else jsonb_build_array(
      jsonb_build_object('id', 'todo', 'name', 'À faire', 'category', 'todo', 'is_default', true, 'is_completed', false),
      jsonb_build_object('id', 'in_progress', 'name', 'En cours', 'category', 'in_progress', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'review', 'name', 'En revue', 'category', 'review', 'is_default', false, 'is_completed', false),
      jsonb_build_object('id', 'done', 'name', 'Terminé', 'category', 'in_progress', 'is_default', false, 'is_completed', true))
  end $$;

-- the stages in order, numbered from 0, never archived yet
create or replace function work.floor_stages(p_stages jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(s || jsonb_build_object('position', n - 1, 'archived_at', null) order by n), '[]'::jsonb)
    from jsonb_array_elements(p_stages) with ordinality as x(s, n) $$;

-- a name as the boards compare them ("Code Review", "code review " and "Côde review" are one stage)
create or replace function pg_temp.fold(p text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(translate(coalesce(p, ''),
    'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g'))) $$;

-- 1. the floors' boards
do $$
declare
  e record;
  v_stages jsonb;
begin
  for e in select id, code from erp.entity loop
    v_stages := work.floor_model(e.code);
    -- a backlog or blocked ticket keeps its status: the floor gets that stage when its model has none
    if not exists (select 1 from jsonb_array_elements(v_stages) s where s->>'category' = 'backlog' and not (s->>'is_completed')::boolean)
       and exists (select 1 from erp.task t where t.entity_id = e.id and t.engagement_id is not null and t.status = 'backlog') then
      v_stages := jsonb_build_array(jsonb_build_object('id', 'backlog', 'name', case when e.code = 'bumex_it' then 'Backlog' else 'En attente' end,
                                                       'category', 'backlog', 'is_default', false, 'is_completed', false)) || v_stages;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_stages) s where s->>'category' = 'blocked' and not (s->>'is_completed')::boolean)
       and exists (select 1 from erp.task t where t.entity_id = e.id and t.engagement_id is not null and t.status = 'blocked') then
      -- before the completed stage
      v_stages := (select jsonb_agg(s order by n) from jsonb_array_elements(v_stages) with ordinality x(s, n) where not (s->>'is_completed')::boolean)
                  || jsonb_build_array(jsonb_build_object('id', 'blocked', 'name', 'Bloqué', 'category', 'blocked', 'is_default', false, 'is_completed', false))
                  || (select jsonb_agg(s order by n) from jsonb_array_elements(v_stages) with ordinality x(s, n) where (s->>'is_completed')::boolean);
    end if;
    insert into work.floor_board (entity_id, stages, allow_backward, allow_skip_forward, allow_reopen)
    values (e.id, work.floor_stages(v_stages), true, true, true);
  end loop;
end $$;

-- 2. every ticket on its floor's stage: the same name and status, else the first of its status
with t as (
  select k.id, k.status, k.entity_id,
         -- its stage on its mission's old board (a ticket from before the boards: its status)
         (select s->>'name' from work.board b, jsonb_array_elements(b.stages) s
           where b.engagement_id = k.engagement_id and s->>'id' = coalesce(k.stage_id, k.status) limit 1) as old_name,
         k.stage_id
    from erp.task k
   where k.engagement_id is not null
), fs as (
  select f.entity_id, s, (s->>'is_completed')::boolean as completed, s->>'category' as category, (s->>'position')::int as pos
    from work.floor_board f, jsonb_array_elements(f.stages) s
), m as (
  select t.id, t.stage_id,
         coalesce(
           (select fs.s->>'id' from fs where fs.entity_id = t.entity_id and t.old_name is not null
               and pg_temp.fold(fs.s->>'name') = pg_temp.fold(t.old_name)
               and (case when fs.completed then 'done' else fs.category end) = (case when t.status = 'archived' then 'done' else t.status end)
             order by fs.pos limit 1),
           (select fs.s->>'id' from fs where fs.entity_id = t.entity_id and fs.completed and t.status in ('done', 'archived') order by fs.pos limit 1),
           (select fs.s->>'id' from fs where fs.entity_id = t.entity_id and not fs.completed and fs.category = t.status order by fs.pos limit 1),
           (select fs.s->>'id' from fs where fs.entity_id = t.entity_id and (fs.s->>'is_default')::boolean limit 1)) as stage
    from t
)
update erp.task k set stage_id = m.stage
  from m
 where k.id = m.id and m.stage is not null and k.stage_id is distinct from m.stage;

-- 3. a new floor starts with the standard board
create or replace function work.floor_board_for_entity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into work.floor_board (entity_id, stages, allow_backward, allow_skip_forward, allow_reopen)
  values (new.id, work.floor_stages(work.floor_model(new.code)), true, true, true)
  on conflict (entity_id) do nothing;
  return null;
end $$;
create trigger floor_board after insert on erp.entity for each row execute function work.floor_board_for_entity();

grant execute on function work.floor_model(text), work.floor_stages(jsonb) to erp_app;

comment on table work.board is 'A mission''s own board (0008). Since 0014 the boards are the floors'' (work.floor_board); kept as it was, no longer read.';
