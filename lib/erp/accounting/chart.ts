import "server-only";

import { readSheet } from "read-excel-file/node";

import { CHART_COLUMNS, validateChartImport, type Account, type ChartImportReport, type ChartRow, type JournalEntry } from "@/lib/erp/engine";
import type { ErpTransaction } from "@/lib/erp/db";
import { AccountingError } from "@/lib/erp/accounting/errors";
import { ENGINE_ENTITY_ID, engineState } from "@/lib/erp/accounting/setup";
import { SETTINGS_ROLES, presentCode, type AccountKind, type Dimension, type ErpEntity } from "@/lib/erp/accounting/model";
import { parseCsv, tableToChartRows } from "@/lib/erp/accounting/sheet";
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";

const say = (locale: Locale, fr: string, en: string) => (locale === "fr" ? fr : en);

export type ChartView = "moving" | "unused" | "auxiliary" | "all";

export type ChartAccountRow = {
  accountId: string;
  code: string;
  name: string;
  nameEn: string | null;
  kind: AccountKind;
  isPostable: boolean;
  active: boolean;
  isStatutory: boolean;
  isAuxiliary: boolean;
  dimension: Dimension;
  collectiveCode: string | null;
  debit: number;
  credit: number;
  balance: number;
  entries: number;
};

// The chart as the screen shows it (erp.chart_rows, 0003): accounts carrying entries, the others, the auxiliaries.
export async function chartRows(tx: ErpTransaction, entityId: string, view: ChartView): Promise<ChartAccountRow[]> {
  const rows = await tx.query<Omit<ChartAccountRow, "dimension"> & { requires_customer: boolean; requires_supplier: boolean; requires_engagement: boolean }>(
    `select r.account_id as "accountId", r.code, r.name_fr as name, a.name_en as "nameEn", r.kind::text as kind, r.is_postable as "isPostable",
            r.active, a.is_statutory as "isStatutory", r.is_auxiliary as "isAuxiliary", r.collective_code as "collectiveCode",
            r.debit::float8 as debit, r.credit::float8 as credit, r.balance::float8 as balance, r.entries::int as entries,
            a.requires_customer, a.requires_supplier, a.requires_engagement
       from erp.chart_rows($1, $2) r join erp.account a on a.id = r.account_id`,
    [entityId, view],
  );
  return rows.map(({ requires_customer, requires_supplier, requires_engagement, ...r }) => ({
    ...r,
    dimension: requires_customer ? "customer" : requires_supplier ? "supplier" : requires_engagement ? "engagement" : "",
  }));
}

export type AccountInput = {
  accountId?: string;
  code: string;
  name: string;
  nameEn: string;
  kind: AccountKind;
  isPostable: boolean;
  active: boolean;
  dimension: Dimension;
};

const KINDS: AccountKind[] = ["asset", "liability", "equity", "income", "expense"];

export async function saveAccount(tx: ErpTransaction, entity: ErpEntity, input: AccountInput, role: ErpRole, locale: Locale) {
  if (!SETTINGS_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas de modifier le plan comptable.", "Your ERP role cannot change the chart of accounts."));
  }
  const name = input.name.trim();
  if (!name) throw new AccountingError(say(locale, "L'intitulé est obligatoire.", "The name is required."));
  if (!KINDS.includes(input.kind)) throw new AccountingError(say(locale, "Nature de compte inconnue.", "Unknown account kind."));
  const flags = { customer: input.dimension === "customer", supplier: input.dimension === "supplier", engagement: input.dimension === "engagement" };

  if (input.accountId) {
    const [current] = await tx.query<{ is_statutory: boolean; is_auxiliary: boolean; kind: AccountKind }>(
      "select is_statutory, is_auxiliary, kind::text as kind from erp.account where id = $1 and entity_id = $2",
      [input.accountId, entity.id],
    );
    if (!current) throw new AccountingError(say(locale, "Compte introuvable.", "Account not found."));
    if (current.is_auxiliary) throw new AccountingError(say(locale, "Un compte auxiliaire se modifie depuis la fiche du client ou du fournisseur.", "An auxiliary account is changed from its customer or supplier."));
    if (current.is_statutory && input.kind !== current.kind) throw new AccountingError(say(locale, "Compte statutaire : la nature ne change pas.", "Statutory account: its kind does not change."));
    await tx.query(
      `update erp.account set name_fr = $3, name_en = $4, kind = $5::erp.account_kind, is_postable = $6 and not is_statutory, active = $7,
              requires_customer = $8, requires_supplier = $9, requires_engagement = $10, requires_counterparty = $8 or $9
        where id = $1 and entity_id = $2`,
      [input.accountId, entity.id, name, input.nameEn.trim() || null, input.kind, input.isPostable, input.active, flags.customer, flags.supplier, flags.engagement],
    );
    return;
  }

  const typed = input.code.trim();
  if (!/^\d{3,8}$/.test(typed)) {
    throw new AccountingError(say(locale, "Le numéro a 3 à 8 chiffres (les racines à 2 chiffres sont réservées au référentiel).", "The number has 3 to 8 digits (2-digit roots belong to the standard chart)."));
  }
  const code = presentCode(typed, entity.codeLength);
  const exists = await tx.query("select 1 from erp.account where entity_id = $1 and code in ($2, $3)", [entity.id, code, typed]);
  if (exists.length) throw new AccountingError(say(locale, `Le compte ${code} existe déjà.`, `Account ${code} already exists.`));
  await tx.query(
    `insert into erp.account (entity_id, code, name_fr, name_en, class, kind, is_postable, active, requires_customer, requires_supplier, requires_engagement)
     values ($1, $2, $3, $4, $5, $6::erp.account_kind, $7, true, $8, $9, $10)`,
    [entity.id, code, name, input.nameEn.trim() || null, Number(code[0]), input.kind, input.isPostable, flags.customer, flags.supplier, flags.engagement],
  );
}

