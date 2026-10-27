-- =====================================================================
--  BUMEX ERP — migration 0012: tickets as Jira has them (asked on 2026-10-27)
--  Applies on top of 0001–0011.
--
--  - A ticket has a key per floor: the floor's prefix and its number (AUD-142). Existing tickets are numbered in the
--    order they were created; a ticket moved to another floor takes that floor's next number (its old key stays in
--    its history).
--  - Labels on a ticket; links between tickets (relates, blocks, duplicates, action item).
--  - Time entered on a ticket (erp.time_entry.task_id): its time spent, read by whoever reads the ticket.
--  - Every change of a ticket's fields is written to its history by the database (the stage, which the application
--    logs with the stage names and the reason, apart), and so are its links.
--  - The ticket's assignee and reporter may attach files to it.
--  Additive: nothing the running app reads or writes changes.
-- =====================================================================
set search_path to erp, public;

-- 1. Keys
alter table erp.entity add column if not exists ticket_prefix text;
alter table erp.entity add column if not exists ticket_seq integer not null default 0;
update erp.entity set ticket_prefix = case code
    when 'bumex_holding' then 'HOLD' when 'bumex_sa' then 'SA' when 'bumex_audit' then 'AUD' when 'bumex_advisory' then 'ADV'
    when 'bumex_mauritanie' then 'MAU' when 'bumex_avocat' then 'AVO' when 'bumex_it' then 'IT' when 'bumex_maroc' then 'MAR'
    when 'bumex_testing' then 'TEST'
    else upper(left(regexp_replace(code, '^bumex_', ''), 4)) end
  where ticket_prefix is null;
alter table erp.entity alter column ticket_prefix set not null;
alter table erp.entity add constraint entity_ticket_prefix_check check (ticket_prefix ~ '^[A-Z][A-Z0-9]{0,7}$');
create unique index if not exists entity_ticket_prefix_uq on erp.entity (ticket_prefix);

alter table erp.task add column if not exists number integer;
-- (numbered as they are: their update time and the audit trail stay as they were)
alter table erp.task disable trigger user;
update erp.task t set number = n.rn
  from (select id, row_number() over (partition by entity_id order by created_at, id) as rn from erp.task) n
 where n.id = t.id and t.number is null;
alter table erp.task enable trigger user;
update erp.entity e set ticket_seq = coalesce((select max(number) from erp.task t where t.entity_id = e.id), 0);
alter table erp.task alter column number set not null;
create unique index if not exists task_number_uq on erp.task (entity_id, number);

-- the floor's next number (the floor's row is locked: two tickets never take the same one); a new entity's prefix
create or replace function erp.task_number() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.entity_id is distinct from old.entity_id then
    update erp.entity set ticket_seq = ticket_seq + 1 where id = new.entity_id returning ticket_seq into new.number;
  elsif new.number is distinct from old.number then
    raise exception 'task_number_immutable';
  end if;
  return new;
