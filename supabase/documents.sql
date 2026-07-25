do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'document_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.document_type as enum (
      'contract',
      'invoice',
      'receipt',
      'bank_transfer',
      'proposal',
      'report',
      'meeting_note',
      'technical_document',
      'legal_document',
      'other'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'document_visibility'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.document_visibility as enum (
      'internal',
      'management',
      'shareholders',
      'restricted'
    );
  end if;
end
$$;

alter type public.document_related_type add value if not exists 'archive';
alter type public.document_related_type add value if not exists 'invoice';
alter type public.document_related_type add value if not exists 'transfer';

alter table public.documents
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists document_type public.document_type not null default 'other',
  alter column related_id drop not null,
  add column if not exists file_name text,
  add column if not exists file_size bigint not null default 0,
  add column if not exists mime_type text,
  add column if not exists visibility public.document_visibility not null default 'internal',
  add column if not exists is_archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.documents
set
  title = coalesce(title, regexp_replace(split_part(file_url, '/', array_length(string_to_array(file_url, '/'), 1)), '^[0-9a-f-]+-', '')),
  file_name = coalesce(file_name, split_part(file_url, '/', array_length(string_to_array(file_url, '/'), 1))),
  updated_at = coalesce(updated_at, created_at)
where title is null or file_name is null;

alter table public.documents
  alter column title set not null,
  alter column file_name set not null;

alter table public.documents
  drop constraint if exists documents_title_not_blank_chk,
  drop constraint if exists documents_file_name_not_blank_chk,
  drop constraint if exists documents_file_size_non_negative_chk,
  drop constraint if exists documents_archive_related_chk;

alter table public.documents
  add constraint documents_title_not_blank_chk check (length(trim(title)) > 0),
  add constraint documents_file_name_not_blank_chk check (length(trim(file_name)) > 0),
  add constraint documents_file_size_non_negative_chk check (file_size >= 0),
  add constraint documents_archive_related_chk check (
    (related_type = 'archive' and related_id is null)
    or (related_type <> 'archive' and related_id is not null)
  );

create index if not exists idx_documents_document_type on public.documents (document_type);
create index if not exists idx_documents_visibility on public.documents (visibility);
create index if not exists idx_documents_archive_state on public.documents (is_archived);
create index if not exists idx_documents_updated_at on public.documents (updated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
