import "server-only";

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logActivity } from "@/lib/activity/service";
import { getContracts } from "@/lib/contracts/service";
import {
  applyEntityScope,
  extendWithEntityCode,
  getCurrentEntityCode,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
import { buildTransferNotes, getDueWindowDates, parseTransferNotesMetadata } from "@/lib/finance/helpers";
import { parseFormattedNumber } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import type { ActivityLogRecord } from "@/types/activity";
import type {
  FinanceClientPreview,
  FinanceContractPreview,
  FinanceOverview,
  FinanceRiskItem,
  FinanceFilters,
  InvoiceFilters,
  InvoiceFiltersData,
  InvoiceFormValues,
  InvoiceStatusPoint,
  PaymentFiltersData,
  PaymentFormValues,
  ReceiptFormValues,
  ReceiptRecord,
  FinanceProjectPreview,
  FinanceSupportingDocument,
  FinanceUserPreview,
  InvoiceRecord,
  InvoiceSummary,
  InvoiceStatus,
  InvoicePaymentSummary,
  MonthlyFinancePoint,
  OverdueClientPoint,
  PaymentInvoicePreview,
  PaymentRecord,
  PaymentSummary,
  ShareholderFinanceSummary,
  BankStatementFormValues,
  BankStatementLineRecord,
  BankStatementMatchStatus,
  BankStatementRecord,
  BankStatementSummary,
  TransferCategory,
  TransferEntity,
  TransferFilters,
  TransferFiltersData,
  TransferFormValues,
  TransferRecord,
  UpcomingFinanceDeadline,
  TransferSummary,
} from "@/types/finance";

type ActivityRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: ActivityLogRecord["entity_type"];
  entity_id: string;
  metadata: ActivityLogRecord["metadata"];
  created_at: string;
  user:
    | {
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }
    | Array<{
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }>
    | null;
};

type InvoiceRow = Omit<
  InvoiceRecord,
  | "client"
  | "project"
  | "contract"
  | "createdBy"
  | "linkedPayments"
  | "receipts"
  | "supportingDocuments"
  | "totalPaid"
  | "remainingBalance"
  | "paymentStatus"
  | "recentActivity"
  | "viewMode"
> & {
  client: FinanceClientPreview | FinanceClientPreview[] | null;
  project: FinanceProjectPreview | FinanceProjectPreview[] | null;
  contract: FinanceContractPreview | FinanceContractPreview[] | null;
  createdBy: FinanceUserPreview | FinanceUserPreview[] | null;
};

type PaymentRow = Omit<PaymentRecord, "client" | "project" | "contract" | "invoice" | "createdBy" | "recentActivity" | "supportingDocuments" | "viewMode"> & {
  client: FinanceClientPreview | FinanceClientPreview[] | null;
  project: FinanceProjectPreview | FinanceProjectPreview[] | null;
  contract: FinanceContractPreview | FinanceContractPreview[] | null;
  invoice: PaymentInvoicePreview | PaymentInvoicePreview[] | null;
  createdBy: FinanceUserPreview | FinanceUserPreview[] | null;
};

type TransferRow = Omit<TransferRecord, "relatedProject" | "relatedClient" | "createdBy" | "recentActivity" | "supportingDocuments" | "viewMode"> & {
  relatedProject: FinanceProjectPreview | FinanceProjectPreview[] | null;
  relatedClient: FinanceClientPreview | FinanceClientPreview[] | null;
  createdBy: FinanceUserPreview | FinanceUserPreview[] | null;
};

type SupportingDocumentRow = FinanceSupportingDocument & {
  related_type: "invoice" | "payment" | "transfer";
  related_id: string;
};

type ReceiptRow = Omit<ReceiptRecord, "payment" | "document" | "createdBy" | "viewMode"> & {
  payment:
    | {
        id: string;
        reference: string | null;
        amount: number;
        currency: string;
        status: PaymentRecord["status"];
      }
    | Array<{
        id: string;
        reference: string | null;
        amount: number;
        currency: string;
        status: PaymentRecord["status"];
      }>
    | null;
  document:
    | {
        id: string;
        title: string;
        document_type: string;
      }
    | Array<{
        id: string;
        title: string;
        document_type: string;
      }>
    | null;
  createdBy: FinanceUserPreview | FinanceUserPreview[] | null;
};

type BankStatementLineRow = Omit<BankStatementLineRecord, "amount">;

type BankStatementRow = Omit<BankStatementRecord, "createdBy" | "lines"> & {
  createdBy: FinanceUserPreview | FinanceUserPreview[] | null;
};

type ScopedFinanceQuery<T> = {
  or: (filters: string) => T;
  eq: (column: string, value: string) => T;
  lt: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
};

function isMissingActivityEntityCodeError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("activity_logs")
    && message.includes("entity_code")
    && (message.includes("schema cache") || message.includes("does not exist"));
}

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapActivity(row: ActivityRow): ActivityLogRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    user: single(row.user),
  };
}

