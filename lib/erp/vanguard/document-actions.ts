"use server";

import { canRoleAccessRoute } from "@/lib/auth/permissions";
import { getDocuments, getDocumentsFilterData } from "@/lib/documents/service";
import { requireErpAccess } from "@/lib/erp/server";
import type { DocumentFiltersData, DocumentRecord } from "@/types/document";

// The Archives room's "Documents" tab (vanguard/one/Documents.tsx): BUMEX One's documents, for the people its
// Documents page was for, with what the upload form links them to. Files download through BUMEX One's route
// (/api/documents/<id>/download), which checks the person's rights again.

const FIELDS = ["id", "title", "description", "document_type", "related_type", "related_id", "file_name", "file_size", "mime_type", "visibility", "is_archived", "updated_at", "relatedLabel", "categoryLabel"] as const;
export type DocumentRow = Pick<DocumentRecord, (typeof FIELDS)[number]> & { uploaderName: string | null };
export type DocumentsData = { documents: DocumentRow[]; options: Pick<DocumentFiltersData, "clients" | "projects" | "contracts" | "tickets">; canManage: boolean } | null;

export async function documentsAction(): Promise<DocumentsData> {
  const { auth } = await requireErpAccess();
  if (!canRoleAccessRoute(auth.role, "documents")) return null;
  const [documents, options] = await Promise.all([getDocuments(auth.role, { archiveState: "all" }), getDocumentsFilterData()]);
  return {
    documents: documents.map((d) => ({ ...(Object.fromEntries(FIELDS.map((k) => [k, d[k]])) as Pick<DocumentRecord, (typeof FIELDS)[number]>), uploaderName: d.uploadedBy?.full_name ?? null })),
    options: { clients: options.clients, projects: options.projects, contracts: options.contracts, tickets: options.tickets },
    canManage: auth.role !== "shareholder" && auth.role !== "supervisor",
  };
}
