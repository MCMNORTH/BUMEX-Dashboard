import type { State, Id, Entity, Currency, BankTransaction, Engagement, Task, ArchiveKind, ArchiveStatus, Role, EmployeeCategory, AppUser } from './types';
import { r2, addDays, addMonths, yearOf, monthOf } from './money';
import { nextId, mapped, accountByCode } from './core';
import { seedChart } from './chart';
import { createFiscalYear, createDraft, postEntry, setPeriodStatus, type DraftLineInput } from './ledger';
import { addCustomer, createInvoice, validateInvoice, recordPayment, sendDunning } from './sales';
import { sha256 } from './sha256';
import { bankSummary } from './bank';
import { archiveEngagement } from './archive';
import { createTask } from './tasks';
import { seedAssetCategories, addAsset, depreciationSchedule } from './assets';
import { addEmployee, postPayroll, payrollRulesFor, defaultPayrollRules } from './hr';
import { assign } from './planning';
import { addLoan, payInstalment } from './loans';
import { addSupplier, createSupplierInvoice, approveSupplierInvoice, paySupplierInvoice } from './purchases';
import { sessionFor, ROLE_DEFAULT_MODULES } from './security';

export const SEED_VERSION = 6;

function emptyState(today: string): State {
  return {
    group: { id: 'grp_bumex', name: 'Groupe BUMEX', presentationCurrency: 'MRU' },
    session: { userId: 'seed', actorId: 'seed', actorName: 'Initialisation', role: 'admin', entityIds: '*', modules: '*' },
    today,
    entities: [], fxRates: [], fiscalYears: [], periods: [], accounts: [], journals: [], mappings: [], taxCodes: [], taxRules: [],
    entries: [], chains: {}, counters: {}, customers: [], salesInvoices: [], creditNotes: [], customerPayments: [], allocations: [],
    suppliers: [], supplierInvoices: [], supplierPayments: [], loans: [], loanPayments: [], bankAccounts: [], bankTransactions: [], bankRules: [],
    engagements: [], assignments: [], assetCategories: [], assets: [], depreciationRuns: [], employees: [], payrollRules: [], payrollRuns: [],
    users: [], deletionRequests: [], tasks: [], archives: [], auditLog: [], seq: 0,
  };
}

const ENTITIES: Omit<Entity, 'id'>[] = [
  { code: 'HOLD', name: 'BUMEX-HOLDING', activity: 'Holding · consolidation', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 500000, floorOrder: 0, isHolding: true, staffPresent: 2, staffTotal: 3 },
  { code: 'SA', name: 'BUMEX SA', activity: 'Tax & Legal', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 3000000, floorOrder: 1, isHolding: false, staffPresent: 7, staffTotal: 9, nif: '[NIF BUMEX SA]', address: 'Nouakchott, Mauritanie' },
  { code: 'AUD', name: 'BUMEX Audit', activity: 'Audit', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 3000000, floorOrder: 2, isHolding: false, staffPresent: 9, staffTotal: 12, nif: '[NIF BUMEX Audit]', address: 'Nouakchott, Mauritanie' },
  { code: 'ADV', name: 'BUMEX Advisory', activity: 'Conseil', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 1500000, floorOrder: 3, isHolding: false, staffPresent: 4, staffTotal: 5 },
  { code: 'MAU', name: 'BUMEX Mauritanie', activity: 'Expertise comptable', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 1200000, floorOrder: 4, isHolding: false, staffPresent: 6, staffTotal: 8 },
  { code: 'AVO', name: 'BUMEX Avocats', activity: 'Cabinet d\'avocats', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 1000000, floorOrder: 5, isHolding: false, staffPresent: 5, staffTotal: 6 },
  { code: 'IT', name: 'BUMEX IT', activity: 'Solutions IT', country: 'MR', functionalCurrency: 'MRU', coaTemplate: 'PCM', fxMethod: 'conversion_accounts', cashThreshold: 800000, floorOrder: 6, isHolding: false, staffPresent: 3, staffTotal: 4 },
  { code: 'MAR', name: 'BUMEX Maroc', activity: 'Casablanca Finance City', country: 'MA', functionalCurrency: 'MAD', coaTemplate: 'CGNC', fxMethod: 'conversion_accounts', cashThreshold: 400000, floorOrder: 7, isHolding: false, staffPresent: 3, staffTotal: 3 },
];

interface Ctx { s: State; today: string; year: number }

function post(ctx: Ctx, entityId: Id, journalKind: string, date: string, description: string, lines: DraftLineInput[], currency: Currency = 'MRU', fxRate = 1, sourceType = 'manual'): Id {
  const journal = ctx.s.journals.find((j) => j.entityId === entityId && j.kind === journalKind)!;
  const [s1, draft] = createDraft(ctx.s, { entityId, journalId: journal.id, date, description, currency, fxRate, lines, sourceType });
  const [s2, posted] = postEntry(s1, draft.id);
  ctx.s = s2;
  return posted.id;
}

function matchedTxn(ctx: Ctx, bankAccountId: Id, date: string, amount: number, description: string, entryId: Id): void {
  const [s1, id] = nextId(ctx.s, 'btx');
  const t: BankTransaction = { id, bankAccountId, date, amount: r2(amount), description, status: 'matched', journalEntryId: entryId, importHash: sha256(`${bankAccountId}|${date}|${amount}|${description}|`).slice(0, 16) };
  ctx.s = { ...s1, bankTransactions: [...s1.bankTransactions, t] };
}

function unmatchedTxn(ctx: Ctx, bankAccountId: Id, date: string, description: string, amount: number, reference?: string): void {
  const [s1, id] = nextId(ctx.s, 'btx');
  const t: BankTransaction = { id, bankAccountId, date, amount: r2(amount), description, reference, status: 'unmatched', importHash: sha256(`${bankAccountId}|${date}|${amount}|${description}|${reference ?? ''}`).slice(0, 16) };
  ctx.s = { ...s1, bankTransactions: [...s1.bankTransactions, t] };
}

function bankAccount(ctx: Ctx, entityId: Id, name: string, bankName: string, currency: Currency, glCode: string, isCash = false, showOnInvoices = false, iban?: string): Id {
  const [s1, id] = nextId(ctx.s, 'bank');
  const gl = accountByCode(s1, entityId, glCode);
  const n = s1.bankAccounts.length + 1;
  const accountNumber = isCash ? undefined : `000${String(1000 + n * 37).padStart(5, '0')}${String(n * 9173).padStart(6, '0')}`;
  const journal = s1.journals.find((j) => j.entityId === entityId && j.kind === (isCash ? 'cash' : 'bank'));
  ctx.s = { ...s1, bankAccounts: [...s1.bankAccounts, { id, entityId, name, bankName, iban, accountNumber, rib: accountNumber ? `MR13 ${accountNumber.slice(0, 5)} ${accountNumber.slice(5)} 44` : undefined, bankAddress: isCash ? undefined : `${bankName} · Avenue Gamal Abdel Nasser, Nouakchott`, currency, glAccountId: gl.id, journalId: journal?.id, isCash, showOnInvoices, active: true, statementBalance: 0 }] };
  return id;
}

function invoice(ctx: Ctx, entityId: Id, customerId: Id, date: string, currency: Currency, lines: { description: string; amount: number; category?: string }[], opts: { dueDays?: number; bankAccountId?: Id; engagementId?: Id; revenueAccountId?: Id } = {}) {
  const [s1, inv] = createInvoice(ctx.s, { entityId, customerId, date, currency, dueDays: opts.dueDays, bankAccountId: opts.bankAccountId, engagementId: opts.engagementId, lines: lines.map((l) => ({ description: l.description, quantity: 1, unitPrice: l.amount, serviceCategory: l.category ?? 'AUDIT', revenueAccountId: opts.revenueAccountId })) });
  const [s2, posted] = validateInvoice(s1, inv.id);
  ctx.s = s2;
  return posted;
}

function pay(ctx: Ctx, entityId: Id, invoiceId: Id, date: string, bankAccountId: Id, amountTxn?: number): void {
  const inv = ctx.s.salesInvoices.find((i) => i.id === invoiceId)!;
  const amt = amountTxn ?? r2(inv.netPayable - inv.amountPaidTxn);
  const [s1, p] = recordPayment(ctx.s, { entityId, customerId: inv.customerId, date, currency: inv.currency, amountTxn: amt, bankAccountId, invoiceId, reference: inv.number });
  ctx.s = s1;
  const c = ctx.s.customers.find((x) => x.id === inv.customerId)!;
  matchedTxn(ctx, bankAccountId, date, amt, `VIR ${c.name.toUpperCase()} FACT ${inv.number}`, p.journalEntryId!);
  ctx.s = { ...ctx.s, customerPayments: ctx.s.customerPayments.map((x) => (x.id === p.id ? { ...x, bankTransactionId: ctx.s.bankTransactions[ctx.s.bankTransactions.length - 1].id } : x)) };
}