function mapPaymentRow(
  row: PaymentRow,
  role: AppRole,
  recentActivity: ActivityLogRecord[] = [],
  supportingDocuments: FinanceSupportingDocument[] = [],
): PaymentRecord {
  return {
    ...row,
    client: single(row.client),
    project: single(row.project),
    contract: single(row.contract),
    invoice: single(row.invoice),
    createdBy: single(row.createdBy),
    recentActivity,
    supportingDocuments,
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

function mapTransferRow(
  row: TransferRow,
  role: AppRole,
  recentActivity: ActivityLogRecord[] = [],
  supportingDocuments: FinanceSupportingDocument[] = [],
): TransferRecord {
  const parsedMetadata = parseTransferNotesMetadata(row.notes);

  return {
    ...row,
    entity: parsedMetadata.entity as TransferEntity,
    notes: parsedMetadata.notes,
    renewal: parsedMetadata.renewal,
    relatedProject: single(row.relatedProject),
    relatedClient: single(row.relatedClient),
    createdBy: single(row.createdBy),
    recentActivity,
    supportingDocuments,
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

async function getActivityMap(entityType: ActivityLogRecord["entity_type"], ids: string[]) {
  const supabase = await createClient();

  if (!supabase || !ids.length) {
    return new Map<string, ActivityLogRecord[]>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .or(`and(entity_type.eq.${entityType},entity_id.in.(${ids.join(",")}))`)
    .order("created_at", { ascending: false })
    .limit(150);

  query = applyEntityScope(query, entityCode);

  let { data, error } = await query.returns<ActivityRow[]>();

  if (error && isMissingActivityEntityCodeError(error)) {
    ({ data, error } = await supabase
      .from("activity_logs")
      .select(
        `
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at,
          user:profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `,
      )
      .or(`and(entity_type.eq.${entityType},entity_id.in.(${ids.join(",")}))`)
      .order("created_at", { ascending: false })
      .limit(150)
      .returns<ActivityRow[]>());
  }

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, ActivityLogRecord[]>();

  for (const activity of (data ?? []).map(mapActivity)) {
    const current = map.get(activity.entity_id) ?? [];
    current.push(activity);
    map.set(activity.entity_id, current);
  }

  return map;
}

async function getSupportingDocumentsMap(
  relatedType: SupportingDocumentRow["related_type"],
  relatedIds: string[],
) {
  const supabase = await createClient();

  if (!supabase || !relatedIds.length) {
    return new Map<string, FinanceSupportingDocument[]>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("documents")
    .select("id, title, file_name, document_type, created_at, related_type, related_id")
    .eq("related_type", relatedType)
    .in("related_id", relatedIds)
    .order("created_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.returns<SupportingDocumentRow[]>();

  if (error) {
    if (error.message.includes("invalid input value for enum document_related_type")) {
      return new Map<string, FinanceSupportingDocument[]>();
    }

    throw new Error(error.message);
  }

  const map = new Map<string, FinanceSupportingDocument[]>();

  for (const document of data ?? []) {
    const current = map.get(document.related_id) ?? [];
    current.push({
      id: document.id,
      title: document.title,
      file_name: document.file_name,
      document_type: document.document_type,
      created_at: document.created_at,
    });
    map.set(document.related_id, current);
  }

  return map;
}

function mapReceipt(row: ReceiptRow, role: AppRole): ReceiptRecord {
  return {
    ...row,
    payment: single(row.payment),
    document: single(row.document),
    createdBy: single(row.createdBy),
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

function mapBankStatementLine(row: BankStatementLineRow): BankStatementLineRecord {
  return {
    ...row,
    amount: Number(row.credit_amount ?? 0) - Number(row.debit_amount ?? 0),
  };
}

async function getReceiptsByPaymentMap(paymentIds: string[], role: AppRole) {
  const supabase = await createClient();

  if (!supabase || !paymentIds.length) {
    return new Map<string, ReceiptRecord[]>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("receipts")
    .select(
      `
        id,
        receipt_number,
        payment_id,
        issue_date,
        amount,
        document_id,
        notes,
        created_by,
        created_at,
        updated_at,
        payment:payments (
          id,
          reference,
          amount,
          currency,
          status
        ),
        document:documents (
          id,
          title,
          document_type
        ),
        createdBy:profiles!receipts_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .in("payment_id", paymentIds)
    .order("created_at", { ascending: false })
    ;

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.returns<ReceiptRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, ReceiptRecord[]>();

  for (const receipt of (data ?? []).map((row) => mapReceipt(row, role))) {
    const current = map.get(receipt.payment_id) ?? [];
    current.push(receipt);
    map.set(receipt.payment_id, current);
  }

  return map;
}

async function getPaymentsByInvoiceMap(invoiceIds: string[], role: AppRole) {
  const supabase = await createClient();

  if (!supabase || !invoiceIds.length) {
    return {
      paymentMap: new Map<string, PaymentRecord[]>(),
      receiptMap: new Map<string, ReceiptRecord[]>(),
    };
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("payments")
    .select(
      `
        id,
        invoice_id,
        client_id,
        project_id,
        contract_id,
        amount,
        currency,
        payment_date,
        due_date,
        method,
        status,
        reference,
        notes,
        created_by,
        created_at,
        updated_at,
        client:clients (
          id,
          name,
          status,
          contact_email
        ),
        project:projects (
          id,
          name,
          status,
          end_date
        ),
        contract:contracts (
          id,
          title,
          status,
          renewal_date,
          end_date
        ),
        invoice:invoices (
          id,
          invoice_number,
          status,
          due_date,
          amount_ttc
        ),
        createdBy:profiles!payments_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: false })
    ;

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.returns<PaymentRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const scopedPayments = (data ?? []).map((row) => mapPaymentRow(row, role));
  const paymentIds = scopedPayments.map((payment) => payment.id);
  const [receiptMap, supportingDocumentsMap] = await Promise.all([
    getReceiptsByPaymentMap(paymentIds, role),
    getSupportingDocumentsMap("payment", paymentIds),
  ]);

  const map = new Map<string, PaymentRecord[]>();

  for (const payment of scopedPayments) {
    if (!payment.invoice_id) {
      continue;
    }

    const current = map.get(payment.invoice_id) ?? [];
    current.push({
      ...payment,
      supportingDocuments: supportingDocumentsMap.get(payment.id) ?? [],
    });
    map.set(payment.invoice_id, current);
  }

  return {
    paymentMap: map,
    receiptMap,
  };
}

function applyScopedFilters<T extends ScopedFinanceQuery<T>>(
  query: T,
  filters: FinanceFilters,
  dueColumn: "due_date" | "transfer_date",
) {
  if (filters.search) {
    query = query.or(`reference.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  }

  if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  if (filters.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters.contractId) {
    query = query.eq("contract_id", filters.contractId);
  }

  if (filters.invoiceId) {
    query = query.eq("invoice_id", filters.invoiceId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.method) {
    query = query.eq("method", filters.method);
  }

  const { today, next7, next30 } = getDueWindowDates(filters.dueWindow);

  if (filters.dueWindow === "overdue") {
    query = query.lt(dueColumn, today);
  }

  if (filters.dueWindow === "next_7_days") {
    query = query.gte(dueColumn, today).lte(dueColumn, next7);
  }

  if (filters.dueWindow === "next_30_days") {
    query = query.gte(dueColumn, today).lte(dueColumn, next30);
  }

  return query;
}

function applyPaymentStatusSuggestion(values: {
  due_date: string | null;
  payment_date: string | null;
  status: PaymentRecord["status"];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (values.status === "reconciled") {
    return "reconciled" as PaymentRecord["status"];
  }

  if (values.payment_date) {
    return "received" as PaymentRecord["status"];
  }

  if (values.due_date) {
    const due = new Date(values.due_date);
    due.setHours(0, 0, 0, 0);

    if (due.getTime() < today.getTime() && values.status === "expected") {
      return "late" as PaymentRecord["status"];
    }
  }

  return values.status;
}

function parsePaymentPayload(values: PaymentFormValues) {
  const dueDate = values.due_date || null;
  const paymentDate = values.payment_date || null;
  const status = applyPaymentStatusSuggestion({
    due_date: dueDate,
    payment_date: paymentDate,
    status: values.status,
  });

  return {
    client_id: values.client_id,
    project_id: values.project_id || null,
    contract_id: values.contract_id || null,
    invoice_id: values.invoice_id || null,
    amount: Number(values.amount),
    currency: values.currency.trim() || "USD",
    due_date: dueDate,
    payment_date: paymentDate,
    method: values.method,
    status,
    reference: values.reference.trim() || null,
    notes: values.notes.trim() || null,
  };
}

function parseInvoicePayload(values: InvoiceFormValues) {
  return {
    invoice_number: values.invoice_number.trim(),
    client_id: values.client_id,
    project_id: values.project_id || null,
    contract_id: values.contract_id || null,
    issue_date: values.issue_date,
    due_date: values.due_date,
    amount_ht: parseFormattedNumber(values.amount_ht) ?? 0,
    tax_amount: parseFormattedNumber(values.tax_amount) ?? 0,
    amount_ttc: parseFormattedNumber(values.amount_ttc) ?? 0,
    currency: values.currency.trim() || "USD",
    status: values.status,
    notes: values.notes.trim() || null,
  };
}

async function generateInvoiceNumber(supabase: SupabaseClient) {
  void supabase;

  const raw = randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const token = raw.slice(0, 10).padEnd(10, "X");

  return `INV-${token.slice(0, 5)}-${token.slice(5, 10)}`;
}

function isDuplicateInvoiceNumberError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" && error.message?.includes("invoices_invoice_number_key") === true;
}

function parseReceiptPayload(values: ReceiptFormValues) {
  return {
    receipt_number: values.receipt_number.trim(),
    payment_id: values.payment_id,
    issue_date: values.issue_date,
    amount: Number(values.amount),
    document_id: values.document_id || null,
    notes: values.notes.trim() || null,
  };
}

export function calculateInvoicePaymentStatus(params: {
  status: InvoiceStatus;
  dueDate: string;
  amountTtc: number;
  linkedPayments: Array<Pick<PaymentRecord, "amount" | "status">>;
}) {
  if (params.status === "cancelled" || params.status === "archived") {
    return params.status;
  }

  const totalPaid = params.linkedPayments
    .filter((payment) => payment.status === "received" || payment.status === "reconciled")
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (totalPaid >= params.amountTtc && params.amountTtc > 0) {
    return "paid" satisfies InvoiceStatus;
  }

  if (totalPaid > 0 && totalPaid < params.amountTtc) {
    return "partially_paid" satisfies InvoiceStatus;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(params.dueDate);
  due.setHours(0, 0, 0, 0);

  if (due.getTime() < today.getTime()) {
    return "overdue" satisfies InvoiceStatus;
  }

  return params.status;
}

function buildInvoicePaymentSummary(invoice: {
  amount_ttc: number;
  due_date: string;
  status: InvoiceStatus;
  linkedPayments: PaymentRecord[];
  receipts: ReceiptRecord[];
}): InvoicePaymentSummary {
  const totalPaid = invoice.linkedPayments
    .filter((payment) => payment.status === "received" || payment.status === "reconciled")
    .reduce((sum, payment) => sum + payment.amount, 0);

  const paymentStatus = calculateInvoicePaymentStatus({
    status: invoice.status,
    dueDate: invoice.due_date,
    amountTtc: invoice.amount_ttc,
    linkedPayments: invoice.linkedPayments,
  });

  return {
    totalPaid,
    remainingBalance: Math.max(invoice.amount_ttc - totalPaid, 0),
    linkedPaymentsCount: invoice.linkedPayments.length,
    receiptCount: invoice.receipts.length,
    paymentStatus,
  };
}

export async function getInvoices(role: AppRole, filters: InvoiceFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("invoices")
    .select(
      `
        id,
        invoice_number,
        client_id,
        project_id,
        contract_id,
        issue_date,
        due_date,
        amount_ht,
        tax_amount,
        amount_ttc,
        currency,
        status,
        notes,
        created_by,
        created_at,
        updated_at,
        client:clients (
          id,
          name,
          status,
          contact_email
        ),
        project:projects (
          id,
          name,
          status,
          end_date
        ),
        contract:contracts (
          id,
          title,
          status,
          renewal_date,
          end_date
        ),
        createdBy:profiles!invoices_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .order("created_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  if (filters.search) {
    query = query.or(`invoice_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
  }

  if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  if (filters.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters.contractId) {
    query = query.eq("contract_id", filters.contractId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { today, next7, next30 } = getDueWindowDates(filters.dueWindow);

  if (filters.dueWindow === "overdue") {
    query = query.lt("due_date", today);
  }

  if (filters.dueWindow === "next_7_days") {
    query = query.gte("due_date", today).lte("due_date", next7);
  }

  if (filters.dueWindow === "next_30_days") {
    query = query.gte("due_date", today).lte("due_date", next30);
  }

  const { data, error } = await query.returns<InvoiceRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const invoiceIds = rows.map((item) => item.id);
  const [activity, { paymentMap, receiptMap }, supportingDocumentsMap] = await Promise.all([
    getActivityMap("invoice", invoiceIds),
    getPaymentsByInvoiceMap(invoiceIds, role),
    getSupportingDocumentsMap("invoice", invoiceIds),
  ]);

  return rows.map((row): InvoiceRecord => {
      const linkedPayments = paymentMap.get(row.id) ?? [];
      const receipts = linkedPayments.flatMap((payment) => receiptMap.get(payment.id) ?? []);
      const summary = buildInvoicePaymentSummary({
        amount_ttc: row.amount_ttc,
        due_date: row.due_date,
        status: row.status,
        linkedPayments,
        receipts,
      });

      return {
      ...row,
      entity_code: row.entity_code ?? entityCode,
      client: single(row.client),
      project: single(row.project),
      contract: single(row.contract),
      createdBy: single(row.createdBy),
      linkedPayments,
      receipts,
      supportingDocuments: supportingDocumentsMap.get(row.id) ?? [],
      totalPaid: summary.totalPaid,
      remainingBalance: summary.remainingBalance,
      paymentStatus: summary.paymentStatus,
      recentActivity: activity.get(row.id) ?? [],
      viewMode: role === "shareholder" ? "summary" : "full",
    };
  });
}

export async function getInvoiceById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("invoices")
    .select(
      `
        id,
        invoice_number,
        client_id,
        project_id,
        contract_id,
        issue_date,
        due_date,
        amount_ht,
        tax_amount,
        amount_ttc,
        currency,
        status,
        notes,
        created_by,
        created_at,
        updated_at,
        client:clients (
          id,
          name,
          status,
          contact_email
        ),
        project:projects (
          id,
          name,
          status,
          end_date
        ),
        contract:contracts (
          id,
          title,
          status,
          renewal_date,
          end_date
        ),
        createdBy:profiles!invoices_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.maybeSingle<InvoiceRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const [activity, { paymentMap, receiptMap }, supportingDocumentsMap] = await Promise.all([
    getActivityMap("invoice", [id]),
    getPaymentsByInvoiceMap([id], role),
    getSupportingDocumentsMap("invoice", [id]),
  ]);
  const linkedPayments = paymentMap.get(id) ?? [];
  const receipts = linkedPayments.flatMap((payment) => receiptMap.get(payment.id) ?? []);
  const summary = buildInvoicePaymentSummary({
    amount_ttc: data.amount_ttc,
    due_date: data.due_date,
    status: data.status,
    linkedPayments,
    receipts,
  });

  return {
    ...data,
    entity_code: data.entity_code ?? entityCode,
    client: single(data.client),
    project: single(data.project),
    contract: single(data.contract),
    createdBy: single(data.createdBy),
    linkedPayments,
    receipts,
    supportingDocuments: supportingDocumentsMap.get(id) ?? [],
    totalPaid: summary.totalPaid,
    remainingBalance: summary.remainingBalance,
    paymentStatus: summary.paymentStatus,
    recentActivity: activity.get(id) ?? [],
    viewMode: role === "shareholder" ? "summary" : "full",
  } satisfies InvoiceRecord;
}

export async function getInvoiceFiltersData(): Promise<InvoiceFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let clientsQuery = supabase.from("clients").select("id, name, status, contact_email");
  let projectsQuery = supabase.from("projects").select("id, name, status, end_date");
  let contractsQuery = supabase.from("contracts").select("id, title, status, renewal_date, end_date");
  let documentsQuery = supabase.from("documents").select("id, title, document_type");

  if (isEntityScopingEnabled()) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode);
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
    contractsQuery = contractsQuery.eq("entity_code", entityCode);
    documentsQuery = documentsQuery.eq("entity_code", entityCode);
  }

  const [clientsResult, projectsResult, contractsResult, documentsResult] = await Promise.allSettled([
    clientsQuery.order("name", { ascending: true }).returns<FinanceClientPreview[]>(),
    projectsQuery.order("name", { ascending: true }).returns<FinanceProjectPreview[]>(),
    contractsQuery.order("title", { ascending: true }).returns<FinanceContractPreview[]>(),
    documentsQuery.in("document_type", ["invoice", "receipt"]).order("created_at", { ascending: false }).returns<Array<{ id: string; title: string; document_type: string }>>(),
  ]);

  const clients = clientsResult.status === "fulfilled" && !clientsResult.value.error ? clientsResult.value.data ?? [] : [];
  const projects = projectsResult.status === "fulfilled" && !projectsResult.value.error ? projectsResult.value.data ?? [] : [];
  const contracts = contractsResult.status === "fulfilled" && !contractsResult.value.error ? contractsResult.value.data ?? [] : [];
  const documents = documentsResult.status === "fulfilled" && !documentsResult.value.error ? documentsResult.value.data ?? [] : [];

  return {
    clients,
    projects,
    contracts,
    documents,
  };
}

export async function getInvoicePayments(invoiceId: string, role: AppRole) {
  const invoice = await getInvoiceById(invoiceId, role);
  return invoice?.linkedPayments ?? [];
}

export async function getPayments(role: AppRole, filters: FinanceFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("payments")
    .select(
      `
        id,
        invoice_id,
        client_id,
        project_id,
        contract_id,
        amount,
        currency,
        payment_date,
        due_date,
        method,
        status,
        reference,
        notes,
        created_by,
        created_at,
        updated_at,
        client:clients (
          id,
          name,
          status,
          contact_email
        ),
        project:projects (
          id,
          name,
          status,
          end_date
        ),
        contract:contracts (
          id,
          title,
          status,
          renewal_date,
          end_date
        ),
        invoice:invoices (
          id,
          invoice_number,
          status,
          due_date,
          amount_ttc
        ),
        createdBy:profiles!payments_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .order("created_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  query = applyScopedFilters(query, filters, "due_date");

  const { data, error } = await query.returns<PaymentRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const paymentIds = (data ?? []).map((item) => item.id);
  const [activity, supportingDocumentsMap] = await Promise.all([
    getActivityMap("payment", paymentIds),
    getSupportingDocumentsMap("payment", paymentIds),
  ]);

  return (data ?? []).map((row) =>
    mapPaymentRow(row, role, activity.get(row.id) ?? [], supportingDocumentsMap.get(row.id) ?? []),
  );
}

export async function getPaymentById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
        id,
        invoice_id,
        client_id,
        project_id,
        contract_id,
        amount,
        currency,
        payment_date,
        due_date,
        method,
        status,
        reference,
        notes,
        created_by,
        created_at,
        updated_at,
        client:clients (
          id,
          name,
          status,
          contact_email
        ),
        project:projects (
          id,
          name,
          status,
          end_date
        ),
        contract:contracts (
          id,
          title,
          status,
          renewal_date,
          end_date
        ),
        invoice:invoices (
          id,
          invoice_number,
          status,
          due_date,
          amount_ttc
        ),
        createdBy:profiles!payments_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("id", id)
    .maybeSingle<PaymentRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const [activity, supportingDocumentsMap] = await Promise.all([
    getActivityMap("payment", [id]),
    getSupportingDocumentsMap("payment", [id]),
  ]);

  return mapPaymentRow(data, role, activity.get(id) ?? [], supportingDocumentsMap.get(id) ?? []);
}

export async function getPaymentsFilterData(): Promise<PaymentFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let clientsQuery = supabase.from("clients").select("id, name, status, contact_email");
  let projectsQuery = supabase.from("projects").select("id, name, status, end_date");
  let contractsQuery = supabase.from("contracts").select("id, title, status, renewal_date, end_date");
  let invoicesQuery = supabase.from("invoices").select("id, invoice_number, status, due_date, amount_ttc");
  let usersQuery = supabase.from("profiles").select("id, full_name, email, avatar_url, role");

  if (isEntityScopingEnabled()) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode);
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
    contractsQuery = contractsQuery.eq("entity_code", entityCode);
    invoicesQuery = invoicesQuery.eq("entity_code", entityCode);
    usersQuery = usersQuery.eq("entity_code", entityCode);
  }

  const [clientsResult, projectsResult, contractsResult, invoicesResult, usersResult] = await Promise.allSettled([
    clientsQuery.order("name", { ascending: true }).returns<FinanceClientPreview[]>(),
    projectsQuery.order("name", { ascending: true }).returns<FinanceProjectPreview[]>(),
    contractsQuery.order("title", { ascending: true }).returns<FinanceContractPreview[]>(),
    invoicesQuery.order("created_at", { ascending: false }).returns<PaymentInvoicePreview[]>(),
    usersQuery.in("role", ["admin", "manager"]).order("full_name", { ascending: true }).returns<FinanceUserPreview[]>(),
  ]);

  const clients = clientsResult.status === "fulfilled" && !clientsResult.value.error ? clientsResult.value.data ?? [] : [];
  const projects = projectsResult.status === "fulfilled" && !projectsResult.value.error ? projectsResult.value.data ?? [] : [];
  const contracts = contractsResult.status === "fulfilled" && !contractsResult.value.error ? contractsResult.value.data ?? [] : [];
  const invoices = invoicesResult.status === "fulfilled" && !invoicesResult.value.error ? invoicesResult.value.data ?? [] : [];
  const users = usersResult.status === "fulfilled" && !usersResult.value.error ? usersResult.value.data ?? [] : [];

  return {
    clients,
    projects,
    contracts,
    invoices,
    users,
  };
}

async function syncInvoiceStatus(invoiceId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let invoiceQuery = supabase
    .from("invoices")
    .select("id, due_date, amount_ttc, status")
    .eq("id", invoiceId);

  if (isEntityScopingEnabled()) {
    invoiceQuery = invoiceQuery.eq("entity_code", entityCode);
  }

  const invoiceResponse = await invoiceQuery.maybeSingle();
  const { data: invoice, error: invoiceError } = invoiceResponse as {
    data: { id: string; due_date: string; amount_ttc: number; status: InvoiceStatus } | null;
    error: { message: string } | null;
  };

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  if (!invoice) {
    return;
  }

  let paymentsQuery = supabase
    .from("payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId);

  if (isEntityScopingEnabled()) {
    paymentsQuery = paymentsQuery.eq("entity_code", entityCode);
  }

  const paymentsResponse = await paymentsQuery.returns();
  const { data: payments, error: paymentsError } = paymentsResponse as {
    data: Array<{ amount: number; status: PaymentRecord["status"] }> | null;
    error: { message: string } | null;
  };

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  const suggestedStatus = calculateInvoicePaymentStatus({
    status: invoice.status,
    dueDate: invoice.due_date,
    amountTtc: invoice.amount_ttc,
    linkedPayments: payments ?? [],
  });

  if (suggestedStatus !== invoice.status) {
    let invoiceUpdateQuery = supabase
      .from("invoices")
      .update({
        status: suggestedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (isEntityScopingEnabled()) {
      invoiceUpdateQuery = invoiceUpdateQuery.eq("entity_code", entityCode);
    }

    const { error } = await invoiceUpdateQuery;

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function createInvoice(values: InvoiceFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseInvoicePayload({
    ...values,
    invoice_number: values.invoice_number.trim(),
  }), entityCode);
  const suggestedStatus = calculateInvoicePaymentStatus({
    status: payload.status,
    dueDate: payload.due_date,
    amountTtc: payload.amount_ttc,
    linkedPayments: [],
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const invoiceNumber = payload.invoice_number || await generateInvoiceNumber(supabase);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...payload,
        invoice_number: invoiceNumber,
        status: suggestedStatus,
        created_by: actorUserId,
      })
      .select("id, invoice_number")
      .single<{ id: string; invoice_number: string }>();

    if (error) {
      if (!payload.invoice_number && isDuplicateInvoiceNumberError(error) && attempt < 3) {
        continue;
      }

      throw new Error(error.message);
    }

    await logInvoiceCreated(data.id, actorUserId, data.invoice_number);
    return data.id;
  }

  throw new Error("Unable to generate a unique invoice number.");
}

export async function updateInvoice(id: string, values: InvoiceFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let previousInvoiceQuery = supabase
    .from("invoices")
    .select("invoice_number, due_date, amount_ht, tax_amount, amount_ttc, status, client_id, project_id, contract_id, notes")
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    previousInvoiceQuery = previousInvoiceQuery.eq("entity_code", entityCode);
  }

  const previousInvoiceResponse = await previousInvoiceQuery.maybeSingle();
  const { data: previous, error: previousError } = previousInvoiceResponse as {
    data: {
      invoice_number: string;
      due_date: string;
      amount_ht: number;
      tax_amount: number;
      amount_ttc: number;
      status: InvoiceStatus;
      client_id: string;
      project_id: string | null;
      contract_id: string | null;
      notes: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = parseInvoicePayload(values);
  const linkedPayments = await getInvoicePayments(id, "admin");
  const suggestedStatus = calculateInvoicePaymentStatus({
    status: payload.status,
    dueDate: payload.due_date,
    amountTtc: payload.amount_ttc,
    linkedPayments,
  });

  let invoiceUpdateQuery = supabase
    .from("invoices")
    .update({
      ...payload,
      status: suggestedStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    invoiceUpdateQuery = invoiceUpdateQuery.eq("entity_code", entityCode);
  }

  const { error } = await invoiceUpdateQuery;

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks: Promise<void>[] = [];

  if (!previous) {
    activityTasks.push(logInvoiceUpdated(id, actorUserId));
  } else {
    const changes: Array<[string, string | number | null, string | number | null, string]> = [
      ["invoice_number", previous.invoice_number, payload.invoice_number, `Updated invoice number to ${payload.invoice_number}`],
      ["due_date", previous.due_date, payload.due_date, "Updated invoice due date"],
      ["amount_ht", previous.amount_ht, payload.amount_ht, "Updated invoice net amount"],
      ["tax_amount", previous.tax_amount, payload.tax_amount, "Updated invoice tax amount"],
      ["amount_ttc", previous.amount_ttc, payload.amount_ttc, "Updated invoice gross amount"],
      ["status", previous.status, suggestedStatus, `Changed invoice status to ${suggestedStatus}`],
      ["client_id", previous.client_id, payload.client_id, "Updated linked client"],
      ["project_id", previous.project_id, payload.project_id, "Updated linked project"],
      ["contract_id", previous.contract_id, payload.contract_id, "Updated linked contract"],
      ["notes", previous.notes, payload.notes, "Updated invoice notes"],
    ];

    for (const [field, from, to, action] of changes) {
      if (from === to) {
        continue;
      }

      activityTasks.push(logInvoiceUpdated(id, actorUserId, field, from, to));
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action,
          entityType: "invoice",
          entityId: id,
          metadata: {
            kind: field === "status" ? "status_change" : field === "due_date" ? "due_date_change" : "update",
            field,
            from,
            to,
            summary: field === "status" ? action : undefined,
          },
        }),
      );
    }
  }

  await Promise.all(activityTasks);
  return id;
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let deleteInvoiceQuery = supabase.from("invoices").delete().eq("id", id);

  if (isEntityScopingEnabled()) {
    deleteInvoiceQuery = deleteInvoiceQuery.eq("entity_code", entityCode);
  }

  const { error } = await deleteInvoiceQuery;

  if (error) {
    throw new Error(error.message);
  }
}

export async function createReceipt(values: ReceiptFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseReceiptPayload(values), entityCode);

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      ...payload,
      created_by: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Created receipt ${payload.receipt_number}`,
    entityType: "receipt",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Receipt created",
    },
  });

  return data.id;
}

export async function createPayment(values: PaymentFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode({
    ...parsePaymentPayload(values),
    created_by: actorUserId,
  }, entityCode);

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id, status")
    .single<{ id: string; status: PaymentRecord["status"] }>();

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: "Created payment",
    entityType: "payment",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Payment created",
    },
  });

  if (data.status === "received") {
    await logPaymentReceived(data.id, actorUserId);
  }

  if (data.status === "late") {
    await logActivity({
      userId: actorUserId,
      action: "Payment marked late",
      entityType: "payment",
      entityId: data.id,
      metadata: {
        kind: "status_change",
        field: "status",
        to: "late",
        summary: "Payment marked late",
      },
    });
  }

  if (payload.invoice_id) {
    await syncInvoiceStatus(payload.invoice_id);
  }

  return data.id;
}

export async function updatePayment(id: string, values: PaymentFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let previousPaymentQuery = supabase
    .from("payments")
    .select("invoice_id, status, due_date, payment_date, amount, method, reference, notes")
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    previousPaymentQuery = previousPaymentQuery.eq("entity_code", entityCode);
  }

  const previousPaymentResponse = await previousPaymentQuery.maybeSingle();
  const { data: previous, error: previousError } = previousPaymentResponse as {
    data: {
      invoice_id: string | null;
      status: PaymentRecord["status"];
      due_date: string | null;
      payment_date: string | null;
      amount: number;
      method: PaymentRecord["method"];
      reference: string | null;
      notes: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...parsePaymentPayload(values),
    updated_at: new Date().toISOString(),
  };

  let updatePaymentQuery = supabase.from("payments").update(payload).eq("id", id);

  if (isEntityScopingEnabled()) {
    updatePaymentQuery = updatePaymentQuery.eq("entity_code", entityCode);
  }

  const { error } = await updatePaymentQuery;

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks: Promise<void>[] = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: "Updated payment",
        entityType: "payment",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Payment updated",
        },
      }),
    );
  } else {
    const changes: Array<[string, string | number | null, string | number | null, string]> = [
      ["status", previous.status, payload.status, `Changed payment status to ${payload.status}`],
      ["due_date", previous.due_date, payload.due_date, "Updated payment due date"],
      ["payment_date", previous.payment_date, payload.payment_date, "Updated payment date"],
      ["amount", previous.amount, payload.amount, "Updated payment amount"],
      ["method", previous.method, payload.method, `Changed payment method to ${payload.method}`],
      ["reference", previous.reference, payload.reference, "Updated payment reference"],
      ["notes", previous.notes, payload.notes, "Updated payment notes"],
    ];

    for (const [field, from, to, action] of changes) {
      if (from === to) {
        continue;
      }

      const kind =
        field === "status"
          ? "status_change"
          : field === "due_date"
            ? "due_date_change"
            : "update";

      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action,
          entityType: "payment",
          entityId: id,
          metadata: {
            kind,
            field,
            from,
            to,
          },
        }),
      );
    }

    if (previous.status !== "received" && payload.status === "received") {
      activityTasks.push(logPaymentReceived(id, actorUserId));
    }

    if (previous.status !== "late" && payload.status === "late") {
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action: "Payment marked late",
          entityType: "payment",
          entityId: id,
          metadata: {
            kind: "status_change",
            field: "status",
            from: previous.status,
            to: "late",
            summary: "Payment marked late",
          },
        }),
      );
    }

    if (previous.status !== "reconciled" && payload.status === "reconciled") {
      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action: "Payment reconciled",
          entityType: "payment",
          entityId: id,
          metadata: {
            kind: "status_change",
            field: "status",
            from: previous.status,
            to: "reconciled",
            summary: "Payment reconciled",
          },
        }),
      );
    }
  }

  await Promise.all(activityTasks);

  if (previous?.invoice_id && previous.invoice_id !== payload.invoice_id) {
    await syncInvoiceStatus(previous.invoice_id);
  }

  if (payload.invoice_id) {
    await syncInvoiceStatus(payload.invoice_id);
  }

  return id;
}

