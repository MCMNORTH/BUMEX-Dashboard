// BUMEX Vanguard on the real schema (every migration, on PGlite), the way production runs it: each change is made
// by the engine in the "browser" (record), then replayed and written by the "server" in the person's ERP session
// (erp_app, row-level security, the guards), and the state read again.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveErpModules } from "@/lib/erp/config";
import type { ErpTransaction } from "@/lib/erp/db";
import { DomainError, groupFigures, withIdSource, type DraftInput, type State } from "@/lib/erp/engine";
import { testFloorBooks } from "@/lib/erp/test-floor";
import { vanguardCommands } from "@/lib/erp/vanguard/commands";
import * as domain from "@/lib/erp/vanguard/domain";
import { vanguardErrorMessage } from "@/lib/erp/vanguard/errors";
import { loadVanguardState, type VanguardPerson } from "@/lib/erp/vanguard/load";
import { record, type VanguardChange } from "@/lib/erp/vanguard/record";
import { ReplayError } from "@/lib/erp/vanguard/replay";
import { applyVanguardChange, saveVanguardChange } from "@/lib/erp/vanguard/save";
import { visibleState } from "@/lib/erp/vanguard/visible";
import { storedAccess } from "@/lib/erp/permissions";
import type { BumexEntityCode } from "@/types/entity";
import type { ErpAccess, ErpEntityModules, ErpModuleKey, ErpRole } from "@/types/erp";

const migrations = join(process.cwd(), "db/erp/migrations");
let db: PGlite;
const tx: ErpTransaction = {
  query: async <T,>(sql: string, params?: unknown[]) => (await db.query(sql, params as never[])).rows as T[],
  run: async (sql: string, params?: unknown[]) => (await db.query(sql, params as never[])).affectedRows ?? 0,
};

const people: VanguardPerson[] = [
  { id: "awa", name: "Awa Associée", email: "awa@bumex.mr", entityCode: "bumex_audit", active: true, present: true },
  { id: "aicha", name: "Aïcha Comptable", email: "aicha@bumex.mr", entityCode: "bumex_audit", active: true, present: false },
  { id: "sidi", name: "Sidi Collaborateur", email: "sidi@bumex.mr", entityCode: "bumex_audit", active: true, present: true },
  { id: "gone", name: "Ancien", email: "old@bumex.mr", entityCode: "bumex_audit", active: false, present: false },
  { id: "adm", name: "Admin ERP", email: "adm@bumex.mr", entityCode: "bumex_holding", active: true, present: true },
  { id: "nouveau", name: "Nouvelle Recrue", email: "nouveau@bumex.mr", entityCode: "bumex_sa", active: true, present: true },
  { id: "mariem", name: "Mariem Sow", email: "mariem@bumex.mr", entityCode: "bumex_audit", active: true, present: true },
  { id: "moussa", name: "Moussa Comptable", email: "moussa@bumex.mr", entityCode: "bumex_maroc", active: true, present: true },
];
// role, entities (null = all), modules (null = the role's), the entities whose modules differ (0009)
const grants: Record<string, [ErpRole, string[] | null, ErpModuleKey[] | null, ErpEntityModules?]> = {
  awa: ["partner", null, null],
  aicha: ["accountant", ["bumex_audit"], null],
  sidi: ["staff", ["bumex_audit"], ["accounting"]],
  adm: ["admin", null, null],
  moussa: ["accountant", ["bumex_audit", "bumex_it"], null, { bumex_it: ["archives"] }],
};
const accessOf = (uid: string): ErpAccess => {
  const [role, entityCodes, modules, entityModules] = grants[uid];
  return { role, entityCodes: entityCodes as ErpAccess["entityCodes"], modules: resolveErpModules(role, modules), entityModules: entityModules ?? {}, managesAccess: false, view3d: false, testFloor: false };
};
const who = (uid: string) => ({ id: uid, name: people.find((p) => p.id === uid)!.name });

async function as<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role erp_app");
    await db.query("select erp.open_session($1)", [uid]);
    const out = await work();
    await db.exec("commit");
    return out;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

// The server's own work (and the Missions room's, written here directly): every entity, the actor recorded.
async function asSystem<T>(work: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role erp_app");
    await db.query("select erp.open_system_session('test')");
    const out = await work();
    await db.exec("commit");
    return out;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const load = (uid: string) => as(uid, () => loadVanguardState(tx, who(uid), accessOf(uid), people));
const send = (uid: string, change: VanguardChange) => as(uid, () => applyVanguardChange(tx, who(uid), accessOf(uid), people, change));

// What the store does: the engine runs on the person's state (recorded), then the server replays and saves it.
async function change<R>(uid: string, run: (state: State) => R) {
  const { state } = await load(uid);
  const { result, change } = record(state, run);
  if (!change) throw new Error("nothing recorded");
  return { browser: result, change, ...(await send(uid, change)) };
}

let audit: string;
let it_: string;
const auditOf = (s: State) => ({
  accounts: s.accounts.filter((a) => a.entityId === audit),
  journals: s.journals.filter((j) => j.entityId === audit),
  entries: s.entries.filter((e) => e.entityId === audit),
});

// A two-line entry of BUMEX Audit in March 2026 (rent paid from the bank).
const draft = (s: State, amount = 150000): DraftInput => {
  const account = (code: string) => s.accounts.find((a) => a.entityId === audit && a.code === code)!.id;
  return {
    entityId: audit,
    journalId: s.journals.find((j) => j.entityId === audit && j.code === "OD")!.id,
    date: "2026-03-15",
    description: "Loyer de mars",
    currency: "MRU",
    lines: [
      { accountId: account("620000"), description: "Loyer", debitTxn: amount, creditTxn: 0 },
      { accountId: account("550100"), description: "Banque", debitTxn: 0, creditTxn: amount },
    ],
  };
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(migrations, f), "utf8")).join("\n"));
  for (const p of people) {
    await db.query("insert into work.person (id, email, full_name, entity_code) values ($1, $2, $3, $4)", [p.id, p.email, p.name, p.entityCode]);
  }
  for (const [uid, [role, codes, modules, entityModules]] of Object.entries(grants)) {
    await db.query("insert into erp.user_access (user_id, erp_role, entity_codes, modules, entity_modules, granted_by) values ($1, $2, $3, $4, $5, 'test')", [uid, role, codes, modules, entityModules ?? null]);
  }
  const rows = (await db.query<{ id: string; code: string }>("select id, code from erp.entity")).rows;
  audit = rows.find((r) => r.code === "bumex_audit")!.id;
  it_ = rows.find((r) => r.code === "bumex_it")!.id;
});

