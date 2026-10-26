import "server-only";

import { getSubjectsActivity } from "@/lib/activity/service";
import { getContracts } from "@/lib/contracts/service";
import { getDueWindowDates, parseTransferNotesMetadata } from "@/lib/finance/helpers";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, asSystem, personId, select } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { ActivityLogRecord } from "@/types/activity";
import type {
  BankStatementRecord,
  FinanceFilters,
  FinanceOverview,
  FinanceRiskItem,
  InvoiceFilters,
  InvoiceRecord,
  InvoiceStatus,
  OverdueClientPoint,
  PaymentRecord,
  ReceiptRecord,
  ShareholderFinanceSummary,
  TransferEntity,
  TransferFilters,
  TransferRecord,
  UpcomingFinanceDeadline,
} from "@/types/finance";

// BUMEX One's finance records (invoices, payments, receipts, transfers, bank statements) are an archive since the ERP
// keeps the books: work.finance_* (0008), read only. They are read in the person's session, where BUMEX One's rules are
// row-level security (administrators read them all, managers those of their clients, missions and contracts). A
// record's project is its mission (engagement_id).

// How many of its latest activity entries a record carries.
const ACTIVITY_PER_RECORD = 20;

type InvoiceRow = Omit<InvoiceRecord, "linkedPayments" | "receipts" | "totalPaid" | "remainingBalance" | "paymentStatus" | "recentActivity" | "viewMode">;
type PaymentRow = Omit<PaymentRecord, "recentActivity" | "viewMode">;
type ReceiptRow = Omit<ReceiptRecord, "viewMode">;
type TransferRow = Omit<TransferRecord, "entity" | "renewal" | "recentActivity" | "viewMode">;

// A record's links as the pages show them; one the person may not see reads as none.
const clientJson = (column: string) =>
  `(select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'contact_email', c.contact_email) from work.client c where c.id = ${column})`;
const projectJson = (column: string) =>
  `(select jsonb_build_object('id', e.id, 'name', e.name, 'status', case when e.status = 'planned' then 'draft' else e.status::text end, 'end_date', e.deadline)
      from erp.engagement e where e.id = ${column})`;
const contractJson = (column: string) =>
  `(select jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status, 'renewal_date', k.renewal_date, 'end_date', k.end_date)
      from work.contract k where k.id = ${column})`;
const personJson = (column: string) =>
  `(select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'role', work.person_role(p.id))
      from work.person p where p.id = ${column})`;
// the files attached to a record, latest first
const documentsJson = (relatedType: "invoice" | "payment" | "transfer", column: string) =>
  `coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'file_name', d.file_name, 'document_type', d.document_type,
                                                 'created_at', d.created_at) order by d.created_at desc)
               from work.document d where d.related_type = '${relatedType}' and d.related_id = ${column}), '[]'::jsonb)`;

// An invoice without an entity (production wrote them unscoped) is shown as the reader's entity's, as BUMEX One did.
const INVOICE_SQL = `
  select i.id, coalesce(i.entity_code, (select entity_code from work.person where id = erp.actor_id())) as entity_code, i.invoice_number, i.client_id,
         i.engagement_id as project_id, i.contract_id, i.issue_date, i.due_date, i.amount_ht, i.tax_amount, i.amount_ttc, i.currency, i.status, i.notes,
         i.created_by, i.created_at, i.updated_at, i.approval_status, i.approved_by, i.approved_at,
         ${clientJson("i.client_id")} as client, ${projectJson("i.engagement_id")} as project, ${contractJson("i.contract_id")} as contract,
         ${personJson("i.created_by")} as "createdBy", ${personJson("i.approved_by")} as "approvedBy",
         ${documentsJson("invoice", "i.id")} as "supportingDocuments"
    from work.finance_invoice i`;

const PAYMENT_SQL = `
  select x.id, x.invoice_id, x.client_id, x.engagement_id as project_id, x.contract_id, x.amount, x.currency, x.payment_date, x.due_date, x.method,
         x.status, x.reference, x.notes, x.created_by, x.created_at, x.updated_at,
         ${clientJson("x.client_id")} as client, ${projectJson("x.engagement_id")} as project, ${contractJson("x.contract_id")} as contract,
         (select jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number, 'status', i.status, 'due_date', i.due_date, 'amount_ttc', i.amount_ttc)
            from work.finance_invoice i where i.id = x.invoice_id) as invoice,
         ${personJson("x.created_by")} as "createdBy", ${documentsJson("payment", "x.id")} as "supportingDocuments"
    from work.finance_payment x`;