export async function deletePayment(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let existingPaymentQuery = supabase
    .from("payments")
    .select("invoice_id")
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    existingPaymentQuery = existingPaymentQuery.eq("entity_code", entityCode);
  }

  const existingPaymentResponse = await existingPaymentQuery.maybeSingle();
  const { data: existing, error: existingError } = existingPaymentResponse as {
    data: { invoice_id: string | null } | null;
    error: { message: string } | null;
  };

  if (existingError) {
    throw new Error(existingError.message);
  }

  let deletePaymentQuery = supabase.from("payments").delete().eq("id", id);

  if (isEntityScopingEnabled()) {
    deletePaymentQuery = deletePaymentQuery.eq("entity_code", entityCode);
  }

  const { error } = await deletePaymentQuery;

  if (error) {
    throw new Error(error.message);
  }

  if (existing?.invoice_id) {
    await syncInvoiceStatus(existing.invoice_id);
  }
}

export async function getOverduePayments(role: AppRole) {
  return getPayments(role, { dueWindow: "overdue", status: "late" });
}

export async function getExpectedPayments(role: AppRole) {
  return getPayments(role, { status: "expected" });
}

export async function getReceivedPayments(role: AppRole) {
  return getPayments(role, { status: "received" });
}

export function getPaymentSummary(payments: PaymentRecord[]): PaymentSummary {
  return {
    total: payments.length,
    overdueCount: payments.filter((payment) => payment.status === "late").length,
    expectedCount: payments.filter((payment) => payment.status === "expected").length,
    receivedCount: payments.filter((payment) => payment.status === "received" || payment.status === "reconciled").length,
    totalExpectedAmount: payments
      .filter((payment) => payment.status === "expected" || payment.status === "late")
      .reduce((sum, payment) => sum + payment.amount, 0),
    totalReceivedAmount: payments
      .filter((payment) => payment.status === "received" || payment.status === "reconciled")
      .reduce((sum, payment) => sum + payment.amount, 0),
  };
}