end $$;
-- (after task_defaults, which sets the ticket's entity from its mission: triggers fire in name order)
create trigger task_number before insert or update of entity_id, engagement_id, number on erp.task
  for each row execute function erp.task_number();

-- (the code's first letters, then a number if another floor has them already)
create or replace function erp.entity_ticket_prefix() returns trigger
language plpgsql as $$
declare
  v_base text := coalesce(nullif(upper(left(regexp_replace(regexp_replace(new.code, '^bumex_', ''), '[^A-Za-z0-9]', '', 'g'), 4)), ''), 'E');
  v_n integer := 1;
begin
  if new.ticket_prefix is null then
    if v_base !~ '^[A-Z]' then v_base := 'E' || left(v_base, 3); end if;
    new.ticket_prefix := v_base;
    while exists (select 1 from erp.entity where ticket_prefix = new.ticket_prefix) loop
      v_n := v_n + 1;
      new.ticket_prefix := v_base || v_n;
    end loop;
  end if;
  return new;
end $$;
create trigger entity_ticket_prefix before insert on erp.entity for each row execute function erp.entity_ticket_prefix();

create or replace function work.task_key(p_task uuid) returns text
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select e.ticket_prefix || '-' || t.number from erp.task t join erp.entity e on e.id = t.entity_id where t.id = p_task $$;

-- 2. Labels
alter table erp.task add column if not exists labels text[] not null default '{}';
create or replace function erp.labels_ok(p_labels text[]) returns boolean
language sql immutable as $$
  select coalesce(array_length(p_labels, 1), 0) <= 10
     and not exists (select 1 from unnest(p_labels) l where l is null or l <> btrim(l) or length(l) not between 1 and 40) $$;
alter table erp.task add constraint task_labels_check check (erp.labels_ok(labels));
create index if not exists task_labels_idx on erp.task using gin (labels);

-- 3. Time on a ticket: the ticket must be of the entry's mission (and so of its floor)
alter table erp.time_entry add column if not exists task_id uuid references erp.task(id) on delete set null;
create index if not exists time_entry_task_idx on erp.time_entry (task_id) where task_id is not null;

create or replace function erp.time_entry_task_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.task_id is not null and not exists (select 1 from erp.task t where t.id = new.task_id and t.engagement_id = new.engagement_id) then
    raise exception 'time_entry_task_mismatch';
  end if;
  return new;
end $$;
create trigger time_entry_task_guard before insert or update of task_id, engagement_id on erp.time_entry
  for each row execute function erp.time_entry_task_guard();

-- a ticket's time spent, for whoever reads the ticket (the lines themselves stay their authors' and managers')
create or replace function work.task_logged_minutes(p_task uuid) returns integer
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when work.can_read_task(p_task)
              then coalesce((select sum(minutes) from erp.time_entry where task_id = p_task), 0)::int else 0 end $$;

-- a ticket's time lines (its work log), for whoever reads the ticket
create or replace function work.task_worklog(p_task uuid)
returns table (id uuid, user_id text, work_date date, minutes integer, note text, created_at timestamptz)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select e.id, e.user_id, e.work_date, e.minutes, e.description, e.created_at
    from erp.time_entry e
   where e.task_id = p_task and work.can_read_task(p_task)
   order by e.work_date desc, e.created_at desc $$;

-- 4. Links between tickets
create table if not exists work.task_link (
  id         uuid primary key default gen_random_uuid(),
  from_task  uuid not null references erp.task(id) on delete cascade,
  to_task    uuid not null references erp.task(id) on delete cascade,
  kind       text not null check (kind in ('relates', 'blocks', 'duplicates', 'action_item')),
  created_by text references work.person(id) on delete set null default erp.actor_id(),
  created_at timestamptz not null default now(),
  check (from_task <> to_task),
  unique (from_task, to_task, kind)
);
create index if not exists task_link_to_idx on work.task_link (to_task);
alter table work.task_link enable row level security;

create or replace function work.can_edit_task(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.task_is_test(p_task)) and (
         work.actor_class() = 'admin'
      or coalesce((select work.can_manage_project(t.engagement_id) or coalesce(t.assignee_id = erp.actor_id(), false)
                          or coalesce(t.reporter_id = erp.actor_id(), false)
                     from erp.task t where t.id = p_task), false)) $$;

create policy read on work.task_link for select using (work.inside() or (work.can_read_task(from_task) and work.can_read_task(to_task)));
create policy add on work.task_link for insert with check (work.inside() or (work.can_edit_task(from_task) and work.can_read_task(to_task)));
create policy remove on work.task_link for delete using (work.inside() or work.can_edit_task(from_task) or work.can_edit_task(to_task));

create or replace function work.task_link_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if work.task_is_test(new.from_task) <> work.task_is_test(new.to_task) then
    raise exception 'test_task_mismatch';
  end if;
  return new;
end $$;
create trigger task_link_guard before insert on work.task_link for each row execute function work.task_link_guard();

-- 5. The ticket's history, written by the database: one line per changed field (the stage and status apart: the
--    application logs them with the stage names and the reason, lib/tickets/service.ts)
create or replace function work.log_task(p_task uuid, p_action text, p_metadata jsonb) returns void
language sql security definer set search_path = pg_catalog, pg_temp as $$
  insert into work.activity (user_id, action, subject_type, subject_id, metadata, entity_code)
  values ((select id from work.person where id = erp.actor_id()), p_action, 'task', p_task::text, p_metadata,
          (select x.code from erp.task t join erp.entity x on x.id = t.entity_id where t.id = p_task)) $$;

create or replace function work.task_history() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_field text;
  v_from jsonb;
  v_to jsonb;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  foreach v_field in array array['title', 'notes', 'assignee_id', 'reporter_id', 'priority', 'type', 'estimated_hours', 'due_date', 'labels', 'engagement_id'] loop
    v_from := v_old -> v_field;
    v_to := v_new -> v_field;
    if v_from is distinct from v_to then
      perform work.log_task(new.id, 'Changed ' || v_field, jsonb_build_object(
        'kind', case v_field when 'assignee_id' then 'assignment_change' when 'priority' then 'priority_change'
                             when 'due_date' then 'due_date_change' else 'update' end,
        'field', v_field,
        -- a description's text stays on the ticket, not in its history
        'from', case when v_field = 'notes' then null else v_from end,
        'to', case when v_field = 'notes' then null else v_to end));
    end if;
  end loop;
  if new.entity_id is distinct from old.entity_id then
    perform work.log_task(new.id, 'Renumbered ticket', jsonb_build_object('kind', 'update', 'field', 'key',
      'from', (select ticket_prefix || '-' || old.number from erp.entity where id = old.entity_id),
      'to', (select ticket_prefix || '-' || new.number from erp.entity where id = new.entity_id)));
  end if;
  return null;
end $$;
create trigger task_history after update on erp.task for each row execute function work.task_history();

create or replace function work.task_link_history() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_row work.task_link := case when tg_op = 'DELETE' then old else new end;
begin
  perform work.log_task(v_row.from_task, case when tg_op = 'DELETE' then 'Removed link' else 'Added link' end,
    jsonb_build_object('kind', 'link', 'field', 'link', 'link', v_row.kind, 'direction', 'out', 'other', v_row.to_task,
                       'other_key', work.task_key(v_row.to_task), 'removed', tg_op = 'DELETE'));
  perform work.log_task(v_row.to_task, case when tg_op = 'DELETE' then 'Removed link' else 'Added link' end,
    jsonb_build_object('kind', 'link', 'field', 'link', 'link', v_row.kind, 'direction', 'in', 'other', v_row.from_task,
                       'other_key', work.task_key(v_row.from_task), 'removed', tg_op = 'DELETE'));
  return null;
end $$;
create trigger task_link_history after insert or delete on work.task_link for each row execute function work.task_link_history();

-- 6. The people working on a ticket attach files to it
create or replace function work.can_manage_document(p_type text, p_related uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select not work.hidden(work.related_is_test(p_type, p_related)) and case
    when work.actor_class() = 'admin' then true
    when p_type = 'archive' then work.actor_class() = 'manager'
    when p_type = 'project' then work.can_manage_project(p_related)
    when p_type = 'task' then work.can_edit_task(p_related)
    when p_type = 'client' then exists (select 1 from work.client c where c.id = p_related and c.account_manager_id = erp.actor_id())
    when p_type = 'contract' then work.can_manage_contract(p_related)
    when p_type = 'payment' then work.can_read_payment(p_related)
    else false
  end $$;

-- 7. Rights, as 0011 left them
grant select, insert, delete on work.task_link to erp_app;
grant select, insert, update, delete on work.task_link to work_reader;
grant execute on all functions in schema erp, work to work_reader;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.prosecdef and p.pronamespace in ('work'::regnamespace, 'erp'::regnamespace) loop
    execute format('alter function %s owner to work_reader', f);
  end loop;
end $$;
grant execute on all functions in schema work to erp_app;
revoke execute on all functions in schema work from public;
revoke execute on function erp.task_number(), erp.time_entry_task_guard() from public, erp_app;
revoke execute on function work.task_link_guard(), work.task_history(), work.task_link_history(), work.log_task(uuid, text, jsonb) from erp_app;