describe("recording in the browser", () => {
  it("wraps every engine change the screens make, and only those", () => {
    for (const name of Object.keys(vanguardCommands) as (keyof typeof vanguardCommands)[]) {
      expect(typeof domain[name]).toBe("function");
      expect(domain[name]).not.toBe(vanguardCommands[name]);
    }
    expect(domain.signInAs).toBeTypeOf("function");
    expect("signInAs" in vanguardCommands).toBe(false);
  });

  it("refuses a change that does not go through the engine", async () => {
    const { state } = await load("awa");
    expect(() => record(state, (s) => ({ ...s, today: "2000-01-01" }))).toThrow(/ne passe pas par le moteur/);
    expect(record(state, (s) => s).change).toBeNull();
  });
});

describe("the state read from the database", () => {
  it("lists every floor, with the ERP team's codes and BUMEX One's people", async () => {
    const { state } = await load("aicha");
    expect(state.entities.map((e) => e.code)).toEqual(["HOLD", "SA", "AUD", "ADV", "MAU", "AVO", "IT", "MAR"]);
    const aud = state.entities.find((e) => e.code === "AUD")!;
    expect([aud.staffTotal, aud.staffPresent]).toEqual([4, 3]); // "gone" is inactive in BUMEX One
    expect(state.session).toMatchObject({ userId: "aicha", role: "accountant", entityIds: [audit] });
    expect(state.session.modules).toEqual(expect.arrayContaining(["accounting", "reports", "missions", "tasks"]));
    expect(state.users.map((u) => u.id)).toEqual(["aicha"]);
    expect((await load("awa")).state.users.map((u) => u.id)).toEqual(["awa"]); // the list is the access administrator's
  });
});

describe("changes made in Vanguard", () => {
  it("a partner sets up the chart from the template: the database keeps the browser's ids", async () => {
    const { browser, state } = await change("awa", (s) => domain.applyChartTemplate(s, audit, "PCM", "replace"));
    const made = auditOf(browser[0]);
    const saved = auditOf(state);
    expect(saved.accounts.length).toBeGreaterThan(90);
    expect(saved.journals.map((j) => j.code).sort()).toEqual(["AC", "BQ", "CA", "CL", "IM", "OD", "VT"]);
    expect(new Set(saved.journals.map((j) => j.id))).toEqual(new Set(made.journals.map((j) => j.id)));
    expect(new Set(saved.accounts.map((a) => a.id))).toEqual(new Set(made.accounts.map((a) => a.id)));
    expect(state.mappings.filter((m) => m.entityId === audit).length).toBeGreaterThan(50);
    expect(state.taxCodes.filter((t) => t.entityId === audit)).toHaveLength(7);
    expect(state.taxRules.filter((t) => t.entityId === audit)).toHaveLength(5);
    expect(state.bankRules.filter((r) => r.entityId === audit)).toHaveLength(4);
  });

  it("an accountant opens 2026 (twelve periods)", async () => {
    const { state } = await change("aicha", (s) => domain.createFiscalYear(s, audit, 2026));
    const fy = state.fiscalYears.find((f) => f.entityId === audit && f.label === "2026")!;
    expect(state.periods.filter((p) => p.fiscalYearId === fy.id)).toHaveLength(12);
  });

  it("an accountant saves and posts in one go: the database numbers, chains and seals the entry", async () => {
    const { browser, state, chainBreaks } = await change("aicha", (s) => {
      const [s1, e] = domain.createDraft(s, draft(s));
      return domain.postEntry(s1, e.id);
    });
    const id = browser[1].id;
    const entry = state.entries.find((e) => e.id === id)!;
    expect(entry).toMatchObject({ status: "posted", entryNo: 1, chainSeq: 1, prevHash: "", postedBy: "aicha" });
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.lines.map((l) => [l.debit, l.credit])).toEqual([[150000, 0], [0, 150000]]);
    expect(chainBreaks).toEqual([]);
    expect(domain.verifyChain(state, audit, entry.journalId).every((c) => c.ok)).toBe(true);
  });

  it("an accountant reverses it: a second entry, the first marked reversed", async () => {
    const { state } = await load("aicha");
    const original = auditOf(state).entries.find((e) => e.status === "posted")!;
    const saved = (await change("aicha", (s) => domain.reverseEntry(s, original.id, "2026-03-20", "erreur de compte"))).state;
    const reversal = saved.entries.find((e) => e.reversalOfId === original.id)!;
    expect(reversal).toMatchObject({ status: "posted", entryNo: 2, chainSeq: 2 });
    expect(saved.entries.find((e) => e.id === original.id)).toMatchObject({ status: "reversed", reversedById: reversal.id });
  });

  it("drafts are edited and deleted; posted entries are not", async () => {
    const created = await change("aicha", (s) => domain.createDraft(s, draft(s, 1000)));
    const id = created.browser[1].id;
    const edited = await change("aicha", (s) => domain.updateDraft(s, id, { description: "Loyer corrigé", lines: draft(s, 2000).lines }));
    expect(edited.state.entries.find((e) => e.id === id)).toMatchObject({ status: "draft", description: "Loyer corrigé" });
    expect(edited.state.entries.find((e) => e.id === id)!.lines[0].debit).toBe(2000);
    const removed = await change("aicha", (s) => domain.deleteDraft(s, id));
    expect(removed.state.entries.some((e) => e.id === id)).toBe(false);
  });
});