export async function getTransfers(role: AppRole, filters: TransferFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("transfers")
    .select(
      `
        id,
        transfer_reference,
        beneficiary_name,
        beneficiary_bank,
        beneficiary_account,
        amount,
        currency,
        transfer_date,
        status,
        category,
        related_project_id,
        related_client_id,
        notes,
        created_by,
        created_at,
        updated_at,
        relatedProject:projects!transfers_related_project_id_fkey (
          id,
          name,
          status,
          end_date
        ),
        relatedClient:clients!transfers_related_client_id_fkey (
          id,
          name,
          status,
          contact_email
        ),
        createdBy:profiles!transfers_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .order("created_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  query = applyTransferFilters(query, filters);

  const { data, error } = await query.returns<TransferRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const transferIds = (data ?? []).map((item) => item.id);
  const [activity, supportingDocumentsMap] = await Promise.all([
    getActivityMap("transfer", transferIds),
    getSupportingDocumentsMap("transfer", transferIds),
  ]);

  const mappedTransfers = (data ?? []).map((row) =>
    mapTransferRow(row, role, activity.get(row.id) ?? [], supportingDocumentsMap.get(row.id) ?? []),
  );

  if (filters.entity) {
    return mappedTransfers.filter((transfer) => transfer.entity === filters.entity);
  }

  return mappedTransfers;
}

function parseTransferPayload(values: TransferFormValues) {
  return {
    transfer_reference: values.transfer_reference.trim(),
    beneficiary_name: values.beneficiary_name.trim(),
    beneficiary_bank: values.beneficiary_bank.trim() || null,
    beneficiary_account: values.beneficiary_account.trim() || null,
    amount: Number(values.amount),
    currency: values.currency.trim() || "USD",
    transfer_date: values.transfer_date,
    status: values.status,
    category: values.category,
    notes: buildTransferNotes(values.entity, values.notes, {
      enabled: values.renewal_enabled,
      next_due_date: values.renewal_next_due_date || null,
      reminder_days: Number(values.renewal_reminder_days) || 30,
      interval_months: Number(values.renewal_interval_months) || 12,
    }),
    related_project_id: values.related_project_id || null,
    related_client_id: values.related_client_id || null,
  };
}

function applyTransferFilters<T extends ScopedFinanceQuery<T> & { ilike: (column: string, value: string) => T }>(
  query: T,
  filters: TransferFilters,
) {
  if (filters.search) {
    query = query.or(
      [
        `transfer_reference.ilike.%${filters.search}%`,
        `beneficiary_name.ilike.%${filters.search}%`,
        `beneficiary_bank.ilike.%${filters.search}%`,
        `notes.ilike.%${filters.search}%`,
      ].join(","),
    );
  }

  if (filters.clientId) {
    query = query.eq("related_client_id", filters.clientId);
  }

  if (filters.projectId) {
    query = query.eq("related_project_id", filters.projectId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const next30 = new Date(today);
  next30.setDate(today.getDate() + 30);
  const past30 = new Date(today);
  past30.setDate(today.getDate() - 30);

  const todayString = today.toISOString().slice(0, 10);
  const monthStart = currentMonthStart.toISOString().slice(0, 10);
  const next30String = next30.toISOString().slice(0, 10);
  const past30String = past30.toISOString().slice(0, 10);

  if (filters.dateWindow === "this_month") {
    query = query.gte("transfer_date", monthStart).lte("transfer_date", todayString);
  }

  if (filters.dateWindow === "next_30_days") {
    query = query.gte("transfer_date", todayString).lte("transfer_date", next30String);
  }

  if (filters.dateWindow === "past_30_days") {
    query = query.gte("transfer_date", past30String).lte("transfer_date", todayString);
  }

  return query;
}

export async function getTransferById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("transfers")
    .select(
      `
        id,
        transfer_reference,
        beneficiary_name,
        beneficiary_bank,
        beneficiary_account,
        amount,
        currency,
        transfer_date,
        status,
        category,
        related_project_id,
        related_client_id,
        notes,
        created_by,
        created_at,
        updated_at,
        relatedProject:projects!transfers_related_project_id_fkey (
          id,
          name,
          status,
          end_date
        ),
        relatedClient:clients!transfers_related_client_id_fkey (
          id,
          name,
          status,
          contact_email
        ),
        createdBy:profiles!transfers_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.maybeSingle<TransferRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const [activity, supportingDocumentsMap] = await Promise.all([
    getActivityMap("transfer", [id]),
    getSupportingDocumentsMap("transfer", [id]),
  ]);

  return mapTransferRow(data, role, activity.get(id) ?? [], supportingDocumentsMap.get(id) ?? []);
}

export async function getTransfersFilterData(): Promise<TransferFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let clientsQuery = supabase.from("clients").select("id, name, status, contact_email");
  let projectsQuery = supabase.from("projects").select("id, name, status, end_date");

  if (isEntityScopingEnabled()) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode);
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
  }

  const [clientsResult, projectsResult] = await Promise.allSettled([
    clientsQuery.order("name", { ascending: true }).returns<FinanceClientPreview[]>(),
    projectsQuery.order("name", { ascending: true }).returns<FinanceProjectPreview[]>(),
  ]);

  const clients = clientsResult.status === "fulfilled" && !clientsResult.value.error ? clientsResult.value.data ?? [] : [];
  const projects = projectsResult.status === "fulfilled" && !projectsResult.value.error ? projectsResult.value.data ?? [] : [];

  return {
    clients,
    projects,
  };
}

