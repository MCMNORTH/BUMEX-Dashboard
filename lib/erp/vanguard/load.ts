import "server-only";

import type { AccountMapping, AppUser, AuditRow, BankRule, DeletionRequest, Entity, FxRate, JournalEntry, ModuleKey, OrgGroup, Session, State, TaxRule } from "@/lib/erp/engine";
import { resolveErpModules } from "@/lib/erp/config";
import type { ErpTransaction } from "@/lib/erp/db";
import { moduleTables, readTable } from "@/lib/erp/vanguard/tables";
import { listTickets, ticketTasks } from "@/lib/erp/vanguard/tickets";
import { visibleState } from "@/lib/erp/vanguard/visible";
import { floors } from "@/lib/erp/vanguard/floors";
import type { ErpAccess, ErpModuleKey } from "@/types/erp";
import { bumexTestEntityCode } from "@/types/entity";

// BUMEX Vanguard's state, read from PostgreSQL for one person (in their ERP session: row-level security applies).

export type VanguardPerson = {
  id: string;
  name: string;
  email: string;
  entityCode: string | null;
  active: boolean; // not marked inactive
  present: boolean; // available, busy or overloaded
};

// The people: names for the ERP's user ids, and who works on each floor.
export async function listPeople(tx: ErpTransaction): Promise<VanguardPerson[]> {
  return rows<VanguardPerson>(
    tx,
    `select id, coalesce(nullif(trim(full_name), ''), email) as name, email, entity_code as "entityCode",
            availability_status <> 'inactive' as active, availability_status in ('available', 'busy', 'overloaded') as present
       from work.person order by full_name`,
  );
}

// The ERP modules → the rooms. Missions and tasks are open to everyone with access.
export const roomOf: Record<ErpModuleKey, ModuleKey> = {
  accounting: "accounting",
  clients: "clients",
  suppliers: "suppliers",
  bank: "bank",
  assets: "assets",
  hr: "hr",
  tax: "tax",
  archives: "archives",
  reports: "reports",
  consolidation: "penthouse",
};

// The bank rules come with the chart (engine seedChart) and are the same for every entity: not stored.
const bankRules = (entityId: string): BankRule[] => [
  { entityId, pattern: "FRAIS|COMMISSION|TENUE DE COMPTE", mappingKey: "BANK_FEES", label: "Règle : services bancaires" },
  { entityId, pattern: "AGIOS|INTERETS DEB", mappingKey: "BANK_INTEREST_EXPENSE", label: "Règle : intérêts bancaires" },
  { entityId, pattern: "INTERETS CRED|REMUNERATION DEPOT", mappingKey: "BANK_INTEREST_INCOME", label: "Règle : produits financiers" },
  { entityId, pattern: "VIR INTERNE|VIREMENT INTERNE", mappingKey: "TRANSFER", label: "Virement interne" },
];

// Every change of the database leaves a row in the audit log, or moves the work's counter (people, mission members:
// 0008): together they tell a screen whether to read again.
export async function vanguardVersion(tx: ErpTransaction): Promise<number> {
  const [{ version }] = await tx.query<{ version: number }>("select (coalesce(max(id), 0) + work.version())::float8 as version from erp.audit_log");
  return version;
}

async function rows<T>(tx: ErpTransaction, sql: string, params: unknown[] = []): Promise<T[]> {
  const [{ rows: list }] = await tx.query<{ rows: T[] }>(`select coalesce(jsonb_agg(r), '[]'::jsonb) as rows from (${sql}) r`, params);
  return list;
}

// jsonb_strip_nulls: an empty column is an absent field, as in the engine's records
async function records<T>(tx: ErpTransaction, sql: string, params: unknown[] = []): Promise<T[]> {
  const [{ rows: list }] = await tx.query<{ rows: T[] }>(`select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(r))), '[]'::jsonb) as rows from (${sql}) r`, params);
  return list;
}

