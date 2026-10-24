// The accounting server layer against the real schema (every migration, on PGlite): what the pages do, end to end.
// Row-level security and session roles are covered by db/erp/test/bumex-one.test.mjs; here the database runs as
// its owner and the ERP role is passed the way the actions pass it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { applyImport, chartRows, exportChart, saveAccount, stageImport, validateImport } from "@/lib/erp/accounting/chart";
import { createYear, listYears, setPeriodStatus, setYearClosed } from "@/lib/erp/accounting/closing";
import { getEntry, listAccounts, listEntries, listJournals, postChecks, postEntry, reverseEntry, saveDraft } from "@/lib/erp/accounting/entries";
import { AccountingError, accountingErrorMessage } from "@/lib/erp/accounting/errors";
import { deleteJournal, listJournalUsage, saveJournal } from "@/lib/erp/accounting/journals";
import { findAccount, parseAmount, presentCode, type ErpEntity } from "@/lib/erp/accounting/model";
import { generalLedger, integrity, trialBalance } from "@/lib/erp/accounting/reports";
import { applyChartTemplate } from "@/lib/erp/accounting/setup";
import { parseCsv, tableToChartRows } from "@/lib/erp/accounting/sheet";
import type { ErpTransaction } from "@/lib/erp/db";

const migrations = join(process.cwd(), "db/erp/migrations");
let db: PGlite;
let tx: ErpTransaction;
let audit: ErpEntity;

const account = async (code: string) => (await listAccounts(tx, audit.id)).find((a) => a.code === code)!;
const journal = async (code: string) => (await listJournals(tx, audit.id)).find((j) => j.code === code)!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(migrations, f), "utf8")).join("\n"));
  tx = { query: async <T,>(sql: string, params?: unknown[]) => (await db.query(sql, params as never[])).rows as T[] };
  const [row] = await tx.query<{ id: string; code: ErpEntity["code"]; name: string; country: string; functional_currency: string; coa_template: ErpEntity["chartTemplate"]; account_code_length: number }>(
    "select id, code, name, country, functional_currency, coa_template::text as coa_template, account_code_length from erp.entity where code = 'bumex_audit'",
  );
  audit = { id: row.id, code: row.code, name: row.name, country: row.country, currency: row.functional_currency, chartTemplate: row.coa_template, codeLength: row.account_code_length };
});

describe("model helpers", () => {
  it("reads amounts the way people type them", () => {
    expect(parseAmount("1 234,50")).toBe(1234.5);
    expect(parseAmount("1234.567")).toBe(1234.57);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });

  it("presents codes on six digits and finds accounts by their short form", () => {
    expect(presentCode("4100", 6)).toBe("410000");
    expect(presentCode("41", 6)).toBe("41");
    const accounts = [{ id: "a", code: "631000", name: "Honoraires", kind: "expense" as const, isPostable: true, active: true, isAuxiliary: false, dimension: "" as const }];
    expect(findAccount(accounts, "6310", 6)?.id).toBe("a");
    expect(findAccount(accounts, "631000 Honoraires", 6)?.id).toBe("a");
    expect(findAccount(accounts, "6399", 6)).toBeUndefined();
  });

  it("reads CSV from Excel in French (semicolons, quotes, BOM)", () => {
    const table = parseCsv('﻿Numéro;Intitulé;Intitulé (EN);Type\r\n6311;"Honoraires; conseil";Fees;Charge\r\n7011;Audit;;Produit\r\n');
    const rows = tableToChartRows(table)!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: "6311", nameFr: "Honoraires; conseil", nameEn: "Fees", kind: "Charge" });
    expect(tableToChartRows([["Foo", "Bar"]])).toBeNull();
  });
});