export async function createTransfer(values: TransferFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode({
    ...parseTransferPayload(values),
    created_by: actorUserId,
  }, entityCode);

  const { data, error } = await supabase
    .from("transfers")
    .insert(payload)
    .select("id, transfer_reference, status")
    .single<{ id: string; transfer_reference: string; status: TransferRecord["status"] }>();

  if (error) {
    throw new Error(error.message);
  }

  await logTransferCreated(data.id, actorUserId, data.transfer_reference);

  if (data.status === "confirmed") {
    await logTransferConfirmed(data.id, actorUserId);
  }

  if (data.status === "sent" || data.status === "failed" || data.status === "cancelled") {
    await logActivity({
      userId: actorUserId,
      action: `Transfer ${data.status}`,
      entityType: "transfer",
      entityId: data.id,
      metadata: {
        kind: "status_change",
        field: "status",
        to: data.status,
        summary: `Transfer ${data.status}`,
      },
    });
  }

  return data.id;
}

export async function updateTransfer(id: string, values: TransferFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let previousTransferQuery = supabase
    .from("transfers")
    .select("status, transfer_date, amount, category, beneficiary_name, related_project_id, related_client_id, notes")
    .eq("id", id);

  if (isEntityScopingEnabled()) {
    previousTransferQuery = previousTransferQuery.eq("entity_code", entityCode);
  }

  const previousTransferResponse = await previousTransferQuery.maybeSingle();
  const { data: previous, error: previousError } = previousTransferResponse as {
    data: {
      status: TransferRecord["status"];
      transfer_date: string;
      amount: number;
      category: TransferCategory;
      beneficiary_name: string;
      related_project_id: string | null;
      related_client_id: string | null;
      notes: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...parseTransferPayload(values),
    updated_at: new Date().toISOString(),
  };

  let updateTransferQuery = supabase.from("transfers").update(payload).eq("id", id);

  if (isEntityScopingEnabled()) {
    updateTransferQuery = updateTransferQuery.eq("entity_code", entityCode);
  }

  const { error } = await updateTransferQuery;

  if (error) {
    throw new Error(error.message);
  }

  const activityTasks: Promise<void>[] = [];

  if (!previous) {
    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action: "Updated transfer",
        entityType: "transfer",
        entityId: id,
        metadata: {
          kind: "update",
          summary: "Transfer updated",
        },
      }),
    );
  } else {
    const changes: Array<
      [string, string | number | null, string | number | null, string, "update" | "status_change"]
    > = [
      ["status", previous.status, payload.status, `Transfer ${payload.status}`, "status_change"],
      ["transfer_date", previous.transfer_date, payload.transfer_date, "Updated transfer date", "update"],
      ["amount", previous.amount, payload.amount, "Updated transfer amount", "update"],
      ["category", previous.category, payload.category, `Changed transfer category to ${payload.category}`, "update"],
      ["beneficiary_name", previous.beneficiary_name, payload.beneficiary_name, "Updated beneficiary", "update"],
      ["related_project_id", previous.related_project_id, payload.related_project_id, "Updated related project", "update"],
      ["related_client_id", previous.related_client_id, payload.related_client_id, "Updated related client", "update"],
      ["notes", previous.notes, payload.notes, "Updated transfer notes", "update"],
    ];

    for (const [field, from, to, action, kind] of changes) {
      if (from === to) {
        continue;
      }

      activityTasks.push(
        logActivity({
          userId: actorUserId,
          action,
          entityType: "transfer",
          entityId: id,
          metadata: {
            kind,
            field,
            from,
            to,
            summary: field === "status" ? action : undefined,
          },
        }),
      );
    }

    if (previous.status !== "confirmed" && payload.status === "confirmed") {
      activityTasks.push(logTransferConfirmed(id, actorUserId));
    }
  }

  await Promise.all(activityTasks);
  return id;
}

export async function deleteTransfer(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let deleteTransferQuery = supabase.from("transfers").delete().eq("id", id);

  if (isEntityScopingEnabled()) {
    deleteTransferQuery = deleteTransferQuery.eq("entity_code", entityCode);
  }

  const { error } = await deleteTransferQuery;

  if (error) {
    throw new Error(error.message);
  }
}

export async function getMonthlyOutgoingTransfers(role: AppRole) {
  return getTransfers(role, { dateWindow: "this_month" });
}

export function getTransferSummary(transfers: TransferRecord[]): TransferSummary {
  return {
    plannedCount: transfers.filter((transfer) => transfer.status === "planned").length,
    pendingCount: transfers.filter((transfer) => transfer.status === "pending").length,
    confirmedCount: transfers.filter((transfer) => transfer.status === "confirmed").length,
    failedCount: transfers.filter((transfer) => transfer.status === "failed").length,
    totalOutgoingThisMonth: transfers.reduce((sum, transfer) => sum + transfer.amount, 0),
  };
}

