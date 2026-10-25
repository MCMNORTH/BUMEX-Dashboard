import type { State } from "@/lib/erp/engine";
import type { ErpAccess, ErpModuleKey } from "@/types/erp";

// What the browser receives of the state. The tables' row-level security is by entity only, so the state read for a
// person holds every module's rows of their entities; the browser gets the rows of the modules the person has, and
// what those rooms read of the others. The server's replay keeps the full state (load.ts, full), so the engine's
// checks see what the database has.
//
// Everyone keeps what the rooms open to all read: the entities, the chart and its settings (accounts, journals,
// periods, counters…), the clients' names (missions, archives, tasks), the missions, their staffing and archive boxes,
// the people without their pay. A collection is sent whole or not at all: a screen meets no invoice without its client
// and no entry without its account. Figures computed from what was not sent (floor signals, badges, report cards)
// count nothing. Reports and consolidation read every module: they keep everything but pay.
//
// Every command a room offers runs in the browser first (store.ts apply), so each module keeps what its commands read
// (paying an invoice reads the bank accounts, an asset bought on credit its supplier…).

type Collection = keyof State;

const EVERYTHING: ErpModuleKey[] = ["reports", "consolidation"];

const READERS: Partial<Record<Collection, ErpModuleKey[]>> = {
  entries: ["accounting", "bank", "clients", "suppliers", "assets", "hr", "tax"],
  salesInvoices: ["clients", "bank", "tax"],
  creditNotes: ["clients"],
  customerPayments: ["clients", "bank"],
  allocations: ["clients", "bank"],
  suppliers: ["suppliers", "accounting", "assets", "bank", "tax"],
  supplierInvoices: ["suppliers", "bank", "tax"],
  supplierPayments: ["suppliers"],
  bankAccounts: ["bank", "clients", "suppliers", "assets", "accounting"],
  bankTransactions: ["bank"],
  loans: ["bank", "accounting"],
  loanPayments: ["bank", "accounting"],
  assetCategories: ["assets"],
  assets: ["assets"],
  depreciationRuns: ["assets"],
  // the runs' totals: the treasury forecast and the closing checklist (their lines stay with HR, below)
  payrollRuns: ["hr", "bank", "accounting"],
};

// The history and the deletion requests name rows and amounts: those of a module stay with it.
const TABLE_MODULE: Record<string, ErpModuleKey> = {
  journal_entry: "accounting",
  journal_line: "accounting",
  sales_invoice: "clients",
  sales_invoice_line: "clients",
  credit_note: "clients",
  credit_note_line: "clients",
  customer_payment: "clients",
  allocation: "clients",
  dunning_run: "clients",
  dunning_item: "clients",
  supplier: "suppliers",
  supplier_invoice: "suppliers",
  supplier_invoice_line: "suppliers",
  supplier_payment: "suppliers",
  bank_account: "bank",
  bank_statement: "bank",
  bank_transaction: "bank",
  reconciliation_match: "bank",
  loan: "bank",
  loan_payment: "bank",
  loan_instalment: "bank",
  asset: "assets",
  asset_category: "assets",
  asset_disposal: "assets",
  depreciation_run: "assets",
  depreciation_run_line: "assets",
  employee: "hr",
  payroll_rules: "hr",
  payroll_run: "hr",
  payroll_line: "hr",
  tax_return: "tax",
};

export function visibleState(state: State, access: ErpAccess): State {
  const has = (module: ErpModuleKey) => access.modules.includes(module);
  const hr = has("hr");
  const all = EVERYTHING.some(has);
  const keeps = (table: string) => !TABLE_MODULE[table] || has(TABLE_MODULE[table]) || (all && TABLE_MODULE[table] !== "hr");

  const out: State = { ...state };
  if (!all) {
    for (const [collection, readers] of Object.entries(READERS) as [Collection, ErpModuleKey[]][]) {
      if (!readers.some(has)) Object.assign(out, { [collection]: [] });
    }
  }
  // Pay stays with the HR module: the others get the people without their salary (planning, initials, the HR room's
  // People tab) and the payroll runs without their lines.
  if (!hr) {
    out.employees = state.employees.map((e) => ({ ...e, grossSalary: 0, allowances: 0 }));
    out.payrollRuns = out.payrollRuns.map((r) => ({ ...r, lines: [] }));
  }
  out.auditLog = state.auditLog.filter((r) => keeps(r.table));
  out.deletionRequests = state.deletionRequests.filter((r) => keeps(r.table));
  return out;
}
