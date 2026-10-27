// Domain types — mirror of packages/schema/migrations/0001_init.sql, trimmed to the prototype's rooms.

export type Id = string;
export type ISODate = string; // YYYY-MM-DD
export type Currency = 'MRU' | 'EUR' | 'USD' | 'MAD';

// Roles: admin (access management, everything), partner (associé), raf (responsable administratif et financier),
// manager, accountant, staff (collaborateur), intern (stagiaire). Access is then narrowed per person: entities and modules.
export type Role = 'admin' | 'partner' | 'raf' | 'manager' | 'accountant' | 'staff' | 'intern';
export const ROLES: Role[] = ['admin', 'partner', 'raf', 'manager', 'accountant', 'staff', 'intern'];
export const MODULE_KEYS = ['accounting', 'bank', 'clients', 'suppliers', 'missions', 'assets', 'hr', 'tax', 'archives', 'tasks', 'reports', 'penthouse'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface Session {
  userId: Id;
  actorId: string;
  actorName: string;
  role: Role;
  entityIds: Id[] | '*';
  modules: string[] | '*';
  entityModules?: Record<Id, string[]>; // [bumex-one] the rooms of the entities where they are not `modules` (0009)
  managesAccess?: boolean; // [bumex-one] changes everyone's access (the permissions page)
  view3d?: boolean; // [bumex-one] sees the building in 3D (0010); without it, the flat pages only
}

export type UserStatus = 'invited' | 'active' | 'disabled';

export interface AppUser {
  id: Id;
  name: string;
  email: string;
  role: Role;
  entityIds: Id[] | '*';
  modules: string[] | '*';
  status: UserStatus;
  inviteToken?: string; // the link sent to the person; activating it signs them in
  invitedAt: ISODate;
  activatedAt?: ISODate;
  createdBy: string;
  employeeId?: Id;
}

// Sensitive deletions: confirmed with a reason; partners and admins execute, other roles file a request.
export type DeletionStatus = 'pending' | 'approved' | 'rejected';

export interface DeletionRequest {
  id: Id;
  entityId?: Id;
  table: string;
  rowId: Id;
  label: string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: DeletionStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface OrgGroup {
  id: Id;
  name: string;
  presentationCurrency: Currency;
}

export type CoaTemplate = 'PCM' | 'CGNC' | 'SYSCOHADA';
export type FxMethod = 'conversion_accounts' | 'direct_to_income';

export interface Entity {
  id: Id;
  code: string;
  name: string;
  activity: string;
  country: 'MR' | 'MA';
  functionalCurrency: Currency;
  coaTemplate: CoaTemplate;
  fxMethod: FxMethod;
  cashThreshold: number;
  floorOrder: number;
  isHolding: boolean;
  nif?: string;
  address?: string;
  staffPresent: number;
  staffTotal: number;
  accountCodeLength?: number; // presentation length of general-ledger accounts (6 by default); roots and auxiliaries are not padded
  thirdPartyRules?: ThirdPartyRules;
}

// Auxiliary accounting: how customer and supplier codes are generated and which collective they attach to.
export interface ThirdPartyRules {
  customerPrefix: string; // 'C'
  supplierPrefix: string; // 'F'
  digits: number; // 3 → C001
  customerCollectiveId?: Id; // defaults to the AR_CONTROL mapping
  supplierCollectiveId?: Id; // defaults to the AP_CONTROL mapping
}

export interface FxRate {
  date: ISODate;
  from: Currency;
  to: Currency;
  rate: number;
  source: string;
}

export interface FiscalYear {
  id: Id;
  entityId: Id;
  label: string;
  start: ISODate;
  end: ISODate;
  isClosed: boolean;
  closedBy?: string;
}

export type PeriodStatus = 'open' | 'soft_closed' | 'locked';

export interface Period {
  id: Id;
  entityId: Id;
  fiscalYearId: Id;
  periodNo: number;
  start: ISODate;
  end: ISODate;
  status: PeriodStatus;
  lockedBy?: string;
}

export type AccountKind = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: Id;
  entityId: Id;
  code: string;
  nameFr: string;
  nameEn?: string;
  kind: AccountKind;
  isPostable: boolean;
  isStatutory: boolean;
  requiresCustomer?: boolean;
  requiresSupplier?: boolean;
  requiresEngagement?: boolean;
  active: boolean;
  isAuxiliary?: boolean; // a third party's account, attached to a collective (411 / 401)
  collectiveId?: Id;
}

export type JournalKind = 'sales' | 'purchases' | 'bank' | 'cash' | 'misc' | 'assets' | 'closing';

export interface Journal {
  id: Id;
  entityId: Id;
  code: string;
  name: string;
  kind: JournalKind;
}

// Mapping key + qualifier → account, per entity. The posting rules only know keys.
export interface AccountMapping {
  entityId: Id;
  key: string;
  qualifier: string;
  accountId: Id;
}

export type CounterpartyRegime = 'standard' | 'exempt' | 'gta' | 'non_resident' | 'public';
export type TaxKind = 'vat' | 'withholding';
export type RevenueStatus = 'taxable_standard' | 'taxable_reduced' | 'exempt_domestic' | 'export_exempt' | 'export_taxable';

export interface TaxCode {
  id: Id;
  entityId: Id;
  code: string;
  nameFr: string;
  kind: TaxKind;
  rate: number; // 0.16 for 16 %
  collectedAccountId?: Id;
  deductibleAccountId?: Id;
  revenueStatus?: RevenueStatus;
  legalMentionFr?: string;
}

export interface TaxRule {
  entityId: Id;
  regime: CounterpartyRegime | null;
  serviceCategory: string | null;
  taxCodeId: Id;
  priority: number;
}

export type EntryStatus = 'draft' | 'posted' | 'reversed';

export interface JournalLine {
  lineNo: number;
  accountId: Id;
  description: string;
  currency: Currency;
  fxRate: number;
  debitTxn: number;
  creditTxn: number;
  debit: number;
  credit: number;
  customerId?: Id;
  supplierId?: Id;
  engagementId?: Id;
  taxCodeId?: Id;
  bankAccountId?: Id;
  assetId?: Id;
  employeeId?: Id;
}

export interface JournalEntry {
  id: Id;
  entityId: Id;
  journalId: Id;
  fiscalYearId: Id;
  periodId: Id;
  entryNo?: number;
  chainSeq?: number;
  date: ISODate;
  status: EntryStatus;
  description: string;
  currency: Currency;
  fxRate: number;
  sourceType: string;
  sourceId?: Id;
  postingRule?: string;
  reversalOfId?: Id;
  reversedById?: Id;
  postedAt?: string;
  postedBy?: string;
  prevHash?: string;
  hash?: string;
  createdBy: string;
  lines: JournalLine[];
}

export interface Customer {
  id: Id;
  entityId: Id;
  code: string;
  name: string;
  regime: CounterpartyRegime;
  country: string;
  defaultCurrency: Currency;
  paymentTermsDays: number;
  groupEntityId?: Id;
  email?: string;
  nif?: string;
  withholdingCodeId?: Id; // the withholding this customer applies on our invoices by default (e.g. RAS 7 %)
  arAccountId?: Id; // auxiliary account attached to the customers' collective
  active: boolean;
}

export type DocStatus = 'draft' | 'validated' | 'posted' | 'paid' | 'cancelled' | 'pending_approval' | 'approved' | 'rejected';

export interface SalesInvoiceLine {
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  serviceCategory: string;
  taxCodeId?: Id;
  taxRateSnapshot?: number;
  revenueAccountId?: Id; // user override, else resolved at validation
  lineHt: number;
  taxAmount: number;
  lineTtc: number;
}

export interface SalesInvoice {
  id: Id;
  entityId: Id;
  customerId: Id;
  engagementId?: Id;
  number?: string;
  status: DocStatus;
  date: ISODate;
  dueDate: ISODate;
  currency: Currency;
  fxRate: number;
  paymentMode: string;
  bankAccountId?: Id;
  lines: SalesInvoiceLine[];
  totalHt: number;
  totalTax: number;
  totalTtc: number;
  withholdingCodeId?: Id; // retenue à la source applied by the customer on this invoice
  withholdingRate: number;
  withholdingAmount: number; // on the HT base; the customer pays TTC − this and remits it to the State
  netPayable: number; // what the customer actually pays
  amountPaidTxn: number;
  journalEntryId?: Id;
  legalMentionFr?: string;
  dunningLevel: number;
  lastDunningDate?: ISODate;
}

export interface CreditNote {
  id: Id;
  entityId: Id;
  customerId: Id;
  originalInvoiceId?: Id;
  number?: string;
  status: DocStatus;
  date: ISODate;
  currency: Currency;
  fxRate: number;
  reason: string;
  lines: SalesInvoiceLine[];
  totalHt: number;
  totalTax: number;
  totalTtc: number;
  journalEntryId?: Id;
}

export interface CustomerPayment {
  id: Id;
  entityId: Id;
  customerId: Id;
  number?: string;
  status: DocStatus;
  date: ISODate;
  currency: Currency;
  amountTxn: number;
  fxRate: number;
  amount: number;
  bankAccountId: Id;
  method: string;
  reference?: string;
  journalEntryId?: Id;
  bankTransactionId?: Id;
}

export interface Allocation {
  id: Id;
  entityId: Id;
  paymentId: Id;
  invoiceId: Id;
  amountTxn: number;
  amountAtDocRate: number;
  amountAtPayRate: number;
  fxDifference: number;
  journalEntryId?: Id;
}

export interface Supplier {
  id: Id;
  entityId: Id;
  code: string;
  name: string;
  regime: CounterpartyRegime;
  withholdingCodeId?: Id; // the withholding we apply on this supplier's invoices (RAS 3 % / 15 %)
  paymentTermsDays: number;
  email?: string;
  phone?: string;
  nif?: string;
  address?: string;
  expenseAccountId?: Id; // default expense account
  apAccountId?: Id; // auxiliary account attached to the suppliers' collective
  groupEntityId?: Id; // set when the supplier is a group company
  active: boolean;
}

export interface SupplierInvoice {
  id: Id;
  entityId: Id;
  supplierId: Id;
  supplierRef: string;
  number?: string; // internal number FA{YY}{MM}-{SEQ4}, given when posted
  status: DocStatus;
  date: ISODate;
  dueDate: ISODate;
  currency: Currency;
  fxRate: number;
  totalHt: number;
  taxCodeId?: Id;
  totalTax: number;
  totalTtc: number;
  withholdingCodeId?: Id;
  withholdingAmount: number;
  netPayable: number;
  amountPaid: number;
  expenseAccountId: Id;
  description: string;
  preparedBy: string;
  approverRole: Role | null;
  journalEntryId?: Id;
  paidAt?: ISODate;
}

export interface SupplierPayment {
  id: Id;
  entityId: Id;
  supplierId: Id;
  invoiceId: Id;
  number?: string;
  date: ISODate;
  amount: number; // invoice currency
  bankAccountId: Id;
  reference?: string;
  journalEntryId?: Id;
}

// Loans of the treasury module: the schedule is computed from the terms; paid instalments are recorded and posted.
export interface Loan {
  id: Id;
  entityId: Id;
  lender: string;
  reference: string;
  currency: Currency;
  principal: number;
  annualRate: number; // 0.08 = 8 %
  months: number; // total duration
  startDate: ISODate; // drawdown; first instalment one period later
  frequency: 'monthly' | 'quarterly';
  method: 'annuity' | 'linear'; // constant payment or constant capital
  feePerInstalment: number;
  bankAccountId: Id;
  status: 'active' | 'closed';
  drawdownEntryId?: Id;
  notes?: string;
  scheduleMode?: 'auto' | 'manual'; // manual = the bank's own schedule, entered instalment by instalment
  manualSchedule?: ManualInstalment[];
  interestAccountId?: Id; // override of the LOAN_INTEREST mapping
  loanAccountId?: Id; // override of the LOAN_PAYABLE mapping
  journalId?: Id; // override of the bank account's journal
}

export interface ManualInstalment {
  no: number;
  date: ISODate;
  capital: number;
  interest: number;
  fees: number;
}

export interface LoanPayment {
  id: Id;
  entityId: Id;
  loanId: Id;
  instalmentNo: number;
  date: ISODate;
  capital: number;
  interest: number;
  fees: number;
  total: number;
  bankAccountId: Id;
  journalEntryId?: Id;
}

export interface BankAccount {
  id: Id;
  entityId: Id;
  name: string;
  bankName: string;
  iban?: string;
  accountNumber?: string;
  rib?: string;
  bankAddress?: string;
  currency: Currency;
  glAccountId: Id;
  journalId?: Id; // the journal every operation of this account posts to (the entity's bank journal by default)
  isCash: boolean;
  showOnInvoices: boolean;
  active?: boolean; // false = closed, kept for history
  statementBalance: number;
  statementDate?: ISODate;
}

export type BankTxnStatus = 'unmatched' | 'matched' | 'booked';

export interface BankTransaction {
  id: Id;
  bankAccountId: Id;
  date: ISODate;
  amount: number; // signed, bank currency
  description: string;
  reference?: string;
  status: BankTxnStatus;
  journalEntryId?: Id;
  importHash: string;
}

export interface BankRule {
  entityId: Id;
  pattern: string; // regex, case-insensitive, on the description
  mappingKey: string; // e.g. BANK_FEES, BANK_INTEREST
  label: string;
}

export type EngagementStatus = 'planned' | 'active' | 'on_hold' | 'completed';

export interface Engagement {
  id: Id;
  entityId: Id;
  customerId: Id;
  code: string;
  name: string;
  kind: string;
  stage: number; // 1..5 : planification, terrain, revue, rapport, facturation
  status: EngagementStatus;
  startDate?: ISODate;
  deadline: ISODate;
  feeType: 'fixed' | 'time';
  fixedFee?: number;
  currency: Currency;
  budgetHours: number;
  actualHours: number;
  invoicedToDate: number;
  staff: string[];
  completedAt?: ISODate;
  archiveId?: Id; // set when the file has been boxed in the archive rack
}

// Work items shown in the command bar and the Tasks module. Linked to a module (room) and optionally to an engagement.
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: Id;
  entityId: Id;
  title: string;
  module: string; // room key: accounting | bank | clients | suppliers | missions | assets | closing | archives | tax | hr
  engagementId?: Id;
  customerId?: Id;
  assignee: string;
  dueDate: ISODate;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: ISODate;
  completedAt?: ISODate;
  notes?: string;
}