function parseStatementLineDate(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parseStatementAmount(value: string) {
  const cleaned = value.replace(/[A-Za-z]/g, "").trim();
  return parseFormattedNumber(cleaned);
}

function parseBankStatementLines(rawContent: string, currency: string) {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.flatMap((line) => {
    const columns = line.split(/\t|;|\|/).map((part) => part.trim());
    if (columns.length < 3) {
      return [];
    }

    const lineDate = parseStatementLineDate(columns[0]);
    if (!lineDate) {
      return [];
    }

    const description = columns[1];
    if (!description) {
      return [];
    }

    let reference: string | null = null;
    let creditAmount = 0;
    let debitAmount = 0;

    if (columns.length >= 5) {
      reference = columns[2] || null;
      creditAmount = parseStatementAmount(columns[3]) ?? 0;
      debitAmount = parseStatementAmount(columns[4]) ?? 0;
    } else if (columns.length === 4) {
      const possibleAmount = parseStatementAmount(columns[3]);

      if (possibleAmount !== null && /[-(]/.test(columns[3])) {
        reference = columns[2] || null;
        debitAmount = Math.abs(possibleAmount);
      } else if (possibleAmount !== null) {
        reference = columns[2] || null;
        creditAmount = possibleAmount;
      } else {
        creditAmount = parseStatementAmount(columns[2]) ?? 0;
        debitAmount = parseStatementAmount(columns[3]) ?? 0;
      }
    } else {
      const amount = parseStatementAmount(columns[2]) ?? 0;
      if (amount >= 0) {
        creditAmount = amount;
      } else {
        debitAmount = Math.abs(amount);
      }
    }

    if (creditAmount === 0 && debitAmount === 0) {
      return [];
    }

    return [
      {
        line_date: lineDate,
        description,
        reference,
        credit_amount: creditAmount,
        debit_amount: debitAmount,
        currency,
      },
    ];
  });
}

function buildSearchableLineText(line: { description: string; reference: string | null }) {
  return `${line.description} ${line.reference ?? ""}`.toLowerCase();
}

function getInvoiceMatchScore(
  line: { amount: number; description: string; reference: string | null },
  invoice: InvoiceRecord,
) {
  if (line.amount <= 0) {
    return { score: 0, reason: null as string | null };
  }

  let score = 0;
  const reasons: string[] = [];
  const searchable = buildSearchableLineText(line);

  if (Math.abs(line.amount - invoice.remainingBalance) < 0.01) {
    score += 70;
    reasons.push("exact remaining balance");
  } else if (Math.abs(line.amount - invoice.amount_ttc) < 0.01) {
    score += 55;
    reasons.push("exact invoice amount");
  } else if (line.amount < invoice.remainingBalance && line.amount > 0) {
    score += 35;
    reasons.push("partial payment amount");
  }

  if (searchable.includes(invoice.invoice_number.toLowerCase())) {
    score += 25;
    reasons.push("invoice number found");
  }

  if (invoice.client?.name && searchable.includes(invoice.client.name.toLowerCase())) {
    score += 18;
    reasons.push("client name found");
  }

  if (invoice.paymentStatus === "overdue") {
    score += 6;
  }

  return {
    score,
    reason: reasons.length ? reasons.join(", ") : null,
  };
}

function getTransferMatchScore(
  line: { amount: number; description: string; reference: string | null },
  transfer: TransferRecord,
) {
  if (line.amount >= 0) {
    return { score: 0, reason: null as string | null };
  }

  let score = 0;
  const reasons: string[] = [];
  const searchable = buildSearchableLineText(line);
  const outgoingAmount = Math.abs(line.amount);

  if (Math.abs(outgoingAmount - transfer.amount) < 0.01) {
    score += 70;
    reasons.push("exact supplier amount");
  }

  if (searchable.includes(transfer.transfer_reference.toLowerCase())) {
    score += 24;
    reasons.push("transfer reference found");
  }

  if (searchable.includes(transfer.beneficiary_name.toLowerCase())) {
    score += 20;
    reasons.push("beneficiary found");
  }

  if (transfer.status === "sent" || transfer.status === "pending") {
    score += 6;
  }

  return {
    score,
    reason: reasons.length ? reasons.join(", ") : null,
  };
}

async function ensureReconciledPaymentForInvoice(params: {
  supabase: SupabaseClient;
  invoice: InvoiceRecord;
  amount: number;
  paymentDate: string;
  reference: string | null;
  actorUserId: string;
}) {
  const { supabase, invoice, amount, paymentDate, reference, actorUserId } = params;
  const normalizedReference = reference?.trim() || `BANK-${invoice.invoice_number}`;
  const entityCode = await getCurrentEntityCode();

  let existingQuery = supabase
    .from("payments")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("amount", amount)
    .eq("payment_date", paymentDate)
    .eq("status", "reconciled")
    .eq("reference", normalizedReference);

  if (isEntityScopingEnabled()) {
    existingQuery = existingQuery.eq("entity_code", entityCode);
  }

  const existingResponse = await existingQuery.maybeSingle();
  const { data: existing, error: existingError } = existingResponse as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing.id;
  }

  const paymentId = await createPayment(
    {
      client_id: invoice.client_id,
      project_id: invoice.project_id ?? "",
      contract_id: invoice.contract_id ?? "",
      invoice_id: invoice.id,
      amount: String(amount),
      currency: invoice.currency,
      due_date: invoice.due_date,
      payment_date: paymentDate,
      method: "bank_transfer",
      status: "reconciled",
      reference: normalizedReference,
      notes: `Auto-created from bank statement reconciliation for ${invoice.invoice_number}.`,
    },
    actorUserId,
  );

  await syncInvoiceStatus(invoice.id);
  return paymentId;
}

export async function getBankStatements(role: AppRole): Promise<BankStatementRecord[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let statementsQuery = supabase
    .from("bank_statements")
    .select(
      `
        id,
        account_label,
        statement_label,
        statement_date,
        currency,
        raw_content,
        notes,
        created_by,
        created_at,
        updated_at,
        createdBy:profiles!bank_statements_created_by_fkey (
          id,
          full_name,
          email,
          avatar_url,
          role
        )
      `,
    )
    .order("statement_date", { ascending: false });

  if (isEntityScopingEnabled()) {
    statementsQuery = statementsQuery.eq("entity_code", entityCode);
  }

  const statementsResponse = await statementsQuery.returns();
  const { data: statements, error: statementsError } = statementsResponse as {
    data: BankStatementRow[] | null;
    error: { message: string } | null;
  };

  if (statementsError) {
    if (statementsError.message.includes("bank_statements")) {
      return [];
    }

    throw new Error(statementsError.message);
  }

  const statementIds = (statements ?? []).map((statement) => statement.id);
  let linesMap = new Map<string, BankStatementLineRecord[]>();

  if (statementIds.length) {
    let linesQuery = supabase
      .from("bank_statement_lines")
      .select(
        "id, statement_id, line_date, description, reference, credit_amount, debit_amount, currency, match_status, matched_entity_type, matched_entity_id, match_confidence, match_reason, created_at",
      )
      .in("statement_id", statementIds)
      .order("line_date", { ascending: false });

    if (isEntityScopingEnabled()) {
      linesQuery = linesQuery.eq("entity_code", entityCode);
    }

    const linesResponse = await linesQuery.returns();
    const { data: lines, error: linesError } = linesResponse as {
      data: BankStatementLineRow[] | null;
      error: { message: string } | null;
    };

    if (linesError) {
      if (linesError.message.includes("bank_statement_lines")) {
        return (statements ?? []).map((statement) => ({
          ...statement,
          createdBy: single(statement.createdBy),
          lines: [],
        }));
      }

      throw new Error(linesError.message);
    }

    linesMap = new Map<string, BankStatementLineRecord[]>();
    for (const line of (lines ?? []).map(mapBankStatementLine)) {
      const current = linesMap.get(line.statement_id) ?? [];
      current.push(line);
      linesMap.set(line.statement_id, current);
    }
  }

  if (role === "shareholder") {
    return (statements ?? []).map((statement) => ({
      ...statement,
      raw_content: "",
      notes: null,
      createdBy: single(statement.createdBy),
      lines: (linesMap.get(statement.id) ?? []).map((line) => ({
        ...line,
        description: line.match_status === "matched" ? "Validated bank line" : "Bank line",
        reference: null,
      })),
    }));
  }

  return (statements ?? []).map((statement) => ({
    ...statement,
    createdBy: single(statement.createdBy),
    lines: linesMap.get(statement.id) ?? [],
  }));
}

export function getBankStatementSummary(statements: BankStatementRecord[]): BankStatementSummary {
  const lines = statements.flatMap((statement) => statement.lines);

  return {
    statementsCount: statements.length,
    matchedLines: lines.filter((line) => line.match_status === "matched").length,
    reviewLines: lines.filter((line) => line.match_status === "review").length,
    unmatchedLines: lines.filter((line) => line.match_status === "unmatched").length,
    latestBalanceDelta: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}

export async function createBankStatement(values: BankStatementFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const parsedLines = parseBankStatementLines(values.raw_content, values.currency.trim() || "USD");
  if (!parsedLines.length) {
    throw new Error("Add at least one readable bank line in the statement.");
  }

  const { data: statement, error: statementError } = await supabase
    .from("bank_statements")
    .insert({
      account_label: values.account_label.trim(),
      statement_label: values.statement_label.trim(),
      statement_date: values.statement_date,
      currency: values.currency.trim() || "USD",
      entity_code: entityCode,
      raw_content: values.raw_content.trim(),
      notes: values.notes.trim() || null,
      created_by: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (statementError) {
    throw new Error(statementError.message);
  }

  const { data: insertedLines, error: linesError } = await supabase
    .from("bank_statement_lines")
    .insert(
      parsedLines.map((line) => ({
        statement_id: statement.id,
        entity_code: entityCode,
        ...line,
        match_status: "unmatched" satisfies BankStatementMatchStatus,
      })),
    )
    .select("id, statement_id, line_date, description, reference, credit_amount, debit_amount, currency, match_status, matched_entity_type, matched_entity_id, match_confidence, match_reason, created_at")
    .returns<BankStatementLineRow[]>();

  if (linesError) {
    throw new Error(linesError.message);
  }

  const [invoices, transfers] = await Promise.all([
    getInvoices("admin", {}),
    getTransfers("admin", {}),
  ]);

  for (const line of (insertedLines ?? []).map(mapBankStatementLine)) {
    const invoiceCandidates = invoices
      .filter((invoice) => invoice.paymentStatus !== "paid" && invoice.paymentStatus !== "cancelled" && invoice.paymentStatus !== "archived")
      .map((invoice) => ({
        invoice,
        ...getInvoiceMatchScore(line, invoice),
      }))
      .sort((left, right) => right.score - left.score);

    const transferCandidates = transfers
      .filter((transfer) => transfer.status !== "confirmed" && transfer.status !== "cancelled" && transfer.status !== "failed")
      .map((transfer) => ({
        transfer,
        ...getTransferMatchScore(line, transfer),
      }))
      .sort((left, right) => right.score - left.score);

    const bestInvoice = invoiceCandidates[0];
    const bestTransfer = transferCandidates[0];

    if ((bestInvoice?.score ?? 0) >= 85 && (bestInvoice?.score ?? 0) >= (bestTransfer?.score ?? 0)) {
      const paymentId = await ensureReconciledPaymentForInvoice({
        supabase,
        invoice: bestInvoice.invoice,
        amount: line.amount,
        paymentDate: line.line_date,
        reference: line.reference ?? line.description,
        actorUserId,
      });

      await supabase
        .from("bank_statement_lines")
        .update({
          match_status: "matched",
          matched_entity_type: "payment",
          matched_entity_id: paymentId,
          match_confidence: bestInvoice.score,
          match_reason: bestInvoice.reason,
        })
        .eq("entity_code", entityCode)
        .eq("id", line.id);

      continue;
    }

    if ((bestTransfer?.score ?? 0) >= 85) {
      await updateTransfer(
        bestTransfer.transfer.id,
        {
          transfer_reference: bestTransfer.transfer.transfer_reference,
          beneficiary_name: bestTransfer.transfer.beneficiary_name,
          beneficiary_bank: bestTransfer.transfer.beneficiary_bank ?? "",
          beneficiary_account: bestTransfer.transfer.beneficiary_account ?? "",
          amount: String(bestTransfer.transfer.amount),
          currency: bestTransfer.transfer.currency,
          transfer_date: bestTransfer.transfer.transfer_date,
          status: "confirmed",
          category: bestTransfer.transfer.category,
          entity: bestTransfer.transfer.entity,
          related_project_id: bestTransfer.transfer.related_project_id ?? "",
          related_client_id: bestTransfer.transfer.related_client_id ?? "",
          notes: bestTransfer.transfer.notes ?? "",
          renewal_enabled: bestTransfer.transfer.renewal.enabled,
          renewal_next_due_date: bestTransfer.transfer.renewal.next_due_date ?? "",
          renewal_reminder_days: String(bestTransfer.transfer.renewal.reminder_days),
          renewal_interval_months: String(bestTransfer.transfer.renewal.interval_months),
        },
        actorUserId,
      );

      await supabase
        .from("bank_statement_lines")
        .update({
          match_status: "matched",
          matched_entity_type: "transfer",
          matched_entity_id: bestTransfer.transfer.id,
          match_confidence: bestTransfer.score,
          match_reason: bestTransfer.reason,
        })
        .eq("entity_code", entityCode)
        .eq("id", line.id);

      continue;
    }

    const reviewCandidate =
      (bestInvoice?.score ?? 0) >= (bestTransfer?.score ?? 0)
        ? bestInvoice
          ? {
              id: bestInvoice.invoice.id,
              type: "invoice" as const,
              score: bestInvoice.score,
              reason: bestInvoice.reason,
            }
          : null
        : bestTransfer
          ? {
              id: bestTransfer.transfer.id,
              type: "transfer" as const,
              score: bestTransfer.score,
              reason: bestTransfer.reason,
            }
          : null;

    if (reviewCandidate && reviewCandidate.score >= 60) {
      await supabase
        .from("bank_statement_lines")
        .update({
          match_status: "review",
          matched_entity_type: reviewCandidate.type,
          matched_entity_id: reviewCandidate.id,
          match_confidence: reviewCandidate.score,
          match_reason: reviewCandidate.reason,
        })
        .eq("entity_code", entityCode)
        .eq("id", line.id);
    }
  }

  return statement.id;
}

export function getInvoiceSummary(invoices: InvoiceRecord[]): InvoiceSummary {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    draftCount: invoices.filter((invoice) => invoice.paymentStatus === "draft").length,
    sentCount: invoices.filter((invoice) => invoice.paymentStatus === "sent" || invoice.paymentStatus === "partially_paid").length,
    overdueCount: invoices.filter((invoice) => invoice.paymentStatus === "overdue").length,
    paidCount: invoices.filter((invoice) => invoice.paymentStatus === "paid").length,
    totalInvoicedThisMonth: invoices
      .filter((invoice) => new Date(invoice.issue_date) >= monthStart)
      .reduce((sum, invoice) => sum + invoice.amount_ttc, 0),
  };
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function getLastMonths(count: number) {
  const today = new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (count - index - 1), 1);
    return {
      key: formatMonthKey(date),
      label: formatMonthLabel(date),
      date,
    };
  });
}

function isCurrentMonth(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function getDaysUntilDate(value: string) {
  const today = new Date();
  const target = new Date(value);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function mapMonthlySeries(input: Array<{ month: string; inflow: number; outflow: number; expected: number; received: number }>) {
  return input.map((point) => ({
    month: point.month,
    inflow: point.inflow,
    outflow: point.outflow,
    expected: point.expected,
    received: point.received,
  })) satisfies MonthlyFinancePoint[];
}

export async function getMonthlyRevenue(role: AppRole) {
  if (role === "shareholder") {
    return getShareholderMonthlyFinance();
  }

  const payments = await getPayments(role, {});
  const months = getLastMonths(6);
  const monthMap = new Map(
    months.map((month) => [
      month.key,
      { month: month.label, inflow: 0, outflow: 0, expected: 0, received: 0 },
    ]),
  );

  for (const payment of payments) {
    if (payment.due_date) {
      const dueDate = new Date(payment.due_date);
      const key = formatMonthKey(dueDate);
      const bucket = monthMap.get(key);
      if (bucket) {
        if (payment.status === "expected" || payment.status === "late") {
          bucket.expected += payment.amount;
        }
      }
    }

    if (payment.payment_date) {
      const paymentDate = new Date(payment.payment_date);
      const key = formatMonthKey(paymentDate);
      const bucket = monthMap.get(key);
      if (bucket && (payment.status === "received" || payment.status === "reconciled")) {
        bucket.inflow += payment.amount;
        bucket.received += payment.amount;
      }
    }
  }

  return mapMonthlySeries(Array.from(monthMap.values()));
}

export async function getMonthlyOutgoing(role: AppRole) {
  if (role === "shareholder") {
    return getShareholderMonthlyFinance();
  }

  const transfers = await getTransfers(role, { dateWindow: "past_30_days" });
  const months = getLastMonths(6);
  const monthMap = new Map(
    months.map((month) => [
      month.key,
      { month: month.label, inflow: 0, outflow: 0, expected: 0, received: 0 },
    ]),
  );

  for (const transfer of transfers) {
    const transferDate = new Date(transfer.transfer_date);
    const key = formatMonthKey(transferDate);
    const bucket = monthMap.get(key);

    if (!bucket) {
      continue;
    }

    if (transfer.status === "sent" || transfer.status === "confirmed") {
      bucket.outflow += transfer.amount;
    }
  }

  return mapMonthlySeries(Array.from(monthMap.values()));
}

export async function getInvoiceStatusSummary(role: AppRole): Promise<InvoiceStatusPoint[]> {
  if (role === "shareholder") {
    const supabase = await createClient();

    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await supabase.rpc("get_shareholder_invoice_status_summary");

    if (error) {
      throw new Error(error.message);
    }

    return ((data as Array<{ status: InvoiceStatus; count: number }> | null) ?? []).map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
  }

  const invoices = await getInvoices(role, {});
  const counts = new Map<InvoiceStatus, number>();

  for (const invoice of invoices) {
    counts.set(invoice.paymentStatus, (counts.get(invoice.paymentStatus) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

export async function getOverdueFinanceItems(role: AppRole) {
  if (role === "shareholder") {
    const [clients, summary] = await Promise.all([
      getShareholderOverdueClients(),
      getShareholderFinanceSummary(),
    ]);

    const risks: FinanceRiskItem[] = clients.slice(0, 5).map((client) => ({
      id: `shareholder-client-${client.clientId}`,
      title: client.clientName,
      description: `${client.overdueCount} overdue invoice(s) and ${client.latePaymentCount} delayed payment(s).`,
      severity: client.overdueAmount > 10000 ? "critical" : "warning",
      amount: client.overdueAmount,
      currency: "USD",
    }));

    if (summary.unpaidInvoices > 0) {
      risks.unshift({
        id: "shareholder-unpaid-invoices",
        title: "Unpaid invoice exposure",
        description: `${summary.unpaidInvoices} invoice(s) remain unpaid across the visible portfolio.`,
        severity: summary.overdueExposure > 0 ? "critical" : "warning",
        amount: summary.overdueExposure,
        currency: "USD",
      });
    }

    return risks;
  }

  const [payments, invoices, transfers, contracts] = await Promise.all([
    getPayments(role, {}),
    getInvoices(role, {}),
    getTransfers(role, {}),
    getContracts(role, {}),
  ]);

  const risks: FinanceRiskItem[] = [];

  for (const invoice of invoices.filter((item) => item.paymentStatus === "overdue").slice(0, 4)) {
    risks.push({
      id: `invoice-${invoice.id}`,
      title: `${invoice.invoice_number} is overdue`,
      description: `${invoice.client?.name ?? "Client"} still has ${formatCurrencyNumber(invoice.remainingBalance)} outstanding.`,
      severity: invoice.remainingBalance > 10000 ? "critical" : "warning",
      href: "/finance/invoices",
      amount: invoice.remainingBalance,
      currency: invoice.currency,
    });
  }

  for (const payment of payments.filter((item) => item.status === "late").slice(0, 3)) {
    risks.push({
      id: `payment-${payment.id}`,
      title: `${payment.client?.name ?? "Payment"} is late`,
      description: `Expected ${formatCurrencyNumber(payment.amount)} by ${payment.due_date ?? "an unset date"}.`,
      severity: "warning",
      href: "/finance/payments",
      amount: payment.amount,
      currency: payment.currency,
    });
  }

  for (const transfer of transfers.filter((item) => item.status === "pending" && item.amount >= 10000).slice(0, 3)) {
    risks.push({
      id: `transfer-${transfer.id}`,
      title: `${transfer.beneficiary_name} transfer is still pending`,
      description: `Large outgoing transfer pending confirmation in category ${transfer.category.replaceAll("_", " ")}.`,
      severity: "critical",
      href: "/finance/transfers",
      amount: transfer.amount,
      currency: transfer.currency,
    });
  }

  const contractsWithoutInvoice = contracts.filter((contract) => contract.status === "active").slice(0, 2);
  for (const contract of contractsWithoutInvoice) {
    risks.push({
      id: `contract-${contract.id}`,
      title: `${contract.title} has no invoice placeholder`,
      description: "Active contract is visible, but no invoice record is linked yet.",
      severity: "info",
      href: "/contracts",
      amount: contract.amount,
      currency: contract.currency,
    });
  }

  const delayMap = new Map<string, OverdueClientPoint>();
  for (const invoice of invoices.filter((item) => item.paymentStatus === "overdue")) {
    const clientId = invoice.client?.id;
    const clientName = invoice.client?.name;
    if (!clientId || !clientName) continue;

    const current = delayMap.get(clientId) ?? {
      clientId,
      clientName,
      overdueAmount: 0,
      overdueCount: 0,
      latePaymentCount: 0,
    };

    current.overdueAmount += invoice.remainingBalance;
    current.overdueCount += 1;
    current.latePaymentCount += payments.filter((payment) => payment.client?.id === clientId && payment.status === "late").length;
    delayMap.set(clientId, current);
  }

  for (const client of Array.from(delayMap.values()).filter((item) => item.overdueCount >= 2).slice(0, 3)) {
    risks.push({
      id: `client-delay-${client.clientId}`,
      title: `${client.clientName} has repeated delays`,
      description: `${client.overdueCount} overdue invoice(s) and ${client.latePaymentCount} late payment(s) in scope.`,
      severity: "critical",
      href: `/clients/${client.clientId}`,
      amount: client.overdueAmount,
      currency: "USD",
    });
  }

  return risks.slice(0, 10);
}

export async function getShareholderFinanceSummary(): Promise<ShareholderFinanceSummary> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const emptySummary: ShareholderFinanceSummary = {
    revenue: 0,
    expenses: 0,
    expectedCollections: 0,
    overdueExposure: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    confirmedTransfers: 0,
    netEstimate: 0,
    projectProfitabilityPlaceholder: "Project profitability will be layered in once cost attribution is implemented.",
  };

  try {
    const [
      { data: invoices, error: invoicesError },
      { data: payments, error: paymentsError },
      { data: transfers, error: transfersError },
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("amount_ttc, due_date, status")
        .returns<Array<{ amount_ttc: number; due_date: string; status: InvoiceStatus }>>(),
      supabase
        .from("payments")
        .select("amount, due_date, payment_date, status")
        .returns<Array<{ amount: number; due_date: string | null; payment_date: string | null; status: PaymentRecord["status"] }>>(),
      supabase
        .from("transfers")
        .select("amount, status")
        .returns<Array<{ amount: number; status: TransferRecord["status"] }>>(),
    ]);

    if (invoicesError || paymentsError || transfersError) {
      return emptySummary;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const safeInvoices = invoices ?? [];
    const safePayments = payments ?? [];
    const safeTransfers = transfers ?? [];

    const expectedCollections = safePayments
      .filter((payment) => payment.status === "expected" || payment.status === "late")
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

    const revenue = safePayments
      .filter((payment) => payment.status === "received" || payment.status === "reconciled")
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

    const overdueExposure = safeInvoices
      .filter((invoice) => {
        if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "archived") {
          return false;
        }

        const dueDate = new Date(invoice.due_date);
        dueDate.setHours(0, 0, 0, 0);

        return invoice.status === "overdue" || dueDate.getTime() < today.getTime();
      })
      .reduce((sum, invoice) => sum + Number(invoice.amount_ttc ?? 0), 0);

    const expenses = safeTransfers
      .filter((transfer) => transfer.status === "sent" || transfer.status === "confirmed")
      .reduce((sum, transfer) => sum + Number(transfer.amount ?? 0), 0);

    const paidInvoices = safeInvoices.filter((invoice) => invoice.status === "paid").length;
    const unpaidInvoices = safeInvoices.filter(
      (invoice) => invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "archived",
    ).length;
    const confirmedTransfers = safeTransfers.filter((transfer) => transfer.status === "confirmed").length;

    return {
      revenue,
      expenses,
      expectedCollections,
      overdueExposure,
      paidInvoices,
      unpaidInvoices,
      confirmedTransfers,
      netEstimate: revenue - expenses,
      projectProfitabilityPlaceholder: emptySummary.projectProfitabilityPlaceholder,
    };
  } catch {
    return emptySummary;
  }
}

async function getShareholderMonthlyFinance(): Promise<MonthlyFinancePoint[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("get_shareholder_monthly_finance");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{ month: string; inflow: number; outflow: number; expected: number; received: number }> | null) ?? []).map((row) => ({
    month: row.month,
    inflow: Number(row.inflow ?? 0),
    outflow: Number(row.outflow ?? 0),
    expected: Number(row.expected ?? 0),
    received: Number(row.received ?? 0),
  }));
}

async function getShareholderOverdueClients(): Promise<OverdueClientPoint[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("get_shareholder_overdue_clients");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<Record<string, string | number>> | null) ?? []).map((row) => ({
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    overdueAmount: Number(row.overdue_amount ?? 0),
    overdueCount: Number(row.overdue_count ?? 0),
    latePaymentCount: Number(row.late_payment_count ?? 0),
  }));
}

export async function getOverdueClientsSummary(role: AppRole): Promise<OverdueClientPoint[]> {
  if (role === "shareholder") {
    return getShareholderOverdueClients();
  }

  const [payments, invoices] = await Promise.all([getPayments(role, {}), getInvoices(role, {})]);
  const map = new Map<string, OverdueClientPoint>();

  for (const invoice of invoices.filter((item) => item.paymentStatus === "overdue")) {
    const clientId = invoice.client?.id;
    const clientName = invoice.client?.name;
    if (!clientId || !clientName) continue;

    const current = map.get(clientId) ?? {
      clientId,
      clientName,
      overdueAmount: 0,
      overdueCount: 0,
      latePaymentCount: 0,
    };

    current.overdueAmount += invoice.remainingBalance;
    current.overdueCount += 1;
    current.latePaymentCount = payments.filter((payment) => payment.client?.id === clientId && payment.status === "late").length;
    map.set(clientId, current);
  }

  return Array.from(map.values()).sort((left, right) => right.overdueAmount - left.overdueAmount).slice(0, 6);
}

async function getShareholderFinanceDeadlines(): Promise<UpcomingFinanceDeadline[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("get_shareholder_finance_deadlines");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<Record<string, string | number | null>> | null) ?? []).map((row) => ({
    kind: row.kind as UpcomingFinanceDeadline["kind"],
    label: String(row.label),
    dueDate: String(row.due_date),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "USD"),
    status: String(row.status ?? ""),
    clientName: row.client_name ? String(row.client_name) : null,
  }));
}

function formatCurrencyNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export async function getFinanceOverview(role: AppRole): Promise<FinanceOverview> {
  if (role === "shareholder") {
    const [summary, deadlines] = await Promise.all([
      getShareholderFinanceSummary(),
      getShareholderFinanceDeadlines(),
    ]);

    return {
      totalExpectedThisMonth: summary.expectedCollections,
      totalReceivedThisMonth: summary.revenue,
      totalOverdue: summary.overdueExposure,
      totalOutgoingThisMonth: summary.expenses,
      pendingInvoices: summary.unpaidInvoices,
      pendingInvoiceAmount: summary.expectedCollections + summary.overdueExposure,
      confirmedTransfers: summary.confirmedTransfers,
      revenueSummary: summary.revenue,
      expectedPayments: summary.expectedCollections,
      overduePayments: summary.overdueExposure,
      paidInvoices: summary.paidInvoices,
      unpaidInvoices: summary.unpaidInvoices,
      outgoingTransfers: summary.expenses,
      netOperationalBalanceEstimate: summary.netEstimate,
      upcomingFinancialDeadlines: deadlines,
      kpiCards: [
        { label: "Total expected this month", value: summary.expectedCollections, currency: "USD", detail: "Visible expected collections" },
        { label: "Total received this month", value: summary.revenue, currency: "USD", detail: "Visible incoming cash" },
        { label: "Total overdue", value: summary.overdueExposure, currency: "USD", detail: "Outstanding overdue exposure" },
        { label: "Total outgoing this month", value: summary.expenses, currency: "USD", detail: "Visible outgoing commitments" },
        { label: "Pending invoices", value: summary.unpaidInvoices, detail: "Invoices awaiting full collection" },
        { label: "Confirmed transfers", value: summary.confirmedTransfers, detail: "Outgoing movements confirmed" },
      ],
    };
  }

  const [payments, invoices, transfers, contracts] = await Promise.all([
    getPayments(role, {}),
    getInvoices(role, {}),
    getTransfers(role, {}),
    getContracts(role, {}),
  ]);

  const now = new Date();
  const totalExpectedThisMonth = payments
    .filter((payment) => isCurrentMonth(payment.due_date) && (payment.status === "expected" || payment.status === "late"))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalReceivedThisMonth = payments
    .filter((payment) => isCurrentMonth(payment.payment_date) && (payment.status === "received" || payment.status === "reconciled"))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalOverdue = invoices
    .filter((invoice) => invoice.paymentStatus === "overdue")
    .reduce((sum, invoice) => sum + invoice.remainingBalance, 0);
  const totalOutgoingThisMonth = transfers
    .filter((transfer) => isCurrentMonth(transfer.transfer_date) && (transfer.status === "sent" || transfer.status === "confirmed"))
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const pendingInvoices = invoices.filter((invoice) => invoice.paymentStatus !== "paid" && invoice.paymentStatus !== "cancelled" && invoice.paymentStatus !== "archived").length;
  const pendingInvoiceAmount = invoices
    .filter((invoice) => invoice.paymentStatus !== "paid" && invoice.paymentStatus !== "cancelled" && invoice.paymentStatus !== "archived")
    .reduce((sum, invoice) => sum + invoice.remainingBalance, 0);
  const confirmedTransfers = transfers.filter((transfer) => transfer.status === "confirmed").length;
  const paidInvoices = invoices.filter((invoice) => invoice.paymentStatus === "paid").length;
  const unpaidInvoices = invoices.filter((invoice) => invoice.paymentStatus !== "paid" && invoice.paymentStatus !== "cancelled" && invoice.paymentStatus !== "archived").length;

  const upcomingFinancialDeadlines: UpcomingFinanceDeadline[] = [
    ...invoices
      .filter((invoice) => {
        const days = getDaysUntilDate(invoice.due_date);
        return days >= 0 && days <= 14 && invoice.paymentStatus !== "paid";
      })
      .slice(0, 4)
      .map((invoice) => ({
        kind: "invoice_due" as const,
        label: invoice.invoice_number,
        dueDate: invoice.due_date,
        amount: invoice.remainingBalance,
        currency: invoice.currency,
        status: invoice.paymentStatus,
        clientName: invoice.client?.name ?? null,
      })),
    ...payments
      .filter((payment) => payment.due_date && (payment.status === "expected" || payment.status === "late"))
      .filter((payment) => {
        const days = getDaysUntilDate(payment.due_date!);
        return days >= 0 && days <= 14;
      })
      .slice(0, 4)
      .map((payment) => ({
        kind: "payment_due" as const,
        label: payment.reference ?? payment.client?.name ?? "Payment due",
        dueDate: payment.due_date!,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        clientName: payment.client?.name ?? null,
      })),
    ...contracts
      .filter((contract) => contract.status === "active" && contract.amount)
      .slice(0, 2)
      .map((contract) => ({
        kind: "contract_placeholder" as const,
        label: contract.title,
        dueDate: contract.renewal_date ?? contract.end_date ?? new Date(now).toISOString().slice(0, 10),
        amount: contract.amount ?? 0,
        currency: contract.currency,
        status: "needs invoice placeholder",
        clientName: contract.client?.name ?? null,
      })),
  ]
    .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
    .slice(0, 8);

  return {
    totalExpectedThisMonth,
    totalReceivedThisMonth,
    totalOverdue,
    totalOutgoingThisMonth,
    pendingInvoices,
    pendingInvoiceAmount,
    confirmedTransfers,
    revenueSummary: invoices.reduce((sum, invoice) => sum + invoice.amount_ttc, 0),
    expectedPayments: payments.filter((payment) => payment.status === "expected").length,
    overduePayments: payments.filter((payment) => payment.status === "late").length,
    paidInvoices,
    unpaidInvoices,
    outgoingTransfers: transfers.filter((transfer) => transfer.status === "planned" || transfer.status === "pending").length,
    netOperationalBalanceEstimate: totalReceivedThisMonth - totalOutgoingThisMonth,
    upcomingFinancialDeadlines,
    kpiCards: [
      { label: "Total expected this month", value: totalExpectedThisMonth, currency: "USD", detail: "Expected collections due this month" },
      { label: "Total received this month", value: totalReceivedThisMonth, currency: "USD", detail: "Recorded cash inflow this month" },
      { label: "Total overdue", value: totalOverdue, currency: "USD", detail: "Overdue invoice exposure" },
      { label: "Total outgoing this month", value: totalOutgoingThisMonth, currency: "USD", detail: "Outgoing transfers executed this month" },
      { label: "Pending invoices", value: pendingInvoices, detail: "Invoices not fully collected yet" },
      { label: "Confirmed transfers", value: confirmedTransfers, detail: "Confirmed outgoing transfers" },
    ],
  };
}

