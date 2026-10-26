-- =====================================================================
--  BUMEX ERP — migration 0008: the work data in PostgreSQL (BUMEX One's Firestore data, moved)
--
--  BUMEX One's collections come home, next to the books:
--  - what the ERP already had is extended: a project IS an erp.engagement (description, owner, priority, kind,
--    client), a ticket IS an erp.task (reporter, type, board column, the statuses of the boards), a timesheet line IS
--    an erp.time_entry (minutes, mission), a project member IS an erp.engagement_staff row;
--  - the rest lives in the schema `work`: people, clients (the group's relationship side; erp.customer stays the
--    accounting side of each entity), contracts, milestones, boards, sub-tasks, documents, comments, notes,
--    notifications and their e-mails, activity, timesheet weeks, the old finance records (read only);
--  - BUMEX One's access rules (lib/firebase/policies.ts, ported from its Postgres policies) become row-level
--    security again, on the person's ERP session (erp.open_session): their Vanguard role decides, as
--    lib/erp/roles.ts maps it (admin, partner and finance lead act as administrators; managers; staff who see the
--    reports only as shareholders; everyone else as employees). The system session sees and does everything.
--
--  Additive only: the app running before this migration keeps working on it (nothing it reads or writes changes).
--  The data is copied in by scripts/work-copy.mjs, once, in a maintenance window.
-- =====================================================================
set search_path to erp, public;

-- 1. The schema, open to the application role like `erp` (0004)
create schema if not exists work;
grant usage on schema work to erp_app;
alter default privileges in schema work grant select, insert, update, delete on tables to erp_app;
alter default privileges in schema work grant usage, select on sequences to erp_app;
alter default privileges in schema work grant execute on functions to erp_app;

-- 2. Inside a rule. The rules read other tables (a ticket's project, its sub-tasks, …) whose own rules would read
--    back: a rule's helper (and a trigger writing what the person may not write themselves: an e-mail to send, a
--    week's history) runs as the role work_reader (security definer), which every rule lets through. No login has
--    it; the application role never becomes it. The system session (the server's own work, the data's copy) passes
--    every rule too, as it sees every entity.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'work_reader') then
    create role work_reader nologin nobypassrls;
  end if;
end $$;
grant work_reader to current_user;
-- (owning functions in a schema needs CREATE on it)
grant usage, create on schema erp, work to work_reader;

create or replace function work.inside() returns boolean
language sql stable as $$ select current_user = 'work_reader' or erp.actor_role() = 'system' $$;

-- (0005: the application role without a session is no one; so is a helper it calls, which runs as work_reader: a
-- helper reached without a session must not read as the system)
create or replace function erp.actor_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('erp.actor_role', true), ''),
                  case when current_user in ('erp_app', 'work_reader') then 'none' else 'system' end)
$$;

