-- ============================================================================
-- PART 8.1 - Internal comments system
-- ----------------------------------------------------------------------------
-- Adds reusable comments and comment attachments for internal collaboration.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'comment_entity_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.comment_entity_type as enum (
      'project',
      'ticket',
      'client',
      'contract',
      'document',
      'invoice',
      'payment',
      'transfer'
    );
  end if;
end
$$;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type public.comment_entity_type not null,
  entity_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  is_internal boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint comments_body_not_blank_chk check (length(trim(body)) > 0)
);

create table if not exists public.comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  file_url text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default timezone('utc', now()),
  constraint comment_attachments_file_size_non_negative_chk check (file_size is null or file_size >= 0)
);

create index if not exists idx_comments_entity on public.comments (entity_type, entity_id, created_at desc);
create index if not exists idx_comments_author on public.comments (author_id, created_at desc);
create index if not exists idx_comments_deleted_at on public.comments (deleted_at);
create index if not exists idx_comment_attachments_comment_id on public.comment_attachments (comment_id);
create index if not exists idx_comment_attachments_document_id on public.comment_attachments (document_id);