// Physical archive: a boxed engagement file on the rack of the clients room. bay / shelf / slot is its place on the rack.
export type ArchiveStatus = 'archived' | 'retrieved' | 'pending_destruction' | 'destroyed';
export type ArchiveKind = 'box' | 'binder';

export interface ArchiveRecord {
  id: Id;
  entityId: Id;
  engagementId: Id;
  reference: string; // ARC-YYYY-0001, gapless per entity and year
  archivedAt: ISODate;
  retentionUntil: ISODate;
  status: ArchiveStatus;
  bay: number; // 1..RACK.bays
  shelf: number; // 1..RACK.shelves, 1 = top
  slot: number; // 1..RACK.slotsPerShelf, left to right
  kind: ArchiveKind;
  label: string; // what is printed on the box
  boxCount: number;
  notes?: string;
  retrievedBy?: string;
  retrievedAt?: ISODate;
}

export type DepreciationMethod = 'linear' | 'declining';

export interface AssetCategory {
  id: Id;
  entityId: Id;
  code: string; // mapping qualifier, e.g. IT, VEHICLE, FITTINGS, SOFTWARE, EQUIPMENT
  name: string;
  lifeMonths: number;
  method: DepreciationMethod;
  assetAccountId: Id;
  accDeprAccountId: Id;
}

