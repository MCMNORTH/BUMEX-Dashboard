import "server-only";

import type { State } from "@/lib/erp/engine";
import type { ErpTransaction } from "@/lib/erp/db";

// The modules' collections and their tables, described once: how each engine field is read from its column and
// written back. load.ts reads with readTable(), save.ts writes with tableWriter(). (Accounting has its own code in
// load.ts / save.ts: posting, chains and numbering go through the database's guards.)

type Kind = "text" | "uuid" | "num" | "int" | "bool" | "date" | "json" | `erp.${string}`;
type Row = Record<string, unknown>;

export type Field = {
  field?: string; // the engine field; none: a column the engine does not have (written from `value` or `sql`)
  column?: string; // default: the field in snake_case
  kind?: Kind; // default text
  read?: string | false; // SQL over the row `t` (a derived field); false: not read
  value?: (row: Row) => unknown; // the value written, when it is not the field's
  sql?: (param: (field: string) => string) => string; // the value written, as SQL over other fields' values
  write?: false; // kept by the database (a trigger, a generated column) or derived: never written
  insertOnly?: boolean;
  fallback?: unknown; // written when the engine leaves the field empty (a column with a default)
  nullable?: boolean; // read as null rather than absent (the engine compares it with null)
};

export type Child = {
  field: string; // the engine's array (lines)
  table: string;
  parent: string; // the column pointing to the parent
  key: string; // the engine field that identifies a line within its parent
  fields: Field[];
  when?: string; // SQL over `t`: the array exists only then
};

export type TableSpec = {
  collection: keyof State;
  table: string;
  id?: string; // the engine field identifying a row (default id)
  fields: Field[];
  children?: Child[];
  order?: string;
  where?: string;
  add?: false | string; // false or the refusal: rows of this table are not created from Vanguard
  remove?: false | string; // the same for deletions
};

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const columnOf = (f: Field) => f.column ?? snake(f.field!);
const cast = (kind: Kind = "text") =>
  kind === "num" ? "::numeric" : kind === "int" ? "::int" : kind === "bool" ? "::boolean" : kind === "date" ? "::date" : kind === "uuid" ? "::uuid" : kind === "json" ? "::jsonb" : kind === "text" ? "::text" : `::${kind}`;

function readExpression(f: Field, alias: string) {
  if (f.read) return f.read;
  const column = `${alias}.${columnOf(f)}`;
  return f.kind === "num" ? `${column}::float8` : f.kind === "date" || f.kind?.startsWith("erp.") ? `${column}::text` : f.kind === "text" || !f.kind ? `${column}::text` : column;
}

function objectSql(fields: Field[], alias: string) {
  const read = fields.filter((f) => f.field && f.read !== false);
  const pairs = (list: Field[]) => list.map((f) => `'${f.field}', ${readExpression(f, alias)}`).join(", ");
  const nullable = read.filter((f) => f.nullable);
  const stripped = `jsonb_strip_nulls(jsonb_build_object(${pairs(read.filter((f) => !f.nullable))}))`;
  return nullable.length ? `(${stripped} || jsonb_build_object(${pairs(nullable)}))` : stripped;
}

function childSql(child: Child, idColumn: string) {
  const list = `coalesce((select jsonb_agg(${objectSql(child.fields, "c")} order by c.${columnOf(child.fields.find((f) => f.field === child.key)!)})
                            from erp.${child.table} c where c.${child.parent} = t.${idColumn}), '[]'::jsonb)`;
  return child.when ? `case when ${child.when} then ${list} end` : list;
}

export async function readTable<T>(tx: ErpTransaction, spec: TableSpec): Promise<T[]> {
  const idColumn = columnOf(spec.fields.find((f) => f.field === (spec.id ?? "id"))!);
  const object = spec.children?.length
    ? `(${objectSql(spec.fields, "t")} || jsonb_strip_nulls(jsonb_build_object(${spec.children.map((c) => `'${c.field}', ${childSql(c, idColumn)}`).join(", ")})))`
    : objectSql(spec.fields, "t");
  const [{ rows }] = await tx.query<{ rows: T[] }>(
    `select coalesce(jsonb_agg(${object} order by ${spec.order ?? `t.${idColumn}`}), '[]'::jsonb) as rows from erp.${spec.table} t ${spec.where ? `where ${spec.where}` : ""}`,
  );
  return rows;
}

