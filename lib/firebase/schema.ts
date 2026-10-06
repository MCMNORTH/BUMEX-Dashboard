// Table metadata carried over from the former Postgres schema (supabase/*.sql).
// Firestore has no column defaults, unique constraints, foreign keys or
// triggers, so the data layer applies these rules itself on every write.

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();

type DefaultValue = unknown | (() => unknown);

type TableSchema = {
  defaults: Record<string, DefaultValue>;
  // Tables without an `id` column are keyed by these columns; the document id
  // is their values joined with "__" (the migration script uses the same rule).
  primaryKey?: string[];
  // Each entry lists the columns of one unique constraint, keyed by the
  // original Postgres constraint name so error messages stay recognizable.
  unique?: Record<string, string[]>;
  // Mirrors `before update` triggers that stamp updated_at.
  touchUpdatedAt?: boolean;
};

const timestamps = { created_at: now, updated_at: now };

export const TABLES: Record<string, TableSchema> = {
  profiles: {
    defaults: {
      ...timestamps,
      role: "employee",
      is_super_admin: false,
      entity_code: null,
      skills: () => [],
      availability_status: "available",
      weekly_capacity_hours: 40,
    },
    unique: { profiles_email_key: ["email"] },
  },
  teams: {
    defaults: { created_at: now },
    unique: { teams_name_unique: ["name"] },
  },
  team_members: {
    defaults: { role: "employee" },
    unique: { team_members_unique_membership: ["user_id", "team_id"] },
  },
  clients: {
    defaults: { ...timestamps, type: "company", status: "prospect" },
    unique: { clients_name_unique: ["name"] },
  },
  projects: {
    defaults: { created_at: now, status: "draft", priority: "medium", project_kind: "client_mission" },
    unique: { projects_client_name_unique: ["client_id", "name"] },
  },
  project_members: {
    defaults: { role: "employee" },
    unique: { project_members_unique_membership: ["project_id", "user_id"] },
  },
  tasks: {
    defaults: { ...timestamps, status: "todo", priority: "medium", type: "task" },
  },
  task_dependencies: {
    defaults: {},
    unique: { task_dependencies_unique: ["task_id", "depends_on_task_id"] },
  },
  milestones: {
    defaults: { ...timestamps, status: "planned" },
  },
  contracts: {
    defaults: { ...timestamps, status: "draft", contract_type: "development", currency: "USD" },
    unique: { contracts_client_title_unique: ["client_id", "title"] },
  },
  invoices: {
    defaults: { ...timestamps, tax_amount: 0, currency: "USD", status: "draft", approval_status: "pending" },
    unique: { invoices_invoice_number_key: ["invoice_number"] },
  },
  documents: {
    defaults: {
      ...timestamps,
      document_type: "other",
      related_type: "archive",
      related_id: null,
      file_size: 0,
      visibility: "internal",
      is_archived: false,
    },
  },
  payments: {
    defaults: { ...timestamps, currency: "USD", method: "bank_transfer", status: "expected" },
  },
  transfers: {
    defaults: { ...timestamps, currency: "USD", status: "planned", category: "other" },
    unique: { transfers_transfer_reference_key: ["transfer_reference"] },
  },
  receipts: {
    defaults: { ...timestamps },
    unique: { receipts_receipt_number_key: ["receipt_number"] },
  },
  activity_logs: {
    defaults: { created_at: now, metadata: () => ({}) },
  },
  comments: {
    defaults: { ...timestamps, is_internal: true, deleted_at: null },
  },
  comment_attachments: {
    defaults: { created_at: now },
  },
  mentions: {
    defaults: { created_at: now },
    unique: { mentions_unique_comment_user: ["comment_id", "mentioned_user_id"] },
  },
  notifications: {
    defaults: { created_at: now, entity_type: "system", is_read: false, archived_at: null },
  },
  internal_notes: {
    defaults: { ...timestamps, visibility: "team", pinned: false, archived_at: null },
  },
  staffing_assignments: {
    defaults: { ...timestamps, status: "draft", note: null, created_by: null },
    unique: { staffing_assignments_unique_period: ["project_id", "user_id", "start_date", "end_date"] },
    touchUpdatedAt: true,
  },
  time_entries: {
    defaults: { ...timestamps, note: "", mission: "" },
  },
  time_mission_favorites: {
    defaults: { created_at: now },
    primaryKey: ["user_id", "project_id", "mission"],
  },
  timesheet_reminders: {
    defaults: { created_at: now, sent_date: () => new Date().toISOString().slice(0, 10), entity_code: null },
    primaryKey: ["user_id", "week_start", "sent_date"],
  },
  timesheet_week_events: {
    defaults: { created_at: now, actor_id: null, note: null },
  },
  timesheet_week_status: {
    defaults: { status: "submitted", submitted_at: now, reviewed_at: null, reviewed_by: null, review_note: null },
    primaryKey: ["user_id", "week_start"],
  },
  timesheet_weekly_reminders: {
    defaults: { created_at: now, entity_code: null },
    primaryKey: ["user_id", "week_start"],
  },
  notification_email_outbox: {
    defaults: {
      created_at: now,
      status: "pending",
      attempts: 0,
      next_attempt_at: now,
      locked_at: null,
      last_error: null,
      sent_at: null,
    },
    unique: { notification_email_outbox_notification_id_key: ["notification_id"] },
  },
  bank_statements: {
    defaults: { ...timestamps, currency: "USD" },
  },
  bank_statement_lines: {
    defaults: {
      created_at: now,
      credit_amount: 0,
      debit_amount: 0,
      currency: "USD",
      match_status: "unmatched",
    },
  },
};