export interface Asset {
  id: Id;
  entityId: Id;
  code: string;
  name: string;
  serial?: string;
  categoryId: Id;
  category: string; // category name, kept for display
  acquisitionDate: ISODate;
  cost: number; // acquisition value
  residual: number;
  lifeMonths: number;
  rate: number; // annual linear rate in %, 100 × 12 / lifeMonths
  method: DepreciationMethod;
  startDate: ISODate; // start of depreciation (commissioning)
  endDate: ISODate;
  accumulated: number; // depreciation posted to date
  location: string;
  status: 'in_service' | 'wip' | 'disposed';
  supplierId?: Id;
  acquisitionEntryId?: Id;
  notes?: string;
}

export interface DepreciationRun {
  id: Id;
  entityId: Id;
  fiscalYearId: Id;
  date: ISODate;
  total: number;
  lines: { assetId: Id; amount: number }[];
  journalEntryId: Id;
}

// Human resources: the people of each entity, their pay and the rules that turn gross pay into entries.
export type EmployeeCategory = 'partner' | 'manager' | 'senior' | 'assistant' | 'intern' | 'support';

export interface Employee {
  id: Id;
  entityId: Id;
  code: string;
  firstName: string;
  lastName: string;
  initials: string;
  jobTitle: string;
  department: string;
  category: EmployeeCategory;
  hireDate: ISODate;
  endDate?: ISODate;
  status: 'active' | 'left';
  email?: string;
  phone?: string;
  contractType: string;
  grossSalary: number; // monthly, functional currency
  allowances: number; // monthly taxable allowances
  userId?: Id;
}

