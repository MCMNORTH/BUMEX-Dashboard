import "server-only";

import { randomUUID } from "node:crypto";

import { getSubjectsActivity, logActivity } from "@/lib/activity/service";
import { storage } from "@/lib/firebase/storage";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select, selectOne } from "@/lib/work/db";
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
  DocumentTicketPreview,
  DocumentTransferPreview,
  DocumentUploader,
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

function getCategoryLabel(documentType: DocumentRecord["document_type"]) {
  return documentType.replaceAll("_", " ");
}

// A document (work.document, 0008; its file in Firebase Storage) with its uploader and what it is linked to, each read
// with the person's rules (a record they may not see reads as none).
const DOCUMENT_SQL = `
  select d.id, d.title, d.description, d.document_type, d.related_type, d.related_id, d.file_url, d.file_name, d.file_size, d.mime_type,
         d.uploaded_by, d.visibility, d.is_archived, d.created_at, d.updated_at,
         (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
            from work.person p where p.id = d.uploaded_by) as "uploadedBy",
         case when d.related_type = 'client' then (select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'contact_email', c.contact_email)
                                                     from work.client c where c.id = d.related_id) end as client,
         case when d.related_type = 'project' then (select jsonb_build_object('id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end,
                                                                              'end_date', e.deadline)
                                                      from erp.engagement e where e.id = d.related_id) end as project,
         case when d.related_type = 'contract' then (select jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'end_date', k.end_date)
                                                       from work.contract k where k.id = d.related_id) end as contract,
         case when d.related_type = 'task' then (select jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
                                                                           'priority', case when t.priority = 'normal' then 'medium' else t.priority end, 'due_date', t.due_date)
                                                   from erp.task t where t.id = d.related_id) end as ticket,
         case when d.related_type = 'invoice' then (select jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number, 'status', i.status, 'due_date', i.due_date,
                                                                              'amount_ttc', i.amount_ttc::float8)
                                                      from work.finance_invoice i where i.id = d.related_id) end as invoice,
         case when d.related_type = 'payment' then (select jsonb_build_object('id', x.id, 'reference', x.reference, 'status', x.status, 'amount', x.amount::float8, 'currency', x.currency)
                                                      from work.finance_payment x where x.id = d.related_id) end as payment,
         case when d.related_type = 'transfer' then (select jsonb_build_object('id', x.id, 'transfer_reference', x.transfer_reference, 'status', x.status,
                                                                               'amount', x.amount::float8, 'currency', x.currency)
                                                       from work.finance_transfer x where x.id = d.related_id) end as transfer
    from work.document d`;

type DocumentReadRow = DocumentRow & {
  uploadedBy: DocumentUploader | null;
  client: DocumentClientPreview | null;
  project: DocumentProjectPreview | null;
  contract: DocumentContractPreview | null;
  ticket: DocumentTicketPreview | null;
  invoice: DocumentInvoicePreview | null;
  payment: DocumentPaymentPreview | null;
  transfer: DocumentTransferPreview | null;
};

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

