do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'note_entity_type'
  ) then
    create type public.note_entity_type as enum (
      'project',
      'client',
      'contract',
      'finance',
      'shareholder'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'note_visibility'
  ) then
    create type public.note_visibility as enum (
      'private',
      'team',
      'management',
      'shareholders'
    );
  end if;
end
$$;

alter type public.activity_entity_type add value if not exists 'finance';
alter type public.activity_entity_type add value if not exists 'shareholder';

create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type public.note_entity_type not null,
  entity_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  body text not null,
  visibility public.note_visibility not null default 'team',
  pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint internal_notes_title_not_blank_chk check (length(trim(title)) > 0),
  constraint internal_notes_body_not_blank_chk check (length(trim(body)) > 0)
);

create index if not exists idx_internal_notes_entity_lookup
on public.internal_notes (entity_type, entity_id, pinned desc, updated_at desc);

create index if not exists idx_internal_notes_author_created_at
on public.internal_notes (author_id, created_at desc);

create index if not exists idx_internal_notes_archived_at
on public.internal_notes (archived_at, updated_at desc);
