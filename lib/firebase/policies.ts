import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { AppRole } from "@/types/auth";

// ---------------------------------------------------------------------------
// TypeScript port of the row level security policies that were live on the
// Supabase project (pg_policies + the private.can_* helpers) when it was
// migrated. Firestore is only reached through the Admin SDK, so these checks
// are what keep users scoped to the rows they may see.
//
// Semantics follow Postgres RLS:
// - select / update-using / delete: rows failing the policy are silently
//   skipped (never an error).
// - insert / update-check: a failing row aborts the write with an error.
// - "for all" policies also grant select, like in Postgres.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

type Command = "select" | "insert" | "update" | "delete";

const CORE = ["projects", "project_members", "tasks", "clients"];
const FINANCE = [...CORE, "contracts", "invoices", "payments", "transfers"];
const EVERYTHING = [...FINANCE, "receipts", "milestones", "documents"];

// Snapshot tables each policy may consult, per role class.
const DEPENDENCIES: Record<string, string[]> = {
  profiles: CORE,
  teams: ["team_members"],
  team_members: ["team_members"],
  clients: CORE,
  projects: CORE,
  project_members: CORE,
  tasks: CORE,
  task_dependencies: CORE,
  milestones: CORE,
  contracts: [...CORE, "contracts"],
  invoices: [...CORE, "contracts", "invoices"],
  payments: [...CORE, "contracts", "invoices", "payments"],
  transfers: CORE,
  receipts: [...CORE, "contracts", "invoices", "payments", "receipts"],
  documents: FINANCE,
  activity_logs: EVERYTHING,
  comments: EVERYTHING,
  comment_attachments: [...EVERYTHING, "comments"],
  mentions: EVERYTHING,
  notifications: EVERYTHING,
  internal_notes: [...CORE, "contracts"],
  staffing_assignments: [],
  time_entries: CORE,
  time_mission_favorites: CORE,
  timesheet_reminders: [],
  timesheet_week_events: [],
  timesheet_week_status: [],
  timesheet_weekly_reminders: [],
  notification_email_outbox: [],
  timesheet_projects: CORE,
  timesheet_missions: CORE,
  bank_statements: [],
  bank_statement_lines: ["bank_statements"],
};

// Admins pass nearly every policy outright; these are the exceptions where
// the SQL still dereferences related rows for them.
const ADMIN_DEPENDENCIES: Record<string, string[]> = {
  comments: ["contracts", "documents", "invoices", "payments", "transfers", "tasks"],
  comment_attachments: ["comments", "contracts", "documents", "invoices", "payments", "transfers", "tasks"],
  mentions: ["contracts", "documents", "invoices", "payments", "transfers", "tasks"],
  internal_notes: ["contracts"],
  time_entries: CORE,
  time_mission_favorites: CORE,
  timesheet_projects: CORE,
  timesheet_missions: CORE,
  bank_statement_lines: ["bank_statements"],
};

class Snapshot {
  private byId = new Map<string, Row>();

  constructor(readonly rows: Row[]) {
    for (const row of rows) {
      this.byId.set(String(row.id), row);
    }
  }

  get(id: unknown) {
    return id == null ? undefined : this.byId.get(String(id));
  }
}

const EMPTY = new Snapshot([]);

export class AccessPolicy {
  private snapshots = new Map<string, Promise<Snapshot>>();
  private resolved = new Map<string, Snapshot>();
  private memo = new Map<string, boolean>();

  constructor(
    readonly uid: string,
    readonly role: AppRole | null,
    private readonly viewer: ViewerProfile = { entityCode: null, isSuperAdmin: false },
  ) {}

  get entityCode() {
    return this.viewer.entityCode;
  }

  get isSuperAdmin() {
    return this.viewer.isSuperAdmin;
  }

  // ---- snapshot management ----------------------------------------------

  async prepare(table: string) {
    const deps = this.isAdmin ? ADMIN_DEPENDENCIES[table] ?? [] : DEPENDENCIES[table] ?? [];
    await Promise.all(deps.map((dep) => this.load(dep)));
  }

