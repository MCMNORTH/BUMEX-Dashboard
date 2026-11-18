-- =====================================================================
--  BUMEX ERP — migration 0017: e-mails to tickets
--  Applies on top of 0001–0016.
--
--  Asked on 2026-11-03: each person connects their own Outlook inbox (Microsoft Graph, delegated Mail.Read); an
--  e-mail that reads like a task becomes a ticket written by Claude, assigned to the person who received it, its
--  attachments the ticket's; a reply in its thread becomes a comment. The server reads and writes all of it (the
--  system session); a person reads their own connection and the e-mails their inbox brought; whoever reads a ticket
--  reads the e-mail it came from (a shareholder apart, as for internal comments). Additive.
-- =====================================================================
set search_path to erp, public;

-- 1. A person's connected inbox (lib/mail): its Microsoft address, its state, where the next Graph delta starts
create table work.mail_connection (
  person_id     text primary key references work.person (id) on delete cascade,
  ms_email      text not null,
  status        text not null default 'active' check (status in ('active', 'paused', 'reconnect')),
  delta_link    text,
  connected_at  timestamptz not null default now(),
  last_sync_at  timestamptz,
  last_error    text,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table work.mail_connection enable row level security;
alter table work.mail_connection force row level security;
create policy read on work.mail_connection for select
  using (work.inside() or person_id = erp.actor_id() or work.actor_class() = 'admin');
create policy system on work.mail_connection for all using (work.inside()) with check (work.inside());

-- 2. Its refresh token, sealed by the server's key (MAIL_TOKEN_KEY): the server alone reads it
create table work.mail_token (
  person_id          text primary key references work.mail_connection (person_id) on delete cascade,
  refresh_token_enc  text not null,
  updated_at         timestamptz not null default now()
);
alter table work.mail_token enable row level security;
alter table work.mail_token force row level security;
create policy system on work.mail_token for all using (erp.actor_role() = 'system');

-- 3. Every e-mail an inbox brought, once (the same e-mail in two inboxes is one row: internet_message_id), and what
--    became of it. Its text is kept only when it became a ticket or a comment; a skipped one keeps its sender, subject
--    and reason for 30 days (the cron deletes it after).
create table work.mail_message (
  id                   uuid primary key default gen_random_uuid(),
  internet_message_id  text not null unique,
  person_id            text not null references work.person (id) on delete cascade,
  graph_id             text not null,
  conversation_id      text,
  from_name            text,
  from_address         text,
  subject              text,
  received_at          timestamptz,
  status               text not null default 'pending'
                       check (status in ('pending', 'processing', 'ticket', 'comment', 'skipped', 'failed')),
  reason               text,
  ticket_id            uuid references erp.task (id) on delete set null,
  comment_id           uuid references work.comment (id) on delete set null,
  body_text            text,
  web_link             text,
  skipped_files        text[] not null default '{}',
  ai                   jsonb,
  forced               boolean not null default false,
  attempts             integer not null default 0,
  next_attempt_at      timestamptz not null default now(),
  locked_at            timestamptz,
  last_error           text,
  created_at           timestamptz not null default now(),
  processed_at         timestamptz
);
create index on work.mail_message (status, next_attempt_at);
create index on work.mail_message (person_id, created_at desc);
create index on work.mail_message (ticket_id) where ticket_id is not null;
alter table work.mail_message enable row level security;
alter table work.mail_message force row level security;
create policy read on work.mail_message for select
  using (work.inside() or person_id = erp.actor_id()
         or (ticket_id is not null and work.actor_class() <> 'shareholder' and work.can_read_task(ticket_id)));
create policy system on work.mail_message for all using (work.inside()) with check (work.inside());

grant select, insert, update, delete on work.mail_connection, work.mail_token, work.mail_message to erp_app;

-- 4. A comment from an e-mail reply: its author is the person whose inbox received it, its writer the sender
alter table work.comment
  add column if not exists email_from_name    text,
  add column if not exists email_from_address text;

-- 5. A floor's "Demandes par e-mail": the mission of the e-mail tickets no mission of their person fitted; one per
--    entity, created by the server on first use, its lead set by an administrator
alter table erp.engagement add column if not exists is_email_intake boolean not null default false;
create unique index if not exists engagement_email_intake_uq on erp.engagement (entity_id) where is_email_intake;