// ---- Excel / CSV round trip, with the engine's checks ---------------------------------------------------------

const KIND_WORD: Record<AccountKind, string> = { asset: "Actif", liability: "Passif", equity: "Capitaux propres", income: "Produit", expense: "Charge" };

export async function exportChart(tx: ErpTransaction, entityId: string): Promise<string[][]> {
  const rows = await tx.query<{ code: string; name_fr: string; name_en: string | null; kind: AccountKind; is_postable: boolean; requires_customer: boolean; requires_supplier: boolean; requires_engagement: boolean; active: boolean }>(
    `select code, name_fr, name_en, kind::text as kind, is_postable, requires_customer, requires_supplier, requires_engagement, active
       from erp.account where entity_id = $1 and not is_auxiliary order by code`,
    [entityId],
  );
  return [
    [...CHART_COLUMNS],
    ...rows.map((a) => [a.code, a.name_fr, a.name_en ?? "", a.code.slice(0, 1), KIND_WORD[a.kind], a.is_postable ? "oui" : "non", a.requires_customer ? "client" : a.requires_supplier ? "fournisseur" : a.requires_engagement ? "mission" : "", a.active ? "oui" : "non"]),
  ];
}

const MAX_BYTES = 2 * 1024 * 1024;

export async function readChartFile(file: File, locale: Locale): Promise<ChartRow[]> {
  if (file.size > MAX_BYTES) throw new AccountingError(say(locale, "Fichier trop lourd (2 Mo au plus).", "File too large (2 MB at most)."));
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let table: string[][];
  if (name.endsWith(".xlsx")) {
    const sheet = await readSheet(buffer);
    table = sheet.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : typeof cell === "boolean" ? (cell ? "oui" : "non") : String(cell))));
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    table = parseCsv(buffer.toString("utf8"));
  } else {
    throw new AccountingError(say(locale, "Format attendu : Excel (.xlsx) ou CSV.", "Expected format: Excel (.xlsx) or CSV."));
  }
  const rows = tableToChartRows(table);
  if (!rows) {
    throw new AccountingError(say(locale, "Colonnes « Numéro » et « Intitulé » introuvables sur la première ligne.", "Columns “Numéro” and “Intitulé” not found on the first row."));
  }
  if (rows.length > 5000) throw new AccountingError(say(locale, "5 000 lignes au plus.", "5,000 rows at most."));
  return rows;
}