export type PayrollRegime = 'normal' | 'gta';

export interface PayrollRules {
  entityId: Id;
  regime?: PayrollRegime; // gta = exemptions below apply as configured
  socialExempt?: boolean;
  healthExempt?: boolean;
  taxExempt?: boolean;
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  cnssCeiling: number; // monthly base ceiling, 0 = none
  cnamEmployeeRate: number;
  cnamEmployerRate: number;
  itsAbatement: number; // monthly abatement before the brackets
  itsBrackets: { upTo: number | null; rate: number }[]; // progressive, monthly
  labels: { social: string; health: string; tax: string }; // CNSS / CNAM / ITS or CNSS / AMO / IR
}

export interface PayrollLine {
  employeeId: Id;
  gross: number;
  cnssEmployee: number;
  cnamEmployee: number;
  taxable: number;
  its: number;
  net: number;
  cnssEmployer: number;
  cnamEmployer: number;
}

export interface PayrollRun {
  id: Id;
  entityId: Id;
  month: string; // YYYY-MM
  date: ISODate;
  status: 'simulated' | 'posted';
  lines: PayrollLine[];
  totals: { gross: number; cnssEmployee: number; cnamEmployee: number; its: number; net: number; cnssEmployer: number; cnamEmployer: number; employerCost: number };
  journalEntryId?: Id;
}