export async function loadVanguardState(
  tx: ErpTransaction,
  person: { id: string; name: string },
  access: ErpAccess,
  people: VanguardPerson[],
  // full: every row the person's entities hold, for the server's replay (save.ts); otherwise what the browser may
  // receive of it (visible.ts)
  { checkChains = true, full = false } = {},
): Promise<{ state: State; chainBreaks: string[]; version: number }> {
  const names = new Map(people.map((p) => [p.id, p.name]));

  const [group] = await rows<OrgGroup>(tx, `select id, name, presentation_currency as "presentationCurrency" from erp.org_group order by created_at limit 1`);

  type EntityRow = Omit<Entity, "code" | "activity" | "staffPresent" | "staffTotal" | "thirdPartyRules"> & {
    code: string;
    rules?: Entity["thirdPartyRules"];
  };
  // every floor of the building, visible or not (the entity list is not restricted; their data is), but the test
  // floor: only whoever has it knows it is there (0011)
  const entityRows = await records<EntityRow>(
    tx,
    `select e.id, e.code, e.name, e.country, e.functional_currency as "functionalCurrency", e.coa_template as "coaTemplate",
            e.fx_method as "fxMethod", e.cash_threshold::float8 as "cashThreshold", e.floor_order as "floorOrder", e.is_holding as "isHolding",
            e.is_test as "isTest",
            e.nif, e.address_lines as address, e.account_code_length as "accountCodeLength",
            case when r.entity_id is not null then jsonb_strip_nulls(jsonb_build_object(
              'customerPrefix', r.customer_prefix, 'supplierPrefix', r.supplier_prefix, 'digits', r.digits,
              'customerCollectiveId', r.customer_collective_id, 'supplierCollectiveId', r.supplier_collective_id)) end as rules
       from erp.entity e left join erp.third_party_rules r on r.entity_id = e.id
      where e.active and (not e.is_test or $1) order by e.floor_order`,
    [access.testFloor],
  );
  const entities: Entity[] = entityRows.map(({ rules, ...e }) => {
    const staff = people.filter((p) => p.entityCode === e.code && p.active);
    return {
      ...e,
      code: floors[e.code]?.code ?? e.code.toUpperCase(),
      activity: floors[e.code]?.activity ?? "",
      staffTotal: staff.length,
      staffPresent: staff.filter((p) => p.present).length,
      ...(rules ? { thirdPartyRules: rules } : {}),
    };
  });
  const entityIdByCode = new Map(entityRows.map((e) => [e.code, e.id]));
  const entityCodeById = new Map(entityRows.map((e) => [e.id, e.code]));
  const rooms = (modules: ErpModuleKey[]) => [...modules.map((m) => roomOf[m]), "missions", "tasks"];

  const session: Session = {
    userId: person.id,
    actorId: person.id,
    actorName: person.name,
    role: access.role,
    // every entity read ("*" when every real one: the test floor is there only for whoever has it)
    entityIds: access.entityCodes
      ? [...access.entityCodes, ...(access.testFloor ? [bumexTestEntityCode] : [])].map((code) => entityIdByCode.get(code)).filter((id): id is string => Boolean(id))
      : "*",
    modules: rooms(access.modules),
    entityModules: Object.fromEntries(
      Object.entries(access.entityModules).flatMap(([code, modules]) => (entityIdByCode.has(code) && modules ? [[entityIdByCode.get(code)!, rooms(modules)]] : [])),
    ),
    managesAccess: access.managesAccess,
    view3d: access.view3d,
    testMode: (await rows<{ test: boolean }>(tx, "select work.in_test() as test"))[0]?.test === true,
    // the floor the app opens on and the logo comes back to: the one they chose, else their home (0015)
    defaultEntityId: (await rows<{ id: string | null }>(tx, "select (select e.id::text from erp.entity e where e.code = coalesce(p.default_entity_code, p.entity_code)) as id from work.person p where p.id = $1", [person.id]))[0]?.id ?? null,
  };

  const fxRates = await rows<FxRate>(tx, `select rate_date::text as date, from_currency as "from", to_currency as "to", rate::float8 as rate, source from erp.fx_rate order by rate_date`);

  const fiscalYears = await records<State["fiscalYears"][number]>(
    tx,
    `select id, entity_id as "entityId", label, start_date::text as start, end_date::text as "end", is_closed as "isClosed", closed_by as "closedBy"
       from erp.fiscal_year order by entity_id, start_date`,
  );
  const periods = await records<State["periods"][number]>(
    tx,
    `select id, entity_id as "entityId", fiscal_year_id as "fiscalYearId", period_no as "periodNo", start_date::text as start, end_date::text as "end",
            status, locked_by as "lockedBy"
       from erp.period order by entity_id, start_date`,
  );
  const accounts = await records<State["accounts"][number]>(
    tx,
    `select id, entity_id as "entityId", code, name_fr as "nameFr", name_en as "nameEn", kind, is_postable as "isPostable", is_statutory as "isStatutory",
            nullif(requires_customer, false) as "requiresCustomer", nullif(requires_supplier, false) as "requiresSupplier",
            nullif(requires_engagement, false) as "requiresEngagement", active, nullif(is_auxiliary, false) as "isAuxiliary", collective_id as "collectiveId"
       from erp.account order by entity_id, code`,
  );
  const journals = await records<State["journals"][number]>(
    tx,
    `select id, entity_id as "entityId", code, name, kind from erp.journal where active order by entity_id, code`,
  );
  const mappings = await rows<AccountMapping>(
    tx,
    `select entity_id as "entityId", key, qualifier, account_id as "accountId" from erp.account_mapping order by entity_id, key, qualifier`,
  );
  const taxCodes = await records<State["taxCodes"][number]>(
    tx,
    `select id, entity_id as "entityId", code, name_fr as "nameFr", kind, rate::float8 as rate, collected_account_id as "collectedAccountId",
            deductible_account_id as "deductibleAccountId", revenue_status as "revenueStatus", legal_mention_fr as "legalMentionFr"
       from erp.tax_code where active order by entity_id, code`,
  );
  const taxRules = await rows<TaxRule>(
    tx,
    `select t.entity_id as "entityId", t.counterparty_regime as regime, c.code as "serviceCategory", t.tax_code_id as "taxCodeId", t.priority
       from erp.tax_rule t left join erp.service_category c on c.id = t.service_category_id
      where t.effective_to is null order by t.entity_id, t.priority`,
  );

  type EntryRow = Omit<JournalEntry, "createdBy" | "postedBy"> & { createdBy: string; postedBy?: string };
  const entries = await records<EntryRow>(
    tx,
    `select e.id, e.entity_id as "entityId", e.journal_id as "journalId", e.fiscal_year_id as "fiscalYearId", e.period_id as "periodId",
            e.entry_no as "entryNo", e.chain_seq as "chainSeq", e.entry_date::text as date, e.status, e.description, e.currency,
            e.fx_rate::float8 as "fxRate", e.source_type as "sourceType", coalesce(e.source_id::text, e.source_ref) as "sourceId", e.posting_rule as "postingRule",
            e.reversal_of_id as "reversalOfId", e.reversed_by_id as "reversedById",
            to_char(e.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "postedAt", e.posted_by as "postedBy",
            case when e.status <> 'draft' then encode(e.prev_hash, 'hex') end as "prevHash", encode(e.hash, 'hex') as hash,
            e.created_by as "createdBy",
            coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                       'lineNo', l.line_no, 'accountId', l.account_id, 'description', l.description, 'currency', l.currency,
                       'fxRate', l.fx_rate::float8, 'debitTxn', l.debit_txn::float8, 'creditTxn', l.credit_txn::float8,
                       'debit', l.debit::float8, 'credit', l.credit::float8, 'customerId', l.customer_id, 'supplierId', l.supplier_id,
                       'engagementId', l.engagement_id, 'taxCodeId', l.tax_code_id, 'bankAccountId', l.bank_account_id,
                       'assetId', l.asset_id, 'employeeId', l.employee_id)) order by l.line_no)
                        from erp.journal_line l where l.entry_id = e.id), '[]'::jsonb) as lines
       from erp.journal_entry e order by e.entity_id, e.entry_date, e.entry_no nulls last, e.created_at`,
  );

  const chains: State["chains"] = {};
  for (const c of await rows<{ entityId: string; journalId: string; lastHash: string; length: number }>(
    tx,
    `select entity_id as "entityId", journal_id as "journalId", encode(last_hash, 'hex') as "lastHash", length from erp.ledger_chain`,
  )) {
    chains[`${c.entityId}|${c.journalId}`] = { lastHash: c.lastHash, length: c.length };
  }

  // the engine's counters hold the last number given; the database's the next one
  const counters: State["counters"] = {};
  for (const c of await rows<{ key: string; last: number }>(
    tx,
    `select p.entity_id || '|' || p.scope || '|' || coalesce(p.scope_ref::text, '') || '|' || c.period_key as key, c.next_number - 1 as last
       from erp.numbering_counter c join erp.numbering_policy p on p.id = c.policy_id`,
  )) {
    counters[c.key] = c.last;
  }

  const deletionRequests = (
    await records<Omit<DeletionRequest, "requestedByName">>(
      tx,
      `select id, entity_id as "entityId", table_name as "table", row_id as "rowId", label, reason, requested_by as "requestedBy",
              requested_at as "requestedAt", status, decided_by as "decidedBy", decided_at as "decidedAt", decision_note as "decisionNote"
         from erp.deletion_request order by requested_at`,
    )
  ).map((r) => ({ ...r, requestedByName: names.get(r.requestedBy) ?? r.requestedBy }));

  // the history of the entities the person sees (the audit log has no row-level security of its own), latest first;
  // rows of no entity (access grants, rates) for the access administrator only
  const auditLog = (
    await records<Omit<AuditRow, "summary"> & { label?: string }>(
      tx,
      `select a.at, a.actor_id as "actorId", a.actor_role as role, a.table_name as "table", a.row_id as "rowId", a.entity_id as "entityId", a.action,
              coalesce(a.after_row, a.before_row) ->> coalesce((select k from unnest(array['label', 'description', 'name', 'name_fr', 'code']) k
                                                                 where coalesce(a.after_row, a.before_row) ? k limit 1), 'id') as label
         from erp.audit_log a
        where (a.entity_id is null and $1) or erp.can_see_entity(a.entity_id)
        order by a.id desc limit 500`,
      [access.role === "admin"],
    )
  )
    .reverse()
    .map(({ label, ...a }) => ({ ...a, actorId: names.get(a.actorId) ?? a.actorId, summary: label ?? "" }));

  // the person's own access (the permissions page reads everyone's: lib/erp/permissions.ts)
  const users = (
    await rows<{ id: string; role: AppUser["role"]; entityCodes: string[] | null; modules: ErpModuleKey[] | null; grantedAt: string; grantedBy: string }>(
      tx,
      `select user_id as id, erp_role as role, entity_codes as "entityCodes", modules, granted_at::date::text as "grantedAt", granted_by as "grantedBy"
         from erp.user_access where user_id = $1`,
      [person.id],
    )
  ).map(
    (u): AppUser => ({
      id: u.id,
      name: names.get(u.id) ?? u.id,
      email: people.find((p) => p.id === u.id)?.email ?? "",
      role: u.role,
      entityIds: u.entityCodes ? u.entityCodes.map((code) => entityIdByCode.get(code) ?? code) : "*",
      modules: rooms(resolveErpModules(u.role, u.modules)),
      status: "active",
      invitedAt: u.grantedAt,
      activatedAt: u.grantedAt,
      createdBy: names.get(u.grantedBy) ?? u.grantedBy,
    }),
  );

  // every hash recomputed: only for a state the person will see
  // the modules' collections (tables.ts); the tasks are the tickets of the missions (tickets.ts)
  const modules: Partial<State> = {};
  for (const spec of moduleTables) {
    Object.assign(modules, { [spec.collection]: await readTable(tx, spec) });
  }
  modules.tasks = ticketTasks(await listTickets(tx), (modules.engagements ?? []) as Parameters<typeof ticketTasks>[1], names);

  const chainBreaks = checkChains
    ? await rows<{ id: string }>(tx, `select c.entry_id as id from erp.ledger_chain l, lateral erp.verify_chain(l.entity_id, l.journal_id) c where not c.ok`)
    : [];

  const state: State = {
    group: group ?? { id: "group", name: "Groupe BUMEX", presentationCurrency: "MRU" },
    session,
    today: new Date().toISOString().slice(0, 10),
    entities,
    fxRates,
    fiscalYears,
    periods,
    accounts,
    journals,
    mappings,
    taxCodes,
    taxRules,
    entries: entries as JournalEntry[],
    chains,
    counters,
    customers: [],
    salesInvoices: [],
    creditNotes: [],
    customerPayments: [],
    allocations: [],
    suppliers: [],
    supplierInvoices: [],
    supplierPayments: [],
    loans: [],
    loanPayments: [],
    bankAccounts: [],
    bankTransactions: [],
    bankRules: entities.filter((e) => accounts.some((a) => a.entityId === e.id)).flatMap((e) => bankRules(e.id)),
    engagements: [],
    assignments: [],
    assetCategories: [],
    assets: [],
    depreciationRuns: [],
    employees: [],
    payrollRules: [],
    payrollRuns: [],
    tasks: [],
    archives: [],
    ...modules,
    users,
    deletionRequests,
    auditLog,
    seq: 0,
  };

  return { state: full ? state : visibleState(state, access, (entityId) => entityCodeById.get(entityId)), chainBreaks: chainBreaks.map((c) => c.id), version: await vanguardVersion(tx) };
}