describe("what the server refuses", () => {
  const forged = (calls: VanguardChange["calls"]): VanguardChange => ({ calls, result: calls.length });

  it("a staff member cannot post, even with a change made by hand", async () => {
    const { state } = await load("sidi");
    const id = crypto.randomUUID();
    const input = draft(state);
    const attempt = send("sidi", forged([{ name: "createDraft", input: 0, args: [input], ids: [id] }, { name: "postEntry", input: 1, args: [id], ids: [] }]));
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toThrow(/rôle/);
  });

  it("only the engine's changes, with new ids", async () => {
    const { state } = await load("awa");
    await expect(send("awa", forged([{ name: "signInAs", input: 0, args: ["x"], ids: [] }]))).rejects.toBeInstanceOf(ReplayError);
    const taken = state.accounts.find((a) => a.entityId === audit)!.id;
    await expect(send("awa", forged([{ name: "addAccount", input: 0, args: [audit, "6281", "Divers", "expense"], ids: [taken] }]))).rejects.toThrow(/Identifiant refusé/);
    await expect(send("awa", forged([{ name: "addAccount", input: 0, args: [audit, "6281", "Divers", "expense"], ids: ["acc_00001"] }]))).rejects.toThrow(/Identifiant refusé/);
  });

  it("a room the person may not open refuses its changes", async () => {
    const { state } = await load("sidi");
    expect(state.session.modules).not.toContain("tax");
    const attempt = send("sidi", forged([{ name: "addTaxCode", input: 0, args: [{ entityId: audit, code: "X", nameFr: "X", kind: "vat", rate: 0.1 }], ids: [crypto.randomUUID()] }]));
    await expect(attempt).rejects.toThrow(/pas ouvert à votre accès/);
  });

  it("an entity the person does not see stays closed (the replay, before row-level security: bumex-one.test.mjs)", async () => {
    const attempt = send("aicha", forged([{ name: "createFiscalYear", input: 0, args: [it_, 2026], ids: Array.from({ length: 13 }, () => crypto.randomUUID()) }]));
    const error = await attempt.catch((e: unknown) => e);
    expect(vanguardErrorMessage(error, "fr")).toBe("Ce module n'est pas ouvert à votre accès sur cette entité.");
  });

  it("a period locked by a partner refuses a posting checked by the database too", async () => {
    const { state } = await load("awa");
    const march = state.periods.find((p) => p.entityId === audit && p.start === "2026-03-01")!;
    const locked = (await change("awa", (s) => domain.setPeriodStatus(s, march.id, "locked"))).state;
    expect(locked.periods.find((p) => p.id === march.id)).toMatchObject({ status: "locked", lockedBy: "awa" });
    // the engine refuses first; the database refuses a change made by hand as well
    const id = crypto.randomUUID();
    const attempt = send("aicha", forged([{ name: "createDraft", input: 0, args: [draft(locked)], ids: [id] }, { name: "postEntry", input: 1, args: [id], ids: [] }]));
    await expect(attempt).rejects.toThrow(/verrouillée/);
  });
});

describe("deletions", () => {
  it("an accountant asks, a partner approves, the account goes", async () => {
    const added = await change("aicha", (s) => domain.addAccount(s, audit, "6288", "Divers à supprimer", "expense"));
    const account = added.state.accounts.find((a) => a.entityId === audit && a.code === "628800")!;
    const asked = await change("aicha", (s) => domain.requestDeletion(s, { table: "account", rowId: account.id, label: "628800", reason: "créé par erreur", entityId: audit }));
    const request = asked.state.deletionRequests.find((r) => r.rowId === account.id)!;
    expect(request).toMatchObject({ status: "pending", requestedBy: "aicha", requestedByName: "Aïcha Comptable" });
    const decided = await change("awa", (s) => domain.decideDeletion(s, request.id, "approved"));
    expect(decided.state.accounts.some((a) => a.id === account.id)).toBe(false);
    expect(decided.state.deletionRequests.find((r) => r.id === request.id)).toMatchObject({ status: "approved", decidedBy: "awa" });
    expect(decided.state.auditLog.some((a) => a.table === "account" && a.action === "D")).toBe(true);
  });
});