// Planning: who works on which engagement, when. Overlaps are allowed but flagged.
export interface Assignment {
  id: Id;
  entityId: Id;
  engagementId: Id;
  employeeId: Id;
  start: ISODate;
  end: ISODate;
  load: number; // 0..1 share of the working day
  role?: string;
}

export interface AuditRow {
  at: string;
  actorId: string;
  role: Role;
  table: string;
  rowId: Id;
  entityId?: Id;
  action: 'I' | 'U' | 'D';
  summary: string;
}

export interface ChainHead {
  lastHash: string;
  length: number;
}

export interface State {
  group: OrgGroup;
  session: Session;
  today: ISODate;
  entities: Entity[];
  fxRates: FxRate[];
  fiscalYears: FiscalYear[];
  periods: Period[];
  accounts: Account[];
  journals: Journal[];
  mappings: AccountMapping[];
  taxCodes: TaxCode[];
  taxRules: TaxRule[];
  entries: JournalEntry[];
  chains: Record<string, ChainHead>; // key `${entityId}|${journalId}`
  counters: Record<string, number>;
  customers: Customer[];
  salesInvoices: SalesInvoice[];
  creditNotes: CreditNote[];
  customerPayments: CustomerPayment[];
  allocations: Allocation[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  supplierPayments: SupplierPayment[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  bankRules: BankRule[];
  engagements: Engagement[];
  assignments: Assignment[];
  assetCategories: AssetCategory[];
  assets: Asset[];
  depreciationRuns: DepreciationRun[];
  employees: Employee[];
  payrollRules: PayrollRules[];
  payrollRuns: PayrollRun[];
  users: AppUser[];
  deletionRequests: DeletionRequest[];
  tasks: Task[];
  archives: ArchiveRecord[];
  auditLog: AuditRow[];
  seq: number;
}

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