const RECEIPT_SQL = `
  select r.id, r.receipt_number, r.payment_id, r.issue_date, r.amount, r.document_id, r.notes, r.created_by, r.created_at, r.updated_at,
         (select jsonb_build_object('id', x.id, 'reference', x.reference, 'amount', x.amount, 'currency', x.currency, 'status', x.status)
            from work.finance_payment x where x.id = r.payment_id) as payment,
         (select jsonb_build_object('id', d.id, 'title', d.title, 'document_type', d.document_type) from work.document d where d.id = r.document_id) as document,
         ${personJson("r.created_by")} as "createdBy"
    from work.finance_receipt r`;

const TRANSFER_SQL = `
  select t.id, t.transfer_reference, t.beneficiary_name, t.beneficiary_bank, t.beneficiary_account, t.amount, t.currency, t.transfer_date, t.status,
         t.category, t.engagement_id as related_project_id, t.client_id as related_client_id, t.notes, t.created_by, t.created_at, t.updated_at,
         ${projectJson("t.engagement_id")} as "relatedProject", ${clientJson("t.client_id")} as "relatedClient", ${personJson("t.created_by")} as "createdBy",
         ${documentsJson("transfer", "t.id")} as "supportingDocuments"
    from work.finance_transfer t`;

// a statement with its lines (latest first), each line's amount signed: credit in, debit out
const BANK_STATEMENT_SQL = `
  select s.id, s.account_label, s.statement_label, s.statement_date, s.currency, s.raw_content, s.notes, s.created_by, s.created_at, s.updated_at,
         ${personJson("s.created_by")} as "createdBy",
         coalesce((select jsonb_agg((to_jsonb(l) - 'entity_code') || jsonb_build_object('amount', l.credit_amount - l.debit_amount) order by l.line_date desc)
                     from work.finance_bank_statement_line l where l.statement_id = s.id), '[]'::jsonb) as lines
    from work.finance_bank_statement s`;

// A query's conditions and their parameters ($1, $2, …).
function sqlFilter() {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  return { where, params, param, sql: () => (where.length ? `where ${where.join(" and ")}` : "") };
}

function dueWindowCondition(column: string, window: FinanceFilters["dueWindow"], param: (value: unknown) => string) {
  const { today, next7, next30 } = getDueWindowDates(window);

  if (window === "overdue") return `${column} < ${param(today)}::date`;
  if (window === "next_7_days") return `${column} between ${param(today)}::date and ${param(next7)}::date`;
  if (window === "next_30_days") return `${column} between ${param(today)}::date and ${param(next30)}::date`;
  return null;
}

// this month so far, the next or the past 30 days (UTC dates, as BUMEX One compared them)
function transferDateWindow(window: TransferFilters["dateWindow"]) {
  const today = new Date();
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const shifted = (days: number) => {
    const date = new Date(today);
    date.setDate(today.getDate() + days);
    return day(date);
  };

  if (window === "this_month") return [day(new Date(today.getFullYear(), today.getMonth(), 1)), day(today)];
  if (window === "next_30_days") return [day(today), shifted(30)];
  if (window === "past_30_days") return [shifted(-30), day(today)];
  return null;
}

function groupBy<T>(items: T[], key: (item: T) => string | null) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    const group = groups.get(value);
    if (group) group.push(item);
    else groups.set(value, [item]);
  }

  return groups;
}

// A shareholder reads the records' figures, the others everything.
function viewModeFor(role: AppRole): InvoiceRecord["viewMode"] {
  return role === "shareholder" ? "summary" : "full";
}

const isReceived = (payment: Pick<PaymentRecord, "status">) => payment.status === "received" || payment.status === "reconciled";

// An invoice's status as its payments make it: paid, partially paid, overdue once its due date is past, or as it was set.
function getInvoicePaymentStatus(invoice: Pick<InvoiceRow, "status" | "due_date" | "amount_ttc">, totalPaid: number): InvoiceStatus {
  if (invoice.status === "cancelled" || invoice.status === "archived") {
    return invoice.status;
  }

  if (totalPaid >= invoice.amount_ttc && invoice.amount_ttc > 0) {
    return "paid";
  }

  if (totalPaid > 0 && totalPaid < invoice.amount_ttc) {
    return "partially_paid";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.due_date);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime() ? "overdue" : invoice.status;
}