-- (read here without work.inside(): the ERP's own functions need no right on the schema `work`)
create or replace function erp.can_see_entity(p_entity uuid) returns boolean
language plpgsql stable as $$
declare v_ids text := coalesce(nullif(current_setting('erp.entity_ids', true), ''), '');
begin
  if current_user = 'work_reader' or erp.actor_role() = 'system' or v_ids = '*' then
    return true;
  end if;
  return p_entity::text = any (string_to_array(v_ids, ','));
end $$;

-- an entity's code is unique in the group (one group): people and access rows name their entity by it
create unique index if not exists entity_code_uq on erp.entity (code);

-- 3. People: one row per person who signs in (Firebase Auth's uid). Their role is Vanguard's (erp.user_access).
create table work.person (
  id                    text primary key check (length(trim(id)) > 0),
  email                 text not null check (position('@' in email) > 1),
  full_name             text not null check (length(trim(full_name)) > 0),
  entity_code           text references erp.entity(code),        -- their home entity
  is_super_admin        boolean not null default false,
  avatar_url            text,                                      -- a data: URL (the profile page) or an address
  job_title             text,
  department            text,
  phone                 text,
  skills                text[] not null default '{}',
  availability_status   text not null default 'available' check (availability_status in ('available','busy','overloaded','away','inactive')),
  weekly_capacity_hours integer not null default 40 check (weekly_capacity_hours between 0 and 168),
  email_notifications   boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index person_email_uq on work.person (lower(email));

-- 4. Clients: the group's relationship side (status, contacts, account manager); each entity that bills one has
--    its accounting side, an erp.customer, linked by customer.client_id. Name, e-mail and tax id follow whichever
--    side was edited (section 15).
create table work.client (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  legal_name         text,
  industry           text,
  type               text not null default 'company' check (type in ('company','public_institution','ngo','individual','other')),
  contact_email      text check (contact_email is null or position('@' in contact_email) > 0),
  contact_phone      text,
  address            text,
  country            text,
  city               text,
  website            text check (website is null or website ~* '^https?://'),
  tax_id             text,
  notes              text,
  status             text not null default 'prospect' check (status in ('prospect','active','inactive','suspended','archived')),
  prospect_stage     text check (prospect_stage in ('initial_contact','qualification','negotiation','proposal_sent','pending_signature')),
  next_follow_up_at  date,
  account_manager_id text references work.person(id) on delete set null,
  entity_code        text references erp.entity(code),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (status = 'prospect' or (prospect_stage is null and next_follow_up_at is null))
);
create unique index client_name_uq on work.client (lower(name));

alter table erp.customer add column if not exists client_id uuid references work.client(id) on delete set null;
create unique index if not exists customer_client_uq on erp.customer (entity_id, client_id) where client_id is not null;

-- 5. Missions: BUMEX One's projects, every kind, are the ERP's engagements
alter table erp.engagement
  add column if not exists description     text,
  add column if not exists owner_id        text references work.person(id) on delete set null,
  add column if not exists priority        text not null default 'medium' check (priority in ('low','medium','high','critical')),
  add column if not exists project_kind    text check (project_kind in ('client_mission','institutional_partnership','internal_product','internal_tool')),
  add column if not exists manual_progress smallint check (manual_progress between 0 and 100),
  add column if not exists client_id       uuid references work.client(id),
  add column if not exists updated_at      timestamptz not null default now();
create index if not exists engagement_client_idx on erp.engagement (client_id);
create index if not exists engagement_owner_idx on erp.engagement (owner_id);

-- the members (BUMEX One's project_members): a person's id, their role on the mission
alter table erp.engagement_staff alter column user_id type text using user_id::text;
alter table erp.engagement_staff add constraint engagement_staff_person_fk foreign key (user_id) references work.person(id) on delete cascade;
create index if not exists engagement_staff_user_idx on erp.engagement_staff (user_id);

create table work.milestone (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references erp.engagement(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  description   text,
  status        text not null default 'planned' check (status in ('planned','in_progress','completed','delayed','cancelled')),
  due_date      date not null,
  completed_at  timestamptz,
  owner_id      text references work.person(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on work.milestone (engagement_id, due_date);

-- a mission's board: its columns (each of a category: backlog, todo, in_progress, review, blocked; one completes)
-- and the moves allowed between them
create table work.board (
  engagement_id              uuid primary key references erp.engagement(id) on delete cascade,
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

-- 6. Tickets are the ERP's tasks, with what the boards keep of them. The engine's three statuses and priorities stay
--    its reading of them (lib/erp/vanguard/load.ts).
-- (the done/completed check and the open tasks' index compare the status: rebuilt on the text column)
alter table erp.task drop constraint task_check;
drop index erp.task_open_idx;
alter table erp.task alter column status drop default;
alter table erp.task alter column status type text using status::text;
alter table erp.task alter column status set default 'todo';
alter table erp.task add constraint task_status_check check (status in ('backlog','todo','in_progress','review','blocked','done','archived'));
alter table erp.task add constraint task_check check ((status = 'done') = (completed_at is not null));
create index task_open_idx on erp.task (entity_id, due_date) where status <> 'done';
alter table erp.task alter column module set default 'missions';
alter table erp.task alter column priority drop default;
alter table erp.task alter column priority type text using priority::text;
alter table erp.task alter column priority set default 'normal';
alter table erp.task add constraint task_priority_check check (priority in ('low','normal','medium','high','urgent'));
alter table erp.task alter column created_at drop default;
alter table erp.task alter column created_at type timestamptz using created_at::timestamptz;
alter table erp.task alter column created_at set default now();
alter table erp.task alter column due_date drop not null;
alter table erp.task alter column assignee drop not null;
alter table erp.task
  add column if not exists assignee_id      text references work.person(id) on delete set null,
  add column if not exists reporter_id      text references work.person(id) on delete set null,
  add column if not exists type             text not null default 'task' check (type in ('task','bug','feature','support','client_request','internal')),
  add column if not exists stage_id         text,
  add column if not exists estimated_hours  numeric(8,2) check (estimated_hours >= 0),
  add column if not exists actual_hours     numeric(8,2) check (actual_hours >= 0),
  add column if not exists github_issue_url text,
  add column if not exists updated_at       timestamptz not null default now();
create index if not exists task_engagement_idx on erp.task (engagement_id);
create index if not exists task_assignee_idx on erp.task (assignee_id);
create index if not exists task_reporter_idx on erp.task (reporter_id);

create table work.subtask (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references erp.task(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 200),
  is_done      boolean not null default false,
  assignee_id  text references work.person(id) on delete set null,
  due_date     date,
  position     integer not null default 0,
  completed_at timestamptz,
  created_by   text references work.person(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on work.subtask (task_id, position);
create index on work.subtask (assignee_id);

-- 7. Contracts and documents
create table work.contract (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references work.client(id),
  engagement_id       uuid references erp.engagement(id) on delete set null,
  title               text not null check (length(trim(title)) > 0),
  contract_number     text,
  status              text not null default 'draft' check (status in ('draft','under_review','signed','active','expired','cancelled','archived')),
  contract_type       text not null default 'development' check (contract_type in ('development','maintenance','consulting','support','hosting','audit','other')),
  start_date          date,
  end_date            date,
  signed_date         date,
  renewal_date        date,
  amount              numeric(14,2) check (amount >= 0),
  currency            text not null default 'USD' check (length(trim(currency)) > 0),
  payment_terms       text,
  notes               text,
  responsible_user_id text references work.person(id) on delete set null,
  entity_code         text references erp.entity(code),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index contract_client_title_uq on work.contract (client_id, lower(title));
create index on work.contract (engagement_id);

-- a document's file stays in Firebase Storage (documents/<file_url>)
create table work.document (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  description   text,
  document_type text not null default 'other' check (document_type in ('contract','invoice','receipt','bank_transfer','proposal','report','meeting_note','technical_document','legal_document','other')),
  related_type  text not null default 'archive' check (related_type in ('client','project','task','contract','invoice','payment','transfer','archive')),
  related_id    uuid,
  file_url      text not null,
  file_name     text not null,
  file_size     bigint not null default 0,
  mime_type     text,
  uploaded_by   text not null references work.person(id),
  visibility    text not null default 'internal' check (visibility in ('internal','management','shareholders','restricted')),
  is_archived   boolean not null default false,
  entity_code   text references erp.entity(code),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((related_type = 'archive') = (related_id is null))
);
create index on work.document (related_type, related_id);

-- 8. Conversation: comments, notes, notifications (and their e-mails), the activity
create table work.comment (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('project','ticket','client','contract','document','invoice','payment','transfer')),
  subject_id   uuid not null,
  author_id    text not null references work.person(id),
  body         text not null check (length(trim(body)) > 0),
  is_internal  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on work.comment (subject_type, subject_id, created_at);

-- the finance and shareholder notes name fixed subjects (lib/notes/constants.ts)
create table work.note (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('project','client','contract','finance','shareholder')),
  subject_id   uuid not null,
  author_id    text not null references work.person(id),
  title        text not null check (length(trim(title)) > 0),
  body         text not null check (length(trim(body)) > 0),
  visibility   text not null default 'team' check (visibility in ('private','team','management','shareholders')),
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index on work.note (subject_type, subject_id);

-- a notification's subject is a record, or a person for the timesheet and system ones
create table work.notification (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references work.person(id) on delete cascade,
  type         text not null check (type in ('mention','assignment','status_change','comment','deadline','overdue','payment_due','contract_due','system')),
  title        text not null check (length(trim(title)) > 0),
  body         text not null check (length(trim(body)) > 0),
  subject_type text not null default 'system',
  subject_id   text,
  is_read      boolean not null default false,
  skip_email   boolean not null default false,   -- in the app only
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index on work.notification (user_id, created_at desc);

create table work.notification_email (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references work.notification(id) on delete cascade,
  user_id         text not null,
  recipient_email text not null,
  subject         text not null,
  body            text not null,
  subject_type    text,
  subject_id      text,
  status          text not null default 'pending' check (status in ('pending','processing','sent','failed','expired')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on work.notification_email (status, next_attempt_at);

-- the work's history as people read it (who did what to which record); the ERP's own is erp.audit_log
create table work.activity (
  id           uuid primary key default gen_random_uuid(),
  user_id      text references work.person(id) on delete set null,
  action       text not null check (length(trim(action)) > 0),
  subject_type text not null,
  subject_id   text,
  metadata     jsonb not null default '{}',
  entity_code  text,
  created_at   timestamptz not null default now()
);
create index on work.activity (subject_type, subject_id, created_at desc);
create index on work.activity (user_id, created_at desc);
create index on work.activity (created_at desc);

-- 9. Time. A timesheet line is an erp.time_entry: minutes on a mission, a free mission label, a note
alter table erp.time_entry alter column user_id type text using user_id::text;
alter table erp.time_entry add constraint time_entry_person_fk foreign key (user_id) references work.person(id) on delete cascade;
alter table erp.time_entry
  add column if not exists minutes    integer,
  add column if not exists mission    text not null default '' check (length(mission) <= 200),
  add column if not exists updated_at timestamptz not null default now();
update erp.time_entry set minutes = round(hours * 60) where minutes is null;
alter table erp.time_entry alter column minutes set not null;
alter table erp.time_entry add constraint time_entry_minutes_check check (minutes between 1 and 1440);
alter table erp.time_entry drop column hours;
alter table erp.time_entry add column hours numeric(8,4) generated always as (round(minutes / 60.0, 4)) stored;
alter table erp.time_entry add constraint time_entry_date_check check (work_date >= date '2000-01-01');
alter table erp.time_entry add constraint time_entry_note_check check (description is null or length(description) <= 1000);
create index if not exists time_entry_user_date_idx on erp.time_entry (user_id, work_date);

create table work.timesheet_week (
  user_id      text not null references work.person(id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  entity_id    uuid not null references erp.entity(id),
  status       text not null default 'submitted' check (status in ('submitted','approved','returned')),
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  text references work.person(id) on delete set null,
  review_note  text,
  primary key (user_id, week_start)
);
create index on work.timesheet_week (entity_id, week_start, status);

create table work.timesheet_week_event (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references work.person(id) on delete cascade,
  week_start date not null,
  entity_id  uuid not null references erp.entity(id),
  status     text not null check (status in ('submitted','approved','returned')),
  actor_id   text references work.person(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);
create index on work.timesheet_week_event (user_id, week_start, created_at desc);

-- a reminder sent by hand: one per person, week and day
create table work.timesheet_reminder (
  user_id    text not null references work.person(id) on delete cascade,
  week_start date not null,
  sent_date  date not null default ((now() at time zone 'UTC')::date),
  entity_id  uuid references erp.entity(id),
  sent_by    text not null references work.person(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, sent_date)
);

-- the automatic Monday reminder, once per person and week
create table work.timesheet_auto_reminder (
  user_id    text not null references work.person(id) on delete cascade,
  week_start date not null,
  entity_id  uuid references erp.entity(id),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table work.mission_favorite (
  user_id       text not null references work.person(id) on delete cascade,
  engagement_id uuid not null references erp.engagement(id) on delete cascade,
  mission       text not null check (length(trim(mission)) between 1 and 200),
  entity_id     uuid not null references erp.entity(id),
  created_at    timestamptz not null default now(),
  primary key (user_id, engagement_id, mission)
);

-- 10. The old finance records (BUMEX One's invoices, payments, receipts, transfers, bank statements): an archive,
--     read only (the books are the ERP's). Their links are kept as they were, without keys: an archive does not
--     change when what it points to does.
create table work.finance_invoice (
  id             uuid primary key,
  invoice_number text not null unique,
  client_id      uuid,
  engagement_id  uuid,
  contract_id    uuid,
  issue_date     date,
  due_date       date,
  amount_ht      numeric(14,2) not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  amount_ttc     numeric(14,2) not null default 0,
  currency       text not null default 'USD',
  status         text not null,
  notes          text,
  approval_status text not null default 'pending',
  approved_by    text,
  approved_at    timestamptz,
  created_by     text,
  entity_code    text,
  created_at     timestamptz not null,
  updated_at     timestamptz not null
);
create table work.finance_payment (
  id            uuid primary key,
  invoice_id    uuid,
  client_id     uuid,
  engagement_id uuid,
  contract_id   uuid,
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'USD',
  payment_date  date,
  due_date      date,
  method        text,
  status        text not null,
  reference     text,
  notes         text,
  created_by    text,
  entity_code   text,
  created_at    timestamptz not null,
  updated_at    timestamptz not null
);
create table work.finance_receipt (
  id             uuid primary key,
  receipt_number text not null,
  payment_id     uuid,
  issue_date     date,
  amount         numeric(14,2) not null default 0,
  document_id    uuid,
  notes          text,
  created_by     text,
  entity_code    text,
  created_at     timestamptz not null,
  updated_at     timestamptz not null
);
create table work.finance_transfer (
  id                  uuid primary key,
  transfer_reference  text not null,
  beneficiary_name    text not null,
  beneficiary_bank    text,
  beneficiary_account text,
  amount              numeric(14,2) not null default 0,
  currency            text not null default 'USD',
  transfer_date       date,
  status              text not null,
  category            text,
  engagement_id       uuid,
  client_id           uuid,
  notes               text,
  created_by          text,
  entity_code         text,
  created_at          timestamptz not null,
  updated_at          timestamptz not null
);
create table work.finance_bank_statement (
  id              uuid primary key,
  account_label   text,
  statement_label text,
  statement_date  date,
  currency        text,
  raw_content     text,
  notes           text,
  created_by      text,
  entity_code     text,
  created_at      timestamptz not null,
  updated_at      timestamptz not null
);
create table work.finance_bank_statement_line (
  id                  uuid primary key,
  statement_id        uuid,
  line_date           date,
  description         text,
  reference           text,
  credit_amount       numeric(14,2) not null default 0,
  debit_amount        numeric(14,2) not null default 0,
  currency            text,
  match_status        text,
  matched_entity_type text,
  matched_entity_id   uuid,
  match_confidence    numeric,
  match_reason        text,
  entity_code         text,
  created_at          timestamptz not null
);
revoke insert, update, delete, truncate on work.finance_invoice, work.finance_payment, work.finance_receipt, work.finance_transfer,
  work.finance_bank_statement, work.finance_bank_statement_line from erp_app;

-- 11. Who is acting, as BUMEX One's rules see them
create or replace function work.actor_class() returns text
language sql stable as $$
  select case
    when erp.actor_role() in ('system', 'admin', 'partner', 'raf') then 'admin'
    when erp.actor_role() = 'manager' then 'manager'
    when erp.actor_role() = 'staff'
         and (select u.modules from erp.user_access u where u.user_id = erp.actor_id()) = array['reports']::text[] then 'shareholder'
    when erp.actor_role() in ('staff', 'accountant', 'intern') then 'employee'
    else 'none'
  end $$;

create or replace function work.me() returns text language sql stable as $$ select erp.actor_id() $$;

create or replace function work.is_super_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select p.is_super_admin from work.person p where p.id = erp.actor_id()), false) $$;

-- the person works in this entity (their home one), or is the super administrator
create or replace function work.works_in_entity(p_entity uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.is_super_admin() or exists (
    select 1 from work.person p join erp.entity e on e.code = p.entity_code where p.id = erp.actor_id() and e.id = p_entity) $$;

-- a manager whose home entity it is
create or replace function work.is_entity_manager(p_entity uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'manager' and exists (
    select 1 from work.person p join erp.entity e on e.code = p.entity_code where p.id = erp.actor_id() and e.id = p_entity) $$;

-- 12. BUMEX One's rules (lib/firebase/policies.ts, private.can_* of its Postgres)
create or replace function work.can_manage_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from erp.engagement e
       where e.id = p_engagement
         and (e.owner_id = erp.actor_id()
              or exists (select 1 from erp.engagement_staff s where s.engagement_id = e.id and s.user_id = erp.actor_id())))
    else false
  end $$;

-- the ticket's assignee, or the owner of one of its sub-tasks
create or replace function work.works_on(p_task uuid, p_assignee text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_assignee = erp.actor_id(), false)
      or exists (select 1 from work.subtask s where s.task_id = p_task and s.assignee_id = erp.actor_id()) $$;

create or replace function work.can_read_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' or p_engagement is null then false
    else work.can_manage_project(p_engagement)
      or exists (select 1 from erp.task t where t.engagement_id = p_engagement and work.works_on(t.id, t.assignee_id))
  end $$;

-- a ticket's reporter signs it off, so they may read it (not its project)
create or replace function work.can_read_task_row(p_task uuid, p_engagement uuid, p_assignee text, p_reporter text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when work.actor_class() in ('admin', 'shareholder') then true
    when work.actor_class() = 'none' then false
    else work.works_on(p_task, p_assignee) or coalesce(p_reporter = erp.actor_id(), false) or work.can_manage_project(p_engagement)
  end $$;

create or replace function work.can_read_task(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() in ('admin', 'shareholder')
      or coalesce((select work.can_read_task_row(t.id, t.engagement_id, t.assignee_id, t.reporter_id) from erp.task t where t.id = p_task), false) $$;

-- who edits a ticket's sub-tasks: administrators, the project's managers, the ticket's assignee
create or replace function work.can_edit_subtasks_of(p_task uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_manage_project(t.engagement_id) or coalesce(t.assignee_id = erp.actor_id(), false)
                     from erp.task t where t.id = p_task), false) $$;

create or replace function work.can_manage_milestones(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (select 1 from erp.engagement e where e.id = p_engagement and e.owner_id = erp.actor_id())
    else false
  end $$;

create or replace function work.can_read_milestone(p_milestone uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select work.can_read_project(m.engagement_id) from work.milestone m where m.id = p_milestone), false) $$;

create or replace function work.can_read_client(p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'shareholder' then true
    when 'manager' then p_client is not null and (
         exists (select 1 from work.client c where c.id = p_client and c.account_manager_id = erp.actor_id())
      or exists (select 1 from erp.engagement e
                  where e.client_id = p_client
                    and (e.owner_id = erp.actor_id()
                         or exists (select 1 from erp.engagement_staff s where s.engagement_id = e.id and s.user_id = erp.actor_id()))))
    when 'employee' then p_client is not null and exists (
      select 1 from erp.task t join erp.engagement e on e.id = t.engagement_id
       where e.client_id = p_client and work.works_on(t.id, t.assignee_id))
    else false
  end $$;

create or replace function work.can_manage_client_finance(p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then exists (select 1 from work.client c where c.id = p_client and c.account_manager_id = erp.actor_id())
    else false
  end $$;

create or replace function work.can_read_contract_row(p_client uuid, p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.can_read_client(p_client) or (p_engagement is not null and work.can_read_project(p_engagement)) $$;

create or replace function work.can_read_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select work.can_read_contract_row(c.client_id, c.engagement_id) from work.contract c where c.id = p_contract), false) $$;

-- a contract's managers: administrators, its client's account manager, the managers of its mission (old or new row)
create or replace function work.can_manage_contract_row(p_client uuid, p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then work.can_manage_client_finance(p_client) or (p_engagement is not null and work.can_manage_project(p_engagement))
    else false
  end $$;

create or replace function work.can_manage_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_manage_contract_row(c.client_id, c.engagement_id) from work.contract c where c.id = p_contract), false) $$;

-- the old finance records (read only)
create or replace function work.can_read_invoice_row(p_client uuid, p_engagement uuid, p_contract uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then work.can_manage_client_finance(p_client)
                     or (p_engagement is not null and work.can_manage_project(p_engagement))
                     or (p_contract is not null and work.can_manage_contract(p_contract))
    else false
  end $$;

create or replace function work.can_read_invoice(p_invoice uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_read_invoice_row(i.client_id, i.engagement_id, i.contract_id) from work.finance_invoice i where i.id = p_invoice), false) $$;

create or replace function work.can_read_payment_row(p_client uuid, p_engagement uuid, p_contract uuid, p_invoice uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then work.can_manage_client_finance(p_client)
                     or (p_engagement is not null and work.can_manage_project(p_engagement))
                     or (p_contract is not null and work.can_manage_contract(p_contract))
                     or (p_invoice is not null and work.can_read_invoice(p_invoice))
    else false
  end $$;

create or replace function work.can_read_payment(p_payment uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_read_payment_row(p.client_id, p.engagement_id, p.contract_id, p.invoice_id) from work.finance_payment p where p.id = p_payment), false) $$;

create or replace function work.can_read_transfer_row(p_engagement uuid, p_client uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then (p_engagement is not null and work.can_manage_project(p_engagement))
                     or (p_client is not null and work.can_manage_client_finance(p_client))
    else false
  end $$;

create or replace function work.can_read_transfer(p_transfer uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_read_transfer_row(t.engagement_id, t.client_id) from work.finance_transfer t where t.id = p_transfer), false) $$;

create or replace function work.can_read_receipt(p_receipt uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.can_read_payment(r.payment_id) from work.finance_receipt r where r.id = p_receipt), false) $$;

-- documents: who manages the files of a record, who reads a document by its visibility
create or replace function work.can_manage_document(p_type text, p_related uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when work.actor_class() = 'admin' then true
    when p_type = 'archive' then work.actor_class() = 'manager'
    when p_type = 'project' then work.can_manage_project(p_related)
    when p_type = 'task' then coalesce((select work.can_manage_project(t.engagement_id) from erp.task t where t.id = p_related), false)
    when p_type = 'client' then exists (select 1 from work.client c where c.id = p_related and c.account_manager_id = erp.actor_id())
    when p_type = 'contract' then work.can_manage_contract(p_related)
    when p_type = 'payment' then work.can_read_payment(p_related)
    else false
  end $$;

create or replace function work.can_read_related(p_type text, p_related uuid, p_allowed text[]) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select p_type = any (p_allowed) and case p_type
    when 'project' then work.can_read_project(p_related)
    when 'task' then work.can_read_task(p_related)
    when 'client' then work.can_read_client(p_related)
    when 'contract' then work.can_read_contract(p_related)
    when 'invoice' then work.can_read_invoice(p_related)
    when 'payment' then work.can_read_payment(p_related)
    when 'transfer' then work.can_read_transfer(p_related)
    else false
  end $$;

create or replace function work.can_read_document_row(p_type text, p_related uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when work.actor_class() = 'admin' then true
    when p_type = 'archive' then
      case when p_visibility = 'shareholders' then work.actor_class() in ('shareholder', 'manager') else work.actor_class() = 'manager' end
    when p_visibility = 'restricted' then work.can_manage_document(p_type, p_related)
    when p_visibility = 'management' then work.actor_class() = 'manager'
                                          and work.can_read_related(p_type, p_related, array['project','task','client','contract','payment'])
    when p_visibility = 'shareholders' then work.actor_class() = 'shareholder'
                                            and work.can_read_related(p_type, p_related, array['project','client','contract','payment'])
    when work.actor_class() = 'manager' then work.can_read_related(p_type, p_related, array['project','task','client','contract','payment'])
    when work.actor_class() = 'employee' then work.can_read_related(p_type, p_related, array['project','task','client','contract'])
    else false
  end $$;

create or replace function work.can_read_document(p_document uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce((select work.can_read_document_row(d.related_type, d.related_id, d.visibility) from work.document d where d.id = p_document), false) $$;

-- comments, notifications, notes, activity: their subject decides
create or replace function work.can_read_subject(p_type text, p_subject uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case p_type
    when 'project' then work.can_read_project(p_subject)
    when 'ticket' then work.can_read_task(p_subject)
    when 'client' then work.can_read_client(p_subject)
    when 'contract' then work.can_read_contract(p_subject)
    when 'document' then work.can_read_document(p_subject)
    when 'invoice' then work.can_read_invoice(p_subject)
    when 'payment' then work.can_read_payment(p_subject)
    when 'transfer' then work.can_read_transfer(p_subject)
    else false
  end $$;

create or replace function work.can_comment_on(p_type text, p_subject uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then work.can_read_subject(p_type, p_subject)
    when 'manager' then work.can_read_subject(p_type, p_subject)
    when 'employee' then (p_type = 'project' and work.can_read_project(p_subject)) or (p_type = 'ticket' and work.can_read_task(p_subject))
    else false
  end $$;

-- a subject id that is not a record's (a person's, for the timesheet and system notifications) reads as none
create or replace function work.uuid_or_null(p_text text) returns uuid
language plpgsql immutable as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end $$;

create or replace function work.can_read_notification_subject(p_type text, p_subject text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when p_type = 'milestone' then work.can_read_milestone(work.uuid_or_null(p_subject))
    when p_type in ('project','ticket','client','contract','document','invoice','payment','transfer')
      then work.can_read_subject(p_type, work.uuid_or_null(p_subject))
    else true
  end $$;

create or replace function work.can_read_note_subject(p_type text, p_subject uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case p_type
    when 'project' then work.can_read_project(p_subject)
    when 'client' then work.can_read_client(p_subject)
    when 'contract' then work.can_read_contract(p_subject)
    when 'finance' then work.actor_class() in ('admin', 'manager', 'shareholder')
    when 'shareholder' then work.actor_class() in ('admin', 'manager', 'shareholder')
    else false
  end $$;

create or replace function work.can_manage_note_subject(p_type text, p_subject uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then work.can_read_note_subject(p_type, p_subject)
    when 'employee' then p_type in ('project', 'client', 'contract') and work.can_read_note_subject(p_type, p_subject)
    else false
  end $$;

create or replace function work.can_read_note_visibility(p_visibility text, p_author text) returns boolean
language sql stable as $$
  select case
    when work.actor_class() = 'admin' then true
    when p_visibility = 'private' then p_author = erp.actor_id()
    when p_visibility = 'team' then work.actor_class() in ('manager', 'employee')
    when p_visibility = 'management' then work.actor_class() = 'manager'
    when p_visibility = 'shareholders' then work.actor_class() in ('manager', 'shareholder')
    else false
  end $$;

create or replace function work.can_use_note_visibility(p_visibility text) returns boolean
language sql stable as $$
  select case work.actor_class()
    when 'admin' then true
    when 'manager' then p_visibility in ('private', 'team', 'management', 'shareholders')
    when 'employee' then p_visibility in ('private', 'team')
    else false
  end $$;

create or replace function work.can_read_activity(p_user text, p_type text, p_subject text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when work.actor_class() = 'admin' or p_user = erp.actor_id() then true
    when work.actor_class() <> 'manager' then false
    when p_type = 'project' then work.can_read_project(work.uuid_or_null(p_subject))
    when p_type = 'milestone' then work.can_read_milestone(work.uuid_or_null(p_subject))
    when p_type = 'task' then work.can_read_task(work.uuid_or_null(p_subject))
    when p_type = 'client' then work.can_read_client(work.uuid_or_null(p_subject))
    when p_type = 'contract' then work.can_read_contract(work.uuid_or_null(p_subject))
    when p_type = 'invoice' then work.can_read_invoice(work.uuid_or_null(p_subject))
    when p_type = 'receipt' then work.can_read_receipt(work.uuid_or_null(p_subject))
    when p_type = 'document' then work.can_read_document(work.uuid_or_null(p_subject))
    when p_type = 'payment' then work.can_read_payment(work.uuid_or_null(p_subject))
    when p_type = 'transfer' then work.can_read_transfer(work.uuid_or_null(p_subject))
    when p_type = 'team' then true
    else false
  end $$;

-- the missions a person enters time on: one they see and own, are a member of or work on (or any, for administrators)
create or replace function work.is_timesheet_project(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.can_read_project(p_engagement) and (
       work.actor_class() = 'admin'
    or work.is_super_admin()
    or exists (select 1 from erp.engagement e where e.id = p_engagement and e.owner_id = erp.actor_id())
    or exists (select 1 from erp.engagement_staff s where s.engagement_id = p_engagement and s.user_id = erp.actor_id())
    or exists (select 1 from erp.task t where t.engagement_id = p_engagement and work.works_on(t.id, t.assignee_id))) $$;

-- an administrator, or a manager of the mission's entity (BUMEX One's staffing managers)
create or replace function work.is_staffing_manager(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() = 'admin'
      or coalesce((select work.is_entity_manager(e.entity_id) from erp.engagement e where e.id = p_engagement), false) $$;

-- 13. Row-level security
do $$
declare t text;
begin
  foreach t in array array['person', 'client', 'milestone', 'board', 'subtask', 'contract', 'document', 'comment', 'note', 'notification',
                           'notification_email', 'activity', 'timesheet_week', 'timesheet_week_event', 'timesheet_reminder',
                           'timesheet_auto_reminder', 'mission_favorite', 'finance_invoice', 'finance_payment', 'finance_receipt',
                           'finance_transfer', 'finance_bank_statement', 'finance_bank_statement_line'] loop
    execute format('alter table work.%I enable row level security', t);
    execute format('alter table work.%I force row level security', t);
  end loop;
end $$;

-- people: everyone signed in reads them; a person edits their own, administrators and managers anyone's
create policy read on work.person for select using (work.inside() or work.actor_class() <> 'none' or id = erp.actor_id());
-- (a person is created at their first sign-in and never deleted: both are the server's, with the super-administrator flag)
create policy add on work.person for insert with check (work.inside() or (work.actor_class() = 'admin' and not is_super_admin));
create policy edit on work.person for update using (work.inside() or id = erp.actor_id() or work.actor_class() in ('admin', 'manager'));
create policy remove on work.person for delete using (erp.actor_role() = 'system');

create policy read on work.client for select using (work.inside() or work.can_read_client(id));
create policy manage on work.client for all
  using (work.inside() or work.actor_class() = 'admin' or (work.actor_class() = 'manager' and account_manager_id = erp.actor_id()));

-- missions: everyone on the entity's floor sees its missions (the ERP's rule), their members and workers too
drop policy if exists by_entity on erp.engagement;
create policy read on erp.engagement for select using (work.inside() or erp.can_see_entity(entity_id) or work.can_read_project(id));
create policy add on erp.engagement for insert
  with check (work.inside() or work.actor_class() = 'admin'
              or (work.actor_class() = 'manager' and owner_id = erp.actor_id() and erp.can_see_entity(entity_id)));
create policy edit on erp.engagement for update using (work.inside() or work.can_manage_project(id));
create policy remove on erp.engagement for delete using (work.inside() or work.can_manage_project(id));

drop policy if exists by_engagement on erp.engagement_staff;
create policy read on erp.engagement_staff for select
  using (work.inside() or exists (select 1 from erp.engagement e where e.id = engagement_staff.engagement_id));
create policy manage on erp.engagement_staff for all
  using (work.inside() or work.can_manage_project(engagement_id) or work.is_staffing_manager(engagement_id));

create policy read on work.milestone for select using (work.inside() or work.can_read_project(engagement_id));
create policy manage on work.milestone for all using (work.inside() or work.can_manage_milestones(engagement_id));

create policy read on work.board for select using (work.inside() or work.can_read_project(engagement_id));
create policy manage on work.board for all using (work.inside() or work.can_manage_project(engagement_id));

-- tickets: the reporter only moves a ticket's column (the app's rule); administrators and the mission's managers do anything
drop policy if exists by_entity on erp.task;
create policy read on erp.task for select using (work.inside() or work.can_read_task_row(id, engagement_id, assignee_id, reporter_id));
create policy add on erp.task for insert with check (work.inside() or work.actor_class() = 'admin' or work.can_manage_project(engagement_id));
create policy edit on erp.task for update
  using (work.inside() or work.actor_class() = 'admin' or work.can_manage_project(engagement_id)
         or assignee_id = erp.actor_id() or reporter_id = erp.actor_id());
create policy remove on erp.task for delete using (work.inside() or work.actor_class() = 'admin' or work.can_manage_project(engagement_id));

-- a sub-task's owner who does not edit the ticket cannot hand it to someone else (checked on the new row too)
create policy read on work.subtask for select using (work.inside() or work.can_read_task(task_id));
create policy add on work.subtask for insert with check (work.inside() or work.can_edit_subtasks_of(task_id));
create policy edit on work.subtask for update using (work.inside() or work.can_edit_subtasks_of(task_id) or assignee_id = erp.actor_id());
create policy remove on work.subtask for delete using (work.inside() or work.can_edit_subtasks_of(task_id));

create policy read on work.contract for select using (work.inside() or work.can_read_contract_row(client_id, engagement_id));
create policy manage on work.contract for all
  using (work.inside() or work.can_manage_contract_row(client_id, engagement_id))
  with check (work.inside() or work.can_manage_contract_row(client_id, engagement_id));

-- (whoever manages a record's files sees them, a "shareholders" one too: the rule also judges what they write)
create policy read on work.document for select
  using (work.inside() or work.can_read_document_row(related_type, related_id, visibility) or work.can_manage_document(related_type, related_id));
create policy add on work.document for insert
  with check (work.inside() or (work.can_manage_document(related_type, related_id) and uploaded_by = erp.actor_id()));
create policy edit on work.document for update using (work.inside() or work.can_manage_document(related_type, related_id));
create policy remove on work.document for delete using (work.inside() or work.can_manage_document(related_type, related_id));

-- a shareholder reads no internal comment and writes none
create policy read on work.comment for select
  using (work.inside() or (work.can_read_subject(subject_type, subject_id) and not (work.actor_class() = 'shareholder' and is_internal)));
create policy add on work.comment for insert
  with check (work.inside() or (author_id = erp.actor_id() and work.can_comment_on(subject_type, subject_id) and work.actor_class() <> 'shareholder'));
create policy edit on work.comment for update using (work.inside() or work.actor_class() = 'admin' or author_id = erp.actor_id());
create policy remove on work.comment for delete using (work.inside() or work.actor_class() = 'admin');

-- (an archived note is left out by the reads themselves: the rule also judges the row an update leaves, and archiving
-- is an update)
create policy read on work.note for select
  using (work.inside() or (work.can_read_note_subject(subject_type, subject_id) and work.can_read_note_visibility(visibility, author_id)));
create policy add on work.note for insert
  with check (work.inside() or (author_id = erp.actor_id() and work.can_manage_note_subject(subject_type, subject_id)
                                and work.can_use_note_visibility(visibility)));
create policy edit on work.note for update
  using (work.inside() or work.actor_class() = 'admin'
         or ((work.actor_class() = 'manager' or author_id = erp.actor_id()) and work.can_manage_note_subject(subject_type, subject_id)))
  with check (work.inside() or work.actor_class() = 'admin'
              or ((work.actor_class() = 'manager' or author_id = erp.actor_id()) and work.can_manage_note_subject(subject_type, subject_id)
                  and work.can_use_note_visibility(visibility)));
create policy remove on work.note for delete using (work.inside() or work.actor_class() = 'admin');

create policy read on work.notification for select
  using (work.inside() or work.actor_class() = 'admin' or (user_id = erp.actor_id() and work.can_read_notification_subject(subject_type, subject_id)));
create policy add on work.notification for insert
  with check (work.inside() or work.actor_class() in ('admin', 'manager')
              or (work.actor_class() <> 'none' and work.can_read_notification_subject(subject_type, subject_id)));
create policy edit on work.notification for update using (work.inside() or work.actor_class() = 'admin' or user_id = erp.actor_id());
create policy remove on work.notification for delete using (work.inside() or work.actor_class() = 'admin');

-- the e-mails and the automatic reminders: the server's own (system session)
create policy system on work.notification_email for all using (work.inside() or erp.actor_role() = 'system');
create policy system on work.timesheet_auto_reminder for all using (work.inside() or erp.actor_role() = 'system');

create policy read on work.activity for select using (work.inside() or work.can_read_activity(user_id, subject_type, subject_id));
create policy add on work.activity for insert with check (work.inside() or work.actor_class() = 'admin' or user_id = erp.actor_id());
create policy edit on work.activity for update using (work.inside() or work.actor_class() = 'admin');
create policy remove on work.activity for delete using (work.inside() or work.actor_class() = 'admin');

-- time: a person writes their own lines only, on their entity's missions or the ones they work on; they read their
-- own, their entity's managers and the administrators read them
drop policy if exists by_entity on erp.time_entry;
create policy read on erp.time_entry for select
  using (work.inside() or user_id = erp.actor_id() or work.actor_class() = 'admin' or work.is_entity_manager(entity_id));
create policy add on erp.time_entry for insert
  with check (work.inside() or (user_id = erp.actor_id() and (work.works_in_entity(entity_id) or work.is_timesheet_project(engagement_id))));
create policy edit on erp.time_entry for update
  using (work.inside() or user_id = erp.actor_id())
  with check (work.inside() or (user_id = erp.actor_id() and (work.works_in_entity(entity_id) or work.is_timesheet_project(engagement_id))));

create policy read on work.timesheet_week for select
  using (work.inside() or user_id = erp.actor_id() or work.actor_class() = 'admin' or work.is_entity_manager(entity_id));
create policy add on work.timesheet_week for insert
  with check (work.inside() or (user_id = erp.actor_id() and status = 'submitted' and reviewed_at is null and reviewed_by is null
                                and work.works_in_entity(entity_id)));
-- a reviewer approves or returns a week (signing it); its owner sends it again, cleared
create policy edit on work.timesheet_week for update
  using (work.inside() or work.actor_class() = 'admin' or user_id = erp.actor_id() or work.is_entity_manager(entity_id))
  with check (work.inside()
              or (status in ('approved', 'returned') and reviewed_by = erp.actor_id() and reviewed_at is not null
                  and user_id <> erp.actor_id() and (work.actor_class() = 'admin' or work.is_entity_manager(entity_id)))
              or (user_id = erp.actor_id() and status = 'submitted' and reviewed_by is null and reviewed_at is null and review_note is null));

create policy read on work.timesheet_week_event for select
  using (work.inside() or user_id = erp.actor_id() or work.actor_class() = 'admin' or work.is_entity_manager(entity_id));
-- written by the week's trigger only
create policy add on work.timesheet_week_event for insert with check (work.inside());

create policy read on work.timesheet_reminder for select using (work.inside() or work.actor_class() = 'admin' or sent_by = erp.actor_id());
create policy add on work.timesheet_reminder for insert
  with check (work.inside() or (sent_by = erp.actor_id() and (work.actor_class() = 'admin' or work.is_entity_manager(entity_id))));

create policy read on work.mission_favorite for select using (work.inside() or user_id = erp.actor_id());
create policy add on work.mission_favorite for insert
  with check (work.inside() or (user_id = erp.actor_id() and work.works_in_entity(entity_id) and work.is_timesheet_project(engagement_id)));
create policy remove on work.mission_favorite for delete using (work.inside() or user_id = erp.actor_id());

create policy read on work.finance_invoice for select using (work.inside() or work.can_read_invoice_row(client_id, engagement_id, contract_id));
create policy read on work.finance_payment for select using (work.inside() or work.can_read_payment_row(client_id, engagement_id, contract_id, invoice_id));
create policy read on work.finance_receipt for select using (work.inside() or work.actor_class() = 'admin' or work.can_read_payment(payment_id));
create policy read on work.finance_transfer for select using (work.inside() or work.can_read_transfer_row(engagement_id, client_id));
create policy read on work.finance_bank_statement for select using (work.inside() or work.actor_class() in ('admin', 'manager'));
create policy read on work.finance_bank_statement_line for select using (work.inside() or work.actor_class() in ('admin', 'manager'));
-- the copy loads them (the system session); the application has no right to write them at all
do $$
declare t text;
begin
  foreach t in array array['finance_invoice', 'finance_payment', 'finance_receipt', 'finance_transfer', 'finance_bank_statement', 'finance_bank_statement_line'] loop
    execute format('create policy copy on work.%I for insert with check (work.inside())', t);
  end loop;
end $$;

-- 14. Guards and defaults
-- a person's super-administrator flag and e-mail are the server's; their entity is set once by themselves, then by an
-- administrator
create or replace function work.person_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if erp.actor_role() <> 'system' then
    if new.is_super_admin is distinct from old.is_super_admin or lower(new.email) is distinct from lower(old.email) then
      raise exception 'person_locked_field' using errcode = '42501';
    end if;
    if new.entity_code is distinct from old.entity_code and old.entity_code is not null and work.actor_class() <> 'admin' then
      raise exception 'person_entity_locked' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger person_guard before update on work.person for each row execute function work.person_guard();

-- the ERP customer of a client in an entity: the linked one, an unlinked one of the same name, or a new one (when
-- the entity's chart has its customers' collective account)
create or replace function erp.ensure_customer(p_entity uuid, p_client uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_id uuid;
  c work.client;
begin
  if p_client is null then return null; end if;
  select id into v_id from erp.customer where entity_id = p_entity and client_id = p_client;
  if v_id is not null then return v_id; end if;
  select * into c from work.client where id = p_client;
  if not found then return null; end if;
  update erp.customer set client_id = p_client
   where id = (select id from erp.customer where entity_id = p_entity and client_id is null and lower(name) = lower(c.name) order by code limit 1)
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  if erp.collective_for(p_entity, 'customer') is null then return null; end if;
  insert into erp.customer (entity_id, code, name, country, email, nif, default_currency, client_id)
  values (p_entity, null, c.name, case when c.country ~* '^[a-z]{2}$' then upper(c.country) end, c.contact_email, c.tax_id,
          (select functional_currency from erp.entity where id = p_entity), p_client)
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.engagement_defaults() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  -- a mission stays on its floor (its tickets, time and books are that entity's)
  if tg_op = 'UPDATE' and new.entity_id <> old.entity_id and erp.actor_role() <> 'system' then
    raise exception 'mission_entity_locked' using errcode = '42501';
  end if;
  if new.code is null or trim(new.code) = '' then
    -- (missions created together on one floor take their numbers one after the other)
    perform pg_advisory_xact_lock(hashtext('erp.engagement.code:' || new.entity_id::text));
    select 'M-' || lpad((coalesce(max(substring(code from '^M-(\d+)$')::int), 0) + 1)::text, 3, '0') into new.code
      from erp.engagement where entity_id = new.entity_id;
  end if;
  if new.project_kind is not null then
    new.kind := case new.project_kind
      when 'client_mission' then 'Mission client'
      when 'institutional_partnership' then 'Partenariat institutionnel'
      when 'internal_product' then 'Produit interne'
      else 'Outil interne' end;
  end if;
  new.currency := coalesce(new.currency, (select functional_currency from erp.entity where id = new.entity_id));
  -- its client's customer in the entity follows the client (when there is one); no client, no customer
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id or new.customer_id is null) then
    new.customer_id := coalesce(erp.ensure_customer(new.entity_id, new.client_id), case when tg_op = 'UPDATE' and new.client_id = old.client_id then old.customer_id end);
  elsif tg_op = 'UPDATE' and new.client_id is null and old.client_id is not null then
    new.customer_id := null;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
create trigger engagement_defaults before insert or update on erp.engagement for each row execute function erp.engagement_defaults();

-- a ticket belongs to its mission's entity
create or replace function erp.task_defaults() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.engagement_id is not null and (tg_op = 'INSERT' or new.engagement_id is distinct from old.engagement_id) then
    new.entity_id := (select entity_id from erp.engagement where id = new.engagement_id);
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
create trigger task_defaults before insert or update on erp.task for each row execute function erp.task_defaults();

create or replace function work.touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['client', 'milestone', 'board', 'subtask', 'contract', 'document', 'comment', 'note'] loop
    execute format('create trigger touch before update on work.%I for each row execute function work.touch()', t);
  end loop;
end $$;

-- a timesheet line: of its mission's entity; never in the future, never in a week sent or approved, never more than
-- 24 hours a day for a person (their writes are serialised); its person and entity do not change
create or replace function erp.time_entry_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  -- a person's own lines only (the rules say so too, but this guard reads before them: it must reveal nothing of
  -- someone else's days or weeks)
  if erp.actor_role() <> 'system' and new.user_id is distinct from erp.actor_id() then
    raise exception 'new row violates row-level security policy for table "time_entry"' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.entity_id := coalesce((select entity_id from erp.engagement where id = new.engagement_id), new.entity_id);
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.entity_id <> old.entity_id or new.id <> old.id
                           or (select entity_id from erp.engagement where id = new.engagement_id) <> old.entity_id) then
    raise exception 'time_entry_identity_immutable';
  end if;
  -- the person's writes are serialised (and with their weeks' submissions: work.week_guard)
  perform 1 from work.person where id = new.user_id for update;
  if exists (select 1 from work.timesheet_week w
              where w.user_id = new.user_id and w.status in ('submitted', 'approved')
                and (w.week_start = date_trunc('week', new.work_date::timestamp)::date
                     or (tg_op = 'UPDATE' and w.week_start = date_trunc('week', old.work_date::timestamp)::date))) then
    raise exception 'timesheet_week_locked';
  end if;
  if new.work_date > (now() at time zone 'UTC')::date then
    raise exception 'time_entry_future_date';
  end if;
  if new.minutes + coalesce((select sum(minutes) from erp.time_entry
                              where user_id = new.user_id and work_date = new.work_date and id <> new.id), 0) > 1440 then
    raise exception 'time_entry_daily_limit';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger time_entry_guard before insert or update on erp.time_entry for each row execute function erp.time_entry_guard();

-- a week is sent or reviewed one at a time with the person's lines (erp.time_entry_guard takes the same lock)
create or replace function work.week_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform 1 from work.person where id = new.user_id for update;
  return new;
end $$;
create trigger week_guard before insert or update on work.timesheet_week for each row execute function work.week_guard();

create or replace function work.record_week_event() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into work.timesheet_week_event (user_id, week_start, entity_id, status, actor_id, note)
    values (new.user_id, new.week_start, new.entity_id, new.status,
            (select id from work.person where id = erp.actor_id()), new.review_note);
  end if;
  return new;
end $$;
create trigger record_week_event after insert or update of status on work.timesheet_week
  for each row execute function work.record_week_event();

-- a notification is e-mailed too, unless it stays in the app or its person turned the e-mails off
create or replace function work.queue_notification_email() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  insert into work.notification_email (notification_id, user_id, recipient_email, subject, body, subject_type, subject_id)
  select new.id, new.user_id, trim(p.email), new.title, new.body, new.subject_type, new.subject_id
    from work.person p
   where p.id = new.user_id and not new.skip_email and p.email_notifications and trim(p.email) <> ''
  on conflict (notification_id) do nothing;
  return new;
end $$;
create trigger queue_notification_email after insert on work.notification for each row execute function work.queue_notification_email();

-- 15. One client, two sides: an edited client's name, e-mail and tax id pass to its customers; a customer saved in
--     Vanguard gets its client (the one of the same name, or a new one) and passes them on to it
create or replace function work.client_to_customers() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update erp.customer c set name = new.name, email = new.contact_email, nif = new.tax_id
   where c.client_id = new.id and (c.name, c.email, c.nif) is distinct from (new.name, new.contact_email, new.tax_id);
  return new;
end $$;
create trigger client_to_customers after update of name, contact_email, tax_id on work.client
  for each row execute function work.client_to_customers();

-- (a customer of a group company is not a client; an e-mail without "@" leaves the client's as it is; a name another
-- client has, or a client already linked on the entity, leaves the customer as it is)
create or replace function erp.customer_to_client() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_client uuid;
begin
  if new.group_entity_id is not null then return new; end if;
  -- its client deleted: the customer stays without one
  if tg_op = 'UPDATE' and new.client_id is null and old.client_id is not null then return new; end if;
  -- a customer without its client: linked to the one of the same name (left as it is), or to a new one
  if new.client_id is null then
    select id into v_client from work.client where lower(name) = lower(new.name);
    if v_client is null then
      insert into work.client (name, contact_email, tax_id, country, type, status)
      values (new.name, case when position('@' in coalesce(new.email, '')) > 0 then new.email end, new.nif, new.country, 'company', 'active')
      returning id into v_client;
    end if;
    if not exists (select 1 from erp.customer where entity_id = new.entity_id and client_id = v_client) then
      update erp.customer set client_id = v_client where id = new.id;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.name, new.email, new.nif) is distinct from (old.name, old.email, old.nif)
     and not exists (select 1 from work.client k where lower(k.name) = lower(new.name) and k.id <> new.client_id) then
    update work.client k
       set name = new.name, contact_email = case when position('@' in coalesce(new.email, '')) > 0 then new.email else k.contact_email end,
           tax_id = new.nif
     where k.id = new.client_id
       and (k.name, k.contact_email, k.tax_id)
           is distinct from (new.name, case when position('@' in coalesce(new.email, '')) > 0 then new.email else k.contact_email end, new.nif);
  end if;
  return new;
end $$;
create trigger customer_to_client after insert or update of name, email, nif, client_id on erp.customer
  for each row execute function erp.customer_to_client();

-- 16. What the server runs (system session)
-- claim e-mails to send: due ones, and ones a crashed sender left (20 minutes); each claimed once
create or replace function work.claim_notification_emails(p_batch integer, p_notification_ids uuid[] default null)
returns setof work.notification_email
language sql as $$
  update work.notification_email o
     set status = 'processing', attempts = o.attempts + 1, locked_at = now(), last_error = null
   where o.id in (
     select id from work.notification_email
      where attempts < 5
        and ((status = 'pending' and next_attempt_at <= now()) or (status = 'processing' and locked_at < now() - interval '20 minutes'))
        and (p_notification_ids is null or notification_id = any (p_notification_ids))
      order by created_at
      limit greatest(1, least(coalesce(p_batch, 50), 100))
      for update skip locked)
  returning o.* $$;

-- the Monday reminder of a week not sent: everyone with access but the shareholders, active, with an e-mail
create or replace function work.queue_weekly_timesheet_reminders(p_week_start date) returns integer
language plpgsql as $$
declare v_count integer;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'The timesheet reminder week must start on a Monday.';
  end if;
  with eligible as (
    select p.id, p.entity_code
      from work.person p join erp.user_access u on u.user_id = p.id
     where not (u.erp_role = 'staff' and coalesce(u.modules = array['reports']::text[], false))
       and p.availability_status <> 'inactive' and trim(p.email) <> ''
       and not exists (select 1 from work.timesheet_week w where w.user_id = p.id and w.week_start = p_week_start and w.status in ('submitted', 'approved'))
       and not exists (select 1 from work.timesheet_auto_reminder r where r.user_id = p.id and r.week_start = p_week_start)
  ), reminded as (
    insert into work.timesheet_auto_reminder (user_id, week_start, entity_id)
    select e.id, p_week_start, (select x.id from erp.entity x where x.code = e.entity_code) from eligible e
    returning user_id
  )
  insert into work.notification (user_id, type, title, body, subject_type, subject_id)
  select r.user_id, 'deadline', 'Rappel : timesheet à envoyer',
         'Votre timesheet de la semaine du ' || to_char(p_week_start, 'DD/MM/YYYY') || ' n’est pas soumise. Merci de la compléter et de l’envoyer dans BUMEX.',
         'system', r.user_id
    from reminded r;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 17. A screen's version (lib/erp/vanguard/run.ts): the ERP's audit log moves with every audited table; the people and
--     the missions' members are not audited, so their changes move this counter
create sequence work.change_seq;
create or replace function work.changed() returns trigger
language plpgsql as $$
begin
  perform nextval('work.change_seq');
  return null;
end $$;
create trigger changed after insert or update or delete on work.person for each statement execute function work.changed();
create trigger changed after insert or update or delete on erp.engagement_staff for each statement execute function work.changed();

create or replace function work.version() returns bigint
language sql stable as $$ select case when is_called then last_value else 0 end from work.change_seq $$;

-- 18. What every viewer of a mission reads the same (its tickets and time lines are each person's to see): its
--     progress (done tickets of the live ones, or the one set by hand; a completed mission is done), its hours, its
--     members' initials ("Mariem Sow" → "M.S.", as the ERP writes them)
create or replace function work.initials(p_name text) returns text
language sql immutable as $$
  select case when coalesce(trim(p_name), '') = '' then '—'
    else upper(left(split_part(regexp_replace(trim(p_name), '\s+', ' ', 'g'), ' ', 1), 1)) || '.'
         || case when trim(p_name) ~ '\s' then upper(left(regexp_replace(trim(p_name), '^.*\s', ''), 1)) || '.' else '' end
  end $$;

-- (only for whoever sees the mission: its floor, its people, the administrators; read from the caller's own entity
-- list, since erp.can_see_entity lets a helper see every entity)
create or replace function work.sees_mission(p_engagement uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select work.actor_class() in ('admin', 'shareholder')
      or exists (select 1 from erp.engagement e
                  where e.id = p_engagement
                    and (coalesce(current_setting('erp.entity_ids', true), '') = '*'
                         or e.entity_id::text = any (string_to_array(coalesce(current_setting('erp.entity_ids', true), ''), ','))))
      or work.can_read_project(p_engagement) $$;

create or replace function work.mission_progress(p_engagement uuid) returns integer
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case
    when e.status = 'completed' then 100
    when e.manual_progress is not null then e.manual_progress
    else coalesce((select round(100.0 * count(*) filter (where t.status = 'done') / nullif(count(*), 0))::integer
                     from erp.task t where t.engagement_id = e.id and t.status <> 'archived'), 0)
  end
  from erp.engagement e where e.id = p_engagement and work.sees_mission(p_engagement) $$;

create or replace function work.mission_hours(p_engagement uuid) returns numeric
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when work.sees_mission(p_engagement)
              then (select round(coalesce(sum(minutes), 0) / 60.0, 2) from erp.time_entry where engagement_id = p_engagement) end $$;

create or replace function work.mission_staff(p_engagement uuid) returns text[]
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when work.sees_mission(p_engagement)
              then (select coalesce(array_agg(distinct work.initials(p.full_name)), '{}')
                      from erp.engagement_staff s join work.person p on p.id = s.user_id where s.engagement_id = p_engagement) end $$;

-- 19. Reading people: a person's role as BUMEX One's rules read it (lib/erp/roles.ts bumexOneRoleFor: an employee
--     without access), and the card the screens show of them
create or replace function work.person_role(p_person text) returns text
language sql stable as $$
  select case
    when u.erp_role in ('admin', 'partner', 'raf') then 'admin'
    when u.erp_role = 'manager' then 'manager'
    when u.erp_role = 'staff' and coalesce(u.modules = array['reports']::text[], false) then 'shareholder'
    else 'employee'
  end
  from (select 1) one left join erp.user_access u on u.user_id = p_person $$;

create or replace function work.person_card(p_person text) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id),
                            'entity_code', p.entity_code, 'job_title', p.job_title)
    from work.person p where p.id = p_person $$;

-- the helpers and triggers that read and write past the rules (section 2) are work_reader's
grant select, insert, update, delete on all tables in schema erp, work to work_reader;
revoke update, delete, truncate on erp.audit_log from work_reader;
grant usage, select on all sequences in schema erp, work to work_reader;
grant execute on all functions in schema erp, work to work_reader;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.prosecdef and p.pronamespace in ('work'::regnamespace, 'erp'::regnamespace) loop
    execute format('alter function %s owner to work_reader', f);
  end loop;
end $$;

grant usage, select on all sequences in schema work to erp_app;
grant execute on all functions in schema work to erp_app;
grant select, insert, update, delete on all tables in schema work to erp_app;
revoke insert, update, delete, truncate on work.finance_invoice, work.finance_payment, work.finance_receipt, work.finance_transfer,
  work.finance_bank_statement, work.finance_bank_statement_line from erp_app;
-- no one but the application role runs the work's functions; the triggers' functions and erp.ensure_customer are
-- work_reader's alone (a trigger fires without its caller's right to run its function; called directly, they would
-- write past the rules)
revoke execute on all functions in schema work from public;
revoke execute on function erp.ensure_customer(uuid, uuid), erp.engagement_defaults(), erp.task_defaults(), erp.time_entry_guard(),
  erp.customer_to_client() from public, erp_app;
revoke execute on function work.person_guard(), work.week_guard(), work.record_week_event(), work.queue_notification_email(),
  work.client_to_customers() from erp_app;
