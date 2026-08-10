import type { ActivityLogRecord } from "@/types/activity";
import type { Profile } from "@/types/auth";
import type { ClientRecord } from "@/types/client";
import type { ContractRecord } from "@/types/contract";
import type { BumexEntityCode } from "@/types/entity";
import type { ProjectRecord } from "@/types/project";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "archived";

export type PaymentStatus = "expected" | "received" | "late" | "cancelled" | "reconciled";
export type PaymentMethod = "cash" | "bank_transfer" | "check" | "mobile_money" | "card" | "other";
export type InvoiceLineItem = {
  name: string;
  price: number;
};
export type TransferStatus = "planned" | "pending" | "sent" | "confirmed" | "failed" | "cancelled";
export type TransferCategory =
  | "supplier"
  | "salary"
  | "subcontractor"
  | "software"
  | "hosting"
  | "taxes"
  | "rent"
  | "other";
export type TransferEntity = "bumex_it" | "insec" | "cnam_intec" | "ltm_yh" | "unassigned";

export type FinanceUserPreview = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;
export type FinanceClientPreview = Pick<ClientRecord, "id" | "name" | "status" | "contact_email">;
export type FinanceProjectPreview = Pick<ProjectRecord, "id" | "name" | "status" | "end_date">;
export type FinanceContractPreview = Pick<ContractRecord, "id" | "title" | "status" | "renewal_date" | "end_date">;
export type FinanceSupportingDocument = {
  id: string;
  title: string;
  file_name: string;
  document_type: "invoice" | "receipt" | "bank_transfer" | "other" | string;
  created_at: string;
};

export type InvoiceRecord = {
  id: string;
  entity_code: BumexEntityCode | null;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  contract_id: string | null;
  issue_date: string;
  due_date: string;
  amount_ht: number;
  tax_amount: number;
  amount_ttc: number;
  currency: string;
  status: InvoiceStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client: FinanceClientPreview | null;
  project: FinanceProjectPreview | null;
  contract: FinanceContractPreview | null;
  createdBy: FinanceUserPreview | null;
  linkedPayments: PaymentRecord[];
  receipts: ReceiptRecord[];
  supportingDocuments: FinanceSupportingDocument[];
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: InvoiceStatus;
  recentActivity: ActivityLogRecord[];
  viewMode: "full" | "summary";
};

export type PaymentInvoicePreview = Pick<
  InvoiceRecord,
  "id" | "invoice_number" | "status" | "due_date" | "amount_ttc"
>;

export type PaymentRecord = {
  id: string;
  invoice_id: string | null;
  client_id: string;
  project_id: string | null;
  contract_id: string | null;
  amount: number;
  currency: string;
  payment_date: string | null;
  due_date: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client: FinanceClientPreview | null;
  project: FinanceProjectPreview | null;
  contract: FinanceContractPreview | null;
  invoice: PaymentInvoicePreview | null;
  createdBy: FinanceUserPreview | null;
  recentActivity: ActivityLogRecord[];
  supportingDocuments: FinanceSupportingDocument[];
  viewMode: "full" | "summary";
};

export type TransferRecord = {
  id: string;
  transfer_reference: string;
  beneficiary_name: string;
  beneficiary_bank: string | null;
  beneficiary_account: string | null;
  amount: number;
  currency: string;
  transfer_date: string;
  status: TransferStatus;
  category: TransferCategory;
  entity: TransferEntity;
  related_project_id: string | null;
  related_client_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  relatedProject: FinanceProjectPreview | null;
  relatedClient: FinanceClientPreview | null;
  createdBy: FinanceUserPreview | null;
  recentActivity: ActivityLogRecord[];
  supportingDocuments: FinanceSupportingDocument[];
  viewMode: "full" | "summary";
};

export type FinanceFilters = {
  clientId?: string;
  projectId?: string;
  contractId?: string;
  invoiceId?: string;
  status?: string;
  method?: PaymentMethod | "";
  dueWindow?: "all" | "overdue" | "next_7_days" | "next_30_days";
  search?: string;
};

export type PaymentFormValues = {
  client_id: string;
  project_id: string;
  contract_id: string;
  invoice_id: string;
  amount: string;
  currency: string;
  due_date: string;
  payment_date: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  notes: string;
};

export type PaymentFiltersData = {
  clients: FinanceClientPreview[];
  projects: FinanceProjectPreview[];
  contracts: FinanceContractPreview[];
  invoices: PaymentInvoicePreview[];
  users: FinanceUserPreview[];
};

export type PaymentSummary = {
  total: number;
  overdueCount: number;
  expectedCount: number;
  receivedCount: number;
  totalExpectedAmount: number;
  totalReceivedAmount: number;
};

export type ReceiptRecord = {
  id: string;
  receipt_number: string;
  payment_id: string;
  issue_date: string;
  amount: number;
  document_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  payment: Pick<PaymentRecord, "id" | "reference" | "amount" | "currency" | "status"> | null;
  document: {
    id: string;
    title: string;
    document_type: "receipt" | "invoice" | "other" | string;
  } | null;
  createdBy: FinanceUserPreview | null;
  viewMode: "full" | "summary";
};