describe("accounting on the real schema", () => {
  it("sets an entity up from the engine's chart, once", async () => {
    const first = await applyChartTemplate(tx, audit, "PCM", [2026]);
    expect(first.accounts).toBeGreaterThan(90);
    expect(first.journals).toBe(7);
    expect(first.taxCodes).toBe(7);
    expect(first.fiscalYears).toBe(1);
    const again = await applyChartTemplate(tx, audit, "PCM", [2026]);
    expect(again).toEqual({ accounts: 0, journals: 0, taxCodes: 0, fiscalYears: 0 });
    const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from erp.account_mapping where entity_id = $1", [audit.id]);
    expect(n).toBeGreaterThan(50);
    expect((await account("410000")).dimension).toBe("customer");
    expect((await account("631000")).isPostable).toBe(true);
    expect((await listAccounts(tx, audit.id)).find((a) => a.code === "63")?.isPostable).toBe(false);
  });

  it("saves a draft, checks it and posts it with number 1", async () => {
    const od = await journal("OD");
    const fees = await account("631000");
    const bank = await account("550100");
    const entryId = await saveDraft(tx, audit, { entityCode: audit.code, journalId: od.id, date: "2026-10-15", description: "Honoraires conseil", currency: "MRU", fxRate: 1, lines: [{ accountId: fees.id, description: "", debit: 1000, credit: 0 }, { accountId: bank.id, description: "", debit: 0, credit: 1000 }] }, "fr");
    expect(await postChecks(tx, entryId, "accountant", "fr")).toEqual([]);
    await expect(postEntry(tx, entryId, "staff", "fr")).rejects.toThrow(/rôle ERP ne permet pas de comptabiliser/);
    const posted = await postEntry(tx, entryId, "accountant", "fr");
    expect(posted).toEqual({ entryNo: 1, journalCode: "OD" });
    const entry = await getEntry(tx, entryId);
    expect(entry?.status).toBe("posted");
    expect(entry?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry?.lines.map((l) => [l.code, l.debit, l.credit])).toEqual([["631000", 1000, 0], ["550100", 0, 1000]]);
  });

  it("converts foreign currency per line and squares the rounding on the last one", async () => {
    const od = await journal("OD");
    const id = await saveDraft(tx, audit, { entityCode: audit.code, journalId: od.id, date: "2026-10-16", description: "Licence USD", currency: "USD", fxRate: 39.987, lines: [{ accountId: (await account("633300")).id, description: "", debit: 33.33, credit: 0 }, { accountId: (await account("633300")).id, description: "", debit: 33.33, credit: 0 }, { accountId: (await account("550200")).id, description: "", debit: 0, credit: 66.66 }] }, "fr");
    const entry = (await getEntry(tx, id))!;
    const debit = entry.lines.reduce((a, l) => a + l.debit, 0);
    const credit = entry.lines.reduce((a, l) => a + l.credit, 0);
    expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
    expect(await postChecks(tx, id, "accountant", "fr")).toEqual([]);
    await postEntry(tx, id, "accountant", "fr");
  });

  it("says why a draft cannot be posted", async () => {
    const od = await journal("OD");
    const unbalanced = await saveDraft(tx, audit, { entityCode: audit.code, journalId: od.id, date: "2026-10-17", description: "", currency: "MRU", fxRate: 1, lines: [{ accountId: (await account("631000")).id, description: "", debit: 100, credit: 0 }, { accountId: (await account("550100")).id, description: "", debit: 0, credit: 90 }] }, "fr");
    expect((await postChecks(tx, unbalanced, "accountant", "fr")).join(" ")).toMatch(/Déséquilibrée/);
    const customer = await saveDraft(tx, audit, { entityCode: audit.code, journalId: od.id, date: "2026-10-17", description: "", currency: "MRU", fxRate: 1, lines: [{ accountId: (await account("410000")).id, description: "", debit: 50, credit: 0 }, { accountId: (await account("550100")).id, description: "", debit: 0, credit: 50 }] }, "en");
    expect((await postChecks(tx, customer, "accountant", "en")).join(" ")).toMatch(/needs a customer/);
    await expect(saveDraft(tx, audit, { entityCode: audit.code, journalId: od.id, date: "2031-01-01", description: "", currency: "MRU", fxRate: 1, lines: [{ accountId: (await account("631000")).id, description: "", debit: 1, credit: 0 }] }, "fr")).rejects.toThrow(/Aucun exercice 2031/);
    expect((await listEntries(tx, audit.id, { status: "draft" })).length).toBe(2);
  });

  it("reverses a posted entry, and the reversal cancels it in the trial balance", async () => {
    const [first] = (await listEntries(tx, audit.id, { status: "posted" })).filter((e) => e.entryNo === 1);
    const reversal = await reverseEntry(tx, first.id, "2026-10-20", "erreur de saisie", "accountant", "fr");
    expect(reversal.entryNo).toBe(3);
    expect((await getEntry(tx, first.id))?.status).toBe("reversed");
    const fy = (await listYears(tx, audit.id))[0];
    const tb = await trialBalance(tx, audit.id, fy.id, false);
    expect(tb.find((r) => r.code === "631000")?.balance).toBe(0);
    const totals = tb.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 });
    expect(Math.round(totals.d * 100)).toBe(Math.round(totals.c * 100));
    const ledger = await generalLedger(tx, audit.id, (await account("631000")).id, fy.id);
    expect(ledger.map((r) => r.running)).toEqual([1000, 0]);
    await expect(reverseEntry(tx, first.id, "2026-10-21", "encore", "accountant", "fr")).rejects.toThrow(AccountingError);
  });

  it("keeps the hash chain intact", async () => {
    const od = (await integrity(tx, audit.id)).find((r) => r.code === "OD")!;
    expect(od.sealed).toBe(3);
    expect(od.verified).toBe(3);
  });

  it("locks periods and closes years with the right roles", async () => {
    const fy = (await listYears(tx, audit.id))[0];
    const january = fy.periods[0];
    await expect(setPeriodStatus(tx, audit.id, january.id, "locked", "accountant", "fr")).rejects.toThrow(/associés/);
    await setPeriodStatus(tx, audit.id, january.id, "soft_closed", "accountant", "fr");
    await setPeriodStatus(tx, audit.id, january.id, "locked", "partner", "fr");
    await expect(setYearClosed(tx, audit.id, fy.id, true, "partner", "fr")).rejects.toThrow();
    const closing = await setYearClosed(tx, audit.id, fy.id, true, "partner", "fr").catch((e) => accountingErrorMessage(e, "fr", { fr: "?", en: "?" }));
    expect(closing).toMatch(/périodes non verrouillées/);
    await createYear(tx, audit.id, 2027, "accountant", "fr");
    expect((await listYears(tx, audit.id)).map((y) => y.label)).toEqual(["2027", "2026"]);
  });

  it("creates accounts on six digits and imports a sheet after checking it", async () => {
    await saveAccount(tx, audit, { code: "6311", name: "Honoraires juridiques", nameEn: "", kind: "expense", isPostable: true, active: true, dimension: "" }, "accountant", "fr");
    expect((await account("631100")).name).toBe("Honoraires juridiques");
    await expect(saveAccount(tx, audit, { code: "631100", name: "Doublon", nameEn: "", kind: "expense", isPostable: true, active: true, dimension: "" }, "accountant", "fr")).rejects.toThrow(/existe déjà/);
    await expect(saveAccount(tx, audit, { code: "6312", name: "X", nameEn: "", kind: "expense", isPostable: true, active: true, dimension: "" }, "staff", "fr")).rejects.toThrow(AccountingError);

    const rows = tableToChartRows(parseCsv("Numéro;Intitulé;Type;Dimension\n7011;Prestations d'audit;Produit;mission\n631100;Honoraires d'avocats;Charge;\n99;Racine;Charge;\n"))!;
    const report = await validateImport(tx, audit, rows);
    expect(report.errors).toEqual([]);
    expect(report.toCreate).toBe(2);
    expect(report.toUpdate).toBe(1);
    const importId = await stageImport(tx, audit, "plan.csv", rows, report);
    expect(await applyImport(tx, audit, importId, "accountant", "fr")).toEqual({ created: 2, updated: 1 });
    expect((await account("701100")).dimension).toBe("engagement");
    expect((await account("631100")).name).toBe("Honoraires d'avocats");
    await expect(applyImport(tx, audit, importId, "accountant", "fr")).rejects.toThrow(/déjà traité/);

    const bad = await validateImport(tx, audit, tableToChartRows(parseCsv("Numéro;Intitulé;Classe\n7012;Audit;6\nabc;X;\n"))!);
    expect(bad.errors.map((e) => e.message).join(" ")).toMatch(/Classe 6 incohérente/);
    expect((await exportChart(tx, audit.id))[0]).toEqual(["Numéro", "Intitulé", "Intitulé (EN)", "Classe", "Type", "Imputable", "Dimension", "Actif"]);
    expect((await chartRows(tx, audit.id, "moving")).some((r) => r.code === "631000")).toBe(true);
  });

  it("manages journals and keeps the ones carrying entries", async () => {
    await saveJournal(tx, audit.id, { code: "bq2", name: "Banque Attijari", kind: "bank" }, "accountant", "fr");
    const bq2 = (await listJournalUsage(tx, audit.id)).find((j) => j.code === "BQ2")!;
    await deleteJournal(tx, audit.id, bq2.id, "accountant", "fr");
    const od = (await listJournalUsage(tx, audit.id)).find((j) => j.code === "OD")!;
    const message = await deleteJournal(tx, audit.id, od.id, "accountant", "fr").catch((e) => accountingErrorMessage(e, "fr", { fr: "?", en: "?" }));
    expect(message).toMatch(/écritures comptabilisées : il est conservé/);
  });
});