// Invoices with their payments (and those payments' receipts), files and activity.
async function readInvoices(role: AppRole, whereSql: string, params: unknown[], search = ""): Promise<InvoiceRecord[]> {
  const terms = searchTerms(search);
  const { rows, payments, receipts } = await asPerson(async (tx) => {
    const rows = (await select<InvoiceRow>(tx, `${INVOICE_SQL} ${whereSql} order by i.created_at desc`, params))
      .filter((row) => matchesSearchTerms(terms, [row.invoice_number, row.notes]));
    const payments = await select<PaymentRow>(tx, `${PAYMENT_SQL} where x.invoice_id = any($1::uuid[]) order by x.created_at desc`, [rows.map((row) => row.id)]);
    const receipts = await select<ReceiptRow>(tx, `${RECEIPT_SQL} where r.payment_id = any($1::uuid[]) order by r.created_at desc`, [payments.map((payment) => payment.id)]);
    return { rows, payments, receipts };
  });
  const activity = await getSubjectsActivity("invoice", rows.map((row) => row.id), ACTIVITY_PER_RECORD);
  const viewMode = viewModeFor(role);
  const paymentsByInvoice = groupBy(payments, (payment) => payment.invoice_id);
  const receiptsByPayment = groupBy(receipts, (receipt) => receipt.payment_id);

  return rows.map((row): InvoiceRecord => {
    const linkedPayments = (paymentsByInvoice.get(row.id) ?? []).map((payment): PaymentRecord => ({ ...payment, recentActivity: [], viewMode }));
    const totalPaid = linkedPayments.filter(isReceived).reduce((sum, payment) => sum + payment.amount, 0);

    return {
      ...row,
      linkedPayments,
      receipts: linkedPayments.flatMap((payment) => (receiptsByPayment.get(payment.id) ?? []).map((receipt) => ({ ...receipt, viewMode }))),
      totalPaid,
      remainingBalance: Math.max(row.amount_ttc - totalPaid, 0),
      paymentStatus: getInvoicePaymentStatus(row, totalPaid),
      recentActivity: activity.get(row.id) ?? [],
      viewMode,
    };
  });
}

export async function getInvoices(role: AppRole, filters: InvoiceFilters = {}) {
  const filter = sqlFilter();

  if (filters.clientId) filter.where.push(`i.client_id = ${filter.param(filters.clientId)}::uuid`);
  if (filters.projectId) filter.where.push(`i.engagement_id = ${filter.param(filters.projectId)}::uuid`);
  if (filters.contractId) filter.where.push(`i.contract_id = ${filter.param(filters.contractId)}::uuid`);
  if (filters.status) filter.where.push(`i.status = ${filter.param(filters.status)}`);
  if (filters.approvalStatus) {
    filter.where.push(`i.approval_status = ${filter.param(filters.approvalStatus === "changes_requested" ? "pending" : filters.approvalStatus)}`);
  }
  const due = dueWindowCondition("i.due_date", filters.dueWindow, filter.param);
  if (due) filter.where.push(due);

  return readInvoices(role, filter.sql(), filter.params, filters.search);
}

export async function getInvoiceById(id: string, role: AppRole) {
  const [invoice] = await readInvoices(role, "where i.id = $1::uuid", [id]).catch(() => []);
  return invoice ?? null;
}

export async function getPayments(role: AppRole, filters: FinanceFilters = {}) {
  const filter = sqlFilter();

  if (filters.clientId) filter.where.push(`x.client_id = ${filter.param(filters.clientId)}::uuid`);
  if (filters.projectId) filter.where.push(`x.engagement_id = ${filter.param(filters.projectId)}::uuid`);
  if (filters.contractId) filter.where.push(`x.contract_id = ${filter.param(filters.contractId)}::uuid`);
  if (filters.invoiceId) filter.where.push(`x.invoice_id = ${filter.param(filters.invoiceId)}::uuid`);
  if (filters.status) filter.where.push(`x.status = ${filter.param(filters.status)}`);
  if (filters.method) filter.where.push(`x.method = ${filter.param(filters.method)}`);
  const due = dueWindowCondition("x.due_date", filters.dueWindow, filter.param);
  if (due) filter.where.push(due);

  const terms = searchTerms(filters.search ?? "");
  const rows = (await asPerson((tx) => select<PaymentRow>(tx, `${PAYMENT_SQL} ${filter.sql()} order by x.created_at desc`, filter.params)))
    .filter((row) => matchesSearchTerms(terms, [row.reference, row.notes]));
  const activity = await getSubjectsActivity("payment", rows.map((row) => row.id), ACTIVITY_PER_RECORD);

  return rows.map((row): PaymentRecord => ({ ...row, recentActivity: activity.get(row.id) ?? [], viewMode: viewModeFor(role) }));
}