  private load(table: string) {
    let pending = this.snapshots.get(table);

    if (!pending) {
      pending = adminDb()
        .collection(table)
        .get()
        .then((result) => {
          const snapshot = new Snapshot(result.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          this.resolved.set(table, snapshot);
          return snapshot;
        });
      this.snapshots.set(table, pending);
    }

    return pending;
  }

  invalidate(table: string) {
    this.snapshots.delete(table);
    this.resolved.delete(table);
    this.memo.clear();
  }

  private t(table: string) {
    return this.resolved.get(table) ?? EMPTY;
  }

  private cached(key: string, compute: () => boolean) {
    const hit = this.memo.get(key);

    if (hit !== undefined) {
      return hit;
    }

    const value = compute();
    this.memo.set(key, value);
    return value;
  }

  // ---- role helpers (private.is_*) ----------------------------------------

  private get isAdmin() {
    return this.role === "admin";
  }

  // Live `private.is_manager()` only matches the manager role (supervisors
  // are not granted manager rights by the database).
  private get isManager() {
    return this.role === "manager";
  }

  private get isEmployee() {
    return this.role === "employee";
  }

  private get isShareholder() {
    return this.role === "shareholder";
  }

  private get isAdminOrManager() {
    return this.isAdmin || this.isManager;
  }

  private is(value: unknown) {
    return value != null && String(value) === this.uid;
  }

  private isTeamMember(teamId: unknown) {
    return this.t("team_members").rows.some(
      (member) => String(member.team_id) === String(teamId) && this.is(member.user_id),
    );
  }

  private isProjectMember(projectId: unknown) {
    return this.t("project_members").rows.some(
      (member) => String(member.project_id) === String(projectId) && this.is(member.user_id),
    );
  }

  // ---- private.can_* helpers ----------------------------------------------

  canManageProject(projectId: unknown): boolean {
    if (this.isAdmin) return true;
    if (!this.isManager || projectId == null) return false;

    return this.cached(`manageProject:${projectId}`, () => {
      const project = this.t("projects").get(projectId);
      return Boolean(project && (this.is(project.owner_id) || this.isProjectMember(project.id)));
    });
  }

  canReadProject(projectId: unknown): boolean {
    if (this.isAdmin || this.isShareholder) return true;
    if (projectId == null) return false;

    return this.cached(`readProject:${projectId}`, () =>
      this.canManageProject(projectId)
      || this.t("tasks").rows.some(
        (task) => String(task.project_id) === String(projectId) && this.is(task.assignee_id),
      ),
    );
  }

  private canReadTaskRow(task: Row | undefined) {
    if (this.isAdmin || this.isShareholder) return true;
    return Boolean(task && (this.is(task.assignee_id) || this.canManageProject(task.project_id)));
  }

  canReadTask(taskId: unknown) {
    if (this.isAdmin || this.isShareholder) return true;
    return this.canReadTaskRow(this.t("tasks").get(taskId));
  }

  canManageMilestones(projectId: unknown) {
    if (this.isAdmin) return true;
    if (!this.isManager) return false;
    const project = this.t("projects").get(projectId);
    return Boolean(project && this.is(project.owner_id));
  }

  canReadMilestone(milestoneId: unknown) {
    const milestone = this.t("milestones").get(milestoneId);
    return Boolean(milestone && this.canReadProject(milestone.project_id));
  }

  canReadClient(clientId: unknown): boolean {
    if (this.isAdmin || this.isShareholder) return true;
    if (clientId == null) return false;

    return this.cached(`readClient:${clientId}`, () => {
      const key = String(clientId);

      if (this.isManager) {
        const client = this.t("clients").get(clientId);

        if (client && this.is(client.account_manager_id)) {
          return true;
        }

        return this.t("projects").rows.some(
          (project) =>
            String(project.client_id) === key
            && (this.is(project.owner_id) || this.isProjectMember(project.id)),
        );
      }

      if (this.isEmployee) {
        return this.t("tasks").rows.some((task) => {
          if (!this.is(task.assignee_id)) return false;
          const project = this.t("projects").get(task.project_id);
          return Boolean(project && String(project.client_id) === key);
        });
      }

      return false;
    });
  }

  private canReadContractRow(contract: Row | undefined) {
    if (!contract) return false;
    return this.canReadClient(contract.client_id)
      || (contract.project_id != null && this.canReadProject(contract.project_id));
  }

  canReadContract(contractId: unknown) {
    return this.canReadContractRow(this.t("contracts").get(contractId));
  }

  private canManageContractRow(contract: Row | undefined) {
    if (this.isAdmin) return true;
    if (!contract || !this.isManager) return false;
    const client = this.t("clients").get(contract.client_id);
    return Boolean(
      (client && this.is(client.account_manager_id))
      || (contract.project_id != null && this.canManageProject(contract.project_id)),
    );
  }

  canManageContract(contractId: unknown) {
    if (this.isAdmin) return true;
    return this.canManageContractRow(this.t("contracts").get(contractId));
  }

  canManageClientFinance(clientId: unknown) {
    if (this.isAdmin) return true;
    if (!this.isManager) return false;
    const client = this.t("clients").get(clientId);
    return Boolean(client && this.is(client.account_manager_id));
  }

  private canReadInvoiceRow(invoice: Row | undefined): boolean {
    if (this.isAdmin) return true;
    if (!invoice) return false;

    if (this.isManager) {
      return this.canManageClientFinance(invoice.client_id)
        || (invoice.project_id != null && this.canManageProject(invoice.project_id))
        || (invoice.contract_id != null && this.canManageContract(invoice.contract_id));
    }

    return false;
  }

  canReadInvoice(invoiceId: unknown) {
    if (this.isAdmin) return true;
    return this.canReadInvoiceRow(this.t("invoices").get(invoiceId));
  }

  private canReadPaymentRow(payment: Row | undefined): boolean {
    if (this.isAdmin) return true;
    if (!payment) return false;

    if (this.isManager) {
      return this.canManagePaymentScope(payment);
    }

    return false;
  }

  private canManagePaymentScope(payment: Row) {
    return this.canManageClientFinance(payment.client_id)
      || (payment.project_id != null && this.canManageProject(payment.project_id))
      || (payment.contract_id != null && this.canManageContract(payment.contract_id))
      || (payment.invoice_id != null && this.canReadInvoice(payment.invoice_id));
  }

  canReadPayment(paymentId: unknown) {
    if (this.isAdmin) return true;
    return this.canReadPaymentRow(this.t("payments").get(paymentId));
  }

  private canReadTransferRow(transfer: Row | undefined) {
    if (this.isAdmin) return true;
    if (!transfer) return false;

    if (this.isManager) {
      return this.canManageTransferScope(transfer);
    }

    return false;
  }

  private canManageTransferScope(transfer: Row) {
    return (transfer.related_project_id != null && this.canManageProject(transfer.related_project_id))
      || (transfer.related_client_id != null && this.canManageClientFinance(transfer.related_client_id));
  }

  canReadTransfer(transferId: unknown) {
    if (this.isAdmin) return true;
    return this.canReadTransferRow(this.t("transfers").get(transferId));
  }

  canReadReceipt(receiptId: unknown) {
    if (this.isAdmin) return true;
    const receipt = this.t("receipts").get(receiptId);
    return Boolean(receipt && this.canReadPayment(receipt.payment_id));
  }

  canManageDocument(relatedType: unknown, relatedId: unknown) {
    if (this.isAdmin) return true;

    switch (relatedType) {
      case "archive":
        return this.isManager;
      case "project":
        return this.canManageProject(relatedId);
      case "task": {
        const task = this.t("tasks").get(relatedId);
        return Boolean(task && this.canManageProject(task.project_id));
      }
      case "client": {
        const client = this.t("clients").get(relatedId);
        return Boolean(client && this.is(client.account_manager_id));
      }
      case "contract":
        return this.canManageContract(relatedId);
      case "payment":
        return this.canReadPayment(relatedId);
      default:
        return false;
    }
  }

  private canReadRelated(relatedType: unknown, relatedId: unknown, allowed: string[]) {
    if (!allowed.includes(String(relatedType))) return false;

    switch (relatedType) {
      case "project":
        return this.canReadProject(relatedId);
      case "task":
        return this.canReadTask(relatedId);
      case "client":
        return this.canReadClient(relatedId);
      case "contract":
        return this.canReadContract(relatedId);
      case "invoice":
        return this.canReadInvoice(relatedId);
      case "payment":
        return this.canReadPayment(relatedId);
      case "transfer":
        return this.canReadTransfer(relatedId);
      default:
        return false;
    }
  }

  canReadDocumentRow(document: Row | undefined) {
    if (!document) return false;
    if (this.isAdmin) return true;

    const { related_type: type, related_id: id, visibility } = document;
    const all = ["project", "task", "client", "contract", "payment"];

    if (type === "archive") {
      return visibility === "shareholders"
        ? this.isShareholder || this.isAdminOrManager
        : this.isAdminOrManager;
    }

    if (visibility === "restricted") return this.canManageDocument(type, id);
    if (visibility === "management") return this.isAdminOrManager && this.canReadRelated(type, id, all);
    if (visibility === "shareholders") {
      return this.isShareholder && this.canReadRelated(type, id, all.filter((kind) => kind !== "task"));
    }
    if (this.isManager) return this.canReadRelated(type, id, all);
    if (this.isEmployee) return this.canReadRelated(type, id, ["project", "task", "client", "contract"]);
    return false;
  }

  private canReadDocument(documentId: unknown) {
    return this.canReadDocumentRow(this.t("documents").get(documentId));
  }

  canReadActivityLog(userId: unknown, entityType: unknown, entityId: unknown) {
    if (this.isAdmin || this.is(userId)) return true;
    if (!this.isManager) return false;

    switch (entityType) {
      case "project":
        return this.canReadProject(entityId);
      case "milestone":
        return this.canReadMilestone(entityId);
      case "task":
        return this.canReadTask(entityId);
      case "client":
        return this.canReadClient(entityId);
      case "contract":
        return this.canReadContract(entityId);
      case "invoice":
        return this.canReadInvoice(entityId);
      case "receipt":
        return this.canReadReceipt(entityId);
      case "document":
        return this.canReadDocument(entityId);
      case "payment":
        return this.canReadPayment(entityId);
      case "team":
        return true;
      case "profile":
        return this.is(userId);
      case "transfer":
        return this.canReadTransfer(entityId);
      default:
        return false;
    }
  }

  canReadCommentEntity(entityType: unknown, entityId: unknown) {
    switch (entityType) {
      case "project":
        return this.canReadProject(entityId);
      case "ticket":
        return this.canReadTask(entityId);
      case "client":
        return this.canReadClient(entityId);
      case "contract":
        return this.canReadContract(entityId);
      case "document":
        return this.canReadDocument(entityId);
      case "invoice":
        return this.canReadInvoice(entityId);
      case "payment":
        return this.canReadPayment(entityId);
      case "transfer":
        return this.canReadTransfer(entityId);
      default:
        return false;
    }
  }

  canCommentOnEntity(entityType: unknown, entityId: unknown) {
    if (this.isAdmin || this.isManager) return this.canReadCommentEntity(entityType, entityId);
    if (this.isEmployee) {
      return (entityType === "project" && this.canReadProject(entityId))
        || (entityType === "ticket" && this.canReadTask(entityId));
    }
    return false;
  }

  canReadNotificationEntity(entityType: unknown, entityId: unknown) {
    switch (entityType) {
      case "milestone":
        return this.canReadMilestone(entityId);
      case "project":
      case "ticket":
      case "client":
      case "contract":
      case "document":
      case "invoice":
      case "payment":
      case "transfer":
        return this.canReadCommentEntity(entityType, entityId);
      default:
        return true;
    }
  }

  canReadNoteEntity(entityType: unknown, entityId: unknown) {
    switch (entityType) {
      case "project":
        return this.canReadProject(entityId);
      case "client":
        return this.canReadClient(entityId);
      case "contract":
        return this.canReadContract(entityId);
      case "finance":
      case "shareholder":
        return this.isAdminOrManager || this.isShareholder;
      default:
        return false;
    }
  }

  canManageNoteEntity(entityType: unknown, entityId: unknown) {
    if (this.isAdmin) return true;
    if (this.isManager) return this.canReadNoteEntity(entityType, entityId);
    if (this.isEmployee) {
      return ["project", "client", "contract"].includes(String(entityType))
        && this.canReadNoteEntity(entityType, entityId);
    }
    return false;
  }

  canReadNoteVisibility(visibility: unknown, authorId: unknown) {
    if (this.isAdmin) return true;

    switch (visibility) {
      case "private":
        return this.is(authorId);
      case "team":
        return this.isManager || this.isEmployee;
      case "management":
        return this.isManager;
      case "shareholders":
        return this.isManager || this.isShareholder;
      default:
        return false;
    }
  }

  canUseNoteVisibility(visibility: unknown) {
    if (this.isAdmin) return true;
    if (this.isManager) return ["private", "team", "management", "shareholders"].includes(String(visibility));
    if (this.isEmployee) return ["private", "team"].includes(String(visibility));
    return false;
  }

  // ---- entity-scoped helpers (timesheet / staffing policies) ---------------

  // `me.role = 'manager' and me.entity_code = <row entity>`
  private isEntityManager(entityCode: unknown) {
    return this.isManager && entityCode != null && this.entityCode === entityCode;
  }

  private isStaffingManagerFor(entityCode: unknown) {
    return this.isAdmin || this.isEntityManager(entityCode);
  }

  // `p.entity_code = <row entity> or p.is_super_admin` for the viewer.
  private worksInEntity(entityCode: unknown) {
    return this.isSuperAdmin || (entityCode != null && this.entityCode === entityCode);
  }

  private projectEntity(projectId: unknown) {
    return this.t("projects").get(projectId)?.entity_code ?? null;
  }

  private canWriteOwnTimeEntry(row: Row) {
    const project = this.t("projects").get(row.project_id);
    return this.is(row.user_id)
      && Boolean(project && project.entity_code === row.entity_code)
      && this.worksInEntity(row.entity_code);
  }

  /** Rows of the `timesheet_projects` view (security_invoker) for the viewer. */
  timesheetProjects(): Row[] {
    return this.t("projects").rows
      .filter((project) =>
        this.canReadProject(project.id)
        && (
          this.isAdmin
          || this.isSuperAdmin
          || this.is(project.owner_id)
          || this.isProjectMember(project.id)
          || this.t("tasks").rows.some(
            (task) => String(task.project_id) === String(project.id) && this.is(task.assignee_id),
          )
        ))
      .map((project) => ({ id: project.id, name: project.name, entity_code: project.entity_code ?? null }));
  }

  private isTimesheetProject(projectId: unknown, entityCode: unknown) {
    return this.cached(`timesheetProject:${projectId}:${entityCode}`, () =>
      this.timesheetProjects().some(
        (project) => String(project.id) === String(projectId) && project.entity_code === entityCode,
      ),
    );
  }

  // ---- table policies -----------------------------------------------------

  allows(table: string, command: Command, row: Row, phase: "using" | "check" = "using"): boolean {
    const policy = this.policies[table];

    if (!policy) {
      return false;
    }

    const forAll = policy.all?.[phase] ?? (phase === "check" ? policy.all?.using : undefined);

    if (command === "select") {
      return Boolean(policy.select?.(row) || policy.all?.using?.(row));
    }

    const specific = policy[command];
    const specificCheck =
      typeof specific === "function"
        ? specific
        : specific?.[phase] ?? (phase === "check" ? specific?.using : undefined);

    return Boolean(specificCheck?.(row) || forAll?.(row));
  }

  private readonly policies: Record<string, TablePolicy> = {
    profiles: {
      // Every signed-in user may read profiles (policy `using (true)`).
      select: () => this.uid !== "",
      update: { using: (row) => this.is(row.id) || this.isAdmin || this.isManager },
      insert: () => this.isAdmin,
      delete: () => this.isAdmin,
    },
    teams: {
      select: (row) => this.isAdmin || this.isManager || this.isTeamMember(row.id),
      all: { using: () => this.isAdmin || this.isManager },
    },
    team_members: {
      select: (row) =>
        this.isAdmin || this.isManager || this.is(row.user_id) || this.isTeamMember(row.team_id),
      all: { using: () => this.isAdmin || this.isManager },
    },
    clients: {
      select: (row) => this.canReadClient(row.id),
      all: { using: (row) => this.isAdmin || (this.isManager && this.is(row.account_manager_id)) },
    },
    projects: {
      select: (row) => this.canReadProject(row.id),
      insert: (row) => this.isAdmin || (this.isManager && this.is(row.owner_id)),
      update: { using: (row) => this.canManageProject(row.id) },
      delete: (row) => this.canManageProject(row.id),
    },
    project_members: {
      select: (row) => this.canReadProject(row.project_id),
      all: {
        using: (row) =>
          this.canManageProject(row.project_id) || this.isStaffingManagerFor(this.projectEntity(row.project_id)),
      },
    },
    tasks: {
      select: (row) => this.canReadTaskRow(row),
      insert: (row) => this.isAdmin || this.canManageProject(row.project_id),
      update: {
        using: (row) => this.isAdmin || this.canManageProject(row.project_id) || this.is(row.assignee_id),
      },
      delete: (row) => this.isAdmin || this.canManageProject(row.project_id),
    },
    task_dependencies: {
      select: (row) => this.canReadTask(row.task_id) && this.canReadTask(row.depends_on_task_id),
      all: {
        using: (row) => {
          if (this.isAdmin) return true;
          const task = this.t("tasks").get(row.task_id);
          return Boolean(task && this.canManageProject(task.project_id));
        },
      },
    },
    milestones: {
      select: (row) => this.canReadProject(row.project_id),
      insert: (row) => this.canManageMilestones(row.project_id),
      update: { using: (row) => this.canManageMilestones(row.project_id) },
      delete: (row) => this.canManageMilestones(row.project_id),
    },
    contracts: {
      select: (row) => this.canReadContractRow(row),
      all: {
        using: (row) => this.canManageContract(row.id),
        check: (row) => {
          if (this.isAdmin) return true;
          if (!this.isManager) return false;
          const client = this.t("clients").get(row.client_id);
          return Boolean(
            (client && this.is(client.account_manager_id))
            || (row.project_id != null && this.canManageProject(row.project_id)),
          );
        },
      },
    },
    invoices: {
      select: (row) => this.canReadInvoiceRow(row),
      all: {
        using: (row) =>
          this.isAdmin
          || (this.isManager && (
            this.canManageClientFinance(row.client_id)
            || (row.project_id != null && this.canManageProject(row.project_id))
            || (row.contract_id != null && this.canManageContract(row.contract_id))
          )),
      },
    },
    documents: {
      select: (row) => this.canReadDocumentRow(row),
      insert: (row) => this.canManageDocument(row.related_type, row.related_id) && this.is(row.uploaded_by),
      update: { using: (row) => this.canManageDocument(row.related_type, row.related_id) },
      delete: (row) => this.canManageDocument(row.related_type, row.related_id),
    },
    payments: {
      select: (row) => this.canReadPaymentRow(row),
      all: { using: (row) => this.isAdmin || (this.isManager && this.canManagePaymentScope(row)) },
    },
    transfers: {
      select: (row) => this.canReadTransferRow(row),
      all: { using: (row) => this.isAdmin || (this.isManager && this.canManageTransferScope(row)) },
    },
    receipts: {
      select: (row) => this.isAdmin || this.canReadPayment(row.payment_id),
      all: { using: (row) => this.isAdmin || (this.isManager && this.canReadPayment(row.payment_id)) },
    },
    activity_logs: {
      select: (row) => this.canReadActivityLog(row.user_id, row.entity_type, row.entity_id),
      insert: (row) => this.isAdmin || this.is(row.user_id),
      update: { using: () => this.isAdmin },
      delete: () => this.isAdmin,
    },
    comments: {
      select: (row) =>
        this.canReadCommentEntity(row.entity_type, row.entity_id)
        && (!this.isShareholder || !row.is_internal),
      insert: (row) =>
        this.is(row.author_id)
        && this.canCommentOnEntity(row.entity_type, row.entity_id)
        && !this.isShareholder,
      update: { using: (row) => this.isAdmin || this.is(row.author_id) },
      delete: () => this.isAdmin,
    },
    comment_attachments: {
      select: (row) => {
        const comment = this.t("comments").get(row.comment_id);
        return Boolean(
          comment
          && this.canReadCommentEntity(comment.entity_type, comment.entity_id)
          && (!this.isShareholder || !comment.is_internal),
        );
      },
      insert: (row) => {
        const comment = this.t("comments").get(row.comment_id);
        return Boolean(comment && (this.isAdmin || this.is(comment.author_id)));
      },
      update: { using: () => this.isAdmin },
      delete: (row) => {
        if (this.isAdmin) return true;
        const comment = this.t("comments").get(row.comment_id);
        return Boolean(comment && this.is(comment.author_id));
      },
    },
    mentions: {
      select: (row) => this.isAdmin || this.is(row.mentioned_user_id) || this.is(row.mentioned_by),
      insert: (row) => this.is(row.mentioned_by) && this.canCommentOnEntity(row.entity_type, row.entity_id),
      delete: () => this.isAdmin,
    },
    notifications: {
      select: (row) =>
        this.isAdmin
        || (this.is(row.user_id) && this.canReadNotificationEntity(row.entity_type, row.entity_id)),
      insert: (row) =>
        this.isAdminOrManager || this.canReadNotificationEntity(row.entity_type, row.entity_id),
      update: { using: (row) => this.isAdmin || this.is(row.user_id) },
      delete: () => this.isAdmin,
    },
    internal_notes: {
      select: (row) =>
        this.canReadNoteEntity(row.entity_type, row.entity_id)
        && this.canReadNoteVisibility(row.visibility, row.author_id)
        && row.archived_at == null,
      insert: (row) =>
        this.is(row.author_id)
        && this.canManageNoteEntity(row.entity_type, row.entity_id)
        && this.canUseNoteVisibility(row.visibility),
      update: {
        using: (row) =>
          this.isAdmin
          || ((this.isManager || this.is(row.author_id))
            && this.canManageNoteEntity(row.entity_type, row.entity_id)),
        check: (row) =>
          this.isAdmin
          || ((this.isManager || this.is(row.author_id))
            && this.canManageNoteEntity(row.entity_type, row.entity_id)
            && this.canUseNoteVisibility(row.visibility)),
      },
      delete: () => this.isAdmin,
    },
    staffing_assignments: {
      select: (row) => this.isAdmin || this.is(row.user_id) || this.isStaffingManagerFor(row.entity_code),
      all: { using: (row) => this.isStaffingManagerFor(row.entity_code) },
    },
    time_entries: {
      select: (row) =>
        this.isAdmin
        || this.isEntityManager(row.entity_code)
        || (this.is(row.user_id) && this.worksInEntity(row.entity_code)),
      insert: (row) => this.canWriteOwnTimeEntry(row) || this.isTimesheetProject(row.project_id, row.entity_code),
      update: {
        using: (row) => this.is(row.user_id) || this.isTimesheetProject(row.project_id, row.entity_code),
        check: (row) => this.canWriteOwnTimeEntry(row) || this.isTimesheetProject(row.project_id, row.entity_code),
      },
    },
    time_mission_favorites: {
      select: (row) => this.is(row.user_id),
      insert: (row) =>
        this.is(row.user_id)
        && this.worksInEntity(row.entity_code)
        && this.isTimesheetProject(row.project_id, row.entity_code),
      delete: (row) => this.is(row.user_id),
    },
    timesheet_reminders: {
      select: (row) => this.isAdmin || this.is(row.sent_by),
      insert: (row) => this.is(row.sent_by) && (this.isAdmin || this.isEntityManager(row.entity_code)),
    },
    timesheet_week_events: {
      select: (row) => this.is(row.user_id) || this.isAdmin || this.isEntityManager(row.entity_code),
    },
    timesheet_week_status: {
      select: (row) => this.is(row.user_id) || this.isAdmin || this.isEntityManager(row.entity_code),
      insert: (row) =>
        this.is(row.user_id)
        && row.status === "submitted"
        && row.reviewed_at == null
        && row.reviewed_by == null
        && this.worksInEntity(row.entity_code),
      update: {
        using: (row) => this.isAdmin || this.is(row.user_id) || this.isEntityManager(row.entity_code),
        check: (row) =>
          (["approved", "returned"].includes(String(row.status)) && this.is(row.reviewed_by) && row.reviewed_at != null)
          || (this.is(row.user_id)
            && row.status === "submitted"
            && row.reviewed_by == null
            && row.reviewed_at == null
            && row.review_note == null),
      },
    },
    // timesheet_weekly_reminders and notification_email_outbox have no
    // policies: only trusted server code (the admin client) may touch them.
    timesheet_weekly_reminders: {},
    notification_email_outbox: {},
    bank_statements: {
      all: { using: () => this.isAdminOrManager },
    },
    bank_statement_lines: {
      all: {
        using: (row) => Boolean(this.t("bank_statements").get(row.statement_id)) && this.isAdminOrManager,
      },
    },
  };
}

type ViewerProfile = { entityCode: string | null; isSuperAdmin: boolean };

type Check = (row: Row) => boolean;
type PhasedCheck = { using?: Check; check?: Check };

type TablePolicy = {
  select?: Check;
  insert?: Check;
  update?: PhasedCheck;
  delete?: Check;
  all?: PhasedCheck;
};