export function getTableSchema(table: string): TableSchema {
  const schema = TABLES[table];

  if (!schema) {
    throw new Error(`Unknown table "${table}".`);
  }

  return schema;
}

export function documentIdFor(table: string, row: Row) {
  const { primaryKey } = getTableSchema(table);

  if (!primaryKey) {
    return String(row.id);
  }

  return primaryKey.map((column) => String(row[column])).join("__").replace(/\//g, "_");
}

export function applyDefaults(table: string, row: Row): Row {
  const { defaults, primaryKey } = getTableSchema(table);
  const next: Row = primaryKey ? {} : { id: row.id ?? crypto.randomUUID() };

  for (const [column, value] of Object.entries(defaults)) {
    next[column] = typeof value === "function" ? (value as () => unknown)() : value;
  }

  for (const [column, value] of Object.entries(row)) {
    if (value !== undefined) {
      next[column] = value;
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Foreign keys referencing each table, with their `on delete` behavior.
// Only tables the application deletes from (or that cascade into them) need
// entries; anything absent has no inbound references.
// ---------------------------------------------------------------------------

export type OnDelete = "cascade" | "set null" | "restrict";

export type InboundReference = {
  table: string;
  column: string;
  onDelete: OnDelete;
};

export const INBOUND_REFERENCES: Record<string, InboundReference[]> = {
  projects: [
    { table: "time_entries", column: "project_id", onDelete: "restrict" },
    { table: "project_members", column: "project_id", onDelete: "cascade" },
    { table: "staffing_assignments", column: "project_id", onDelete: "cascade" },
    { table: "time_mission_favorites", column: "project_id", onDelete: "cascade" },
    { table: "tasks", column: "project_id", onDelete: "cascade" },
    { table: "milestones", column: "project_id", onDelete: "cascade" },
    { table: "contracts", column: "project_id", onDelete: "set null" },
    { table: "invoices", column: "project_id", onDelete: "set null" },
    { table: "payments", column: "project_id", onDelete: "set null" },
    { table: "transfers", column: "related_project_id", onDelete: "set null" },
  ],
  tasks: [
    { table: "task_dependencies", column: "task_id", onDelete: "cascade" },
    { table: "task_dependencies", column: "depends_on_task_id", onDelete: "cascade" },
  ],
  clients: [
    { table: "projects", column: "client_id", onDelete: "restrict" },
    { table: "contracts", column: "client_id", onDelete: "restrict" },
    { table: "invoices", column: "client_id", onDelete: "restrict" },
    { table: "payments", column: "client_id", onDelete: "restrict" },
    { table: "transfers", column: "related_client_id", onDelete: "set null" },
  ],
  contracts: [
    { table: "invoices", column: "contract_id", onDelete: "set null" },
    { table: "payments", column: "contract_id", onDelete: "set null" },
  ],
  invoices: [{ table: "payments", column: "invoice_id", onDelete: "set null" }],
  payments: [{ table: "receipts", column: "payment_id", onDelete: "cascade" }],
  documents: [
    { table: "receipts", column: "document_id", onDelete: "set null" },
    { table: "comment_attachments", column: "document_id", onDelete: "set null" },
  ],
  notifications: [{ table: "notification_email_outbox", column: "notification_id", onDelete: "cascade" }],
  comments: [
    { table: "comment_attachments", column: "comment_id", onDelete: "cascade" },
    { table: "mentions", column: "comment_id", onDelete: "cascade" },
  ],
  teams: [{ table: "team_members", column: "team_id", onDelete: "cascade" }],
  bank_statements: [{ table: "bank_statement_lines", column: "statement_id", onDelete: "cascade" }],
};