describe("the modules", () => {
  const account = (s: State, code: string) => s.accounts.find((a) => a.entityId === audit && a.code === code)!.id;
  const journal = (s: State, code: string) => s.journals.find((j) => j.entityId === audit && j.code === code)!.id;
  let customer: string;
  let bank: string;
  let employee: string;
  let engagement: string;

  it("clients: a customer with its auxiliary account, an invoice validated, numbered and posted, then paid", async () => {
    const created = await change("aicha", (s) => domain.addCustomer(s, { entityId: audit, name: "SNIM", regime: "standard", country: "MR", defaultCurrency: "MRU", paymentTermsDays: 30 }));
    const c = created.state.customers.find((x) => x.name === "SNIM")!;
    customer = c.id;
    expect(c.code).toBe("C001");
    expect(created.state.accounts.find((a) => a.id === c.arAccountId)).toMatchObject({ code: "C001", isAuxiliary: true, requiresCustomer: true });

    const banked = await change("aicha", (s) => domain.addBankAccount(s, { entityId: audit, name: "BNM compte MRU", bankName: "BNM", currency: "MRU", glAccountId: account(s, "550100"), journalId: journal(s, "BQ") }));
    bank = banked.state.bankAccounts.find((b) => b.name === "BNM compte MRU")!.id;

    const invoiced = await change("aicha", (s) => {
      const [s1, inv] = domain.createInvoice(s, { entityId: audit, customerId: customer, date: "2026-05-12", currency: "MRU", lines: [{ description: "Audit légal 2025", quantity: 1, unitPrice: 450000, serviceCategory: "AUDIT" }] });
      return domain.validateInvoice(s1, inv.id);
    });
    const invoice = invoiced.state.salesInvoices.find((i) => i.customerId === customer)!;
    expect(invoice).toMatchObject({ number: "IN2605-0001", totalHt: 450000 });
    expect(invoice.lines[0]).toMatchObject({ serviceCategory: "AUDIT", lineHt: 450000 });
    const posted = invoiced.state.entries.find((e) => e.id === invoice.journalEntryId)!;
    expect(posted).toMatchObject({ status: "posted", sourceType: "sales_invoice" });
    expect(posted.entryNo).toBeGreaterThan(0);

    const paid = await change("aicha", (s) => domain.recordPayment(s, { entityId: audit, customerId: customer, date: "2026-05-20", currency: "MRU", amountTxn: invoice.netPayable, bankAccountId: bank, invoiceId: invoice.id }));
    expect(paid.state.salesInvoices.find((i) => i.id === invoice.id)!.amountPaidTxn).toBe(invoice.netPayable);
    expect(paid.state.customerPayments).toHaveLength(1);
    expect(paid.state.allocations).toMatchObject([{ invoiceId: invoice.id, amountTxn: invoice.netPayable }]);

    // the next invoice takes the next number: the counter is kept in the database
    const second = await change("aicha", (s) => {
      const [s1, inv] = domain.createInvoice(s, { entityId: audit, customerId: customer, date: "2026-05-28", currency: "MRU", lines: [{ description: "Conseil", quantity: 2, unitPrice: 50000, serviceCategory: "ADVISORY" }] });
      return domain.validateInvoice(s1, inv.id);
    });
    expect(second.state.salesInvoices.map((i) => i.number).sort()).toEqual(["IN2605-0001", "IN2605-0002"]);

    const credited = await change("aicha", (s) => domain.createCreditNote(s, second.browser[1].id, "remise commerciale", "2026-05-30"));
    expect(credited.state.creditNotes[0]).toMatchObject({ number: "AV2605-0001", status: "posted" });
    expect(credited.state.creditNotes[0].lines[0].serviceCategory).toBe("ADVISORY");
  });

  it("bank: a statement imported, a fee booked by rule", async () => {
    const imported = await change("aicha", (s) => domain.importStatement(s, bank, [
      { date: "2026-05-31", amount: -2500, description: "FRAIS TENUE DE COMPTE MAI" },
      { date: "2026-05-31", amount: 15000, description: "VIREMENT CLIENT DIVERS" },
    ]));
    expect(imported.state.bankTransactions).toHaveLength(2);
    const fee = imported.state.bankTransactions.find((t) => t.amount === -2500)!;
    const booked = await change("aicha", (s) => domain.bookByRule(s, fee.id, "BANK_FEES"));
    const t = booked.state.bankTransactions.find((x) => x.id === fee.id)!;
    expect(t.status).toBe("booked");
    expect(booked.state.entries.find((e) => e.id === t.journalEntryId)).toMatchObject({ status: "posted" });
  });

  it("suppliers: a supplier, an invoice approved by a partner, then paid", async () => {
    const made = await change("aicha", (s) => domain.addSupplier(s, { entityId: audit, name: "Mauritel", regime: "standard" }));
    const supplier = made.state.suppliers[0];
    expect(supplier.code).toBe("F001");
    const invoiced = await change("aicha", (s) => domain.createSupplierInvoice(s, { entityId: audit, supplierId: supplier.id, supplierRef: "MT-2026-06", date: "2026-06-03", currency: "MRU", totalHt: 900000, taxCodeId: null, expenseAccountId: account(s, "620000"), description: "Location bureaux" }));
    let invoice = invoiced.state.supplierInvoices[0];
    if (invoice.status === "pending_approval") {
      invoice = (await change("awa", (s) => domain.approveSupplierInvoice(s, invoice.id))).state.supplierInvoices[0];
    }
    expect(invoice.number).toMatch(/^FA2606-0001$/);
    const paid = await change("aicha", (s) => domain.paySupplierInvoice(s, { invoiceId: invoice.id, date: "2026-06-10", bankAccountId: bank }));
    expect(paid.state.supplierPayments).toMatchObject([{ invoiceId: invoice.id, amount: invoice.netPayable }]);
    expect(paid.state.supplierInvoices[0]).toMatchObject({ status: "paid", amountPaid: invoice.netPayable });
  });

  it("loans: drawn down, the first instalment paid", async () => {
    const made = await change("aicha", (s) => domain.addLoan(s, { entityId: audit, lender: "BNM", reference: "EMP-2026-1", currency: "MRU", principal: 1200000, annualRate: 0.1, months: 12, startDate: "2026-06-01", frequency: "monthly", method: "annuity", bankAccountId: bank, postDrawdown: true }));
    const loan = made.state.loans[0];
    expect(made.state.entries.find((e) => e.id === loan.drawdownEntryId)).toMatchObject({ status: "posted" });
    const paid = await change("aicha", (s) => domain.payInstalment(s, { loanId: loan.id, instalmentNo: 1, date: "2026-07-01" }));
    expect(paid.state.loanPayments).toMatchObject([{ loanId: loan.id, instalmentNo: 1 }]);
    expect(paid.state.loanPayments[0].total).toBeCloseTo(paid.state.loanPayments[0].capital + paid.state.loanPayments[0].interest, 2);
  });

  it("assets: a category, an asset, the year's depreciation (the database keeps the total)", async () => {
    const withCategory = await change("aicha", (s) => {
      const mapped = (key: string) => s.mappings.find((m) => m.entityId === audit && m.key === key && m.qualifier === "IT")!.accountId;
      return domain.addAssetCategory(s, { entityId: audit, code: "IT", name: "Matériel informatique", lifeMonths: 36, method: "linear", assetAccountId: mapped("ASSET"), accDeprAccountId: mapped("ACC_DEPR") });
    });
    const category = withCategory.state.assetCategories[0];
    const bought = await change("aicha", (s) => domain.addAsset(s, { entityId: audit, name: "Portables audit", categoryId: category.id, acquisitionDate: "2026-01-15", cost: 360000, location: "Nouakchott" }));
    const asset = bought.state.assets[0];
    expect(asset).toMatchObject({ category: "Matériel informatique", accumulated: 0, lifeMonths: 36 });
    const fy = bought.state.fiscalYears.find((f) => f.entityId === audit && f.label === "2026")!;
    const run = await change("aicha", (s) => domain.postDepreciation(s, audit, fy.id, "2026-12-31"));
    const total = run.state.depreciationRuns[0].total;
    expect(total).toBeGreaterThan(0);
    expect(run.state.assets[0].accumulated).toBe(total); // added once, by the database
  });

  it("people: an employee, the payroll rules, a payroll posted (a partner: HR is not among an accountant's modules)", async () => {
    const hired = await change("awa", (s) => domain.addEmployee(s, { entityId: audit, firstName: "Mariem", lastName: "Sow", jobTitle: "Auditrice", department: "Audit", category: "senior", hireDate: "2026-01-01", contractType: "CDI", grossSalary: 60000, allowances: 5000 }));
    employee = hired.state.employees[0].id;
    expect(hired.state.employees[0]).toMatchObject({ status: "active", initials: "M.S." });
    const ruled = await change("awa", (s) => domain.setPayrollRules(s, domain.defaultPayrollRules(audit, "MR")));
    expect(ruled.state.payrollRules[0].labels.tax).toBe("ITS");
    const paid = await change("awa", (s) => domain.postPayroll(s, audit, "2026-06", "2026-06-30"));
    const run = paid.state.payrollRuns[0];
    expect(run).toMatchObject({ month: "2026-06", status: "posted" });
    expect(run.lines[0].employeeId).toBe(employee);
    expect(run.totals.employerCost).toBeGreaterThan(run.totals.gross);
  });

  it("the HR room opens to whoever sees the floor (its People tab); its records and changes stay with the HR module", async () => {
    const { state } = await load("aicha");
    expect(domain.canUseModule(state, "hr")).toBe(false);
    expect(domain.canOpenRoom(state, audit, "hr")).toBe(true);
    expect(domain.canOpenRoom(state, it_, "hr")).toBe(false);
    // the people, without their pay
    expect(state.employees).toEqual([expect.objectContaining({ id: employee, initials: "M.S.", grossSalary: 0, allowances: 0 })]);
    expect(state.payrollRuns.length).toBeGreaterThan(0);
    expect(state.payrollRuns.every((r) => r.lines.length === 0 && r.totals.gross > 0)).toBe(true);
    const forged: VanguardChange = {
      calls: [{ name: "addEmployee", input: 0, args: [{ entityId: audit, firstName: "X", lastName: "Y", jobTitle: "", department: "Audit", category: "senior", hireDate: "2026-01-01", contractType: "CDI", grossSalary: 1, allowances: 0 }], ids: [crypto.randomUUID()] }],
      result: 1,
    };
    await expect(send("aicha", forged)).rejects.toThrow(/pas ouvert à votre accès/);
  });

  it("the browser gets the rows of the person's modules, and what their rooms read of the others", async () => {
    const full = await as("sidi", () => loadVanguardState(tx, who("sidi"), accessOf("sidi"), people, { full: true }));
    expect(full.state.salesInvoices.length).toBeGreaterThan(0);
    // a staff member with the accounting module: the ledger, the third parties its pickers name, no sales or payroll
    const { state } = await load("sidi");
    expect(state.entries.length).toBe(full.state.entries.length);
    expect(state.customers.length).toBe(full.state.customers.length);
    expect(state.suppliers.length).toBe(full.state.suppliers.length);
    expect(state.salesInvoices).toEqual([]);
    expect(state.customerPayments).toEqual([]);
    expect(state.bankTransactions).toEqual([]);
    expect(state.supplierInvoices).toEqual([]);
    expect(state.assets).toEqual([]);
    expect(state.payrollRuns.every((r) => r.lines.length === 0)).toBe(true);
    expect(state.auditLog.some((r) => r.table === "sales_invoice" || r.table === "employee")).toBe(false);
    expect(full.state.auditLog.some((r) => r.table === "sales_invoice")).toBe(true);
    // the accountant has the reports: every module but pay
    const accountant = (await load("aicha")).state;
    expect(accountant.salesInvoices.length).toBe(full.state.salesInvoices.length);
    expect(accountant.employees.every((e) => e.grossSalary === 0)).toBe(true);
    expect(accountant.auditLog.some((r) => r.table === "employee" || r.table === "payroll_run")).toBe(false);
  });

  const version = async () => (await db.query<{ v: number }>("select max(id)::int as v from erp.audit_log")).rows[0].v;
  // a mission as the Missions room saves it (lib/projects/service.ts), on BUMEX Audit
  const mission = (name: string, clientId: string | null, more: { progress?: number; fee?: number } = {}) =>
    asSystem(async () =>
      (await db.query<{ id: string }>(
        `insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status, start_date, deadline, fixed_fee, manual_progress)
         values ($1, 'awa', $2, $3, 'client_mission', 'active', '2026-05-01', '2026-07-31', $4, $5) returning id`,
        [audit, clientId, name, more.fee ?? null, more.progress ?? null],
      )).rows[0].id,
    );

  it("missions are erp.engagement: their client's customer, their members, their hours; read-only in the engine", async () => {
    // the customer added in Vanguard got its client (0008: one client, two sides)
    const snim = (await db.query<{ client_id: string }>("select client_id from erp.customer where id = $1", [customer])).rows[0].client_id;
    expect(snim).toBeTruthy();
    engagement = await mission("Audit légal 2025", snim, { progress: 45, fee: 900000 });
    await asSystem(async () => {
      await db.query("insert into erp.engagement_staff (engagement_id, user_id, role) values ($1, 'mariem', 'employee')", [engagement]);
      await db.query("insert into erp.time_entry (engagement_id, user_id, work_date, minutes) values ($1, 'mariem', '2026-05-04', 600), ($1, 'mariem', '2026-05-05', 150)", [engagement]);
      const bp = (await db.query<{ id: string }>("insert into work.client (name, country, tax_id, status) values ('Banque Populaire', 'Mauritanie', '123', 'active') returning id")).rows[0].id;
      return bp;
    }).then((bp) => mission("Conseil fiscal", bp));
    const { state } = await load("aicha");
    const audit2025 = state.engagements.find((e) => e.name === "Audit légal 2025")!;
    expect(audit2025).toMatchObject({ code: "M-001", customerId: customer, status: "active", stage: 3, actualHours: 12.5, staff: ["M.S."], fixedFee: 900000, projectId: engagement });
    // a new client gets its customer where the entity has its chart
    const bp = state.customers.find((c) => c.name === "Banque Populaire")!;
    expect(bp).toMatchObject({ nif: "123", defaultCurrency: "MRU" });
    expect(bp.country).toBeUndefined(); // not a country code
    expect(state.engagements.find((e) => e.name === "Conseil fiscal")).toMatchObject({ code: "M-002", customerId: bp.id });

    await expect(change("aicha", (s) => domain.createTask(s, { entityId: audit, title: "x", module: "missions", assignee: "M.S.", dueDate: "2026-06-15", engagementId: "nope" }))).rejects.toThrow(/Mission inconnue/);
    await expect(change("awa", (s) => domain.requestDeletion(s, { table: "engagement", rowId: engagement, label: "M-001", reason: "test de suppression", entityId: audit }))).rejects.toThrow(/salle Missions/);
  });

  it("a client edited updates its customer accounts (name, e-mail, tax id) and their ledger account", async () => {
    await asSystem(() => db.query("update work.client set name = 'SNIM SA', contact_email = 'finance@snim.mr', tax_id = 'NIF-9' where id = (select client_id from erp.customer where id = $1)", [customer]));
    const { state } = await load("aicha");
    const snim = state.customers.find((c) => c.id === customer)!;
    expect(snim).toMatchObject({ name: "SNIM SA", email: "finance@snim.mr", nif: "NIF-9" });
    expect(state.accounts.find((a) => a.id === snim.arAccountId)?.nameFr).toBe("SNIM SA");
    // the same values again change nothing (the screens' version does not move)
    const before = await version();
    await asSystem(() => db.query("update work.client set name = 'SNIM SA', contact_email = 'finance@snim.mr', tax_id = 'NIF-9' where id = (select client_id from erp.customer where id = $1)", [customer]));
    expect(await version()).toBe(before);
  });

  it("missions in the ERP's work: an assignment, a task, the file archived once completed", async () => {
    const assigned = await change("awa", (s) => domain.assign(s, { entityId: audit, engagementId: engagement, employeeId: employee, start: "2026-06-01", end: "2026-06-30", load: 0.5 }));
    expect(assigned.state.engagements.find((e) => e.id === engagement)!.staff).toEqual(["M.S."]);

    // the tasks are the tickets: the engine's own task changes are not saved
    await expect(change("aicha", (s) => domain.createTask(s, { entityId: audit, title: "Confirmations", module: "missions", assignee: "M.S.", dueDate: "2026-06-15", engagementId: engagement }))).rejects.toThrow(/tickets des missions/);

    // completed in the Missions room, then boxed in the archive rack here
    await asSystem(() => db.query("update erp.engagement set status = 'completed' where id = $1", [engagement]));
    const archived = await change("aicha", (s) => domain.archiveEngagement(s, { engagementId: engagement, kind: "box", boxCount: 2 }));
    expect(archived.state.archives[0]).toMatchObject({ engagementId: engagement, status: "archived", boxCount: 2 });
    expect(archived.state.archives[0].reference).toMatch(/^ARC-\d{4}-0001$/);
    expect(archived.state.engagements.find((e) => e.id === engagement)!.archiveId).toBe(archived.state.archives[0].id);
  });

  it("tasks are the tickets of the missions the person sees, by BUMEX One's rules", async () => {
    const elsewhere = await asSystem(async () =>
      (await db.query<{ id: string }>("insert into erp.engagement (entity_id, owner_id, name, project_kind, deadline) values ($1, 'adm', 'Ailleurs', 'internal_tool', '2026-12-31') returning id", [it_])).rows[0].id,
    );
    await asSystem(async () => {
      const ticket = (id: string, missionId: string, more: string, values: unknown[] = []) =>
        db.query(
          `insert into erp.task (id, engagement_id, title, assignee_id, reporter_id, status, priority, due_date, completed_at, created_at, updated_at)
           values ($1, $2, $3, 'aicha', 'awa', ${more}, '2026-06-01T08:00:00Z', '2026-06-02T08:00:00Z')`,
          [id, missionId, `Ticket ${id}`, ...values],
        );
      await ticket("00000000-0000-4000-8000-0000000000a1", engagement, "'review', 'urgent', '2026-06-10', null");
      await ticket("00000000-0000-4000-8000-0000000000a2", engagement, "'done', 'medium', null, '2026-06-02'");
      await ticket("00000000-0000-4000-8000-0000000000a3", elsewhere, "'todo', 'medium', null, null");
      // a ticket that is neither theirs nor of a mission they manage stays out of their sight
      await db.query("insert into erp.task (engagement_id, title, assignee_id, reporter_id) values ($1, 'Pas pour Aïcha', 'awa', 'awa')", [engagement]);
    });
    const { state } = await load("aicha");
    expect(state.tasks.map((t) => [t.id.slice(-2), t.status, t.priority, t.dueDate, t.assignee, t.engagementId === engagement])).toEqual([
      ["a1", "in_progress", "high", "2026-06-10", "Aïcha Comptable", true],
      ["a2", "done", "normal", "9999-12-31", "Aïcha Comptable", true],
    ]);
    expect(domain.taskStats(state, audit)).toMatchObject({ active: 1, done: 1 });
  });

  it("access is the permissions page's: the engine's account commands are refused", async () => {
    for (const name of ["createUser", "updateUserAccess", "setUserStatus"]) {
      expect(name in vanguardCommands).toBe(false);
      await expect(send("adm", { calls: [{ name, input: 0, args: [], ids: [] }], result: 1 })).rejects.toThrow(/Opération inconnue/);
    }
  });

  it("a person's modules can differ per entity: their rooms, what the server replays, what the browser gets", async () => {
    const { state } = await load("moussa");
    expect(domain.canOpenRoom(state, audit, "accounting")).toBe(true);
    expect(domain.canOpenRoom(state, it_, "accounting")).toBe(false);
    expect(domain.canOpenRoom(state, it_, "archives")).toBe(true);
    expect(domain.canUseModule(state, "accounting")).toBe(true); // on one of his entities
    // the server refuses the module on the entity where it is not his, and lets it through on the other
    const years = Array.from({ length: 13 }, () => crypto.randomUUID());
    await expect(send("moussa", { calls: [{ name: "createFiscalYear", input: 0, args: [it_, 2027], ids: years }], result: 1 })).rejects.toThrow(/sur cette entité/);
    const opened = await change("moussa", (s) => domain.createFiscalYear(s, audit, 2027));
    expect(opened.state.fiscalYears.some((f) => f.entityId === audit && f.label === "2027")).toBe(true);
    // the browser: an entity's rows by its own modules (a bank line by its account's entity), pay by HR
    const full = await as("moussa", () => loadVanguardState(tx, who("moussa"), accessOf("moussa"), people, { full: true }));
    const made = {
      ...full.state,
      entries: [{ id: "e-aud", entityId: audit }, { id: "e-it", entityId: it_ }],
      bankAccounts: [{ id: "b-aud", entityId: audit }, { id: "b-it", entityId: it_ }],
      bankTransactions: [{ id: "t-aud", bankAccountId: "b-aud" }, { id: "t-it", bankAccountId: "b-it" }],
      employees: [{ id: "p-it", entityId: it_, grossSalary: 9, allowances: 1 }],
    } as unknown as State;
    const codes = new Map([[audit, "bumex_audit"], [it_, "bumex_it"]]);
    const seen = visibleState(made, accessOf("moussa"), (id) => codes.get(id));
    expect(seen.entries.map((e) => e.id)).toEqual(["e-aud"]);
    expect(seen.bankAccounts.map((b) => b.id)).toEqual(["b-aud"]);
    expect(seen.bankTransactions.map((t) => t.id)).toEqual(["t-aud"]);
    expect(seen.employees[0].grossSalary).toBe(0);
    const withHr = visibleState(made, { ...accessOf("moussa"), entityModules: { bumex_it: ["hr"] } }, (id) => codes.get(id));
    expect(withHr.employees[0].grossSalary).toBe(9);
    expect(withHr.entries.map((e) => e.id)).toEqual(["e-aud", "e-it"]); // payroll posts to the ledger: HR reads it
    expect(withHr.bankAccounts.map((b) => b.id)).toEqual(["b-aud"]);
  });

  it("the permissions page's choices are stored as the usual modules and the entities that differ", () => {
    const all = ["bumex_holding", "bumex_audit", "bumex_it"] as BumexEntityCode[];
    const std = resolveErpModules("accountant", null);
    const base = { role: "accountant" as ErpRole, allEntities: false, consolidation: false, managesAccess: false, view3d: false };
    expect(storedAccess({ ...base, parts: { bumex_audit: std, bumex_it: [...std].reverse() }, managesAccess: true }, all))
      .toEqual({ role: "accountant", entityCodes: ["bumex_audit", "bumex_it"], modules: null, entityModules: null, managesAccess: false, view3d: false, testFloor: false });
    // the building in 3D is anyone's option, apart from their parts
    expect(storedAccess({ ...base, parts: { bumex_audit: std }, view3d: true }, all)).toMatchObject({ modules: null, entityModules: null, view3d: true });
    expect(storedAccess({ ...base, parts: { bumex_audit: std, bumex_it: ["archives"] } }, all))
      .toMatchObject({ modules: null, entityModules: { bumex_it: ["archives"] } });
    // what most entities have becomes the usual modules
    expect(storedAccess({ ...base, allEntities: true, parts: { bumex_holding: ["reports"], bumex_audit: ["reports"], bumex_it: std } }, all))
      .toMatchObject({ entityCodes: null, modules: ["reports"], entityModules: { bumex_it: std } });
    // an administrator without the group's consolidation, who manages access
    const every = resolveErpModules("admin", null).filter((m) => m !== "consolidation");
    expect(storedAccess({ role: "admin", allEntities: true, parts: {}, consolidation: false, managesAccess: true, view3d: false }, all))
      .toEqual({ role: "admin", entityCodes: null, modules: every, entityModules: null, managesAccess: true, view3d: false, testFloor: false });
    expect(storedAccess({ role: "admin", allEntities: true, parts: {}, consolidation: true, managesAccess: false, view3d: false }, all)).toMatchObject({ modules: null });
    expect(storedAccess({ ...base, parts: {} }, all)).toBe("no_entity");
    expect(storedAccess({ ...base, parts: { bumex_audit: ["missions" as ErpModuleKey] } }, all)).toBe("invalid");
    expect(storedAccess({ ...base, parts: { bumex_audit: ["consolidation"] } }, all)).toBe("invalid");
    expect(storedAccess({ ...base, parts: { bumex_sa: std } }, all)).toBe("invalid");
    expect(storedAccess({ ...base, role: "boss" as ErpRole, parts: { bumex_audit: std } }, all)).toBe("invalid");
    // the test floor (0011): its own flag, never among the entities, its parts an exception when not the usual ones
    expect(storedAccess({ ...base, allEntities: true, parts: { bumex_testing: std } }, all, "bumex_testing"))
      .toMatchObject({ entityCodes: null, modules: null, entityModules: null, testFloor: true });
    expect(storedAccess({ ...base, parts: { bumex_audit: std, bumex_testing: ["accounting"] } }, all, "bumex_testing"))
      .toMatchObject({ entityCodes: ["bumex_audit"], modules: null, entityModules: { bumex_testing: ["accounting"] }, testFloor: true });
    expect(storedAccess({ ...base, parts: { bumex_testing: std } }, all, "bumex_testing")).toMatchObject({ entityCodes: [], testFloor: true });
    expect(storedAccess({ ...base, parts: { bumex_testing: std } }, all)).toBe("invalid");
  });

  it("the test floor (0011): only whoever has it gets it; its sample books go through the writers; the group's figures leave it out", async () => {
    expect((await load("adm")).state.entities.some((e) => e.isTest)).toBe(false);
    const tester = { ...accessOf("adm"), testFloor: true };
    await asSystem(() => tx.query("update erp.user_access set test_floor = true where user_id = 'adm'"));
    try {
      const { state: before } = await as("adm", () => loadVanguardState(tx, who("adm"), tester, people, { checkChains: false, full: true }));
      const floor = before.entities.find((e) => e.isTest)!;
      expect(floor.code).toBe("TEST");
      const after = withIdSource(() => crypto.randomUUID(), () => testFloorBooks(before, floor.id));
      await asSystem(() => saveVanguardChange(tx, before, after));
      const { state } = await as("adm", () => loadVanguardState(tx, who("adm"), tester, people));
      expect(state.accounts.some((a) => a.entityId === floor.id)).toBe(true);
      expect(state.salesInvoices.filter((i) => i.entityId === floor.id).map((i) => i.status).sort()).toEqual(["draft", "posted", "posted"]);
      // its clients are the floor's own
      expect((await db.query<{ n: number }>("select count(*)::int as n from work.client where is_test")).rows[0].n).toBe(3);
      // the group's figures: the same with or without the test floor's revenue
      const without = { ...state, entities: state.entities.filter((e) => !e.isTest) };
      expect(groupFigures(state).sumRevenue).toBe(groupFigures(without).sumRevenue);
      expect(groupFigures(state).floors.some((f) => f.entity.isTest)).toBe(false);
    } finally {
      await asSystem(() => tx.query("update erp.user_access set test_floor = false where user_id = 'adm'"));
    }
  });

  it("a partner deletes a customer without documents; its auxiliary account stays in the ledger history", async () => {
    const made = await change("aicha", (s) => domain.addCustomer(s, { entityId: audit, name: "Prospect", regime: "standard", country: "MR", defaultCurrency: "MRU", paymentTermsDays: 30 }));
    const prospect = made.state.customers.find((c) => c.name === "Prospect")!;
    const gone = await change("awa", (s) => domain.requestDeletion(s, { table: "customer", rowId: prospect.id, label: prospect.name, reason: "doublon", entityId: audit }));
    expect(gone.state.customers.some((c) => c.id === prospect.id)).toBe(false);
  });
});