function opening(ctx: Ctx, entityId: Id, date: string, bank: Record<string, number>, capital: number, fixed: { qualifier: string; cost: number; accumulated: number }[] = []): void {
  const lines: DraftLineInput[] = [];
  let total = 0;
  for (const [code, amount] of Object.entries(bank)) {
    lines.push({ accountId: accountByCode(ctx.s, entityId, code).id, description: 'À nouveau', debitTxn: amount });
    total += amount;
  }
  for (const f of fixed) {
    lines.push({ accountId: mapped(ctx.s, entityId, 'ASSET', f.qualifier).id, description: `À nouveau immobilisations ${f.qualifier}`, debitTxn: r2(f.cost) });
    if (f.accumulated) lines.push({ accountId: mapped(ctx.s, entityId, 'ACC_DEPR', f.qualifier).id, description: `À nouveau amortissements ${f.qualifier}`, creditTxn: r2(f.accumulated) });
    total += f.cost - f.accumulated;
  }
  const tpl = ctx.s.entities.find((e) => e.id === entityId)!.coaTemplate;
  const capitalCode = tpl === 'PCM' ? '101' : tpl === 'CGNC' ? '1111' : '101';
  lines.push({ accountId: accountByCode(ctx.s, entityId, capitalCode).id, description: 'Capital', creditTxn: capital });
  lines.push({ accountId: mapped(ctx.s, entityId, 'RETAINED_EARNINGS').id, description: 'Report à nouveau', creditTxn: r2(total - capital) });
  post(ctx, entityId, 'misc', date, `À nouveau ${yearOf(date)}`, lines, undefined, 1, 'opening');
}

function monthlyCosts(ctx: Ctx, entityId: Id, bankId: Id, salaries: number, rent: number, fromDate: string, today: string): void {
  const e = ctx.s.entities.find((x) => x.id === entityId)!;
  const salaryCode = e.coaTemplate === 'PCM' ? '6500' : '6171';
  const rentCode = e.coaTemplate === 'PCM' ? '6200' : '6131';
  const bankGl = ctx.s.bankAccounts.find((b) => b.id === bankId)!.glAccountId;
  let d = addDays(fromDate.slice(0, 8) + '01', 27);
  while (d < today) {
    if (salaries) {
      const id = post(ctx, entityId, 'bank', d, `Salaires ${d.slice(0, 7)}`, [{ accountId: accountByCode(ctx.s, entityId, salaryCode).id, description: 'Salaires', debitTxn: salaries }, { accountId: bankGl, description: 'Salaires', creditTxn: salaries, bankAccountId: bankId }], e.functionalCurrency, 1, 'payroll');
      matchedTxn(ctx, bankId, d, -salaries, `VIR SALAIRES ${d.slice(0, 7)}`, id);
    }
    if (rent && [1, 4, 7, 10].includes(monthOf(d))) {
      const id2 = post(ctx, entityId, 'bank', d, `Loyer T${Math.ceil(monthOf(d) / 3)}`, [{ accountId: accountByCode(ctx.s, entityId, rentCode).id, description: 'Loyer', debitTxn: rent }, { accountId: bankGl, description: 'Loyer', creditTxn: rent, bankAccountId: bankId }], e.functionalCurrency, 1, 'rent');
      matchedTxn(ctx, bankId, d, -rent, 'PRLV LOYER BAILLEUR', id2);
    }
    d = addMonths(d, 1);
  }
}