// The columns and values of one row, as SQL with its parameters ($1 is kept for the row's id in updates).
function values(fields: Field[], row: Row, params: unknown[], { update = false } = {}) {
  const param = (value: unknown, kind?: Kind) => {
    params.push(value === undefined || value === null ? null : kind === "json" ? JSON.stringify(value) : value);
    return `$${params.length}${cast(kind)}`;
  };
  const byField = (name: string) => param(row[name], fields.find((f) => f.field === name)?.kind);
  const out: [string, string][] = [];
  for (const f of fields) {
    if (f.write === false || (update && f.insertOnly) || (!f.field && !f.value && !f.sql)) continue;
    if (f.sql) {
      out.push([columnOf(f), f.sql(byField)]);
      continue;
    }
    const value = f.value ? f.value(row) : row[f.field!];
    out.push([columnOf(f), param(value === undefined || value === null ? (f.fallback ?? null) : value, f.kind)]);
  }
  return out;
}

async function insertRow(tx: ErpTransaction, table: string, fields: Field[], row: Row, extra: [string, unknown][] = []) {
  const params: unknown[] = extra.map(([, v]) => v);
  const list = [...extra.map(([column], i) => [column, `$${i + 1}`] as [string, string]), ...values(fields, row, params)];
  await tx.query(`insert into erp.${table} (${list.map(([c]) => c).join(", ")}) values (${list.map(([, v]) => v).join(", ")})`, params);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function syncChild(tx: ErpTransaction, child: Child, parentId: unknown, before: Row[], after: Row[]) {
  const keyField = child.fields.find((f) => f.field === child.key)!;
  const keyColumn = columnOf(keyField);
  const old = new Map(before.map((r) => [String(r[child.key]), r]));
  const kept = new Set(after.map((r) => String(r[child.key])));
  for (const r of before) {
    if (!kept.has(String(r[child.key]))) {
      await tx.query(`delete from erp.${child.table} where ${child.parent} = $1 and ${keyColumn} = $2${cast(keyField.kind)}`, [parentId, r[child.key]]);
    }
  }
  for (const r of after) {
    const previous = old.get(String(r[child.key]));
    if (!previous) {
      await insertRow(tx, child.table, child.fields, r, [[child.parent, parentId]]);
    } else if (!same(previous, r)) {
      const params: unknown[] = [parentId, r[child.key]];
      const list = values(child.fields.filter((f) => f.field !== child.key), r, params, { update: true });
      if (list.length) {
        await tx.query(`update erp.${child.table} set ${list.map(([c, v]) => `${c} = ${v}`).join(", ")} where ${child.parent} = $1 and ${keyColumn} = $2${cast(keyField.kind)}`, params);
      }
    }
  }
}

export type TableWriter = {
  key: (row: never) => string;
  add?: (tx: ErpTransaction, row: never) => Promise<unknown>;
  change?: (tx: ErpTransaction, before: never, after: never) => Promise<unknown>;
  remove?: (tx: ErpTransaction, row: never) => Promise<unknown>;
};

export class TableRefusal extends Error {}

export function tableWriter(spec: TableSpec): TableWriter {
  const idField = spec.id ?? "id";
  const idSpec = spec.fields.find((f) => f.field === idField)!;
  const idColumn = columnOf(idSpec);
  const childrenOf = (row: Row, child: Child) => (Array.isArray(row[child.field]) ? (row[child.field] as Row[]) : []);
  return {
    key: (row: Row) => String(row[idField]),
    add: async (tx: ErpTransaction, row: Row) => {
      if (spec.add !== undefined) throw new TableRefusal(spec.add || "Cet ajout n'est pas prévu.");
      await insertRow(tx, spec.table, spec.fields, row);
      for (const child of spec.children ?? []) await syncChild(tx, child, row[idField], [], childrenOf(row, child));
    },
    change: async (tx: ErpTransaction, before: Row, after: Row) => {
      const params: unknown[] = [after[idField]];
      const list = values(spec.fields.filter((f) => f.field !== idField), after, params, { update: true });
      const fieldsChanged = spec.fields.some((f) => f.field && f.write !== false && !f.insertOnly && !same(before[f.field], after[f.field]));
      if (list.length && fieldsChanged) {
        await tx.query(`update erp.${spec.table} set ${list.map(([c, v]) => `${c} = ${v}`).join(", ")} where ${idColumn} = $1${cast(idSpec.kind)}`, params);
      }
      for (const child of spec.children ?? []) {
        if (!same(before[child.field], after[child.field])) await syncChild(tx, child, after[idField], childrenOf(before, child), childrenOf(after, child));
      }
    },
    remove: async (tx: ErpTransaction, row: Row) => {
      if (spec.remove !== undefined) throw new TableRefusal(spec.remove || "Cette suppression n'est pas prévue.");
      for (const child of spec.children ?? []) await tx.query(`delete from erp.${child.table} where ${child.parent} = $1`, [row[idField]]);
      await tx.query(`delete from erp.${spec.table} where ${idColumn} = $1${cast(idSpec.kind)}`, [row[idField]]);
    },
  };
}

// ---- the tables ---------------------------------------------------------------------------------------------

const id: Field = { field: "id", kind: "uuid", insertOnly: true };
const entityId: Field = { field: "entityId", kind: "uuid", insertOnly: true };
const uuid = (field: string, more: Partial<Field> = {}): Field => ({ field, kind: "uuid", ...more });
const num = (field: string, more: Partial<Field> = {}): Field => ({ field, kind: "num", ...more });
const date = (field: string, more: Partial<Field> = {}): Field => ({ field, kind: "date", ...more });
const text = (field: string, more: Partial<Field> = {}): Field => ({ field, ...more });
const int = (field: string, more: Partial<Field> = {}): Field => ({ field, kind: "int", ...more });
const bool = (field: string, more: Partial<Field> = {}): Field => ({ field, kind: "bool", ...more });
const status = (type: string, more: Partial<Field> = {}): Field => ({ field: "status", kind: `erp.${type}`, ...more });

const serviceCategory: Field = {
  field: "serviceCategory",
  column: "service_category_id",
  read: "(select s.code from erp.service_category s where s.id = c.service_category_id)",
  sql: (p) => `(select s.id from erp.service_category s where s.code = ${p("serviceCategory")} limit 1)`,
};
const documentLines = (table: string, parent: string): Child => ({
  field: "lines",
  table,
  parent,
  key: "lineNo",
  fields: [
    int("lineNo", { column: "line_no" }), text("description"), num("quantity"), num("unitPrice"), serviceCategory,
    uuid("taxCodeId"), num("taxRateSnapshot", { fallback: 0 }), uuid("revenueAccountId"), num("lineHt"), num("taxAmount"), num("lineTtc"),
  ],
});

export const moduleTables: TableSpec[] = [
  {
    collection: "customers",
    table: "customer",
    fields: [
      id, entityId, text("code"), text("name"), { field: "regime", kind: "erp.counterparty_regime" }, text("country"), text("defaultCurrency"),
      int("paymentTermsDays"), uuid("groupEntityId"), text("email"), text("nif"), uuid("withholdingCodeId"), uuid("arAccountId"), bool("active"),
      // beyond the engine's record: the BUMEX One client this customer is the accounting side of (clients.ts)
      { field: "clientId", column: "bumex_client_id", write: false },
    ],
    order: "t.code",
  },
  {
    collection: "suppliers",
    table: "supplier",
    fields: [
      id, entityId, text("code"), text("name"), { field: "regime", kind: "erp.counterparty_regime" }, uuid("withholdingCodeId"), int("paymentTermsDays"),
      text("email"), text("phone"), text("nif"), text("address", { column: "address_lines" }), uuid("expenseAccountId"), uuid("apAccountId"),
      uuid("groupEntityId"), bool("active"),
    ],
    order: "t.code",
  },
  {
    collection: "bankAccounts",
    table: "bank_account",
    fields: [
      id, entityId, text("name"), text("bankName"), text("iban"), text("accountNumber"), text("rib"), text("bankAddress"), text("currency"),
      uuid("glAccountId"), uuid("journalId"), bool("isCash"), bool("showOnInvoices"), bool("active", { fallback: true }), num("statementBalance", { fallback: 0 }),
      date("statementDate"),
    ],
    order: "t.name",
  },
  {
    collection: "employees",
    table: "employee",
    fields: [
      id, entityId, text("code"), text("firstName"), text("lastName"), text("initials"), text("jobTitle"), text("department"), text("category"),
      date("hireDate", { column: "hired_on" }), date("endDate", { column: "left_on" }),
      { field: "status", read: "case when t.active then 'active' else 'left' end", column: "active", kind: "bool", value: (r) => r.status === "active" },
      { column: "name", value: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() },
      text("email"), text("phone"), text("contractType"), num("grossSalary"), num("allowances"),
    ],
    order: "t.code",
  },
  {
    collection: "payrollRules",
    table: "payroll_rules",
    id: "entityId",
    fields: [
      { field: "entityId", kind: "uuid", insertOnly: true }, text("regime", { fallback: "normal" }), bool("socialExempt"), bool("healthExempt"), bool("taxExempt"),
      num("cnssEmployeeRate", { column: "social_employee_rate" }), num("cnssEmployerRate", { column: "social_employer_rate" }),
      num("cnssCeiling", { column: "social_ceiling" }), num("cnamEmployeeRate", { column: "health_employee_rate" }),
      num("cnamEmployerRate", { column: "health_employer_rate" }), num("itsAbatement", { column: "tax_abatement" }),
      { field: "itsBrackets", column: "tax_brackets", kind: "json" },
      { field: "labels", read: "jsonb_build_object('social', t.label_social, 'health', t.label_health, 'tax', t.label_tax)", write: false },
      { column: "label_social", value: (r) => (r.labels as { social: string }).social },
      { column: "label_health", value: (r) => (r.labels as { health: string }).health },
      { column: "label_tax", value: (r) => (r.labels as { tax: string }).tax },
    ],
  },
  {
    collection: "assetCategories",
    table: "asset_category",
    fields: [
      id, entityId, text("code"), text("name", { column: "name_fr" }), int("lifeMonths", { column: "default_life_months" }),
      { field: "method", kind: "erp.depreciation_method" }, uuid("assetAccountId"), uuid("accDeprAccountId"),
    ],
    order: "t.code",
  },
  {
    // missions are BUMEX One's projects (missions.ts): shown here, created and worked on in BUMEX One
    collection: "engagements",
    table: "engagement",
    where: "t.status <> 'cancelled'",
    add: "Les missions se créent dans BUMEX One (Projets) : elles apparaissent ici d'elles-mêmes.",
    remove: "Les missions se gèrent dans BUMEX One (Projets).",
    fields: [
      id, entityId, uuid("customerId", { write: false }), text("code", { write: false }), text("name", { write: false }), text("kind", { write: false }),
      {
        // the five stages (planning, fieldwork, review, report, invoicing) follow BUMEX One's progress
        field: "stage",
        read: "case when t.stage_id is not null then (select s.stage_no from erp.engagement_stage s where s.id = t.stage_id) else least(5, 1 + t.progress / 20) end",
        write: false,
      },
      { field: "status", kind: "erp.engagement_status", write: false },
      date("startDate", { write: false }), { field: "deadline", read: "coalesce(t.deadline, t.start_date, current_date)::text", write: false },
      text("feeType", { write: false }), num("fixedFee", { write: false }),
      { field: "currency", read: "coalesce(t.currency, (select e.functional_currency from erp.entity e where e.id = t.entity_id))::text", write: false },
      { field: "budgetHours", read: "coalesce(t.budget_hours, 0)::float8", write: false },
      { field: "actualHours", read: "t.actual_hours::float8", write: false }, // BUMEX One's timesheets
      {
        field: "invoicedToDate",
        read: "(select coalesce(sum(i.total_ht), 0)::float8 from erp.sales_invoice i where i.engagement_id = t.id and i.status not in ('draft', 'cancelled'))",
        write: false,
      },
      {
        // BUMEX One's project members, and the employees planned on it here
        field: "staff",
        read: `coalesce((select jsonb_agg(distinct x) from (select unnest(t.staff) as x
                 union select e.initials from erp.assignment a join erp.employee e on e.id = a.employee_id where a.engagement_id = t.id) s), '[]'::jsonb)`,
        write: false,
      },
      { field: "archiveId", read: "(select r.id from erp.archive_record r where r.engagement_id = t.id and r.status <> 'destroyed' limit 1)", write: false },
      // beyond the engine's record: the BUMEX One project the mission is (Vanguard's mission forms)
      { field: "projectId", column: "bumex_project_id", write: false },
    ],
    order: "t.code",
  },
  {
    collection: "salesInvoices",
    table: "sales_invoice",
    fields: [
      id, entityId, uuid("customerId"), uuid("engagementId"), text("number"), status("doc_status"), date("date", { column: "invoice_date" }), date("dueDate"),
      text("currency"), num("fxRate"), text("paymentMode"), uuid("bankAccountId"), num("totalHt"), num("totalTax"), num("totalTtc"),
      uuid("withholdingCodeId"), num("withholdingRate"), num("withholdingAmount"), num("netPayable"), num("amountPaidTxn"), uuid("journalEntryId"),
      text("legalMentionFr"), int("dunningLevel"), date("lastDunningDate"),
    ],
    children: [documentLines("sales_invoice_line", "invoice_id")],
    order: "t.invoice_date, t.created_at",
  },
  {
    collection: "creditNotes",
    table: "credit_note",
    fields: [
      id, entityId, uuid("customerId"), uuid("originalInvoiceId"), text("number"), status("doc_status"), date("date", { column: "note_date" }), text("currency"),
      num("fxRate"), text("reason"), num("totalHt"), num("totalTax"), num("totalTtc"), uuid("journalEntryId"),
    ],
    children: [documentLines("credit_note_line", "credit_note_id")],
    order: "t.note_date, t.created_at",
  },
  {
    collection: "bankTransactions",
    table: "bank_transaction",
    fields: [
      id, uuid("bankAccountId", { insertOnly: true }), date("date", { column: "txn_date" }), num("amount"), text("description"), text("reference"), text("status"),
      uuid("journalEntryId"), text("importHash"),
    ],
    order: "t.txn_date, t.id",
  },
  {
    collection: "customerPayments",
    table: "customer_payment",
    fields: [
      id, entityId, uuid("customerId"), text("number"), status("doc_status"), date("date", { column: "payment_date" }), text("currency"), num("amountTxn"),
      num("fxRate"), num("amount"), uuid("bankAccountId"), text("method"), text("reference"), uuid("journalEntryId"), uuid("bankTransactionId"),
    ],
    order: "t.payment_date, t.created_at",
  },
  {
    collection: "allocations",
    table: "allocation",
    where: "t.side = 'ar'",
    fields: [
      id, entityId, { column: "side", value: () => "ar", insertOnly: true }, { column: "document_type", value: () => "sales_invoice", insertOnly: true },
      uuid("paymentId"), uuid("invoiceId", { column: "document_id" }), num("amountTxn"), num("amountAtDocRate"), num("amountAtPayRate"),
      num("fxDifference", { write: false }), // generated by the database
      uuid("journalEntryId"),
    ],
    order: "t.created_at",
  },
  {
    collection: "supplierInvoices",
    table: "supplier_invoice",
    fields: [
      id, entityId, uuid("supplierId"), text("supplierRef"), text("number"), status("doc_status"), date("date", { column: "invoice_date" }), date("dueDate"),
      text("currency"), num("fxRate"), num("totalHt"), uuid("taxCodeId"), num("totalTax"), num("totalTtc"), uuid("withholdingCodeId"),
      num("withholdingAmount"), num("netPayable"), num("amountPaid"), uuid("expenseAccountId"), text("description"),
      text("preparedBy", { column: "created_by", write: false }), text("approverRole", { nullable: true }), uuid("journalEntryId"), date("paidAt"),
    ],
    order: "t.invoice_date, t.created_at",
  },
  {
    collection: "supplierPayments",
    table: "supplier_payment",
    fields: [
      id, entityId, uuid("supplierId"), uuid("invoiceId"), text("number"), date("date", { column: "payment_date" }),
      num("amount", { column: "amount_txn" }),
      { column: "amount", sql: (p) => `round(${p("amount")} * (select i.fx_rate from erp.supplier_invoice i where i.id = ${p("invoiceId")}), 2)` },
      { column: "currency", sql: (p) => `(select i.currency from erp.supplier_invoice i where i.id = ${p("invoiceId")})`, insertOnly: true },
      { column: "fx_rate", sql: (p) => `(select i.fx_rate from erp.supplier_invoice i where i.id = ${p("invoiceId")})`, insertOnly: true },
      { column: "status", value: () => "posted", kind: "erp.doc_status", insertOnly: true },
      uuid("bankAccountId"), text("reference"), uuid("journalEntryId"),
    ],
    order: "t.payment_date, t.created_at",
  },
  {
    collection: "loans",
    table: "loan",
    fields: [
      id, entityId, text("lender"), text("reference"), text("currency"), num("principal"), num("annualRate"), int("months"), date("startDate"),
      text("frequency"), text("method"), num("feePerInstalment"), uuid("bankAccountId"),
      text("status", { insertOnly: true }), // closed by the database with the last instalment
      uuid("drawdownEntryId"), text("notes"), text("scheduleMode", { fallback: "auto" }), uuid("interestAccountId"), uuid("loanAccountId"), uuid("journalId"),
    ],
    children: [
      {
        field: "manualSchedule",
        table: "loan_instalment",
        parent: "loan_id",
        key: "no",
        when: "t.schedule_mode = 'manual'",
        fields: [int("no", { column: "instalment_no" }), date("date", { column: "due_date" }), num("capital"), num("interest"), num("fees")],
      },
    ],
    order: "t.start_date, t.created_at",
  },
  {
    collection: "loanPayments",
    table: "loan_payment",
    fields: [
      id, entityId, uuid("loanId"), int("instalmentNo"), date("date", { column: "paid_on" }), num("capital"), num("interest"), num("fees"),
      num("total", { write: false }), uuid("bankAccountId"), uuid("journalEntryId"),
    ],
    order: "t.loan_id, t.instalment_no",
  },
  {
    collection: "assets",
    table: "asset",
    fields: [
      id, entityId, text("code"), text("name"), text("serial"), uuid("categoryId"),
      { field: "category", read: "(select c.name_fr from erp.asset_category c where c.id = t.category_id)", write: false },
      date("acquisitionDate"), num("cost"),
      { column: "currency", sql: (p) => `(select e.functional_currency from erp.entity e where e.id = ${p("entityId")})`, insertOnly: true },
      num("residual", { column: "residual_value" }), int("lifeMonths"), num("rate"), { field: "method", kind: "erp.depreciation_method" }, date("startDate"),
      date("endDate"), num("accumulated", { insertOnly: true }), // then the depreciation runs add to it (database trigger)
      text("location"), text("status"), uuid("supplierId"), uuid("acquisitionEntryId"), text("notes"),
    ],
    order: "t.code",
  },
  {
    collection: "depreciationRuns",
    table: "depreciation_run",
    fields: [
      id, entityId, uuid("fiscalYearId"), date("date", { column: "run_date" }), num("total"), uuid("journalEntryId"),
      { column: "status", value: () => "posted", kind: "erp.doc_status", insertOnly: true },
    ],
    children: [{ field: "lines", table: "depreciation_run_line", parent: "run_id", key: "assetId", fields: [uuid("assetId"), num("amount")] }],
    order: "t.run_date",
  },
  {
    collection: "payrollRuns",
    table: "payroll_run",
    fields: [
      id, entityId, text("month"), date("date", { column: "run_date" }), text("status"), uuid("journalEntryId"),
      {
        field: "totals",
        read: `jsonb_build_object('gross', t.gross::float8, 'cnssEmployee', t.social_employee::float8, 'cnamEmployee', t.health_employee::float8,
               'its', t.tax::float8, 'net', t.net::float8, 'cnssEmployer', t.social_employer::float8, 'cnamEmployer', t.health_employer::float8,
               'employerCost', t.employer_cost::float8)`,
        write: false,
      },
      ...(
        [["gross", "gross"], ["social_employee", "cnssEmployee"], ["health_employee", "cnamEmployee"], ["tax", "its"], ["net", "net"],
          ["social_employer", "cnssEmployer"], ["health_employer", "cnamEmployer"]] as const
      ).map(([column, key]): Field => ({ column, kind: "num", value: (r) => (r.totals as Record<string, number>)[key] })),
    ],
    children: [
      {
        field: "lines",
        table: "payroll_line",
        parent: "run_id",
        key: "employeeId",
        fields: [
          uuid("employeeId"), num("gross"), num("cnssEmployee", { column: "social_employee" }), num("cnamEmployee", { column: "health_employee" }),
          num("taxable"), num("its", { column: "tax" }), num("net"), num("cnssEmployer", { column: "social_employer" }), num("cnamEmployer", { column: "health_employer" }),
        ],
      },
    ],
    order: "t.month",
  },
  {
    collection: "assignments",
    table: "assignment",
    fields: [id, entityId, uuid("engagementId"), uuid("employeeId"), date("start", { column: "start_date" }), date("end", { column: "end_date" }), num("load"), text("role")],
    order: "t.start_date",
  },
  {
    collection: "archives",
    table: "archive_record",
    fields: [
      id, entityId, uuid("engagementId"), text("reference"), date("archivedAt"), date("retentionUntil"), status("archive_status"), int("bay"), int("shelf"),
      int("slot"), { field: "kind", kind: "erp.archive_kind" }, text("label"), int("boxCount"), text("notes"), text("retrievedBy"), date("retrievedAt"),
    ],
    order: "t.reference",
  },
];