export async function logInvoiceCreated(invoiceId: string, actorUserId: string, invoiceNumber: string) {
  await logActivity({
    userId: actorUserId,
    action: `Created invoice ${invoiceNumber}`,
    entityType: "invoice",
    entityId: invoiceId,
    metadata: {
      kind: "create",
      summary: "Invoice created",
    },
  });
}

export async function logInvoiceUpdated(invoiceId: string, actorUserId: string, field?: string, from?: string | number | boolean | null, to?: string | number | boolean | null) {
  await logActivity({
    userId: actorUserId,
    action: "Updated invoice",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: {
      kind: "update",
      field,
      from,
      to,
      summary: "Invoice updated",
    },
  });
}

export async function logPaymentReceived(paymentId: string, actorUserId: string) {
  await logActivity({
    userId: actorUserId,
    action: "Payment received",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      kind: "status_change",
      field: "status",
      to: "received",
      summary: "Payment received",
    },
  });
}

export async function logTransferCreated(transferId: string, actorUserId: string, reference: string) {
  await logActivity({
    userId: actorUserId,
    action: `Created transfer ${reference}`,
    entityType: "transfer",
    entityId: transferId,
    metadata: {
      kind: "create",
      summary: "Transfer created",
    },
  });
}

export async function logTransferConfirmed(transferId: string, actorUserId: string) {
  await logActivity({
    userId: actorUserId,
    action: "Transfer confirmed",
    entityType: "transfer",
    entityId: transferId,
    metadata: {
      kind: "status_change",
      field: "status",
      to: "confirmed",
      summary: "Transfer confirmed",
    },
  });
}
