import "server-only";

import { randomUUID } from "node:crypto";

import { logActivity } from "@/lib/activity/service";
import {
  applyEntityScope,
  getCurrentEntityCode,
  extendWithEntityCode,
  isEntityScopingEnabled,
} from "@/lib/entities/scope";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import type { ActivityLogRecord } from "@/types/activity";
import type {
  DocumentClientPreview,
  DocumentContractPreview,
  DocumentFilters,
  DocumentFiltersData,
  DocumentFormValues,
  DocumentInvoicePreview,
  DocumentPaymentPreview,
  DocumentProjectPreview,
  DocumentRecord,
  DocumentRelatedType,
  DocumentTicketPreview,
  DocumentTransferPreview,
  DocumentType,
  DocumentUploader,
  DocumentVisibility,
} from "@/types/document";

const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

type DocumentRow = {
  id: string;
  title: string;
  description: string | null;
  document_type: DocumentRecord["document_type"];
  related_type: DocumentRecord["related_type"];
  related_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  uploaded_by: string;
  visibility: DocumentRecord["visibility"];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

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

function sanitizeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function getStoragePath(fileName: string, actorUserId: string) {
  const now = new Date();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const safeName = sanitizeFileName(fileName) || "document";
  return `${actorUserId}/${now.getUTCFullYear()}/${month}/${randomUUID()}-${safeName}`;
}

type UpsertBinaryDocumentParams = {
  existingDocumentId?: string | null;
  title: string;
  description: string;
  documentType: DocumentType;
  relatedType: DocumentRelatedType;
  relatedId: string;
  visibility: DocumentVisibility;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  actorUserId: string;
};

function getCategoryLabel(documentType: DocumentRecord["document_type"]) {
  return documentType.replaceAll("_", " ");
}

async function getDocumentActivityMap(documentIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !documentIds.length) {
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
    .or(`and(entity_type.eq.document,entity_id.in.(${documentIds.join(",")}))`)
    .order("created_at", { ascending: false })
    .limit(150);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.returns<ActivityRow[]>();

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

async function getUploaderMap(userIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !userIds.length) {
    return new Map<string, DocumentUploader>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .in("id", userIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentUploader[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getClientMap(clientIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !clientIds.length) {
    return new Map<string, DocumentClientPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("clients")
    .select("id, name, status, contact_email")
    .in("id", clientIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentClientPreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getProjectMap(projectIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !projectIds.length) {
    return new Map<string, DocumentProjectPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("projects")
    .select("id, name, status, end_date")
    .in("id", projectIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentProjectPreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getContractMap(contractIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !contractIds.length) {
    return new Map<string, DocumentContractPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("contracts")
    .select("id, title, status, end_date")
    .in("id", contractIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentContractPreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

type TicketLookupRow = {
  id: string;
  title: string;
  status: DocumentTicketPreview["status"];
  priority: DocumentTicketPreview["priority"];
  due_date: string | null;
  project_id: string;
};

async function getTicketMap(ticketIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !ticketIds.length) {
    return new Map<string, DocumentTicketPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, project_id")
    .in("id", ticketIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<TicketLookupRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date,
      },
    ]),
  );
}

async function getInvoiceMap(invoiceIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !invoiceIds.length) {
    return new Map<string, DocumentInvoicePreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, status, due_date, amount_ttc")
    .in("id", invoiceIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentInvoicePreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getPaymentMap(paymentIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !paymentIds.length) {
    return new Map<string, DocumentPaymentPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("payments")
    .select("id, reference, status, amount, currency")
    .in("id", paymentIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentPaymentPreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getTransferMap(transferIds: string[]) {
  const supabase = await createClient();

  if (!supabase || !transferIds.length) {
    return new Map<string, DocumentTransferPreview>();
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("transfers")
    .select("id, transfer_reference, status, amount, currency")
    .in("id", transferIds);

  if (isEntityScopingEnabled()) {
    query = query.eq("entity_code", entityCode);
  }

  const { data, error } = await query.returns<DocumentTransferPreview[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

function getDocumentRelatedLabel(
  row: DocumentRow,
  client: DocumentClientPreview | null,
  project: DocumentProjectPreview | null,
  contract: DocumentContractPreview | null,
  ticket: DocumentTicketPreview | null,
  invoice: DocumentInvoicePreview | null,
  payment: DocumentPaymentPreview | null,
  transfer: DocumentTransferPreview | null,
) {
  if (row.related_type === "archive") {
    return "General company archive";
  }

  if (row.related_type === "client") {
    return client?.name ?? "Client link";
  }

  if (row.related_type === "project") {
    return project?.name ?? "Project link";
  }

  if (row.related_type === "contract") {
    return contract?.title ?? "Contract link";
  }

  if (row.related_type === "invoice") {
    return invoice?.invoice_number ?? "Invoice link";
  }

  if (row.related_type === "task") {
    return ticket?.title ?? "Ticket link";
  }

  if (row.related_type === "payment") {
    return payment?.reference?.trim() || (payment ? `Payment ${payment.currency} ${payment.amount}` : "Payment link");
  }

  if (row.related_type === "transfer") {
    return transfer?.transfer_reference ?? "Transfer link";
  }

  return "General archive";
}

function mapDocument(
  row: DocumentRow,
  role: AppRole,
  uploaders: Map<string, DocumentUploader>,
  clients: Map<string, DocumentClientPreview>,
  projects: Map<string, DocumentProjectPreview>,
  contracts: Map<string, DocumentContractPreview>,
  tickets: Map<string, DocumentTicketPreview>,
  invoices: Map<string, DocumentInvoicePreview>,
  payments: Map<string, DocumentPaymentPreview>,
  transfers: Map<string, DocumentTransferPreview>,
  activities: Map<string, ActivityLogRecord[]>,
): DocumentRecord {
  const client = row.related_type === "client" && row.related_id ? (clients.get(row.related_id) ?? null) : null;
  const project = row.related_type === "project" && row.related_id ? (projects.get(row.related_id) ?? null) : null;
  const contract = row.related_type === "contract" && row.related_id ? (contracts.get(row.related_id) ?? null) : null;
  const ticket = row.related_type === "task" && row.related_id ? (tickets.get(row.related_id) ?? null) : null;
  const invoice = row.related_type === "invoice" && row.related_id ? (invoices.get(row.related_id) ?? null) : null;
  const payment = row.related_type === "payment" && row.related_id ? (payments.get(row.related_id) ?? null) : null;
  const transfer = row.related_type === "transfer" && row.related_id ? (transfers.get(row.related_id) ?? null) : null;

  return {
    ...row,
    uploadedBy: uploaders.get(row.uploaded_by) ?? null,
    client,
    project,
    contract,
    ticket,
    recentActivity: (activities.get(row.id) ?? []).slice(0, 8),
    categoryLabel: getCategoryLabel(row.document_type),
    relatedLabel: getDocumentRelatedLabel(row, client, project, contract, ticket, invoice, payment, transfer),
    viewMode: role === "shareholder" ? "summary" : "full",
  };
}

function filterMappedDocuments(documents: DocumentRecord[], filters: DocumentFilters) {
  return documents.filter((document) => {
    if (filters.clientId && document.client?.id !== filters.clientId) {
      return false;
    }

    if (filters.projectId && document.project?.id !== filters.projectId) {
      return false;
    }

    if (filters.contractId && document.contract?.id !== filters.contractId) {
      return false;
    }

    return true;
  });
}

export async function getDocuments(role: AppRole, filters: DocumentFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("documents")
    .select(
      `
        id,
        title,
        description,
        document_type,
        related_type,
        related_id,
        file_url,
        file_name,
        file_size,
        mime_type,
        uploaded_by,
        visibility,
        is_archived,
        created_at,
        updated_at
      `,
    )
    .order("updated_at", { ascending: false });

  query = applyEntityScope(query, entityCode);

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,file_name.ilike.%${filters.search}%`,
    );
  }

  if (filters.documentType) {
    query = query.eq("document_type", filters.documentType);
  }

  if (filters.relatedType) {
    query = query.eq("related_type", filters.relatedType);
  }

  if (filters.uploadedBy) {
    query = query.eq("uploaded_by", filters.uploadedBy);
  }

  if (filters.visibility) {
    query = query.eq("visibility", filters.visibility);
  }

  if (filters.archiveState === "active") {
    query = query.eq("is_archived", false);
  }

  if (filters.archiveState === "archived") {
    query = query.eq("is_archived", true);
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  if (filters.date === "recent_7d") {
    query = query.gte("created_at", sevenDaysAgo.toISOString());
  }

  if (filters.date === "recent_30d") {
    query = query.gte("created_at", thirtyDaysAgo.toISOString());
  }

  if (filters.date === "older") {
    query = query.lt("created_at", thirtyDaysAgo.toISOString());
  }

  const { data, error } = await query.returns<DocumentRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const [activities, uploaders, clients, projects, contracts, tickets, invoices, payments, transfers] = await Promise.all([
    getDocumentActivityMap(rows.map((row) => row.id)),
    getUploaderMap([...new Set(rows.map((row) => row.uploaded_by))]),
    getClientMap(rows.filter((row) => row.related_type === "client" && row.related_id).map((row) => row.related_id!)),
    getProjectMap(rows.filter((row) => row.related_type === "project" && row.related_id).map((row) => row.related_id!)),
    getContractMap(rows.filter((row) => row.related_type === "contract" && row.related_id).map((row) => row.related_id!)),
    getTicketMap(rows.filter((row) => row.related_type === "task" && row.related_id).map((row) => row.related_id!)),
    getInvoiceMap(rows.filter((row) => row.related_type === "invoice" && row.related_id).map((row) => row.related_id!)),
    getPaymentMap(rows.filter((row) => row.related_type === "payment" && row.related_id).map((row) => row.related_id!)),
    getTransferMap(rows.filter((row) => row.related_type === "transfer" && row.related_id).map((row) => row.related_id!)),
  ]);

  const mapped = rows.map((row) =>
    mapDocument(row, role, uploaders, clients, projects, contracts, tickets, invoices, payments, transfers, activities),
  );

  return filterMappedDocuments(mapped, filters);
}

export async function getDocumentById(id: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("documents")
    .select(
      `
        id,
        title,
        description,
        document_type,
        related_type,
        related_id,
        file_url,
        file_name,
        file_size,
        mime_type,
        uploaded_by,
        visibility,
        is_archived,
        created_at,
        updated_at
      `,
    )
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data, error } = await query.maybeSingle<DocumentRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const [activities, uploaders, clients, projects, contracts, tickets, invoices, payments, transfers] = await Promise.all([
    getDocumentActivityMap([data.id]),
    getUploaderMap([data.uploaded_by]),
    getClientMap(data.related_type === "client" && data.related_id ? [data.related_id] : []),
    getProjectMap(data.related_type === "project" && data.related_id ? [data.related_id] : []),
    getContractMap(data.related_type === "contract" && data.related_id ? [data.related_id] : []),
    getTicketMap(data.related_type === "task" && data.related_id ? [data.related_id] : []),
    getInvoiceMap(data.related_type === "invoice" && data.related_id ? [data.related_id] : []),
    getPaymentMap(data.related_type === "payment" && data.related_id ? [data.related_id] : []),
    getTransferMap(data.related_type === "transfer" && data.related_id ? [data.related_id] : []),
  ]);

  return mapDocument(data, role, uploaders, clients, projects, contracts, tickets, invoices, payments, transfers, activities);
}

export async function getDocumentsFilterData(): Promise<DocumentFiltersData> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let clientsQuery = supabase.from("clients").select("id, name, status, contact_email").order("name", { ascending: true });
  let projectsQuery = supabase.from("projects").select("id, name, status, end_date").order("name", { ascending: true });
  let contractsQuery = supabase.from("contracts").select("id, title, status, end_date").order("title", { ascending: true });
  let ticketsQuery = supabase.from("tasks").select("id, title, status, priority, due_date").order("updated_at", { ascending: false }).limit(100);
  let invoicesQuery = supabase.from("invoices").select("id, invoice_number, status, due_date, amount_ttc").order("created_at", { ascending: false }).limit(100);
  let paymentsQuery = supabase.from("payments").select("id, reference, status, amount, currency").order("created_at", { ascending: false }).limit(100);
  let transfersQuery = supabase.from("transfers").select("id, transfer_reference, status, amount, currency").order("created_at", { ascending: false }).limit(100);
  let uploadersQuery = supabase.from("profiles").select("id, full_name, email, avatar_url, role").order("full_name", { ascending: true });

  if (isEntityScopingEnabled()) {
    clientsQuery = clientsQuery.eq("entity_code", entityCode);
    projectsQuery = projectsQuery.eq("entity_code", entityCode);
    contractsQuery = contractsQuery.eq("entity_code", entityCode);
    ticketsQuery = ticketsQuery.eq("entity_code", entityCode);
    invoicesQuery = invoicesQuery.eq("entity_code", entityCode);
    paymentsQuery = paymentsQuery.eq("entity_code", entityCode);
    transfersQuery = transfersQuery.eq("entity_code", entityCode);
    uploadersQuery = uploadersQuery.eq("entity_code", entityCode);
  }

  const [
    { data: clients, error: clientsError },
    { data: projects, error: projectsError },
    { data: contracts, error: contractsError },
    { data: tickets, error: ticketsError },
    { data: invoices, error: invoicesError },
    { data: payments, error: paymentsError },
    { data: transfers, error: transfersError },
    { data: uploadedByOptions, error: uploadersError },
  ] = await Promise.all([
    clientsQuery.returns<DocumentClientPreview[]>(),
    projectsQuery.returns<DocumentProjectPreview[]>(),
    contractsQuery.returns<DocumentContractPreview[]>(),
    ticketsQuery.returns<DocumentTicketPreview[]>(),
    invoicesQuery.returns<DocumentInvoicePreview[]>(),
    paymentsQuery.returns<DocumentPaymentPreview[]>(),
    transfersQuery.returns<DocumentTransferPreview[]>(),
    uploadersQuery.returns<DocumentUploader[]>(),
  ]);

  if (clientsError) throw new Error(clientsError.message);
  if (projectsError) throw new Error(projectsError.message);
  if (contractsError) throw new Error(contractsError.message);
  if (ticketsError) throw new Error(ticketsError.message);
  if (invoicesError) throw new Error(invoicesError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  if (transfersError) throw new Error(transfersError.message);
  if (uploadersError) throw new Error(uploadersError.message);

  return {
    clients: clients ?? [],
    projects: projects ?? [],
    contracts: contracts ?? [],
    tickets: tickets ?? [],
    invoices: invoices ?? [],
    payments: payments ?? [],
    transfers: transfers ?? [],
    uploadedByOptions: uploadedByOptions ?? [],
  };
}

function parseDocumentPayload(values: DocumentFormValues) {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    document_type: values.document_type,
    related_type: values.related_type,
    related_id: values.related_type === "archive" ? null : values.related_id || null,
    visibility: values.visibility,
  };
}

function validateFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error("Please choose a file to upload.");
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error("Files must be 10 MB or smaller.");
  }
}

export async function createDocument(values: DocumentFormValues, file: File, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  validateFile(file);

  const entityCode = await getCurrentEntityCode();
  const payload = extendWithEntityCode(parseDocumentPayload(values), entityCode);
  const path = getStoragePath(file.name, actorUserId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const insertPayload = {
    ...payload,
    file_url: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: actorUserId,
  };

  const { data, error } = await supabase
    .from("documents")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    await supabase.storage.from("documents").remove([path]);
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Uploaded document ${payload.title}`,
    entityType: "document",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Document uploaded",
      related_type: payload.related_type,
      related_id: payload.related_id,
      visibility: payload.visibility,
    },
  });

  return data.id;
}

export async function upsertBinaryDocument({
  existingDocumentId = null,
  title,
  description,
  documentType,
  relatedType,
  relatedId,
  visibility,
  fileName,
  mimeType,
  bytes,
  actorUserId,
}: UpsertBinaryDocumentParams) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  const path = getStoragePath(fileName, actorUserId);
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, {
      contentType: mimeType || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  if (existingDocumentId) {
    let previousQuery = supabase
      .from("documents")
      .select("file_url")
      .eq("id", existingDocumentId);

    previousQuery = applyEntityScope(previousQuery, entityCode);

    const { data: previous, error: previousError } = await previousQuery.maybeSingle<{ file_url: string }>();

    if (previousError) {
      await supabase.storage.from("documents").remove([path]);
      throw new Error(previousError.message);
    }

    let updateQuery = supabase
      .from("documents")
      .update({
        title,
        description,
        document_type: documentType,
        related_type: relatedType,
        related_id: relatedId,
        ...extendWithEntityCode({}, entityCode),
        file_url: path,
        file_name: fileName,
        file_size: bytes.byteLength,
        mime_type: mimeType,
        uploaded_by: actorUserId,
        visibility,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingDocumentId);

    updateQuery = applyEntityScope(updateQuery, entityCode);

    const { error: updateError } = await updateQuery;

    if (updateError) {
      await supabase.storage.from("documents").remove([path]);
      throw new Error(updateError.message);
    }

    if (previous?.file_url) {
      await supabase.storage.from("documents").remove([previous.file_url]);
    }

    await logActivity({
      userId: actorUserId,
      action: "Regenerated document file",
      entityType: "document",
      entityId: existingDocumentId,
      metadata: {
        kind: "update",
        summary: "System-generated file refreshed",
      },
    });

    return existingDocumentId;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      description,
      document_type: documentType,
      related_type: relatedType,
      related_id: relatedId,
      ...extendWithEntityCode({}, entityCode),
      file_url: path,
      file_name: fileName,
      file_size: bytes.byteLength,
      mime_type: mimeType,
      uploaded_by: actorUserId,
      visibility,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    await supabase.storage.from("documents").remove([path]);
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: `Uploaded document ${title}`,
    entityType: "document",
    entityId: data.id,
    metadata: {
      kind: "create",
      summary: "Document uploaded",
      related_type: relatedType,
      related_id: relatedId,
      visibility,
    },
  });

  return data.id;
}

export async function updateDocument(id: string, values: DocumentFormValues, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let previousQuery = supabase
    .from("documents")
    .select("title, document_type, related_type, related_id, visibility, is_archived")
    .eq("id", id);

  previousQuery = applyEntityScope(previousQuery, entityCode);

  const { data: previous, error: previousError } = await previousQuery.maybeSingle<{
      title: string;
      document_type: DocumentRecord["document_type"];
      related_type: DocumentRecord["related_type"];
      related_id: string | null;
      visibility: DocumentRecord["visibility"];
      is_archived: boolean;
    }>();

  if (previousError) {
    throw new Error(previousError.message);
  }

  const payload = {
    ...extendWithEntityCode(parseDocumentPayload(values), entityCode),
    updated_at: new Date().toISOString(),
  };

  let updateQuery = supabase.from("documents").update(payload).eq("id", id);
  updateQuery = applyEntityScope(updateQuery, entityCode);
  const { error } = await updateQuery;

  if (error) {
    throw new Error(error.message);
  }

  const changes: Array<[string, string | null, string | null, string]> = previous
    ? [
        ["title", previous.title, payload.title, `Renamed document to ${payload.title}`],
        ["document_type", previous.document_type, payload.document_type, `Changed document type to ${payload.document_type}`],
        ["related_type", previous.related_type, payload.related_type, "Changed document linkage"],
        ["related_id", previous.related_id, payload.related_id, "Changed linked record"],
        ["visibility", previous.visibility, payload.visibility, `Changed visibility to ${payload.visibility}`],
      ]
    : [];

  if (!changes.length) {
    await logActivity({
      userId: actorUserId,
      action: "Updated document metadata",
      entityType: "document",
      entityId: id,
      metadata: {
        kind: "update",
        summary: "Document updated",
      },
    });

    return id;
  }

  const activityTasks: Promise<void>[] = [];

  for (const [field, from, to, action] of changes) {
    if (from === to) {
      continue;
    }

    activityTasks.push(
      logActivity({
        userId: actorUserId,
        action,
        entityType: "document",
        entityId: id,
        metadata: {
          kind: "update",
          field,
          from,
          to,
        },
      }),
    );
  }

  await Promise.all(activityTasks);

  return id;
}

export async function setDocumentArchiveState(id: string, isArchived: boolean, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let updateQuery = supabase
    .from("documents")
    .update({
      is_archived: isArchived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  updateQuery = applyEntityScope(updateQuery, entityCode);

  const { error } = await updateQuery;

  if (error) {
    throw new Error(error.message);
  }

  await logActivity({
    userId: actorUserId,
    action: isArchived ? "Archived document" : "Restored document",
    entityType: "document",
    entityId: id,
    metadata: {
      kind: "update",
      field: "is_archived",
      to: isArchived,
      summary: isArchived ? "Document archived" : "Document restored",
    },
  });
}

export async function deleteDocument(id: string, actorUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let existingQuery = supabase
    .from("documents")
    .select("file_url")
    .eq("id", id);

  existingQuery = applyEntityScope(existingQuery, entityCode);

  const { data, error } = await existingQuery.maybeSingle<{ file_url: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return;
  }

  const { error: removeError } = await supabase.storage.from("documents").remove([data.file_url]);

  if (removeError) {
    throw new Error(removeError.message);
  }

  let deleteQuery = supabase.from("documents").delete().eq("id", id);
  deleteQuery = applyEntityScope(deleteQuery, entityCode);
  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await logActivity({
    userId: actorUserId,
    action: "Deleted document",
    entityType: "document",
    entityId: id,
    metadata: {
      kind: "delete",
      summary: "Document deleted",
    },
  });
}

export async function getDocumentDownloadUrl(id: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getCurrentEntityCode();
  let query = supabase
    .from("documents")
    .select("id, file_url")
    .eq("id", id);

  query = applyEntityScope(query, entityCode);

  const { data: document, error } = await query.maybeSingle<{ id: string; file_url: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!document) {
    return null;
  }

  const { data, error: signedError } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.file_url, 60);

  if (signedError) {
    throw new Error(signedError.message);
  }

  return data.signedUrl;
}
