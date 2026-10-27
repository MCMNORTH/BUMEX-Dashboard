import "server-only";

import { randomUUID } from "node:crypto";

import {
  accountByCode,
  addBankAccount,
  addCustomer,
  addSupplier,
  createFiscalYear,
  createInvoice,
  createSupplierInvoice,
  recordPayment,
  seedChart,
  validateInvoice,
  withIdSource,
  type Id,
  type State,
} from "@/lib/erp/engine";
import { resolveErpModules } from "@/lib/erp/config";
import { withErpSystemSession } from "@/lib/erp/db";
import { listPeople, loadVanguardState } from "@/lib/erp/vanguard/load";
import { saveVanguardChange } from "@/lib/erp/vanguard/save";
import type { ErpAccess } from "@/types/erp";

// The test floor's sample data (BUMEX Testing, migration 0011), put there once by a role modifier from the
// permissions page: its books through the engine and Vanguard's writers, as a person's changes are (a chart of
// accounts, the year, a bank account, three customers and their invoices, a supplier and its bill), then the work (two
// missions and their tickets, the role modifier owning them). Fictional names; nothing outside the floor is touched.

const CUSTOMERS = ["Société Test Alpha", "Client Démo Beta", "Organisation Exemple Gamma"];

export function testFloorBooks(state: State, entityId: Id): State {
  const year = Number(state.today.slice(0, 4));
  const date = state.today;
  let s = seedChart(state, entityId, "PCM");
  s = createFiscalYear(s, entityId, year);
  const [withBank, bank] = addBankAccount(s, {
    entityId, name: "Compte courant (test)", bankName: "Banque de test", currency: "MRU",
    glAccountId: accountByCode(s, entityId, "5501").id, showOnInvoices: true,
  });
  s = withBank;
  const customers: Id[] = [];
  for (const name of CUSTOMERS) {
    let customer;
    [s, customer] = addCustomer(s, { entityId, name, regime: "standard", country: "MR", defaultCurrency: "MRU", paymentTermsDays: 30 });
    customers.push(customer.id);
  }
  const invoice = (customerId: Id, description: string, amount: number) => {
    let draft;
    [s, draft] = createInvoice(s, { entityId, customerId, date, currency: "MRU", bankAccountId: bank.id, lines: [{ description, quantity: 1, unitPrice: amount, serviceCategory: "AUDIT" }] });
    return draft;
  };
  let first = invoice(customers[0], "Audit des comptes (test)", 450000);
  [s, first] = validateInvoice(s, first.id);
  [s] = recordPayment(s, { entityId, customerId: customers[0], date, currency: "MRU", amountTxn: 200000, bankAccountId: bank.id, invoiceId: first.id, reference: first.number });
  let second = invoice(customers[1], "Mission de conseil (test)", 300000);
  [s, second] = validateInvoice(s, second.id);
  invoice(customers[2], "Devis à valider (brouillon de test)", 120000);
  const [withSupplier, supplier] = addSupplier(s, { entityId, name: "Fournisseur Test", regime: "standard", expenseAccountId: accountByCode(s, entityId, "6200").id });
  s = withSupplier;
  [s] = createSupplierInvoice(s, {
    entityId, supplierId: supplier.id, supplierRef: "FT-0001", date, currency: "MRU", totalHt: 80000, taxCodeId: null,
    expenseAccountId: accountByCode(s, entityId, "6200").id, description: "Loyer du sous-sol (test)",
  });
  return s;
}

export async function prepareTestFloor(actorId: string, actorName: string): Promise<{ error?: "ready" | "unavailable" }> {
  try {
    return await withErpSystemSession(actorId, async (tx) => {
      const [floor] = await tx.query<{ id: string; ready: boolean }>(
        `select e.id, exists (select 1 from erp.account a where a.entity_id = e.id) as ready from erp.entity e where e.is_test`,
      );
      if (!floor) return { error: "unavailable" as const };
      if (floor.ready) return { error: "ready" as const };

      // the books, as the system replays a person's change: everything read, the engine's calls, the writers
      const access: ErpAccess = {
        role: "admin", entityCodes: null, modules: resolveErpModules("admin", null), entityModules: {}, managesAccess: false, view3d: false, testFloor: true,
      };
      const { state: before } = await loadVanguardState(tx, { id: actorId, name: actorName }, access, await listPeople(tx), { checkChains: false, full: true });
      const after = withIdSource(() => randomUUID(), () => testFloorBooks(before, floor.id));
      await saveVanguardChange(tx, before, after);

      // the work: the customers' clients (the floor's own, 0011), two missions and their tickets
      await tx.query("update work.client set account_manager_id = $1 where is_test and account_manager_id is null", [actorId]);
      const [client] = await tx.query<{ id: string }>("select id from work.client where is_test and name = $1", [CUSTOMERS[0]]);
      const mission = async (name: string, clientId: string | null, kind: string, description: string) =>
        (await tx.query<{ id: string }>(
          `insert into erp.engagement (entity_id, owner_id, client_id, name, project_kind, status, start_date, deadline, description, priority)
           values ($1, $2, $3, $4, $5, 'active', current_date, current_date + 60, $6, 'medium') returning id`,
          [floor.id, actorId, clientId, name, kind, description],
        ))[0].id;
      const audit = await mission("Mission de démonstration", client?.id ?? null, "client_mission", "Une mission pour essayer les tickets, le temps, les documents et la facturation.");
      const tool = await mission("Projet interne de test", null, "internal_tool", "Un projet interne pour essayer le tableau et les étapes.");
      const tickets: [string, string, string, string][] = [
        [audit, "Préparer le planning", "todo", "high"],
        [audit, "Collecter les pièces", "in_progress", "medium"],
        [audit, "Revue du dossier", "review", "medium"],
        [tool, "Essayer le tableau kanban", "todo", "low"],
      ];
      for (const [engagementId, title, status, priority] of tickets) {
        await tx.query(
          `insert into erp.task (engagement_id, title, assignee_id, reporter_id, status, stage_id, priority, due_date)
           values ($1, $2, $3, $3, $4, $4, $5, current_date + 14)`,
          [engagementId, title, actorId, status, priority],
        );
      }
      await tx.query(
        `insert into work.comment (subject_type, subject_id, author_id, body, is_internal)
         values ('project', $1, $2, 'Bienvenue au sous-sol : tout ce qui se fait ici reste ici. Essayez librement.', false)`,
        [audit, actorId],
      );
      return {};
    });
  } catch (error) {
    console.error("[test-floor]", error instanceof Error ? error.message : error);
    return { error: "unavailable" };
  }
}