export function buildDemo(today: string): State {
  const year = Number(today.slice(0, 4));
  const ctx: Ctx = { s: emptyState(today), today, year };

  // entities, charts, fiscal years
  const ids: Record<string, Id> = {};
  for (const e of ENTITIES) {
    const [s1, id] = nextId(ctx.s, 'ent');
    ctx.s = { ...s1, entities: [...s1.entities, { ...e, id }] };
    ids[e.code] = id;
    ctx.s = seedChart(ctx.s, id, e.coaTemplate);
    ctx.s = seedAssetCategories(ctx.s, id);
    for (const y of [year - 2, year - 1, year]) ctx.s = createFiscalYear(ctx.s, id, y);
  }
  // payroll regime per company: BUMEX SA works under the GTA regime (no salary tax, no CNSS / CNAM), the others under the normal one
  ctx.s = { ...ctx.s, payrollRules: [...ctx.s.payrollRules, { ...defaultPayrollRules(ids.SA, 'MR'), regime: 'gta' as const, socialExempt: true, healthExempt: true, taxExempt: true }] };

  // ---- accounts and access: the administrator manages who sees which entity and which modules ----------------
  const user = (name: string, email: string, role: Role, entityIds: Id[] | '*', modules?: string[] | '*', status: AppUser['status'] = 'active') => {
    const [s1, id] = nextId(ctx.s, 'usr');
    const u: AppUser = { id, name, email, role, entityIds, modules: modules ?? ROLE_DEFAULT_MODULES[role], status, inviteToken: status === 'invited' ? sha256(`${id}|${email}`).slice(0, 24) : undefined, invitedAt: addDays(today, -40), activatedAt: status === 'active' ? addDays(today, -39) : undefined, createdBy: 'seed' };
    ctx.s = { ...s1, users: [...s1.users, u] };
    return u;
  };
  const uAdmin = user('Administrateur · S.E.', 'admin@bumex.mr', 'admin', '*');
  const uPartner = user('Associé · E.M.', 'associe@bumex.mr', 'partner', '*');
  const uRaf = user('RAF · F.B.', 'raf@bumex.mr', 'raf', '*');
  user('Manager · M.K.', 'manager@bumex.mr', 'manager', [ids.AUD, ids.SA]);
  const uAcc = user('Comptable · E.W.', 'compta@bumex.mr', 'accountant', [ids.AUD]);
  user('Collaborateur · A.A.', 'aa@bumex.mr', 'staff', [ids.AUD], ['missions', 'tasks']);
  user('Stagiaire · N.D.', 'nd@bumex.mr', 'intern', [ids.AUD], ['missions', 'tasks'], 'invited');
  ctx.s = { ...ctx.s, session: sessionFor(uAdmin) };
  void uPartner; void uRaf;

  // rates: BCM quotes; the USD and EUR moved about 60 days ago, which is what makes the FX examples work
  const t60 = addDays(today, -60);
  ctx.s.fxRates = [
    { date: `${year - 2}-01-01`, from: 'USD', to: 'MRU', rate: 39.8, source: 'BCM' }, { date: t60, from: 'USD', to: 'MRU', rate: 40.15, source: 'BCM' },
    { date: `${year - 2}-01-01`, from: 'EUR', to: 'MRU', rate: 43.1, source: 'BCM' }, { date: t60, from: 'EUR', to: 'MRU', rate: 42.6, source: 'BCM' },
    { date: `${year - 2}-01-01`, from: 'MAD', to: 'MRU', rate: 3.94, source: 'BAM' },
    { date: `${year - 2}-01-01`, from: 'USD', to: 'MAD', rate: 10.1, source: 'BAM' }, { date: `${year - 2}-01-01`, from: 'EUR', to: 'MAD', rate: 10.9, source: 'BAM' },
  ];

  const fyStart = `${year}-01-01`;
  const AUD = ids.AUD;

  // ---- BUMEX Audit: the fully working floor ---------------------------------------
  const bMru = bankAccount(ctx, AUD, 'Compte principal MRU', 'BMCI', 'MRU', '5501', false, true, 'MR13 0001 0000 0123 4567 8901 23');
  const bUsd = bankAccount(ctx, AUD, 'Compte USD', 'BMCI', 'USD', '5502', false, true, 'MR13 0001 0000 0123 4567 8902 45');
  const bEur = bankAccount(ctx, AUD, 'Compte EUR', 'Société Générale Mauritanie', 'EUR', '5503');
  bankAccount(ctx, AUD, 'Caisse siège', '', 'MRU', '560', true);

  // fixed assets: sheets with their schedules; what was depreciated before this year sits in the opening balance
  const catOf = (code: string) => ctx.s.assetCategories.find((c) => c.entityId === AUD && c.code === code)!;
  const priorDepr = (cost: number, lifeMonths: number, method: 'linear' | 'declining', start: string) => {
    const probe = { cost, residual: 0, lifeMonths, method, startDate: start, accumulated: 0 } as Parameters<typeof depreciationSchedule>[0];
    return r2(depreciationSchedule(probe).filter((r) => r.year < year).reduce((a, r) => a + r.dotation, 0));
  };
  const assetDefs: { code: string; name: string; serial?: string; cat: string; acquired: string; cost: number; life?: number; method?: 'linear' | 'declining'; location: string; status?: 'in_service' | 'wip' }[] = [
    { code: `IMM-${year - 2}-031`, name: 'Véhicule de mission · 4x4', serial: 'VIN-MR-4X4-2024-031', cat: 'VEHICLE', acquired: `${year - 2}-05-10`, cost: 4200000, life: 60, method: 'declining', location: 'Nouakchott · parc' },
    { code: `IMM-${year}-040`, name: "Parc d'ordinateurs portables · 12 unités", serial: 'LOT-PC-2026-040', cat: 'IT', acquired: addDays(today, -7), cost: 480000, life: 36, location: 'Nouakchott · bureau audit' },
    { code: `IMM-${year - 3}-018`, name: 'Agencement bureaux 2e étage', cat: 'FITTINGS', acquired: `${year - 3}-09-01`, cost: 3600000, life: 120, location: 'Nouakchott · siège' },
    { code: `IMM-${year - 4}-007`, name: 'Serveur et baie réseau', serial: 'SRV-DELL-R740-007', cat: 'IT', acquired: `${year - 4}-03-15`, cost: 1900000, life: 36, location: 'Nouakchott · local technique' },
    { code: `IMM-${year - 1}-036`, name: "Licences logicielles d'audit · 3 ans", cat: 'SOFTWARE', acquired: `${year - 1}-02-01`, cost: 1500000, life: 36, location: '—' },
    { code: `IMM-${year}-041`, name: 'Climatisation gainable · étage audit', cat: 'FITTINGS', acquired: addDays(today, -20), cost: 2150000, life: 96, location: 'Nouakchott · siège', status: 'wip' },
    { code: `IMM-${year - 1}-022`, name: 'Mobilier de la salle du conseil', cat: 'FURNITURE', acquired: `${year - 1}-06-20`, cost: 860000, life: 120, location: 'Nouakchott · siège' },
  ];
  const fixedByCat: Record<string, { cost: number; accumulated: number }> = {};
  const assetRows = assetDefs.map((d) => {
    const cat = catOf(d.cat);
    const life = d.life ?? cat.lifeMonths;
    const method = d.method ?? cat.method;
    const accumulated = d.status === 'wip' || d.acquired >= fyStart ? 0 : priorDepr(d.cost, life, method, d.acquired);
    if (d.acquired < fyStart) {
      const f = (fixedByCat[d.cat] ??= { cost: 0, accumulated: 0 });
      f.cost = r2(f.cost + d.cost);
      f.accumulated = r2(f.accumulated + accumulated);
    }
    return { ...d, life, method, accumulated, cat };
  });
  opening(ctx, AUD, fyStart, { '5501': 3500000, '5502': r2(20000 * 39.8), '5503': r2(4000 * 43.1), '560': 38500 }, 1000000, Object.entries(fixedByCat).map(([qualifier, f]) => ({ qualifier, ...f })));

  const cust = (code: string, name: string, regime: any, currency: Currency, country: string, terms = 30, groupEntityId?: Id) => {
    const [s1, c] = addCustomer(ctx.s, { entityId: AUD, code, name, regime, country, defaultCurrency: currency, paymentTermsDays: terms, groupEntityId });
    ctx.s = s1;
    return c.id;
  };
  const cOp = cust('C001', 'Opérateur GTA — contrat ' + year, 'non_resident', 'USD', 'GB');
  const cSt = cust('C002', 'Sous-traitant GTA A', 'gta', 'MRU', 'MR');
  const cMin = cust('C003', 'Société minière B', 'standard', 'MRU', 'MR');
  const ras7 = ctx.s.taxCodes.find((t) => t.entityId === AUD && t.code === 'RAS-7')!.id;
  const cBnk = cust('C004', 'Banque C', 'standard', 'MRU', 'MR');
  const cAss = cust('C005', 'Assurance D', 'standard', 'MRU', 'MR');
  ctx.s = { ...ctx.s, customers: ctx.s.customers.map((c) => (c.id === cBnk || c.id === cAss ? { ...c, withholdingCodeId: ras7 } : c)) };
  const cOng = cust('C006', 'ONG F', 'exempt', 'EUR', 'FR', 45);
  const cTra = cust('C007', 'Société de transport L', 'standard', 'MRU', 'MR');
  const cHot = cust('C008', 'Hôtel M', 'standard', 'MRU', 'MR');
  const cPha = cust('C009', 'Pharmacie N', 'standard', 'MRU', 'MR');
  const cAdv = cust('C010', 'BUMEX Advisory (groupe)', 'standard', 'MRU', 'MR', 30, ids.ADV);

  // engagements
  const eng = (code: string, name: string, customerId: Id, kind: string, stage: number, deadlineDays: number, feeType: 'fixed' | 'time', fixedFee: number | undefined, budgetHours: number, actualHours: number, invoiced: number, staff: string[], status: Engagement['status'] = 'active') => {
    const [s1, id] = nextId(ctx.s, 'eng');
    ctx.s = { ...s1, engagements: [...s1.engagements, { id, entityId: AUD, customerId, code, name, kind, stage, status, deadline: addDays(today, deadlineDays), feeType, fixedFee, currency: 'MRU', budgetHours, actualHours, invoicedToDate: invoiced, staff }] };
    return id;
  };
  const engGta1 = eng(`AUD-${year}-014`, 'Audit GTA-1 · Opérateur', cOp, 'audit', 2, 62, 'fixed', 4800000, 360, 162, 477600, ['S.E.', 'F.B.', 'A.A.', 'M.K.']);
  eng(`AUD-${year}-016`, 'Audit · SARL X', cHot, 'audit', 2, -4, 'fixed', 900000, 150, 90, 0, ['A.A.']);
  eng(`FIS-${year}-003`, 'Revue fiscale · Sous-traitant GTA A', cSt, 'tax', 2, 37, 'time', undefined, 80, 24, 0, ['F.B.']);
  eng(`AUD-${year}-017`, `Audit ${year} · Société minière B`, cMin, 'audit', 2, 137, 'fixed', 1800000, 300, 114, 0, ['F.B.', 'M.K.']);
  const engGta2 = eng(`AUD-${year}-012`, 'Audit GTA-2 · Sous-traitant', cSt, 'audit', 3, 17, 'fixed', 3000000, 300, 240, 1500000, ['E.W.', 'A.A.']);
  eng(`AUD-${year}-009`, 'Audit · Banque C', cBnk, 'audit', 3, 11, 'fixed', 1800000, 300, 312, 1230000, ['S.E.', 'F.B.']);
  eng(`FIS-${year}-004`, 'Conseil fiscal · Opérateur', cOp, 'tax', 4, -9, 'fixed', 600000, 80, 74, 0, ['F.B.']);
  eng(`AUD-${year}-018`, 'Audit · ONG F', cOng, 'audit', 4, 6, 'fixed', 190000, 60, 57, 0, ['M.K.']);
  eng(`ADV-${year}-002`, 'Due diligence · Cible K', cAdv, 'advisory', 1, 47, 'time', undefined, 120, 12, 0, ['S.E.', 'A.A.']);
  eng(`AUD-${year + 1}-001`, `Audit ${year} · Assurance D`, cAss, 'audit', 1, 168, 'fixed', 2400000, 210, 8, 0, ['F.B.']);
  eng(`AUD-${year}-021`, 'Audit intérimaire · Opérateur GTA', cOp, 'audit', 5, 20, 'fixed', 477600, 120, 120, 477600, ['S.E.', 'M.K.'], 'completed');

  // ---- the archive rack: finished engagements of the prior years, boxed and placed by (bay, shelf, slot) -----------
  const done = (code: string, name: string, customerId: Id, kind: string, completedAt: string, fee: number, hours: number, staff: string[]) => {
    const [s1, id] = nextId(ctx.s, 'eng');
    ctx.s = { ...s1, engagements: [...s1.engagements, { id, entityId: AUD, customerId, code, name, kind, stage: 5, status: 'completed', deadline: completedAt, feeType: 'fixed', fixedFee: fee, currency: 'MRU', budgetHours: hours, actualHours: hours, invoicedToDate: fee, staff, completedAt }] };
    return id;
  };
  // boxes are placed on the rack in archive-date order, whatever the order below
  const pendingBoxes: { engagementId: Id; date: string; opts: { kind?: ArchiveKind; boxCount?: number; status?: ArchiveStatus; retentionYears?: number; notes?: string; retrievedBy?: string } }[] = [];
  const box = (engagementId: Id, date: string, opts: { kind?: ArchiveKind; boxCount?: number; status?: ArchiveStatus; retentionYears?: number; notes?: string; retrievedBy?: string } = {}) => {
    pendingBoxes.push({ engagementId, date, opts });
  };
  const y1 = year - 1, y2 = year - 2, y3 = year - 3;
  box(done(`AUD-${y3}-003`, `Audit légal ${y3} · Banque C`, cBnk, 'audit', `${y2}-04-18`, 1700000, 290, ['S.E.', 'F.B.']), `${y2}-05-06`, { boxCount: 3, notes: 'Dossier permanent + dossier annuel, 3 boîtes' });
  box(done(`AUD-${y3}-007`, `Audit ${y3} · Société minière B`, cMin, 'audit', `${y2}-04-30`, 1600000, 260, ['F.B.', 'M.K.']), `${y2}-05-06`, { boxCount: 2 });
  box(done(`FIS-${y3}-002`, `Revue fiscale ${y3} · Assurance D`, cAss, 'tax', `${y2}-03-12`, 420000, 70, ['F.B.']), `${y2}-05-06`, { kind: 'binder' });
  box(done(`AUD-${y3}-011`, `Audit de projet ${y3} · ONG F`, cOng, 'audit', `${y2}-06-20`, 180000, 55, ['M.K.']), `${y2}-07-02`, { kind: 'binder' });
  box(done(`PCV-${y3}-001`, `Procédures convenues ${y3} · Transport L`, cTra, 'audit', `${y2}-02-27`, 220000, 40, ['A.A.']), `${y2}-07-02`, { kind: 'binder' });
  box(done(`AUD-${y2}-004`, `Audit légal ${y2} · Banque C`, cBnk, 'audit', `${y1}-04-22`, 1750000, 300, ['S.E.', 'F.B.']), `${y1}-05-10`, { boxCount: 3 });
  box(done(`AUD-${y2}-006`, `Audit ${y2} · Société minière B`, cMin, 'audit', `${y1}-04-29`, 1650000, 270, ['F.B.', 'M.K.']), `${y1}-05-10`, { boxCount: 2 });
  box(done(`AUD-${y2}-009`, `Audit GTA-1 ${y2} · Opérateur`, cOp, 'audit', `${y1}-03-31`, 4500000, 340, ['S.E.', 'F.B.', 'A.A.']), `${y1}-05-10`, { boxCount: 4, notes: 'Conventions GTA, rapports de phase, confirmations' });
  box(done(`AUD-${y2}-012`, `Audit GTA-2 ${y2} · Sous-traitant`, cSt, 'audit', `${y1}-05-15`, 2800000, 280, ['E.W.', 'A.A.']), `${y1}-06-03`, { boxCount: 2, status: 'retrieved', retrievedBy: 'F.B.', notes: 'Sortie pour la revue des comparatifs GTA-2' });
  box(done(`ADV-${y2}-001`, `Due diligence ${y2} · Cible J`, cAdv, 'advisory', `${y1}-01-20`, 900000, 110, ['S.E.']), `${y1}-06-03`, { kind: 'binder', notes: 'Data room imprimée · confidentiel' });
  box(done(`AUD-${y2}-015`, `Examen limité ${y2} · Pharmacie N`, cPha, 'audit', `${y1}-07-08`, 85000, 30, ['M.K.']), `${y1}-08-01`, { kind: 'binder' });
  box(done(`AUD-${y1}-002`, `Audit ${y1} · Hôtel M`, cHot, 'audit', `${year}-03-14`, 850000, 140, ['A.A.']), `${year}-04-02`, { boxCount: 1 });
  box(done(`AUD-${y1}-005`, `Audit ${y1} · Assurance D`, cAss, 'audit', `${year}-04-25`, 2300000, 210, ['F.B.']), `${year}-05-12`, { boxCount: 3 });
  box(done(`AUD-${y1}-008`, `Audit légal ${y1} · Banque C`, cBnk, 'audit', `${year}-04-28`, 1800000, 310, ['S.E.', 'F.B.']), `${year}-05-12`, { boxCount: 3 });
  box(done(`CAA-${y1}-001`, `Commissariat aux apports ${y1} · Société T`, cTra, 'legal', `${year}-02-10`, 350000, 45, ['S.E.']), `${year}-05-12`, { kind: 'binder' });
  box(done(`AUD-${year - 6}-002`, `Audit légal ${year - 6} · Banque C`, cBnk, 'audit', `${year - 5}-04-15`, 1200000, 250, ['S.E.']), `${year - 5}-05-02`, { boxCount: 2, retentionYears: 5, status: 'pending_destruction', notes: 'Conservation échue · destruction à autoriser par un associé' });
  const y4 = year - 4, y5 = year - 5;
  box(done(`AUD-${y5}-002`, `Audit légal ${y5} · Banque C`, cBnk, 'audit', `${y4}-04-20`, 1500000, 280, ['S.E.']), `${y4}-05-08`, { boxCount: 3 });
  box(done(`AUD-${y5}-005`, `Audit ${y5} · Assurance D`, cAss, 'audit', `${y4}-05-02`, 2000000, 200, ['F.B.']), `${y4}-05-08`, { boxCount: 2 });
  box(done(`PCV-${y5}-001`, `Procédures convenues ${y5} · Pharmacie N`, cPha, 'audit', `${y4}-03-10`, 70000, 25, ['M.K.']), `${y4}-05-08`, { kind: 'binder' });
  box(done(`AUD-${y4}-003`, `Audit légal ${y4} · Banque C`, cBnk, 'audit', `${y3}-04-24`, 1600000, 285, ['S.E.', 'F.B.']), `${y3}-05-09`, { boxCount: 3 });
  box(done(`AUD-${y4}-006`, `Audit ${y4} · Société minière B`, cMin, 'audit', `${y3}-04-28`, 1550000, 255, ['F.B.']), `${y3}-05-09`, { boxCount: 2 });
  box(done(`AUD-${y4}-010`, `Audit GTA-1 ${y4} · Opérateur`, cOp, 'audit', `${y3}-03-29`, 4200000, 330, ['S.E.', 'A.A.']), `${y3}-05-09`, { boxCount: 4 });
  box(done(`FIS-${y4}-001`, `Revue fiscale ${y4} · Transport L`, cTra, 'tax', `${y3}-02-15`, 380000, 60, ['F.B.']), `${y3}-05-09`, { kind: 'binder' });
  box(done(`ADV-${y4}-002`, `Due diligence ${y4} · Cible H`, cAdv, 'advisory', `${y3}-06-30`, 800000, 100, ['S.E.']), `${y3}-07-15`, { kind: 'binder', notes: 'Confidentiel · accès associés' });
  for (const b of [...pendingBoxes].sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0))) {
    const [s1] = archiveEngagement(ctx.s, { engagementId: b.engagementId, date: b.date, kind: b.opts.kind, boxCount: b.opts.boxCount, status: b.opts.status, retentionYears: b.opts.retentionYears, notes: b.opts.notes, retrievedBy: b.opts.retrievedBy, retrievedAt: b.opts.retrievedBy ? addDays(today, -3) : undefined });
    ctx.s = s1;
  }

  // ---- tasks: the work items of the command bar, tied to the engagements and rooms above ------------------------
  const task = (title: string, module: string, assignee: string, dueDays: number, opts: { status?: Task['status']; priority?: Task['priority']; engagementId?: Id; customerId?: Id; doneDays?: number; notes?: string } = {}) => {
    const [s1] = createTask(ctx.s, { entityId: AUD, title, module, assignee, dueDate: addDays(today, dueDays), status: opts.status, priority: opts.priority, engagementId: opts.engagementId, customerId: opts.customerId, notes: opts.notes, createdAt: addDays(today, Math.min(dueDays, 0) - 12), completedAt: opts.doneDays !== undefined ? addDays(today, opts.doneDays) : undefined });
    ctx.s = s1;
  };
  const engOf = (code: string) => ctx.s.engagements.find((e) => e.entityId === AUD && e.code === code)!.id;
  task('Rapport final · Audit SARL X', 'missions', 'A.A.', -4, { status: 'in_progress', priority: 'high', engagementId: engOf(`AUD-${year}-016`), notes: 'Échéance dépassée : le client attend le rapport signé' });
  task('Note de synthèse fiscale · Opérateur', 'missions', 'F.B.', -9, { priority: 'high', engagementId: engOf(`FIS-${year}-004`) });
  task('Relancer Assurance D · facture en retard', 'clients', 'E.W.', -2, { priority: 'normal', customerId: cAss });
  task('Rapprocher les 8 lignes BMCI en attente', 'bank', 'E.W.', 1, { status: 'in_progress' });
  task('Comptabiliser la provision congés payés', 'accounting', 'E.W.', 2, { notes: 'Brouillon OD en attente de validation' });
  task('Approuver la facture Bailleur SCI du Port · loyer T4', 'suppliers', 'S.E.', 3, { priority: 'high' });
  task(`Verrouiller la période ${addMonths(today.slice(0, 8) + '01', -1).slice(0, 7)}`, 'closing', 'S.E.', 4);
  task('Revue associé · Audit Banque C', 'missions', 'S.E.', 5, { engagementId: engOf(`AUD-${year}-009`) });
  task('Archiver le dossier · Audit intérimaire Opérateur GTA', 'archives', 'M.K.', 6, { engagementId: engOf(`AUD-${year}-021`) });
  task('Sortir la boîte GTA-2 pour la revue des comparatifs', 'archives', 'F.B.', 0, { status: 'done', doneDays: -3, engagementId: engOf(`AUD-${y2}-012`) });
  task('Planification · Audit Assurance D', 'missions', 'F.B.', 20, { engagementId: engOf(`AUD-${year + 1}-001`) });
  task('Lettre de mission · Due diligence Cible K', 'missions', 'S.E.', 9, { engagementId: engOf(`ADV-${year}-002`) });
  task('Immobiliser le parc de 12 portables', 'assets', 'E.W.', 8, { status: 'in_progress' });
  task('Facturer le solde GTA-2', 'clients', 'E.W.', -29, { status: 'done', doneDays: -29, engagementId: engGta2 });
  task(`Import relevé BMCI · ${addMonths(today, -1).slice(0, 7)}`, 'bank', 'E.W.', -12, { status: 'done', doneDays: -12 });
  task(`Déclaration TVA · ${addMonths(today, -1).slice(0, 7)}`, 'tax', 'F.B.', -14, { status: 'done', doneDays: -15 });
  task('Lettrage encaissement Banque C', 'clients', 'E.W.', -45, { status: 'done', doneDays: -46 });
  task('Dossier permanent · Hôtel M', 'missions', 'A.A.', -30, { status: 'done', doneDays: -31, engagementId: engOf(`AUD-${year}-016`) });
  task('Confirmations bancaires · Société minière B', 'missions', 'M.K.', -20, { status: 'done', doneDays: -22, engagementId: engOf(`AUD-${year}-017`) });
  task('Inventaire physique · parc véhicules', 'assets', 'M.K.', -8, { status: 'done', doneDays: -8 });

  // ---- people: the HR module's sheets; the initials are the ones the engagements already use -------------------
  const emp = (code: string, firstName: string, lastName: string, initials: string, jobTitle: string, department: string, category: EmployeeCategory, hireDate: string, grossSalary: number, allowances = 0, contractType = 'CDI') => {
    const [s1, e] = addEmployee(ctx.s, { entityId: AUD, code, firstName, lastName, initials, jobTitle, department, category, hireDate, grossSalary, allowances, contractType, email: `${initials.toLowerCase().replace(/\./g, '')}@bumex.mr` });
    ctx.s = s1;
    return e.id;
  };
  const people: Record<string, Id> = {
    'S.E.': emp('P001', 'Sidi', 'Elemine', 'S.E.', 'Associé signataire', 'Direction', 'partner', `${year - 9}-01-15`, 180000, 40000),
    'F.B.': emp('P002', 'Fatma', 'Bâ', 'F.B.', 'Manager audit & fiscal', 'Audit', 'manager', `${year - 6}-03-01`, 95000, 15000),
    'O.T.': emp('P003', 'Oumar', 'Tall', 'O.T.', 'Manager audit', 'Audit', 'manager', `${year - 5}-09-01`, 92000, 15000),
    'A.A.': emp('P004', 'Aïcha', 'Abdallahi', 'A.A.', 'Senior audit', 'Audit', 'senior', `${year - 4}-02-01`, 60000, 8000),
    'M.K.': emp('P005', 'Mohamed', 'Kane', 'M.K.', 'Senior audit', 'Audit', 'senior', `${year - 3}-10-01`, 58000, 8000),
    'H.S.': emp('P006', 'Hawa', 'Sow', 'H.S.', 'Senior fiscal', 'Fiscalité', 'senior', `${year - 2}-01-10`, 56000, 6000),
    'E.W.': emp('P007', 'El Hassen', 'Wane', 'E.W.', 'Comptable', 'Administration & finance', 'assistant', `${year - 5}-05-02`, 42000, 5000),
    'J.D.': emp('P008', 'Jemal', 'Dah', 'J.D.', 'Assistant audit', 'Audit', 'assistant', `${year - 1}-09-01`, 38000, 4000),
    'L.K.': emp('P009', 'Leila', 'Khattri', 'L.K.', 'Assistante audit', 'Audit', 'assistant', `${year - 1}-11-15`, 36000, 4000),
    'B.M.': emp('P010', 'Bilal', 'Mbaye', 'B.M.', 'Assistant administratif', 'Administration & finance', 'support', `${year - 3}-04-01`, 30000, 3000),
    'N.D.': emp('P011', 'Nouha', 'Diallo', 'N.D.', 'Stagiaire audit', 'Audit', 'intern', addDays(today, -45), 12000, 0, 'Stage'),
    'R.B.': emp('P012', 'Rayane', 'Beddi', 'R.B.', 'Chauffeur-coursier', 'Services généraux', 'support', `${year - 2}-06-01`, 25000, 3000),
  };
  // planning: who is on which engagement, from the engagement sheets; A.A. is double-booked on purpose
  const assignOn = (code: string, initials: string, startDays: number, endDays: number | null, load = 1) => {
    const e = ctx.s.engagements.find((x) => x.entityId === AUD && x.code === code)!;
    const [s1] = assign(ctx.s, { entityId: AUD, engagementId: e.id, employeeId: people[initials], start: addDays(today, startDays), end: endDays === null ? e.deadline : addDays(today, endDays), load });
    ctx.s = s1;
  };
  assignOn(`AUD-${year}-014`, 'S.E.', -30, null, 0.3); assignOn(`AUD-${year}-014`, 'F.B.', -30, null, 0.4); assignOn(`AUD-${year}-014`, 'A.A.', -20, null, 1); assignOn(`AUD-${year}-014`, 'M.K.', -20, 30, 0.5);
  assignOn(`AUD-${year}-016`, 'A.A.', -40, 6, 0.5);
  assignOn(`FIS-${year}-003`, 'F.B.', -10, null, 0.2); assignOn(`FIS-${year}-003`, 'H.S.', -10, null, 0.5);
  assignOn(`AUD-${year}-017`, 'F.B.', 20, null, 0.4); assignOn(`AUD-${year}-017`, 'M.K.', 32, null, 1); assignOn(`AUD-${year}-017`, 'J.D.', 32, null, 1);
  assignOn(`AUD-${year}-012`, 'O.T.', -50, null, 0.5); assignOn(`AUD-${year}-012`, 'A.A.', -50, null, 0.5);
  assignOn(`AUD-${year}-009`, 'S.E.', -60, null, 0.2); assignOn(`AUD-${year}-009`, 'F.B.', -60, null, 0.2); assignOn(`AUD-${year}-009`, 'L.K.', -60, null, 1);
  assignOn(`FIS-${year}-004`, 'F.B.', -25, 2, 0.2); assignOn(`FIS-${year}-004`, 'H.S.', -25, 2, 0.5);
  assignOn(`AUD-${year}-018`, 'M.K.', -15, null, 0.5); assignOn(`AUD-${year}-018`, 'N.D.', -15, null, 1);
  assignOn(`ADV-${year}-002`, 'S.E.', 3, null, 0.2); assignOn(`ADV-${year}-002`, 'A.A.', 3, null, 0.5);
  assignOn(`AUD-${year + 1}-001`, 'F.B.', 60, null, 0.3); assignOn(`AUD-${year + 1}-001`, 'J.D.', 60, null, 1); assignOn(`AUD-${year + 1}-001`, 'L.K.', 70, null, 1);

  // invoices over the year, oldest first (dates relative to today)
  const d = (days: number) => addDays(today, -days);
  const i1 = invoice(ctx, AUD, cBnk, d(285), 'MRU', [{ description: `Audit légal ${year - 1} · phase finale`, amount: 1200000 }]);
  pay(ctx, AUD, i1.id, d(258), bMru);
  const i2 = invoice(ctx, AUD, cMin, d(270), 'MRU', [{ description: `Audit légal ${year - 1} · rapport`, amount: 900000 }]);
  pay(ctx, AUD, i2.id, d(240), bMru);
  const i3 = invoice(ctx, AUD, cSt, d(245), 'MRU', [{ description: 'Audit GTA-2 · acompte 50 %', amount: 1500000 }], { engagementId: engGta2 });
  pay(ctx, AUD, i3.id, d(212), bMru);
  const i4 = invoice(ctx, AUD, cOp, d(230), 'USD', [{ description: 'Audit GTA-1 · phase de planification', amount: 15000 }], { bankAccountId: bUsd, engagementId: engGta1 });
  pay(ctx, AUD, i4.id, d(200), bUsd);
  const i5 = invoice(ctx, AUD, cAss, d(162), 'MRU', [{ description: 'Audit des comptes · phase intérimaire', amount: 600000 }]);
  const i6 = invoice(ctx, AUD, cBnk, d(200), 'MRU', [{ description: 'Audit · acompte', amount: 1100000 }]);
  pay(ctx, AUD, i6.id, d(165), bMru);
  const i7 = invoice(ctx, AUD, cMin, d(180), 'MRU', [{ description: 'Audit · acompte', amount: 1300000 }]);
  pay(ctx, AUD, i7.id, d(150), bMru);
  const i8 = invoice(ctx, AUD, cOp, d(150), 'USD', [{ description: 'Audit GTA-1 · phase intérimaire 1', amount: 18000 }], { bankAccountId: bUsd, engagementId: engGta1 });
  pay(ctx, AUD, i8.id, d(45), bUsd); // paid after the rate moved: realised gain
  const i9 = invoice(ctx, AUD, cAss, d(140), 'MRU', [{ description: 'Revue fiscale', amount: 450000, category: 'TAX' }]);
  pay(ctx, AUD, i9.id, d(105), bMru);
  const i10 = invoice(ctx, AUD, cBnk, d(96), 'MRU', [{ description: 'Audit · phase finale', amount: 1200000 }]);
  pay(ctx, AUD, i10.id, d(50), bMru, 500000);
  const i11 = invoice(ctx, AUD, cPha, d(125), 'MRU', [{ description: 'Mission d\'examen limité', amount: 90000 }]);
  const i12 = invoice(ctx, AUD, cTra, d(70), 'MRU', [{ description: 'Audit · acompte', amount: 180000 }]);
  const i13 = invoice(ctx, AUD, cTra, d(65), 'MRU', [{ description: 'Procédures convenues', amount: 240000 }]);
  const i14 = invoice(ctx, AUD, cMin, d(55), 'MRU', [{ description: 'Audit · phase intérimaire', amount: 450000 }]);
  const i15 = invoice(ctx, AUD, cHot, d(42), 'MRU', [{ description: 'Audit SARL X · acompte', amount: 150000 }]);
  const i16 = invoice(ctx, AUD, cSt, d(29), 'MRU', [{ description: 'Audit GTA-2 · solde', amount: 1850000 }], { engagementId: engGta2 });
  const i17 = invoice(ctx, AUD, cOng, d(10), 'EUR', [{ description: 'Audit de projet · rapport', amount: 4500 }], { bankAccountId: bEur });
  const i18 = invoice(ctx, AUD, cAdv, d(14), 'MRU', [{ description: 'Mise à disposition équipe · due diligence', amount: 300000, category: 'ADVISORY' }]);
  // your invoice IN2610-0116: the sequence of the month is set so the next number is 0116
  const monthKey = `${AUD}|sales_invoice||${d(12).slice(0, 7)}`;
  ctx.s = { ...ctx.s, counters: { ...ctx.s.counters, [monthKey]: Math.max(ctx.s.counters[monthKey] ?? 0, 115) } };
  invoice(ctx, AUD, cOp, d(12), 'USD', [{ description: `Audit des comptes ${year} · phase intérimaire 2`, amount: 12000 }], { bankAccountId: bUsd, engagementId: engGta1 });
  void [i5, i11, i12, i13, i14, i15, i16, i17, i18];
  ctx.s = sendDunning(ctx.s, i5.id);
  ctx.s = sendDunning(ctx.s, i10.id);

  // running costs: payroll posted month by month (gross, contributions, withheld tax), net paid from the bank; the rent quarterly
  {
    const rules = payrollRulesFor(ctx.s, AUD);
    const bankGl = ctx.s.bankAccounts.find((b) => b.id === bMru)!.glAccountId;
    let m = fyStart.slice(0, 7);
    while (`${m}-28` < today) {
      const [s1, run] = postPayroll(ctx.s, AUD, m, `${m}-28`);
      ctx.s = s1;
      const payDate = `${m}-28`;
      const netId = post(ctx, AUD, 'bank', payDate, `Virement des salaires ${m}`, [{ accountId: mapped(ctx.s, AUD, 'NET_PAYABLE').id, description: `Salaires nets ${m}`, debitTxn: run.totals.net }, { accountId: bankGl, description: `Salaires nets ${m}`, creditTxn: run.totals.net, bankAccountId: bMru }], 'MRU', 1, 'payroll');
      matchedTxn(ctx, bMru, payDate, -run.totals.net, `VIR SALAIRES ${m}`, netId);
      const social = r2(run.totals.cnssEmployee + run.totals.cnssEmployer), health = r2(run.totals.cnamEmployee + run.totals.cnamEmployer);
      const dueDate = addDays(`${m}-28`, 17);
      if (dueDate < today) {
        const contribId = post(ctx, AUD, 'bank', dueDate, `Règlement ${rules.labels.social} · ${rules.labels.health} · ${rules.labels.tax} ${m}`, [
          { accountId: mapped(ctx.s, AUD, 'SOCIAL_PAYABLE').id, description: `${rules.labels.social} ${m}`, debitTxn: social },
          { accountId: mapped(ctx.s, AUD, 'HEALTH_PAYABLE').id, description: `${rules.labels.health} ${m}`, debitTxn: health },
          { accountId: mapped(ctx.s, AUD, 'TAX_WITHHELD_PAYABLE').id, description: `${rules.labels.tax} ${m}`, debitTxn: run.totals.its },
          { accountId: bankGl, description: `Charges sociales et ${rules.labels.tax} ${m}`, creditTxn: r2(social + health + run.totals.its), bankAccountId: bMru },
        ], 'MRU', 1, 'payroll');
        matchedTxn(ctx, bMru, dueDate, -r2(social + health + run.totals.its), `VIR CNSS CNAM TRESOR ${m}`, contribId);
      }
      m = addMonths(`${m}-01`, 1).slice(0, 7);
    }
    monthlyCosts(ctx, AUD, bMru, 0, 450000, fyStart, today);
  }
  // the equipment loan: drawn in March, monthly annuities paid up to last month
  {
    const [s1, loan] = addLoan(ctx.s, { entityId: AUD, lender: 'BMCI', reference: `EMP-${year}-017`, currency: 'MRU', principal: 3000000, annualRate: 0.085, months: 36, startDate: `${year}-03-01`, frequency: 'monthly', method: 'annuity', feePerInstalment: 1500, bankAccountId: bMru, notes: 'Financement du parc informatique et des agencements', postDrawdown: true });
    ctx.s = s1;
    matchedTxn(ctx, bMru, `${year}-03-01`, 3000000, `DEBLOCAGE PRET ${loan.reference}`, loan.drawdownEntryId!);
    for (let n = 1; ; n++) {
      const due = addMonths(`${year}-03-01`, n);
      if (due >= today) break;
      const [s2, p] = payInstalment(ctx.s, { loanId: loan.id, instalmentNo: n });
      ctx.s = s2;
      matchedTxn(ctx, bMru, due, -p.total, `ECHEANCE PRET ${loan.reference} ${n}`, p.journalEntryId!);
    }
  }

  // unmatched statement lines
  unmatchedTxn(ctx, bMru, d(1), `VIR SOUS-TRAITANT GTA A FACT ${i16.number}`, 1850000, i16.number);
  unmatchedTxn(ctx, bMru, d(2), 'FRAIS TENUE DE COMPTE ' + d(2).slice(0, 7), -4500);
  unmatchedTxn(ctx, bMru, d(2), 'VIR RECU REF 88213', 250000, '88213');
  unmatchedTxn(ctx, bMru, d(3), 'PRLV ASSURANCE MULTIRISQUE', -120000);
  unmatchedTxn(ctx, bMru, d(4), 'AGIOS TRIMESTRE', -12300);
  unmatchedTxn(ctx, bMru, d(5), 'VIR INTERNE VERS COMPTE USD', -400000);
  unmatchedTxn(ctx, bUsd, d(5), 'VIR INTERNE DEPUIS COMPTE MRU', r2(400000 / 40.15));
  unmatchedTxn(ctx, bEur, d(6), 'FRAIS VIREMENT INTERNATIONAL', -18);

  // suppliers: sheets, invoices entered by the accountant, approved by threshold, one paid — the whole cycle
  const vat16 = ctx.s.taxCodes.find((t) => t.entityId === AUD && t.code === 'TVA-16')!.id;
  const sup = (name: string, regime: any, withholdingCode?: string, expenseCode?: string, extra: { email?: string; phone?: string; nif?: string; address?: string } = {}) => {
    const whc = withholdingCode ? ctx.s.taxCodes.find((t) => t.entityId === AUD && t.code === withholdingCode)?.id : undefined;
    const [s1, sp] = addSupplier(ctx.s, { entityId: AUD, name, regime, withholdingCodeId: whc, expenseAccountId: expenseCode ? accountByCode(ctx.s, AUD, expenseCode).id : undefined, ...extra });
    ctx.s = s1;
    return sp.id;
  };
  const sJur = sup('Cabinet juridique G', 'standard', 'RAS-3', '6331', { email: 'contact@cabinet-g.mr', nif: '30201234' });
  const sBail = sup('Bailleur SCI du Port', 'standard', undefined, '6200', { address: 'Nouakchott, Tevragh Zeina' });
  const sCons = sup('Consultant non résident H', 'non_resident', 'RAS-15', '6331', { email: 'h.consult@example.com' });
  const sInfo = sup('Fournisseur informatique I', 'standard', undefined, '6333', { phone: '+222 45 00 00 00' });
  const sTel = sup('Télécoms J', 'standard', undefined, '632');
  const sAss = sup('Assureur multirisque K', 'standard', undefined, '6230');
  // the accountant enters the invoices (so that a partner can approve them: segregation of duties)
  ctx.s = { ...ctx.s, session: sessionFor(uAcc) };
  const sinv = (supplierId: Id, ref: string, date: string, currency: Currency, ht: number, withVat: boolean, expenseCode: string, description: string) => {
    const [s1, si] = createSupplierInvoice(ctx.s, { entityId: AUD, supplierId, supplierRef: ref, date, currency, totalHt: ht, taxCodeId: withVat ? vat16 : null, expenseAccountId: accountByCode(ctx.s, AUD, expenseCode).id, description });
    ctx.s = s1;
    return si.id;
  };
  sinv(sJur, 'FJ-' + year + '-118', d(4), 'MRU', 300000, true, '6331', 'Honoraires conseil juridique · contentieux client');
  sinv(sBail, 'LOY-T4-' + year, d(5), 'MRU', 1350000, true, '6200', 'Loyer bureaux T4');
  sinv(sCons, 'INV-0931', d(6), 'EUR', 4000, false, '6331', 'Mission technique · revue IFRS');
  sinv(sInfo, 'F-77810', d(7), 'MRU', 480000, true, '6333', 'Parc de 12 ordinateurs portables (à immobiliser)');
  const telId = sinv(sTel, year + '-10-4411', d(8), 'MRU', 62000, true, '632', 'Téléphonie et internet'); // below the threshold: posted at once
  const assId = sinv(sAss, 'POL-' + year + '-0455', d(40), 'MRU', 1200000, false, '6230', "Prime d'assurance multirisque bureaux");
  const telPrev = sinv(sTel, year + '-09-4201', d(38), 'MRU', 61000, true, '632', 'Téléphonie et internet · mois précédent');
  const jurPrev = sinv(sJur, 'FJ-' + year + '-097', d(52), 'MRU', 250000, true, '6331', 'Honoraires · rédaction de contrats'); // with a 3 % withholding to remit
  ctx.s = { ...ctx.s, session: sessionFor(uAdmin) };
  ctx.s = approveSupplierInvoice(ctx.s, assId); // the insurer's premium, approved by the partner, then paid
  ctx.s = approveSupplierInvoice(ctx.s, jurPrev);
  {
    const si = ctx.s.supplierInvoices.find((x) => x.id === jurPrev)!;
    const [s1, pay0] = paySupplierInvoice(ctx.s, { invoiceId: jurPrev, date: d(20), bankAccountId: bMru });
    ctx.s = s1;
    matchedTxn(ctx, bMru, d(20), -si.netPayable, 'VIR CABINET JURIDIQUE G FJ-' + year + '-097', pay0.journalEntryId!);
  }
  {
    const [s1, pay1] = paySupplierInvoice(ctx.s, { invoiceId: assId, date: d(33), bankAccountId: bMru, reference: 'VIR-' + year + '-0912' });
    ctx.s = s1;
    matchedTxn(ctx, bMru, d(33), -1200000, 'VIR ASSUREUR MULTIRISQUE K POL-' + year + '-0455', pay1.journalEntryId!);
    const [s2, pay2] = paySupplierInvoice(ctx.s, { invoiceId: telPrev, date: d(10), bankAccountId: bMru });
    ctx.s = s2;
    matchedTxn(ctx, bMru, d(10), -70760, 'PRLV TELECOMS J', pay2.journalEntryId!);
  }
  void telId;

  // assets: the register, from the sheets defined with the opening balance; the laptops were bought this year
  for (const a of assetRows) {
    const [s1] = addAsset(ctx.s, { entityId: AUD, code: a.code, name: a.name, serial: a.serial, categoryId: a.cat.id, acquisitionDate: a.acquired, cost: a.cost, lifeMonths: a.life, method: a.method, location: a.location, status: a.status ?? 'in_service', accumulated: a.accumulated, supplierId: a.code === `IMM-${year}-040` ? sInfo : undefined, acquisition: a.acquired >= fyStart && a.status !== 'wip' ? { credit: 'supplier', vatAmount: r2(a.cost * 0.16) } : null });
    ctx.s = s1;
  }

  // drafts: a provision, a bank line typed by hand, and a back-dated entry in the open prior year
  {
    const od = ctx.s.journals.find((j) => j.entityId === AUD && j.kind === 'misc')!;
    const [s1] = createDraft(ctx.s, { entityId: AUD, journalId: od.id, date: addDays(today, -1), description: 'Provision congés payés', currency: 'MRU', lines: [{ accountId: accountByCode(ctx.s, AUD, '6500').id, description: 'Provision congés', debitTxn: 310000 }, { accountId: accountByCode(ctx.s, AUD, '421').id, description: 'Provision congés', creditTxn: 310000 }] });
    ctx.s = s1;
    const [s2] = createDraft(ctx.s, { entityId: AUD, journalId: od.id, date: `${year - 2}-06-15`, description: `Reprise ${year - 2} · loyer T2`, currency: 'MRU', lines: [{ accountId: accountByCode(ctx.s, AUD, '6200').id, description: 'Loyer bureaux T2', debitTxn: 450000 }, { accountId: accountByCode(ctx.s, AUD, '4350').id, description: 'TVA 16 % loyer T2', debitTxn: 72000 }, { accountId: accountByCode(ctx.s, AUD, '4000').id, description: 'Bailleur SCI du Port', creditTxn: 522000, supplierId: sBail }] });
    ctx.s = s2;
    const [s3] = createDraft(ctx.s, { entityId: AUD, journalId: od.id, date: today, description: 'Note de frais déplacement terrain GTA', currency: 'MRU', lines: [{ accountId: accountByCode(ctx.s, AUD, '6310').id, description: 'Déplacement', debitTxn: 86500 }, { accountId: accountByCode(ctx.s, AUD, '421').id, description: 'À rembourser', creditTxn: 80000 }] });
    ctx.s = s3;
  }

  // ---- other floors: an opening balance, a few invoices, engagements --------------------
  const light = (code: string, bankCode: string, cash: number, capital: number, customers: [string, any, Currency][], invoices: [number, number, number, number][], engagements: [string, number, number, number][], salaries: number) => {
    const id = ids[code];
    const e = ctx.s.entities.find((x) => x.id === id)!;
    const b = bankAccount(ctx, id, `Compte principal ${e.functionalCurrency}`, e.country === 'MA' ? 'Attijariwafa bank' : 'BMCI', e.functionalCurrency, bankCode, false, true);
    opening(ctx, id, fyStart, { [bankCode]: cash }, capital);
    const cids = customers.map(([name, regime, currency], i) => {
      const [s1, c] = addCustomer(ctx.s, { entityId: id, code: `C00${i + 1}`, name, regime, country: currency === 'MAD' ? 'MA' : 'MR', defaultCurrency: currency, paymentTermsDays: 30 });
      ctx.s = s1;
      return c.id;
    });
    invoices.forEach(([ci, daysAgo, amount, paidDaysAgo], i) => {
      const inv = invoice(ctx, id, cids[ci], d(daysAgo), e.functionalCurrency, [{ description: `Prestation ${i + 1}`, amount, category: code === 'AVO' ? 'LEGAL' : code === 'IT' ? 'IT' : 'ADVISORY' }]);
      if (paidDaysAgo >= 0) pay(ctx, id, inv.id, d(paidDaysAgo), b);
    });
    engagements.forEach(([name, deadlineDays, budget, actual], i) => {
      const [s1, eid] = nextId(ctx.s, 'eng');
      ctx.s = { ...s1, engagements: [...s1.engagements, { id: eid, entityId: id, customerId: cids[i % cids.length], code: `${code}-${year}-00${i + 1}`, name, kind: 'advisory', stage: 2, status: 'active', deadline: addDays(today, deadlineDays), feeType: 'fixed', fixedFee: budget * 5000, currency: e.functionalCurrency, budgetHours: budget, actualHours: actual, invoicedToDate: 0, staff: ['—'] }] };
    });
    monthlyCosts(ctx, id, b, salaries, 0, fyStart, today);
    // people: a small team per entity, the first engagement staffed from it
    const team: [string, string, string, string, EmployeeCategory, number][] = [['Responsable', code, 'R.' + code.slice(0, 1) + '.', 'Responsable d\'entité', 'manager', Math.round(salaries * 0.3)], ['Senior', code, 'S.' + code.slice(0, 1) + '.', 'Senior', 'senior', Math.round(salaries * 0.25)], ['Assistant', code, 'A.' + code.slice(0, 1) + '.', 'Assistant', 'assistant', Math.round(salaries * 0.18)]];
    const empIds = team.slice(0, Math.max(2, Math.min(3, e.staffTotal))).map(([first, last, initials, title, category, gross], i) => {
      const [s1, em] = addEmployee(ctx.s, { entityId: id, code: `P00${i + 1}`, firstName: first, lastName: last, initials, jobTitle: title, department: e.activity, category, hireDate: `${year - 2}-01-10`, grossSalary: gross });
      ctx.s = s1;
      return em;
    });
    const firstActive = ctx.s.engagements.find((x) => x.entityId === id && x.status === 'active');
    if (firstActive) for (const em of empIds.slice(0, 2)) { const [s1] = assign(ctx.s, { entityId: id, engagementId: firstActive.id, employeeId: em.id, start: addDays(today, -15), end: firstActive.deadline > today ? firstActive.deadline : addDays(today, 10), load: 0.6 }); ctx.s = s1; }
    // two finished engagements of the prior year on the rack, and a handful of tasks
    engagements.slice(0, 2).forEach(([name], i) => {
      const [s1, eid] = nextId(ctx.s, 'eng');
      const completedAt = `${year - 1}-${i === 0 ? '06' : '11'}-15`;
      ctx.s = { ...s1, engagements: [...s1.engagements, { id: eid, entityId: id, customerId: cids[i % cids.length], code: `${code}-${year - 1}-00${i + 1}`, name: `${name} · ${year - 1}`, kind: 'advisory', stage: 5, status: 'completed', deadline: completedAt, feeType: 'fixed', fixedFee: 400000, currency: e.functionalCurrency, budgetHours: 80, actualHours: 80, invoicedToDate: 400000, staff: ['—'], completedAt }] };
      const [s2] = archiveEngagement(ctx.s, { engagementId: eid, date: addDays(completedAt, 20), kind: i === 0 ? 'box' : 'binder' });
      ctx.s = s2;
    });
    const firstEng = ctx.s.engagements.find((x) => x.entityId === id && x.status === 'active');
    const tk = (title: string, module: string, dueDays: number, status: Task['status'] = 'todo', engagementId?: Id) => {
      const [s1] = createTask(ctx.s, { entityId: id, title, module, assignee: '—', dueDate: addDays(today, dueDays), status, engagementId, createdAt: addDays(today, -10), completedAt: status === 'done' ? addDays(today, -2) : undefined });
      ctx.s = s1;
    };
    tk(`Relancer la facture ouverte · ${customers[0][0]}`, 'clients', 3);
    tk(`Point d'avancement · ${engagements[0][0]}`, 'missions', engagements[0][1] < 0 ? -1 : 6, 'in_progress', firstEng?.id);
    tk(`Rapprochement bancaire · ${addMonths(today, -1).slice(0, 7)}`, 'bank', -3, 'done');
    tk(`Déclaration TVA · ${addMonths(today, -1).slice(0, 7)}`, 'tax', -5, 'done');
  };
  light('SA', '5501', 4200000, 2000000, [['Opérateur GTA · fiscal', 'non_resident', 'USD'], ['Sous-traitant GTA C', 'gta', 'MRU'], ['Sous-traitant GTA D', 'gta', 'MRU']], [[1, 250, 3200000, 220], [2, 190, 2800000, 160], [1, 120, 3100000, 90], [2, 60, 2600000, -1], [1, 20, 1420000, -1]], [['Conformité fiscale GTA · lot 1', 30, 200, 120], ['Contrats sous-traitance', 55, 90, 20]], 620000);
  light('ADV', '5501', 1800000, 500000, [['Groupe industriel P', 'standard', 'MRU'], ['Banque C', 'standard', 'MRU']], [[0, 200, 2400000, 170], [1, 140, 1900000, 100], [0, 75, 1800000, 40], [1, 25, 380000, -1]], [['Business plan P', 40, 160, 90], ['Diagnostic organisation', 70, 80, 10]], 380000);
  light('MAU', '5501', 1200000, 300000, [['SARL Q', 'standard', 'MRU'], ['SARL R', 'standard', 'MRU'], ['ONG S', 'exempt', 'MRU']], [[0, 220, 900000, 190], [1, 160, 700000, 120], [2, 100, 500000, 70], [0, 50, 640000, -1]], [['Tenue comptable Q', 20, 300, 260], ['Bilan R', 45, 60, 30], ['Déclarations S', 10, 40, 38]], 280000);
  light('AVO', '5501', 1300000, 400000, [['Opérateur GTA · juridique', 'non_resident', 'USD'], ['Société T', 'standard', 'MRU']], [[1, 210, 1500000, 180], [0, 150, 1200000, 110], [1, 90, 1100000, 60], [1, 40, 720000, -1]], [['Contentieux T', -6, 120, 80], ['Due diligence juridique', 35, 60, 15]], 450000);
  light('IT', '5501', 950000, 300000, [['Banque C', 'standard', 'MRU'], ['Assurance D', 'standard', 'MRU']], [[0, 180, 1800000, 150], [1, 120, 900000, 85], [0, 60, 1200000, 30], [1, 15, 180000, -1]], [['Déploiement ERP · Banque C', -2, 400, 310], ['Support annuel D', 120, 200, 90]], 300000);
  light('MAR', '5141', 650000, 300000, [['Société marocaine U', 'standard', 'MAD'], ['Client CFC V', 'non_resident', 'MAD']], [[0, 200, 420000, 170], [1, 150, 380000, 120], [0, 80, 360000, 50], [1, 18, 220000, -1]], [['Mission CFC V', 25, 120, 60], ['Audit U', 90, 200, 40]], 110000);
  // the Holding: management fees to the subsidiaries (intercompany, eliminated at consolidation)
  {
    const id = ids.HOLD;
    const b = bankAccount(ctx, id, 'Compte principal MRU', 'BMCI', 'MRU', '5501');
    opening(ctx, id, fyStart, { '5501': 600000 }, 5000000);
    const subs: [string, Id, number][] = [['BUMEX SA', ids.SA, 1200000], ['BUMEX Audit', ids.AUD, 1000000], ['BUMEX Advisory', ids.ADV, 500000]];
    subs.forEach(([name, eid, fee], i) => {
      const [s1, c] = addCustomer(ctx.s, { entityId: id, code: `G00${i + 1}`, name, regime: 'standard', country: 'MR', defaultCurrency: 'MRU', paymentTermsDays: 30, groupEntityId: eid });
      ctx.s = s1;
      const inv = invoice(ctx, id, c.id, d(20), 'MRU', [{ description: `Frais de gestion T3 ${year}`, amount: fee, category: 'ADVISORY' }]);
      if (i < 2) pay(ctx, id, inv.id, d(3), b);
    });
    monthlyCosts(ctx, id, b, 250000, 0, fyStart, today);
    for (const [title, dueDays, status] of [['Consolidation T3 · éliminations intercos', 10, 'in_progress'], ['Encaisser les frais de gestion T3 · BUMEX Advisory', 5, 'todo'], ['Consolidation T2 · figée', -40, 'done']] as [string, number, Task['status']][]) {
      const [s1] = createTask(ctx.s, { entityId: id, title, module: 'penthouse', assignee: 'S.E.', dueDate: addDays(today, dueDays), status, createdAt: addDays(today, -15), completedAt: status === 'done' ? addDays(today, -40) : undefined });
      ctx.s = s1;
    }
  }

  // statement balances = book balance + the unmatched lines (that is what makes the gap)
  for (const e of ctx.s.entities) {
    for (const b of bankSummary(ctx.s, e.id)) {
      const unmatched = ctx.s.bankTransactions.filter((t) => t.bankAccountId === b.account.id && t.status === 'unmatched').reduce((a, t) => a + t.amount, 0);
      ctx.s = { ...ctx.s, bankAccounts: ctx.s.bankAccounts.map((x) => (x.id === b.account.id ? { ...x, statementBalance: r2(b.bookBalance + unmatched), statementDate: addDays(today, -1) } : x)) };
    }
  }

  // periods: everything older than the previous month is locked; the previous month is soft-closed
  const prevMonth = addMonths(today.slice(0, 8) + '01', -1);
  for (const p of ctx.s.periods) {
    if (p.fiscalYearId !== ctx.s.fiscalYears.find((f) => f.entityId === p.entityId && f.label === String(year))!.id) continue;
    if (p.end < prevMonth) ctx.s = setPeriodStatus(ctx.s, p.id, 'locked');
    else if (p.start === prevMonth) ctx.s = setPeriodStatus(ctx.s, p.id, 'soft_closed');
  }
  // prior years stay open: they are being keyed in from the ERP. The period set-up above is not "activity".
  {
    const kept: typeof ctx.s.auditLog = [];
    const perEntity: Record<string, number> = {};
    for (const r of [...ctx.s.auditLog].reverse()) {
      if (r.table === 'period' || r.table === 'fiscal_year') continue;
      const k = r.entityId ?? '*';
      perEntity[k] = (perEntity[k] ?? 0) + 1;
      if (perEntity[k] <= 40) kept.push(r);
    }
    ctx.s = { ...ctx.s, auditLog: kept.reverse() };
  }
  return ctx.s;
}

export function entityByCode(state: State, code: string): Entity {
  return state.entities.find((e) => e.code === code)!;
}
