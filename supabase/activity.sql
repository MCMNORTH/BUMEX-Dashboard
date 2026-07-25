alter table public.activity_logs
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_activity_logs_metadata_gin
on public.activity_logs
using gin (metadata);
