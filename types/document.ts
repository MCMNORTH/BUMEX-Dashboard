import type { ActivityLogRecord } from "@/types/activity";
import type { Profile } from "@/types/auth";
import type { ClientRecord } from "@/types/client";
import type { ContractRecord } from "@/types/contract";
import type { InvoiceRecord, PaymentRecord, TransferRecord } from "@/types/finance";
import type { ProjectRecord } from "@/types/project";
import type { TicketRecord } from "@/types/ticket";

export type DocumentType =
  | "contract"
  | "invoice"
  | "receipt"
  | "bank_transfer"
  | "proposal"
  | "report"
  | "meeting_note"
  | "technical_document"
  | "legal_document"
  | "other";

export type DocumentVisibility = "internal" | "management" | "shareholders" | "restricted";
export type DocumentRelatedType = "client" | "project" | "task" | "contract" | "invoice" | "payment" | "transfer" | "archive";

export type DocumentUploader = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;
export type DocumentClientPreview = Pick<ClientRecord, "id" | "name" | "status" | "contact_email">;
export type DocumentProjectPreview = Pick<ProjectRecord, "id" | "name" | "status" | "end_date">;
export type DocumentContractPreview = Pick<ContractRecord, "id" | "title" | "status" | "end_date">;
export type DocumentTicketPreview = Pick<TicketRecord, "id" | "title" | "status" | "priority" | "due_date">;
export type DocumentInvoicePreview = Pick<InvoiceRecord, "id" | "invoice_number" | "status" | "due_date" | "amount_ttc">;
export type DocumentPaymentPreview = Pick<PaymentRecord, "id" | "reference" | "status" | "amount" | "currency">;
export type DocumentTransferPreview = Pick<TransferRecord, "id" | "transfer_reference" | "status" | "amount" | "currency">;

export type DocumentRecord = {
  id: string;
  title: string;
  description: string | null;
  document_type: DocumentType;
  related_type: DocumentRelatedType;
  related_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  uploaded_by: string;
  visibility: DocumentVisibility;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  uploadedBy: DocumentUploader | null;
  client: DocumentClientPreview | null;
  project: DocumentProjectPreview | null;
  contract: DocumentContractPreview | null;
  ticket: DocumentTicketPreview | null;
  recentActivity: ActivityLogRecord[];
  categoryLabel: string;
  relatedLabel: string;
  viewMode: "full" | "summary";
};

export type DocumentFilters = {
  search?: string;
  documentType?: DocumentType | "";
  relatedType?: DocumentRelatedType | "";
  clientId?: string;
  projectId?: string;
  contractId?: string;
  uploadedBy?: string;
  archiveState?: "active" | "archived" | "all";
  visibility?: DocumentVisibility | "";
  date?: "all" | "recent_7d" | "recent_30d" | "older";
};

export type DocumentFormValues = {
  title: string;
  description: string;
  document_type: DocumentType;
  related_type: DocumentRelatedType;
  related_id: string;
  visibility: DocumentVisibility;
};

export type DocumentFiltersData = {
  clients: DocumentClientPreview[];
  projects: DocumentProjectPreview[];
  contracts: DocumentContractPreview[];
  tickets: DocumentTicketPreview[];
  invoices: DocumentInvoicePreview[];
  payments: DocumentPaymentPreview[];
  transfers: DocumentTransferPreview[];
  uploadedByOptions: DocumentUploader[];
};