// The engine's validateChartImport, on the entity's current chart (and which accounts carry posted entries).
export async function validateImport(tx: ErpTransaction, entity: ErpEntity, rows: ChartRow[]): Promise<ChartImportReport> {
  const accounts = await tx.query<{ id: string; code: string; name_fr: string; name_en: string | null; kind: AccountKind; is_postable: boolean; is_statutory: boolean; active: boolean; requires_customer: boolean; requires_supplier: boolean; requires_engagement: boolean; moving: boolean }>(
    `select a.id, a.code, a.name_fr, a.name_en, a.kind::text as kind, a.is_postable, a.is_statutory, a.active, a.requires_customer, a.requires_supplier,
            a.requires_engagement,
            exists (select 1 from erp.journal_line l join erp.journal_entry e on e.id = l.entry_id where l.account_id = a.id and e.status <> 'draft') as moving
       from erp.account a where a.entity_id = $1 and not a.is_auxiliary`,
    [entity.id],
  );
  const state = engineState(entity);
  state.accounts = accounts.map<Account>((a) => ({
    id: a.id,
    entityId: ENGINE_ENTITY_ID,
    code: a.code,
    nameFr: a.name_fr,
    nameEn: a.name_en ?? undefined,
    kind: a.kind,
    isPostable: a.is_postable,
    isStatutory: a.is_statutory,
    requiresCustomer: a.requires_customer,
    requiresSupplier: a.requires_supplier,
    requiresEngagement: a.requires_engagement,
    active: a.active,
  }));
  // only "is this account used" matters to the checks
  state.entries = accounts.filter((a) => a.moving).map((a) => ({ entityId: ENGINE_ENTITY_ID, status: "posted", lines: [{ accountId: a.id }] }) as unknown as JournalEntry);
  return validateChartImport(state, ENGINE_ENTITY_ID, rows);
}

export async function stageImport(tx: ErpTransaction, entity: ErpEntity, fileName: string, rows: ChartRow[], report: ChartImportReport) {
  const [{ id }] = await tx.query<{ id: string }>(
    "insert into erp.chart_import (entity_id, file_name, rows, errors, warnings) values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) returning id",
    [entity.id, fileName, JSON.stringify(rows), JSON.stringify(report.errors), JSON.stringify(report.warnings)],
  );
  return id;
}

// Applies a staged import after checking it again against the chart as it is now.
export async function applyImport(tx: ErpTransaction, entity: ErpEntity, importId: string, role: ErpRole, locale: Locale) {
  if (!SETTINGS_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas d'importer le plan comptable.", "Your ERP role cannot import the chart of accounts."));
  }
  const [staged] = await tx.query<{ rows: ChartRow[] }>(
    "select rows from erp.chart_import where id = $1 and entity_id = $2 and status = 'validated' for update",
    [importId, entity.id],
  );
  if (!staged) throw new AccountingError(say(locale, "Import introuvable ou déjà traité.", "Import not found or already processed."));
  const report = await validateImport(tx, entity, staged.rows);
  if (report.errors.length) {
    throw new AccountingError(say(locale, `${report.errors.length} erreur(s) à corriger avant l'import.`, `${report.errors.length} error(s) to fix before importing.`));
  }
  let created = 0;
  let updated = 0;
  for (const r of report.rows) {
    if (r.action === "update" && r.existingId) {
      await tx.query(
        `update erp.account set name_fr = $2, name_en = $3, kind = case when is_statutory then kind else $4::erp.account_kind end,
                is_postable = $5 and not is_statutory, requires_customer = $6, requires_supplier = $7, requires_engagement = $8,
                requires_counterparty = $6 or $7, active = $9
          where id = $1 and entity_id = $10`,
        [r.existingId, r.nameFr, r.nameEn ?? null, r.kind, r.isPostable, r.requiresCustomer, r.requiresSupplier, r.requiresEngagement, r.active, entity.id],
      );
      updated++;
    } else if (r.action === "create") {
      await tx.query(
        `insert into erp.account (entity_id, code, name_fr, name_en, class, kind, is_postable, is_statutory, requires_customer, requires_supplier,
                                  requires_engagement, active)
         values ($1, $2, $3, $4, $5, $6::erp.account_kind, $7, $8, $9, $10, $11, $12)`,
        [entity.id, r.code, r.nameFr, r.nameEn ?? null, Number(r.code[0]), r.kind, r.code.length > 2 && r.isPostable, r.code.length === 2, r.requiresCustomer, r.requiresSupplier, r.requiresEngagement, r.active],
      );
      created++;
    }
  }
  await tx.query("update erp.chart_import set status = 'applied' where id = $1", [importId]);
  return { created, updated };
}

export async function discardImport(tx: ErpTransaction, entityId: string, importId: string) {
  await tx.query("update erp.chart_import set status = 'discarded' where id = $1 and entity_id = $2 and status = 'validated'", [importId, entityId]);
}