function mapDocument(row: DocumentReadRow, role: AppRole, activities: Map<string, ActivityLogRecord[]>): DocumentRecord {
  const { uploadedBy, client, project, contract, ticket, invoice, payment, transfer, ...document } = row;
  return {
    ...document,
    uploadedBy,
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
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const daysAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  if (filters.documentType) where.push(`d.document_type = ${param(filters.documentType)}`);
  if (filters.relatedType) where.push(`d.related_type = ${param(filters.relatedType)}`);
  if (filters.uploadedBy) where.push(`d.uploaded_by = ${param(filters.uploadedBy)}`);
  if (filters.visibility) where.push(`d.visibility = ${param(filters.visibility)}`);
  if (filters.archiveState === "active") where.push("not d.is_archived");
  if (filters.archiveState === "archived") where.push("d.is_archived");
  if (filters.date === "recent_7d") where.push(`d.created_at >= ${param(daysAgo(7))}::timestamptz`);
  if (filters.date === "recent_30d") where.push(`d.created_at >= ${param(daysAgo(30))}::timestamptz`);
  if (filters.date === "older") where.push(`d.created_at < ${param(daysAgo(30))}::timestamptz`);

  const rows = await asPerson((tx) =>
    select<DocumentReadRow>(tx, `${DOCUMENT_SQL} ${where.length ? `where ${where.join(" and ")}` : ""} order by d.updated_at desc`, params),
  );
  const terms = filters.search ? searchTerms(filters.search) : [];
  const found = rows.filter((row) => matchesSearchTerms(terms, [row.title, row.description, row.file_name]));
  const activities = await getSubjectsActivity("document", found.map((row) => row.id), 8);

  return filterMappedDocuments(found.map((row) => mapDocument(row, role, activities)), filters);
}

export async function getDocumentById(id: string, role: AppRole) {
  const row = await asPerson((tx) => selectOne<DocumentReadRow>(tx, `${DOCUMENT_SQL} where d.id = $1::uuid`, [id])).catch(() => null);

  if (!row) {
    return null;
  }

  return mapDocument(row, role, await getSubjectsActivity("document", [id], 8));
}

export async function getDocumentsFilterData(): Promise<DocumentFiltersData> {
  return asPerson(async (tx) => ({
    clients: await select<DocumentClientPreview>(tx, "select id, name, status, contact_email from work.client order by name"),
    projects: await select<DocumentProjectPreview>(
      tx,
      "select id, name, case when status = 'planned' then 'draft' else status::text end as status, deadline as end_date from erp.engagement order by name",
    ),
    contracts: await select<DocumentContractPreview>(tx, "select id, title, status, end_date from work.contract order by title"),
    tickets: await select<DocumentTicketPreview>(
      tx,
      `select id, title, status, case when priority = 'normal' then 'medium' else priority end as priority, due_date
         from erp.task where engagement_id is not null order by updated_at desc limit 100`,
    ),
    invoices: await select<DocumentInvoicePreview>(
      tx,
      "select id, invoice_number, status, due_date, amount_ttc::float8 as amount_ttc from work.finance_invoice order by created_at desc limit 100",
    ),
    payments: await select<DocumentPaymentPreview>(tx, "select id, reference, status, amount::float8 as amount, currency from work.finance_payment order by created_at desc limit 100"),
    transfers: await select<DocumentTransferPreview>(
      tx,
      "select id, transfer_reference, status, amount::float8 as amount, currency from work.finance_transfer order by created_at desc limit 100",
    ),
    uploadedByOptions: await select<DocumentUploader>(
      tx,
      "select p.id, p.full_name, p.email, p.avatar_url, work.person_role(p.id) as role from work.person p order by p.full_name",
    ),
  }));
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
  validateFile(file);
  const payload = parseDocumentPayload(values);
  const path = getStoragePath(file.name, actorUserId);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await storage.from("documents").upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  let data: { id: string } | null;
  try {
    data = await asPerson((tx) =>
      selectOne<{ id: string }>(
        tx,
        `insert into work.document (title, description, document_type, related_type, related_id, visibility, file_url, file_name, file_size, mime_type,
                                    uploaded_by, entity_code)
         values ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, (select entity_code from work.person where id = erp.actor_id()))
         returning id`,
        [payload.title, payload.description, payload.document_type, payload.related_type, payload.related_id, payload.visibility, path, file.name, file.size,
          file.type || null, actorUserId],
      ),
    );
  } catch (error) {
    await storage.from("documents").remove([path]);
    throw error;
  }

  if (!data) {
    await storage.from("documents").remove([path]);
    throw new Error("Document creation did not return an id.");
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

export async function updateDocument(id: string, values: DocumentFormValues, actorUserId: string) {
  const payload = parseDocumentPayload(values);
  const previous = await asPerson(async (tx) => {
    const before = await selectOne<{
      title: string;
      document_type: DocumentRecord["document_type"];
      related_type: DocumentRecord["related_type"];
      related_id: string | null;
      visibility: DocumentRecord["visibility"];
    }>(tx, "select title, document_type, related_type, related_id, visibility from work.document where id = $1::uuid", [id]);
    const updated = await tx.run(
      `update work.document set title = $2, description = $3, document_type = $4, related_type = $5, related_id = $6::uuid, visibility = $7
        where id = $1::uuid`,
      [id, payload.title, payload.description, payload.document_type, payload.related_type, payload.related_id, payload.visibility],
    );
    if (!updated) throw new Error("You cannot edit this document.");
    return before;
  });

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
  const updated = await asPerson((tx) => tx.run("update work.document set is_archived = $2 where id = $1::uuid", [id, isArchived]));

  if (!updated) {
    throw new Error("You cannot change this document.");
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
  // the row first (the rules decide), then its file
  const deleted = await asPerson((tx) => select<{ file_url: string }>(tx, "delete from work.document where id = $1::uuid returning file_url", [id]));

  if (!deleted.length) {
    return;
  }

  const { error: removeError } = await storage.from("documents").remove([deleted[0].file_url]);

  if (removeError) {
    console.error("[documents:delete] file left in storage", removeError.message);
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
  const document = await asPerson((tx) => selectOne<{ file_url: string }>(tx, "select file_url from work.document where id = $1::uuid", [id])).catch(() => null);

  if (!document) {
    return null;
  }

  const { data, error: signedError } = await storage.from("documents").createSignedUrl(document.file_url, 60);

  if (signedError) {
    throw new Error(signedError.message);
  }

  return data.signedUrl;
}