export async function getOverduePayments(role: AppRole) {
  return getPayments(role, { dueWindow: "overdue", status: "late" });
}

export async function getExpectedPayments(role: AppRole) {
  return getPayments(role, { status: "expected" });
}

// A transfer's notes carry its entity and renewal settings (lib/finance/helpers.ts).
function mapTransfer(row: TransferRow, role: AppRole, recentActivity: ActivityLogRecord[]): TransferRecord {
  const metadata = parseTransferNotesMetadata(row.notes);

  return {
    ...row,
    entity: metadata.entity as TransferEntity,
    notes: metadata.notes,
    renewal: metadata.renewal,
    recentActivity,
    viewMode: viewModeFor(role),
  };
}

export async function getTransfers(role: AppRole, filters: TransferFilters = {}) {
  const filter = sqlFilter();

  if (filters.clientId) filter.where.push(`t.client_id = ${filter.param(filters.clientId)}::uuid`);
  if (filters.projectId) filter.where.push(`t.engagement_id = ${filter.param(filters.projectId)}::uuid`);
  if (filters.status) filter.where.push(`t.status = ${filter.param(filters.status)}`);
  if (filters.category) filter.where.push(`t.category = ${filter.param(filters.category)}`);
  const window = transferDateWindow(filters.dateWindow);
  if (window) filter.where.push(`t.transfer_date between ${filter.param(window[0])}::date and ${filter.param(window[1])}::date`);

  const terms = searchTerms(filters.search ?? "");
  const rows = (await asPerson((tx) => select<TransferRow>(tx, `${TRANSFER_SQL} ${filter.sql()} order by t.created_at desc`, filter.params)))
    .filter((row) => matchesSearchTerms(terms, [row.transfer_reference, row.beneficiary_name, row.beneficiary_bank, row.notes]))
    .filter((row) => !filters.entity || parseTransferNotesMetadata(row.notes).entity === filters.entity);
  const activity = await getSubjectsActivity("transfer", rows.map((row) => row.id), ACTIVITY_PER_RECORD);

  return rows.map((row) => mapTransfer(row, role, activity.get(row.id) ?? []));
}

export async function getBankStatements(role: AppRole): Promise<BankStatementRecord[]> {
  const statements = await asPerson((tx) => select<BankStatementRecord>(tx, `${BANK_STATEMENT_SQL} order by s.statement_date desc`));

  if (role !== "shareholder") {
    return statements;
  }

  // a shareholder reads the movements, not what the bank wrote
  return statements.map((statement) => ({
    ...statement,
    raw_content: "",
    notes: null,
    lines: statement.lines.map((line) => ({
      ...line,
      description: line.match_status === "matched" ? "Validated bank line" : "Bank line",
      reference: null,
    })),
  }));
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

function formatCurrencyNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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

// The totals of what the person may read (a shareholder reads no finance record: zeros).
export async function getShareholderFinanceSummary(): Promise<ShareholderFinanceSummary> {
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
    const { invoices, payments, transfers } = await asPerson(async (tx) => ({
      invoices: await select<{ amount_ttc: number; due_date: string; status: InvoiceStatus }>(tx, "select amount_ttc, due_date, status from work.finance_invoice"),
      payments: await select<{ amount: number; status: PaymentRecord["status"] }>(tx, "select amount, status from work.finance_payment"),
      transfers: await select<{ amount: number; status: TransferRecord["status"] }>(tx, "select amount, status from work.finance_transfer"),
    }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expectedCollections = payments
      .filter((payment) => payment.status === "expected" || payment.status === "late")
      .reduce((sum, payment) => sum + payment.amount, 0);

    const revenue = payments.filter(isReceived).reduce((sum, payment) => sum + payment.amount, 0);

    const overdueExposure = invoices
      .filter((invoice) => {
        if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "archived") {
          return false;
        }

        const dueDate = new Date(invoice.due_date);
        dueDate.setHours(0, 0, 0, 0);

        return invoice.status === "overdue" || dueDate.getTime() < today.getTime();
      })
      .reduce((sum, invoice) => sum + invoice.amount_ttc, 0);

    const expenses = transfers
      .filter((transfer) => transfer.status === "sent" || transfer.status === "confirmed")
      .reduce((sum, transfer) => sum + transfer.amount, 0);

    return {
      revenue,
      expenses,
      expectedCollections,
      overdueExposure,
      paidInvoices: invoices.filter((invoice) => invoice.status === "paid").length,
      unpaidInvoices: invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "archived").length,
      confirmedTransfers: transfers.filter((transfer) => transfer.status === "confirmed").length,
      netEstimate: revenue - expenses,
      projectProfitabilityPlaceholder: emptySummary.projectProfitabilityPlaceholder,
    };
  } catch {
    return emptySummary;
  }
}

