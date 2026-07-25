create extension if not exists pgcrypto;

create type public.role as enum ('admin', 'manager', 'supervisor', 'employee', 'shareholder');
create type public.availability_status as enum (
  'available',
  'busy',
  'overloaded',
  'away',
  'inactive'
);
create type public.project_status as enum (
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);
create type public.task_status as enum (
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled'
);
create type public.priority as enum ('low', 'medium', 'high', 'critical');
create type public.invoice_status as enum (
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'archived'
);
create type public.payment_status as enum (
  'expected',
  'received',
  'late',
  'cancelled',
  'reconciled'
);
create type public.payment_method as enum (
  'cash',
  'bank_transfer',
  'check',
  'mobile_money',
  'card',
  'other'
);
create type public.transfer_status as enum (
  'planned',
  'pending',
  'sent',
  'confirmed',
  'failed',
  'cancelled'
);
create type public.transfer_category as enum (
  'supplier',
  'salary',
  'subcontractor',
  'software',
  'hosting',
  'taxes',
  'rent',
  'other'
);
create type public.contract_status as enum (
  'draft',
  'under_review',
  'signed',
  'active',
  'expired',
  'cancelled',
  'archived'
);
create type public.contract_type as enum (
  'development',
  'maintenance',
  'consulting',
  'support',
  'hosting',
  'audit',
  'other'
);
create type public.document_related_type as enum (
  'client',
  'project',
  'task',
  'contract',
  'invoice',
  'payment',
  'transfer',
  'archive'
);
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
create type public.document_visibility as enum (
  'internal',
  'management',
  'shareholders',
  'restricted'
);
create type public.activity_entity_type as enum (
  'profile',
  'team',
  'finance',
  'shareholder',
  'client',
  'project',
  'milestone',
  'task',
  'contract',
  'invoice',
  'receipt',
  'document',
  'payment',
  'transfer'
);
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
create type public.note_entity_type as enum (
  'project',
  'client',
  'contract',
  'finance',
  'shareholder'
);
create type public.note_visibility as enum (
  'private',
  'team',
  'management',
  'shareholders'
);
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
create type public.milestone_status as enum (
  'planned',
  'in_progress',
  'completed',
  'delayed',
  'cancelled'
);
create type public.client_status as enum (
  'prospect',
  'active',
  'inactive',
  'suspended',
  'archived'
);
create type public.client_type as enum (
  'company',
  'public_institution',
  'ngo',
  'individual',
  'other'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.role not null default 'employee',
  avatar_url text,
  job_title text,
  department text,
  skills text[] not null default '{}',
  phone text,
  availability_status public.availability_status not null default 'available',
  weekly_capacity_hours integer not null default 40,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_email_format_chk check (position('@' in email) > 1)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint teams_name_unique unique (name)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role public.role not null default 'employee',
  constraint team_members_unique_membership unique (user_id, team_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  type public.client_type not null default 'company',
  industry text,
  contact_email text,
  contact_phone text,
  address text,
  country text,
  city text,
  website text,
  tax_id text,
  status public.client_status not null default 'prospect',
  account_manager_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint clients_name_unique unique (name),
  constraint clients_contact_email_format_chk check (
    contact_email is null or position('@' in contact_email) > 1
  ),
  constraint clients_website_format_chk check (
    website is null or website ~* '^https?://'
  )
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid not null references public.clients (id) on delete restrict,
  status public.project_status not null default 'draft',
  owner_id uuid not null references public.profiles (id) on delete restrict,
  start_date date,
  end_date date,
  created_at timestamptz not null default timezone('utc', now()),
  constraint projects_schedule_chk check (
    end_date is null or start_date is null or end_date >= start_date
  ),
  constraint projects_client_name_unique unique (client_id, name)
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.role not null default 'employee',
  constraint project_members_unique_membership unique (project_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  constraint task_dependencies_unique unique (task_id, depends_on_task_id),
  constraint task_dependencies_not_self_chk check (task_id <> depends_on_task_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  status public.milestone_status not null default 'planned',
  due_date date not null,
  completed_at timestamptz,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint milestones_title_not_blank_chk check (length(trim(title)) > 0),
  constraint milestones_completed_status_chk check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  title text not null,
  contract_number text,
  project_id uuid references public.projects (id) on delete set null,
  status public.contract_status not null default 'draft',
  contract_type public.contract_type not null default 'development',
  start_date date,
  end_date date,
  signed_date date,
  renewal_date date,
  amount numeric(14, 2),
  currency text not null default 'USD',
  payment_terms text,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint contracts_amount_positive_chk check (amount is null or amount >= 0),
  constraint contracts_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint contracts_schedule_chk check (
    end_date is null or start_date is null or end_date >= start_date
  ),
  constraint contracts_client_title_unique unique (client_id, title)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  contract_id uuid references public.contracts (id) on delete set null,
  issue_date date not null,
  due_date date not null,
  amount_ht numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null default 0,
  amount_ttc numeric(14, 2) not null,
  currency text not null default 'USD',
  status public.invoice_status not null default 'draft',
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoices_amount_ht_non_negative_chk check (amount_ht >= 0),
  constraint invoices_tax_amount_non_negative_chk check (tax_amount >= 0),
  constraint invoices_amount_ttc_non_negative_chk check (amount_ttc >= 0),
  constraint invoices_amount_consistency_chk check (amount_ttc = amount_ht + tax_amount),
  constraint invoices_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint invoices_schedule_chk check (due_date >= issue_date)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  document_type public.document_type not null default 'other',
  related_type public.document_related_type not null default 'archive',
  related_id uuid,
  file_url text not null,
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  visibility public.document_visibility not null default 'internal',
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint documents_title_not_blank_chk check (length(trim(title)) > 0),
  constraint documents_file_url_not_blank_chk check (length(trim(file_url)) > 0),
  constraint documents_file_name_not_blank_chk check (length(trim(file_name)) > 0),
  constraint documents_file_size_non_negative_chk check (file_size >= 0),
  constraint documents_archive_related_chk check (
    (related_type = 'archive' and related_id is null)
    or (related_type <> 'archive' and related_id is not null)
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices (id) on delete set null,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  contract_id uuid references public.contracts (id) on delete set null,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  payment_date date,
  due_date date,
  method public.payment_method not null default 'bank_transfer',
  status public.payment_status not null default 'expected',
  reference text,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payments_amount_positive_chk check (amount >= 0),
  constraint payments_currency_not_blank_chk check (length(trim(currency)) > 0)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_reference text not null unique,
  beneficiary_name text not null,
  beneficiary_bank text,
  beneficiary_account text,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  transfer_date date not null,
  status public.transfer_status not null default 'planned',
  category public.transfer_category not null default 'other',
  related_project_id uuid references public.projects (id) on delete set null,
  related_client_id uuid references public.clients (id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint transfers_amount_positive_chk check (amount > 0),
  constraint transfers_currency_not_blank_chk check (length(trim(currency)) > 0),
  constraint transfers_beneficiary_name_not_blank_chk check (length(trim(beneficiary_name)) > 0)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  payment_id uuid not null references public.payments (id) on delete cascade,
  issue_date date not null,
  amount numeric(14, 2) not null,
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint receipts_amount_positive_chk check (amount > 0)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type public.activity_entity_type not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint activity_logs_action_not_blank_chk check (length(trim(action)) > 0)
);

create table public.comments (
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

create table public.comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  file_url text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default timezone('utc', now()),
  constraint comment_attachments_file_size_non_negative_chk check (file_size is null or file_size >= 0)
);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  mentioned_by uuid not null references public.profiles (id) on delete restrict,
  entity_type public.comment_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint mentions_unique_comment_user unique (comment_id, mentioned_user_id)
);

create table public.notifications (
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

create table public.internal_notes (
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

create index idx_profiles_role on public.profiles (role);
create index idx_profiles_availability_status on public.profiles (availability_status);
create index idx_profiles_department on public.profiles (department);
create index idx_profiles_created_at on public.profiles (created_at desc);
create index idx_profiles_updated_at on public.profiles (updated_at desc);

create index idx_team_members_user_id on public.team_members (user_id);
create index idx_team_members_team_id on public.team_members (team_id);
create index idx_team_members_role on public.team_members (role);

create index idx_clients_created_at on public.clients (created_at desc);
create index idx_clients_status on public.clients (status);
create index idx_clients_type on public.clients (type);
create index idx_clients_account_manager_id on public.clients (account_manager_id);
create index idx_clients_updated_at on public.clients (updated_at desc);

create index idx_projects_client_id on public.projects (client_id);
create index idx_projects_owner_id on public.projects (owner_id);
create index idx_projects_status on public.projects (status);
create index idx_projects_start_date on public.projects (start_date);
create index idx_projects_end_date on public.projects (end_date);
create index idx_projects_created_at on public.projects (created_at desc);

create index idx_project_members_project_id on public.project_members (project_id);
create index idx_project_members_user_id on public.project_members (user_id);
create index idx_project_members_role on public.project_members (role);

create index idx_tasks_project_id on public.tasks (project_id);
create index idx_tasks_assignee_id on public.tasks (assignee_id);
create index idx_tasks_status on public.tasks (status);
create index idx_tasks_priority on public.tasks (priority);
create index idx_tasks_due_date on public.tasks (due_date);
create index idx_tasks_created_at on public.tasks (created_at desc);
create index idx_tasks_project_status_priority on public.tasks (project_id, status, priority);
create index idx_comments_entity on public.comments (entity_type, entity_id, created_at desc);
create index idx_comments_author on public.comments (author_id, created_at desc);
create index idx_comments_deleted_at on public.comments (deleted_at);
create index idx_comment_attachments_comment_id on public.comment_attachments (comment_id);
create index idx_comment_attachments_document_id on public.comment_attachments (document_id);
create index idx_mentions_comment_id on public.mentions (comment_id);
create index idx_mentions_mentioned_user_id on public.mentions (mentioned_user_id, created_at desc);
create index idx_mentions_entity on public.mentions (entity_type, entity_id, created_at desc);
create index idx_notifications_user_id on public.notifications (user_id, created_at desc);
create index idx_notifications_is_read on public.notifications (user_id, is_read, created_at desc);
create index idx_notifications_entity on public.notifications (entity_type, entity_id, created_at desc);
create index idx_notifications_archived_at on public.notifications (user_id, archived_at, created_at desc);
create index idx_internal_notes_entity_lookup on public.internal_notes (entity_type, entity_id, pinned desc, updated_at desc);
create index idx_internal_notes_author_created_at on public.internal_notes (author_id, created_at desc);
create index idx_internal_notes_archived_at on public.internal_notes (archived_at, updated_at desc);

create index idx_task_dependencies_task_id on public.task_dependencies (task_id);
create index idx_task_dependencies_depends_on_task_id on public.task_dependencies (depends_on_task_id);

create index idx_milestones_project_id on public.milestones (project_id);
create index idx_milestones_owner_id on public.milestones (owner_id);
create index idx_milestones_status on public.milestones (status);
create index idx_milestones_due_date on public.milestones (due_date);
create index idx_milestones_project_due_date on public.milestones (project_id, due_date);

create index idx_contracts_client_id on public.contracts (client_id);
create index idx_contracts_project_id on public.contracts (project_id);
create index idx_contracts_status on public.contracts (status);
create index idx_contracts_contract_type on public.contracts (contract_type);
create index idx_contracts_signed_date on public.contracts (signed_date);
create index idx_contracts_end_date on public.contracts (end_date);
create index idx_contracts_renewal_date on public.contracts (renewal_date);
create index idx_contracts_responsible_user_id on public.contracts (responsible_user_id);
create index idx_contracts_created_at on public.contracts (created_at desc);
create index idx_contracts_updated_at on public.contracts (updated_at desc);

create index idx_invoices_client_id on public.invoices (client_id);
create index idx_invoices_project_id on public.invoices (project_id);
create index idx_invoices_contract_id on public.invoices (contract_id);
create index idx_invoices_due_date on public.invoices (due_date);
create index idx_invoices_status on public.invoices (status);
create index idx_invoices_created_at on public.invoices (created_at desc);
create index idx_invoices_created_by on public.invoices (created_by);

create index idx_documents_related_lookup on public.documents (related_type, related_id);
create index idx_documents_document_type on public.documents (document_type);
create index idx_documents_visibility on public.documents (visibility);
create index idx_documents_archive_state on public.documents (is_archived);
create index idx_documents_uploaded_by on public.documents (uploaded_by);
create index idx_documents_created_at on public.documents (created_at desc);
create index idx_documents_updated_at on public.documents (updated_at desc);

create index idx_payments_invoice_id on public.payments (invoice_id);
create index idx_payments_client_id on public.payments (client_id);
create index idx_payments_project_id on public.payments (project_id);
create index idx_payments_contract_id on public.payments (contract_id);
create index idx_payments_status on public.payments (status);
create index idx_payments_due_date on public.payments (due_date);
create index idx_payments_created_at on public.payments (created_at desc);
create index idx_payments_created_by on public.payments (created_by);
create index idx_payments_client_status on public.payments (client_id, status);

create index idx_transfers_related_project_id on public.transfers (related_project_id);
create index idx_transfers_related_client_id on public.transfers (related_client_id);
create index idx_transfers_status on public.transfers (status);
create index idx_transfers_transfer_date on public.transfers (transfer_date);
create index idx_transfers_created_at on public.transfers (created_at desc);
create index idx_transfers_created_by on public.transfers (created_by);

create index idx_receipts_payment_id on public.receipts (payment_id);
create index idx_receipts_issue_date on public.receipts (issue_date);
create index idx_receipts_document_id on public.receipts (document_id);
create index idx_receipts_created_at on public.receipts (created_at desc);
create index idx_receipts_created_by on public.receipts (created_by);

create index idx_activity_logs_user_id on public.activity_logs (user_id);
create index idx_activity_logs_entity_lookup on public.activity_logs (entity_type, entity_id);
create index idx_activity_logs_created_at on public.activity_logs (created_at desc);
create index idx_activity_logs_metadata_gin on public.activity_logs using gin (metadata);