export type InvoiceFilters = {
  clientId?: string;
  projectId?: string;
  contractId?: string;
  status?: InvoiceStatus | "";
  dueWindow?: "all" | "overdue" | "next_7_days" | "next_30_days";
  search?: string;
};

export type InvoiceFormValues = {
  invoice_number: string;
  client_id: string;
  project_id: string;
  contract_id: string;
  issue_date: string;
  due_date: string;
  amount_ht: string;
  tax_amount: string;
  amount_ttc: string;
  currency: string;
  status: InvoiceStatus;
  notes: string;
};

export type ReceiptFormValues = {
  receipt_number: string;
  payment_id: string;
  issue_date: string;
  amount: string;
  document_id: string;
  notes: string;
};

export type InvoiceFiltersData = {
  clients: FinanceClientPreview[];
  projects: FinanceProjectPreview[];
  contracts: FinanceContractPreview[];
  documents: Array<{
    id: string;
    title: string;
    document_type: string;
  }>;
};

export type InvoiceSummary = {
  draftCount: number;
  sentCount: number;
  overdueCount: number;
  paidCount: number;
  totalInvoicedThisMonth: number;
};

export type InvoicePaymentSummary = {
  totalPaid: number;
  remainingBalance: number;
  linkedPaymentsCount: number;
  receiptCount: number;
  paymentStatus: InvoiceStatus;
};

export type FinanceKpiCard = {
  label: string;
  value: number;
  currency?: string;
  detail: string;
};

export type MonthlyFinancePoint = {
  month: string;
  inflow: number;
  outflow: number;
  expected: number;
  received: number;
};

export type InvoiceStatusPoint = {
  status: InvoiceStatus;
  count: number;
};

export type OverdueClientPoint = {
  clientId: string;
  clientName: string;
  overdueAmount: number;
  overdueCount: number;
  latePaymentCount: number;
};

export type UpcomingFinanceDeadline = {
  kind: "invoice_due" | "payment_due" | "contract_placeholder";
  label: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: string;
  clientName: string | null;
};

export type FinanceRiskItem = {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  href?: string | null;
  amount?: number | null;
  currency?: string | null;
};

export type FinanceOverview = {
  totalExpectedThisMonth: number;
  totalReceivedThisMonth: number;
  totalOverdue: number;
  totalOutgoingThisMonth: number;
  pendingInvoices: number;
  pendingInvoiceAmount: number;
  confirmedTransfers: number;
  revenueSummary: number;
  expectedPayments: number;
  overduePayments: number;
  paidInvoices: number;
  unpaidInvoices: number;
  outgoingTransfers: number;
  netOperationalBalanceEstimate: number;
  upcomingFinancialDeadlines: UpcomingFinanceDeadline[];
  kpiCards: FinanceKpiCard[];
};

export type ShareholderFinanceSummary = {
  revenue: number;
  expenses: number;
  expectedCollections: number;
  overdueExposure: number;
  paidInvoices: number;
  unpaidInvoices: number;
  confirmedTransfers: number;
  netEstimate: number;
  projectProfitabilityPlaceholder: string;
};

export type TransferFilters = {
  clientId?: string;
  projectId?: string;
  status?: TransferStatus | "";
  category?: TransferCategory | "";
  entity?: TransferEntity | "";
  dateWindow?: "all" | "this_month" | "next_30_days" | "past_30_days";
  search?: string;
};

export type TransferFormValues = {
  transfer_reference: string;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_account: string;
  amount: string;
  currency: string;
  transfer_date: string;
  status: TransferStatus;
  category: TransferCategory;
  entity: TransferEntity;
  related_project_id: string;
  related_client_id: string;
  notes: string;
};

export type TransferFiltersData = {
  clients: FinanceClientPreview[];
  projects: FinanceProjectPreview[];
};

export type TransferSummary = {
  plannedCount: number;
  pendingCount: number;
  confirmedCount: number;
  failedCount: number;
  totalOutgoingThisMonth: number;
};

export type BankStatementMatchStatus = "matched" | "review" | "unmatched";

export type BankStatementMatchedEntityType = "invoice" | "payment" | "transfer";

export type BankStatementLineRecord = {
  id: string;
  statement_id: string;
  line_date: string;
  description: string;
  reference: string | null;
  credit_amount: number;
  debit_amount: number;
  amount: number;
  currency: string;
  match_status: BankStatementMatchStatus;
  matched_entity_type: BankStatementMatchedEntityType | null;
  matched_entity_id: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  created_at: string;
};

export type BankStatementRecord = {
  id: string;
  account_label: string;
  statement_label: string;
  statement_date: string;
  currency: string;
  raw_content: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  createdBy: FinanceUserPreview | null;
  lines: BankStatementLineRecord[];
};

export type BankStatementFormValues = {
  account_label: string;
  statement_label: string;
  statement_date: string;
  currency: string;
  raw_content: string;
  notes: string;
};

export type BankStatementSummary = {
  statementsCount: number;
  matchedLines: number;
  reviewLines: number;
  unmatchedLines: number;
  latestBalanceDelta: number;
};
