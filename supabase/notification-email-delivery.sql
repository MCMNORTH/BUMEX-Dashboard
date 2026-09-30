-- Persist every in-app notification for email delivery and schedule weekly timesheet reminders.
-- Apply after the base schema and timesheet workflow migrations.

alter type public.notification_entity_type add value if not exists 'timesheet';

begin;

create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  entity_type public.notification_entity_type not null,
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_email_outbox_pending_idx
  on public.notification_email_outbox(status, next_attempt_at, created_at);

alter table public.notification_email_outbox enable row level security;
revoke all on public.notification_email_outbox from public, anon, authenticated;
grant select, insert, update on public.notification_email_outbox to service_role;

create or replace function private.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_email_outbox (
    notification_id,
    user_id,
    recipient_email,
    subject,
    body,
    entity_type,
    entity_id
  )
  select
    new.id,
    new.user_id,
    profile.email,
    new.title,
    new.body,
    new.entity_type,
    new.entity_id
  from public.profiles profile
  where profile.id = new.user_id
    and nullif(trim(profile.email), '') is not null
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
after insert on public.notifications
for each row execute function private.enqueue_notification_email();

create or replace function public.claim_notification_email_outbox(
  p_batch_size integer default 50,
  p_notification_ids uuid[] default null
)
returns setof public.notification_email_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_email_outbox outbox
    where outbox.attempts < 5
      and (
        (outbox.status = 'pending' and outbox.next_attempt_at <= now())
        or (outbox.status = 'processing' and outbox.locked_at < now() - interval '20 minutes')
      )
      and (p_notification_ids is null or outbox.notification_id = any(p_notification_ids))
    order by outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_batch_size, 50), 1), 100)
  )
  update public.notification_email_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      last_error = null
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_notification_email_outbox(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_notification_email_outbox(integer, uuid[]) to service_role;

create table if not exists public.timesheet_weekly_reminders (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  entity_code text,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.timesheet_weekly_reminders enable row level security;
revoke all on public.timesheet_weekly_reminders from public, anon, authenticated;
grant select, insert on public.timesheet_weekly_reminders to service_role;

create or replace function public.queue_weekly_timesheet_reminders(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reminder_count integer;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'The timesheet reminder week must start on a Monday.';
  end if;

  with eligible as (
    select profile.id, profile.entity_code
    from public.profiles profile
    left join public.timesheet_week_status week_status
      on week_status.user_id = profile.id
      and week_status.week_start = p_week_start
    where profile.role <> 'shareholder'
      and profile.availability_status <> 'inactive'
      and nullif(trim(profile.email), '') is not null
      and (week_status.status is null or week_status.status not in ('submitted', 'approved'))
      and not exists (
        select 1
        from public.timesheet_weekly_reminders reminder
        where reminder.user_id = profile.id
          and reminder.week_start = p_week_start
      )
  ), recorded as (
    insert into public.timesheet_weekly_reminders (user_id, week_start, entity_code)
    select eligible.id, p_week_start, eligible.entity_code
    from eligible
    on conflict (user_id, week_start) do nothing
    returning user_id
  ), created_notifications as (
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      entity_type,
      entity_id,
      is_read
    )
    select
      recorded.user_id,
      'deadline'::public.notification_type,
      'Timesheet reminder',
      'Votre timesheet de la semaine du ' || to_char(p_week_start, 'YYYY-MM-DD')
        || ' n’est pas soumise. Merci de la compléter et de l’envoyer dans BUMEX Dashboard.'
        || ' / Your timesheet for the week starting ' || to_char(p_week_start, 'YYYY-MM-DD')
        || ' has not been submitted. Please complete and submit it in BUMEX Dashboard.',
      'timesheet'::public.notification_entity_type,
      recorded.user_id,
      false
    from recorded
    returning id
  )
  select count(*)::integer into reminder_count from created_notifications;

  return coalesce(reminder_count, 0);
end;
$$;

revoke all on function public.queue_weekly_timesheet_reminders(date) from public, anon, authenticated;
grant execute on function public.queue_weekly_timesheet_reminders(date) to service_role;

notify pgrst, 'reload schema';
commit;