// BUMEX One gave shareholders, who read no finance record, two views of the whole portfolio through database functions
// with full access (get_shareholder_overdue_clients, get_shareholder_finance_deadlines): they run in the system
// session, for the person.

// the clients with overdue invoices, most exposed first
async function getShareholderOverdueClients(): Promise<OverdueClientPoint[]> {
  return asSystem(await personId(), (tx) =>
    select<OverdueClientPoint>(
      tx,
      `select c.id as "clientId", c.name as "clientName", sum(i.amount_ttc) as "overdueAmount", count(*) as "overdueCount",
              (select count(*) from work.finance_payment x where x.client_id = c.id and x.status = 'late') as "latePaymentCount"
         from work.client c join work.finance_invoice i on i.client_id = c.id
        where i.status = 'overdue'
        group by c.id
        order by "overdueAmount" desc, "overdueCount" desc`,
    ),
  );
}

// the open invoices and expected payments due in the next 14 days (UTC), soonest first
async function getShareholderFinanceDeadlines(): Promise<UpcomingFinanceDeadline[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);

  return asSystem(await personId(), (tx) =>
    select<UpcomingFinanceDeadline>(
      tx,
      `select kind, label, due_date as "dueDate", amount, currency, status, client_name as "clientName" from (
         select 'invoice_due' as kind, i.invoice_number as label, i.due_date, i.amount_ttc as amount, i.currency, i.status,
                (select c.name from work.client c where c.id = i.client_id) as client_name
           from work.finance_invoice i
          where i.status not in ('paid', 'cancelled', 'archived') and i.due_date between $1::date and $2::date
         union all
         select 'payment_due', coalesce(x.reference, c.name, 'Payment due'), x.due_date, x.amount, x.currency, x.status, c.name
           from work.finance_payment x left join work.client c on c.id = x.client_id
          where x.status in ('expected', 'late') and x.due_date between $1::date and $2::date
       ) d
       order by d.due_date, d.kind
       limit 12`,
      [today, horizon.toISOString().slice(0, 10)],
    ),
  );
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
    .filter((payment) => isCurrentMonth(payment.payment_date) && isReceived(payment))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalOverdue = invoices
    .filter((invoice) => invoice.paymentStatus === "overdue")
    .reduce((sum, invoice) => sum + invoice.remainingBalance, 0);
  const totalOutgoingThisMonth = transfers
    .filter((transfer) => isCurrentMonth(transfer.transfer_date) && (transfer.status === "sent" || transfer.status === "confirmed"))
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const unpaid = invoices.filter((invoice) => invoice.paymentStatus !== "paid" && invoice.paymentStatus !== "cancelled" && invoice.paymentStatus !== "archived");
  const confirmedTransfers = transfers.filter((transfer) => transfer.status === "confirmed").length;
  const paidInvoices = invoices.filter((invoice) => invoice.paymentStatus === "paid").length;

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
    pendingInvoices: unpaid.length,
    pendingInvoiceAmount: unpaid.reduce((sum, invoice) => sum + invoice.remainingBalance, 0),
    confirmedTransfers,
    revenueSummary: invoices.reduce((sum, invoice) => sum + invoice.amount_ttc, 0),
    expectedPayments: payments.filter((payment) => payment.status === "expected").length,
    overduePayments: payments.filter((payment) => payment.status === "late").length,
    paidInvoices,
    unpaidInvoices: unpaid.length,
    outgoingTransfers: transfers.filter((transfer) => transfer.status === "planned" || transfer.status === "pending").length,
    netOperationalBalanceEstimate: totalReceivedThisMonth - totalOutgoingThisMonth,
    upcomingFinancialDeadlines,
    kpiCards: [
      { label: "Total expected this month", value: totalExpectedThisMonth, currency: "USD", detail: "Expected collections due this month" },
      { label: "Total received this month", value: totalReceivedThisMonth, currency: "USD", detail: "Recorded cash inflow this month" },
      { label: "Total overdue", value: totalOverdue, currency: "USD", detail: "Overdue invoice exposure" },
      { label: "Total outgoing this month", value: totalOutgoingThisMonth, currency: "USD", detail: "Outgoing transfers executed this month" },
      { label: "Pending invoices", value: unpaid.length, detail: "Invoices not fully collected yet" },
      { label: "Confirmed transfers", value: confirmedTransfers, detail: "Confirmed outgoing transfers" },
    ],
  };
}
