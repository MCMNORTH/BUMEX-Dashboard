do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'notification_type'
  ) then
    create type public.notification_type as enum (
      'mention',
      'assignment',
      'status_change',
      'comment',
      'deadline',
      'overdue',
      'payment_due',
      'contract_due',
      'system'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'notification_entity_type'
  ) then
    create type public.notification_entity_type as enum (
      'project',
      'ticket',
      'client',
      'contract',
      'document',
      'invoice',
      'payment',
      'transfer',
      'milestone',
      'system'
    );
  end if;
end $$;

create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  mentioned_by uuid not null references public.profiles (id) on delete restrict,
  entity_type public.comment_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint mentions_unique_comment_user unique (comment_id, mentioned_user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  entity_type public.notification_entity_type not null default 'system',
  entity_id uuid not null,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint notifications_title_not_blank_chk check (length(trim(title)) > 0),
  constraint notifications_body_not_blank_chk check (length(trim(body)) > 0)
);

alter table public.notifications add column if not exists archived_at timestamptz;

create index if not exists idx_mentions_comment_id on public.mentions (comment_id);
create index if not exists idx_mentions_mentioned_user_id on public.mentions (mentioned_user_id, created_at desc);
create index if not exists idx_mentions_entity on public.mentions (entity_type, entity_id, created_at desc);
create index if not exists idx_notifications_user_id on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_is_read on public.notifications (user_id, is_read, created_at desc);
create index if not exists idx_notifications_entity on public.notifications (entity_type, entity_id, created_at desc);
create index if not exists idx_notifications_archived_at on public.notifications (user_id, archived_at, created_at desc);
