import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, createDraft, postEntry, reverseEntry, checkPostable, verifyChain, setPeriodStatus, setFiscalYearClosed,
  trialBalance, accountByCode, createInvoice, validateInvoice, recordPayment, createCreditNote, aging, openInvoices,
  importStatement, parseStatementCsv, suggestFor, bookByRule, bookTransfer, bankSummary, cashForecast, floorSignals, groupFigures,
  addAccount, r2, type State, DomainError, resolveTaxCode, sha256, entryHash, approveSupplierInvoice,
  taskStats, createTask, completeTask, reopenTask, alerts, recentActivity, archiveRows, rackLayout, archiveEngagement, retrieveArchive, returnArchive, destroyArchive, nextFreeSlot, archiveQueue, RACK_CAPACITY, slotKey,
} from '..';

const TODAY = '2026-10-14';
const base = buildDemo(TODAY);
const AUD = entityByCode(base, 'AUD').id;
const od = (s: State) => s.journals.find((j) => j.entityId === AUD && j.kind === 'misc')!.id;
const acc = (s: State, code: string) => accountByCode(s, AUD, code).id;

function draft(s: State, date: string, lines: { code: string; d?: number; c?: number; customerId?: string }[]) {
  return createDraft(s, { entityId: AUD, journalId: od(s), date, description: 'test', currency: 'MRU', lines: lines.map((l) => ({ accountId: acc(s, l.code), debitTxn: l.d, creditTxn: l.c, customerId: l.customerId })) });
}

describe('seed', () => {
  it('builds eight entities with charts, three fiscal years each and a populated Audit floor', () => {
    expect(base.entities).toHaveLength(8);
    expect(base.fiscalYears.filter((f) => f.entityId === AUD)).toHaveLength(3);
    expect(base.salesInvoices.filter((i) => i.entityId === AUD).length).toBeGreaterThan(15);
    const chains = Object.values(base.chains);
    expect(chains.length).toBeGreaterThan(8);
  });
  it('every posted entry balances and every chain verifies', () => {
    for (const e of base.entries.filter((x) => x.status !== 'draft')) {
      const d = r2(e.lines.reduce((a, l) => a + l.debit, 0));
      const c = r2(e.lines.reduce((a, l) => a + l.credit, 0));
      expect(d).toBe(c);
    }
    for (const key of Object.keys(base.chains)) {
      const [entityId, journalId] = key.split('|');
      const checks = verifyChain(base, entityId, journalId);
      expect(checks.every((c) => c.ok)).toBe(true);
    }
  });
  it('trial balance of BUMEX Audit sums to zero', () => {
    const tb = trialBalance(base, AUD);
    expect(r2(tb.reduce((a, r) => a + r.balance, 0))).toBe(0);
  });
  it('numbers your invoice IN2610-0116', () => {
    expect(base.salesInvoices.some((i) => i.number === 'IN2610-0116' && i.currency === 'USD' && i.totalTtc === 12000)).toBe(true);
  });
});

describe('ledger guarantees', () => {
  it('refuses an unbalanced entry', () => {
    const [s, e] = draft(base, TODAY, [{ code: '6310', d: 1000 }, { code: '560', c: 900 }]);
    expect(checkPostable(s, e.id).map((c) => c.code)).toContain('unbalanced');
    expect(() => postEntry(s, e.id)).toThrow(/Déséquilibrée/);
  });
  it('refuses a header account and a missing dimension', () => {
    const [s, e] = draft(base, TODAY, [{ code: '41', d: 100 }, { code: '4100', c: 100 }]);
    const codes = checkPostable(s, e.id).map((c) => c.code);
    expect(codes).toContain('account');
    expect(codes).toContain('dimension');
  });
  it('posts a balanced entry, numbers it gaplessly per fiscal year and seals it', () => {
    const [s1, e1] = draft(base, TODAY, [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    const [s2, p1] = postEntry(s1, e1.id);
    const [s3, e2] = draft(s2, TODAY, [{ code: '6310', d: 50 }, { code: '560', c: 50 }]);
    const [s4, p2] = postEntry(s3, e2.id);
    expect(p2.entryNo).toBe((p1.entryNo ?? 0) + 1);
    expect(p2.prevHash).toBe(p1.hash);
    expect(() => postEntry(s4, p2.id)).toThrow(/Déjà comptabilisée/);
    expect(verifyChain(s4, AUD, od(s4)).every((c) => c.ok)).toBe(true);
  });
  it('detects a tampered posted entry', () => {
    const [s1, e1] = draft(base, TODAY, [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    const [s2, p1] = postEntry(s1, e1.id);
    const tampered: State = { ...s2, entries: s2.entries.map((x) => (x.id === p1.id ? { ...x, lines: x.lines.map((l, i) => (i === 0 ? { ...l, debit: 999 } : l)) } : x)) };
    const bad = verifyChain(tampered, AUD, od(s2)).find((c) => c.entryId === p1.id);
    expect(bad?.ok).toBe(false);
  });
  it('reverses only by a mirrored entry and keeps the original immutable', () => {
    const [s1, e1] = draft(base, TODAY, [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    const [s2, p1] = postEntry(s1, e1.id);
    const [s3, rev] = reverseEntry(s2, p1.id, TODAY, 'erreur');
    const orig = s3.entries.find((x) => x.id === p1.id)!;
    expect(orig.status).toBe('reversed');
    expect(orig.reversedById).toBe(rev.id);
    expect(rev.lines[0].credit).toBe(100);
    expect(verifyChain(s3, AUD, od(s3)).every((c) => c.ok)).toBe(true);
  });
  it('refuses to post into a locked period, allows a partner into a soft-closed one', () => {
    const locked = base.periods.find((p) => p.entityId === AUD && p.status === 'locked')!;
    const [s1, e1] = draft(base, locked.start, [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    expect(() => postEntry(s1, e1.id)).toThrow(/verrouillée/);
    const soft = base.periods.find((p) => p.entityId === AUD && p.status === 'soft_closed')!;
    const [s2, e2] = draft(base, soft.start, [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    const asAccountant: State = { ...s2, session: { ...s2.session, role: 'accountant' } };
    expect(() => postEntry(asAccountant, e2.id)).toThrow(/associé/);
    expect(() => postEntry(s2, e2.id)).not.toThrow();
  });
  it('accepts a back-dated entry in the open prior year, numbered in that year', () => {
    const [s1, e1] = draft(base, '2024-06-15', [{ code: '6310', d: 100 }, { code: '560', c: 100 }]);
    const [s2, p1] = postEntry(s1, e1.id);
    expect(p1.fiscalYearId).toBe(base.fiscalYears.find((f) => f.entityId === AUD && f.label === '2024')!.id);
    expect(p1.entryNo).toBe(1);
    expect(verifyChain(s2, AUD, od(s2)).every((c) => c.ok)).toBe(true);
  });
  it('locking needs zero drafts and a partner; closing a year needs locked periods', () => {
    const open = base.periods.find((p) => p.entityId === AUD && p.status === 'open' && TODAY >= p.start && TODAY <= p.end)!;
    expect(() => setPeriodStatus(base, open.id, 'locked')).toThrow(/brouillon/);
    const fy2024 = base.fiscalYears.find((f) => f.entityId === AUD && f.label === '2024')!;
    expect(() => setFiscalYearClosed(base, fy2024.id, true)).toThrow(/non verrouillée/);
    const asManager: State = { ...base, session: { ...base.session, role: 'manager' } };
    const locked = base.periods.find((p) => p.entityId === AUD && p.status === 'locked')!;
    expect(() => setPeriodStatus(asManager, locked.id, 'open')).toThrow(/associé/);
  });
  it('statutory roots cannot be used, sub-accounts can be added', () => {
    expect(() => addAccount(base, AUD, '41', 'x', 'asset')).toThrow(/racines/);
    const [s, a] = addAccount(base, AUD, '7017121', 'Audit export', 'income');
    expect(a.isPostable).toBe(true);
    expect(s.accounts.length).toBe(base.accounts.length + 1);
  });
});

describe('sales', () => {
  const cust = (regime: string) => base.customers.find((c) => c.entityId === AUD && c.regime === regime)!;
  it('resolves tax codes by regime: 16 % standard, 0 % GTA, 0 % export', () => {
    expect(resolveTaxCode(base, AUD, cust('standard'), 'AUDIT', TODAY).rate).toBe(0.16);
    expect(resolveTaxCode(base, AUD, cust('gta'), 'AUDIT', TODAY).code).toBe('GTA-EXO');
    expect(resolveTaxCode(base, AUD, cust('non_resident'), 'AUDIT', TODAY).code).toBe('EXP-0');
  });
  it('posts a standard invoice: AR 522 000 / revenue 450 000 / VAT 72 000', () => {
    const customer = cust('standard');
    const [s1, inv] = createInvoice(base, { entityId: AUD, customerId: customer.id, date: TODAY, currency: 'MRU', lines: [{ description: 'Audit', quantity: 1, unitPrice: 450000, serviceCategory: 'AUDIT' }] });
    const [s2, v] = validateInvoice(s1, inv.id);
    const e = s2.entries.find((x) => x.id === v.journalEntryId)!;
    const by = (code: string) => e.lines.filter((l) => accountByCode(s2, AUD, code).id === l.accountId);
    // the receivable goes to the customer's auxiliary account, attached to the collective 410000
    const aux = s2.accounts.find((a) => a.id === customer.arAccountId)!;
    expect(aux.isAuxiliary).toBe(true);
    expect(aux.collectiveId).toBe(accountByCode(s2, AUD, '4100').id);
    expect(e.lines.find((l) => l.accountId === aux.id)!.debit).toBe(522000);
    expect(by('701722')[0].credit).toBe(450000);
    expect(by('4357')[0].credit).toBe(72000);
    expect(v.number).toMatch(/^IN\d{4}-\d{4}$/);
  });
  it('posts the export invoice in USD at the day rate with no VAT, on 701712', () => {
    const inv = base.salesInvoices.find((i) => i.number === 'IN2610-0116')!;
    const e = base.entries.find((x) => x.id === inv.journalEntryId)!;
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0].debit).toBe(r2(12000 * 40.15));
    expect(accountByCode(base, AUD, '701712').id).toBe(e.lines[1].accountId);
  });
  it('honours a revenue account override on a line', () => {
    const [s0, custom] = addAccount(base, AUD, '7017121', 'Audit export', 'income');
    const [s1, inv] = createInvoice(s0, { entityId: AUD, customerId: cust('non_resident').id, date: TODAY, currency: 'USD', lines: [{ description: 'Audit', quantity: 1, unitPrice: 1000, serviceCategory: 'AUDIT', revenueAccountId: custom.id }] });
    const [s2, v] = validateInvoice(s1, inv.id);
    const e = s2.entries.find((x) => x.id === v.journalEntryId)!;
    expect(e.lines[1].accountId).toBe(custom.id);
  });
  it('books a realised FX gain when a USD invoice is paid at a higher rate', () => {
    const gain = base.entries.find((x) => x.entityId === AUD && x.postingRule === 'allocation.v1')!;
    expect(gain).toBeDefined();
    const g = gain.lines.find((l) => l.accountId === accountByCode(base, AUD, '778').id)!;
    expect(g.credit).toBe(r2(18000 * (40.15 - 39.8)));
  });
  it('credit note settles the invoice and mirrors the entry', () => {
    const inv = base.salesInvoices.find((i) => i.entityId === AUD && i.status === 'posted' && i.currency === 'MRU' && i.amountPaidTxn === 0)!;
    const [s1, cn] = createCreditNote(base, inv.id, 'remise commerciale', TODAY);
    expect(cn.totalTtc).toBe(inv.totalTtc);
    expect(s1.salesInvoices.find((i) => i.id === inv.id)!.status).toBe('paid');
    const e = s1.entries.find((x) => x.id === cn.journalEntryId)!;
    const arLine = e.lines.find((l) => l.credit > 0 && l.customerId && !l.taxCodeId)!;
    expect(arLine.credit).toBe(r2((inv.totalTtc - inv.withholdingAmount) * inv.fxRate));
  });
  it('ages receivables into buckets', () => {
    const a = aging(base, AUD);
    expect(a.total).toBeGreaterThan(0);
    expect(a.overdueCount).toBeGreaterThanOrEqual(6);
    expect(a.over90Count).toBeGreaterThanOrEqual(2);
    expect(r2(a.current + a.d1to30 + a.d31to90 + a.d90plus)).toBe(a.total);
  });
  it('partial payment keeps the invoice open for the remainder', () => {
    const inv = openInvoices(base, AUD).find((o) => o.invoice.amountPaidTxn > 0)!;
    expect(inv.openTxn).toBe(r2(inv.invoice.netPayable - inv.invoice.amountPaidTxn));
  });
});

describe('bank', () => {
  const bank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
  it('parses a CSV statement and de-duplicates on re-import', () => {
    const lines = parseStatementCsv('14/10/2026;VIR CLIENT TEST;1 250,50\n2026-10-13;"FRAIS TENUE DE COMPTE";-4500');
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(1250.5);
    const [s1, n1] = importStatement(base, bank.id, lines);
    const [, n2] = importStatement(s1, bank.id, lines);
    expect(n1).toBe(2);
    expect(n2).toBe(0);
  });
  it('suggests the invoice named in the description, the fee rule, the transfer', () => {
    const txns = base.bankTransactions.filter((t) => t.bankAccountId === bank.id && t.status === 'unmatched');
    const kinds = txns.map((t) => suggestFor(base, t).kind);
    expect(kinds).toContain('invoice');
    expect(kinds).toContain('rule');
    expect(kinds).toContain('transfer');
    expect(kinds).toContain('none');
  });
  it('books a fee by rule and a transfer between two currencies, matching both lines', () => {
    const fee = base.bankTransactions.find((t) => t.bankAccountId === bank.id && /FRAIS/.test(t.description))!;
    const [s1] = bookByRule(base, fee.id, 'BANK_FEES');
    expect(s1.bankTransactions.find((t) => t.id === fee.id)!.status).toBe('booked');
    const tr = s1.bankTransactions.find((t) => t.bankAccountId === bank.id && /VIR INTERNE/.test(t.description))!;
    const usd = s1.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'USD')!;
    const [s2] = bookTransfer(s1, tr.id, usd.id);
    const matched = s2.bankTransactions.filter((t) => t.status === 'matched' && /VIR INTERNE/.test(t.description));
    expect(matched).toHaveLength(2);
  });
  it('recording a payment from a statement line matches the line and settles the invoice', () => {
    const txn = base.bankTransactions.find((t) => t.bankAccountId === bank.id && t.status === 'unmatched' && /FACT/.test(t.description))!;
    const sug = suggestFor(base, txn);
    expect(sug.kind).toBe('invoice');
    if (sug.kind !== 'invoice') return;
    const [s1] = recordPayment(base, { entityId: AUD, customerId: sug.invoice.customerId, date: txn.date, currency: 'MRU', amountTxn: txn.amount, bankAccountId: bank.id, invoiceId: sug.invoice.id, bankTransactionId: txn.id });
    expect(s1.bankTransactions.find((t) => t.id === txn.id)!.status).toBe('matched');
    expect(s1.salesInvoices.find((i) => i.id === sug.invoice.id)!.status).toBe('paid');
  });
  it('bank summary: statement minus book equals the unmatched lines', () => {
    const row = bankSummary(base, AUD).find((b) => b.account.id === bank.id)!;
    const unmatched = base.bankTransactions.filter((t) => t.bankAccountId === bank.id && t.status === 'unmatched').reduce((a, t) => a + t.amount, 0);
    expect(r2(row.statementBalance - row.bookBalance)).toBe(r2(unmatched));
  });
  it('forecasts 13 weeks', () => {
    const f = cashForecast(base, AUD, 13, 900000);
    expect(f).toHaveLength(13);
    expect(f[0].balance).toBeLessThanOrEqual(f[0].inflow + f[0].balance + 1);
  });
  it('approval: preparer cannot approve, partner threshold enforced, then posted with withholding', () => {
    const si = base.supplierInvoices.find((s) => s.entityId === AUD && s.withholdingAmount > 0 && s.status === 'pending_approval')!;
    const asPreparer: State = { ...base, session: { ...base.session, actorId: si.preparedBy, role: 'manager' } };
    expect(() => approveSupplierInvoice(asPreparer, si.id)).toThrow(/préparateur/);
    const partnerOnly = base.supplierInvoices.find((s) => s.approverRole === 'partner' && s.status === 'pending_approval')!;
    const asManager: State = { ...base, session: { ...base.session, actorId: 'u_mgr', role: 'manager' } };
    expect(() => approveSupplierInvoice(asManager, partnerOnly.id)).toThrow(/associé/);
    const s1 = approveSupplierInvoice(base, si.id);
    const posted = s1.supplierInvoices.find((s) => s.id === si.id)!;
    const e = s1.entries.find((x) => x.id === posted.journalEntryId)!;
    expect(e.lines.some((l) => l.accountId === accountByCode(s1, AUD, '433').id && l.credit === si.withholdingAmount)).toBe(true);
  });
});

describe('signals', () => {
  it('computes floor signals and group figures', () => {
    const f = floorSignals(base, AUD);
    expect(f.cash).toBeGreaterThan(0);
    expect(f.overdueCount).toBeGreaterThan(0);
    expect(f.lateEngagements).toBe(2);
    expect(f.drafts).toBe(3);
    const g = groupFigures(base);
    expect(g.floors).toHaveLength(8);
    expect(g.intercompanyRevenue).toBe(2700000 + 300000);
    expect(g.consolidatedRevenue).toBe(r2(g.sumRevenue - g.intercompanyRevenue));
  });
  it('hides floors from a scoped accountant', () => {
    const scoped: State = { ...base, session: { ...base.session, role: 'accountant', entityIds: [AUD] } };
    expect(floorSignals(scoped, AUD).visible).toBe(true);
    expect(floorSignals(scoped, entityByCode(base, 'SA').id).visible).toBe(false);
  });
});

describe('sha256', () => {
  it('matches the reference vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('errors', () => {
  it('are typed DomainErrors', () => {
    try {
      postEntry(base, 'nope');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
    }
    const posted = base.entries.find((e) => e.status === 'posted')!;
    expect(entryHash(posted, base.accounts)).toBe(posted.hash);
  });
});

describe('tasks and the command bar figures', () => {
  it('seeds tasks for every entity and computes the bar figures from them', () => {
    const g = taskStats(base, null);
    expect(g.total).toBeGreaterThan(20);
    expect(g.done + g.active).toBe(g.total);
    expect(g.progress).toBeCloseTo(g.done / g.total, 6);
    const a = taskStats(base, AUD);
    expect(a.overdue).toBeGreaterThanOrEqual(2); // the late report and the tax note
    expect(a.nextDeadlines[0].dueDate <= a.nextDeadlines[a.nextDeadlines.length - 1].dueDate).toBe(true);
    expect(a.engagementsLate).toBe(2);
    expect(a.engagementDeadlines.some((d) => d.late)).toBe(true);
    for (const e of base.entities) expect(taskStats(base, e.id).total).toBeGreaterThan(0);
  });
  it('completes and reopens a task, and the figures follow', () => {
    const before = taskStats(base, AUD);
    const t = before.overdueTasks[0];
    const [s1] = completeTask(base, t.id);
    const after = taskStats(s1, AUD);
    expect(after.done).toBe(before.done + 1);
    expect(after.overdue).toBe(before.overdue - 1);
    expect(() => completeTask(s1, t.id)).toThrow(DomainError);
    const [s2] = reopenTask(s1, t.id);
    expect(taskStats(s2, AUD).overdue).toBe(before.overdue);
    expect(recentActivity(s2, AUD, 1)[0].summary).toMatch(/rouverte/);
  });
  it('creates a task linked to an engagement and refuses an empty title', () => {
    const eng = base.engagements.find((e) => e.entityId === AUD && e.status === 'active')!;
    const [s1, t] = createTask(base, { entityId: AUD, title: 'Confirmations', module: 'missions', assignee: 'M.K.', dueDate: TODAY, engagementId: eng.id });
    expect(s1.tasks.find((x) => x.id === t.id)?.engagementId).toBe(eng.id);
    expect(() => createTask(base, { entityId: AUD, title: '  ', module: 'missions', assignee: 'M.K.', dueDate: TODAY })).toThrow(/titre/);
  });
  it('lists alerts that point at the room where they are handled', () => {
    const a = alerts(base, AUD);
    expect(a.some((x) => x.code === 'overdue' && x.module === 'clients')).toBe(true);
    expect(a.some((x) => x.code === 'unmatched' && x.module === 'bank')).toBe(true);
    expect(a.some((x) => x.code === 'archive' && x.module === 'archives')).toBe(true);
    expect(a[0].kind).not.toBe('info');
  });
});

describe('archive rack', () => {
  it('places every archived engagement of Audit on a distinct slot with a gapless yearly reference', () => {
    const rows = archiveRows(base, AUD, { status: 'all' });
    expect(rows.length).toBeGreaterThanOrEqual(24);
    const slots = new Set(rows.map((r) => slotKey(r.record.bay, r.record.shelf, r.record.slot)));
    expect(slots.size).toBe(rows.length);
    const refs = rows.map((r) => r.record.reference);
    expect(refs.every((r) => /^ARC-\d{4}-\d{4}$/.test(r))).toBe(true);
    const byYear = new Map<string, number[]>();
    for (const r of refs) { const [, y, n] = r.split('-'); byYear.set(y, [...(byYear.get(y) ?? []), Number(n)]); }
    for (const ns of byYear.values()) expect([...ns].sort((a, b) => a - b)).toEqual(ns.map((_, i) => i + 1));
    expect(rows.every((r) => r.engagement.status === 'completed' && r.engagement.archiveId === r.record.id)).toBe(true);
    expect(rackLayout(base, AUD).used).toBe(rows.length);
  });
  it('searches by client, code or reference and filters by status', () => {
    expect(archiveRows(base, AUD, { q: 'banque c' }).length).toBeGreaterThanOrEqual(3);
    expect(archiveRows(base, AUD, { q: 'ARC-' }).length).toBeGreaterThan(10);
    expect(archiveRows(base, AUD, { status: 'retrieved' })).toHaveLength(1);
    expect(archiveRows(base, AUD, { status: 'pending_destruction' })).toHaveLength(1);
    expect(archiveRows(base, AUD, { kind: 'binder' }).every((r) => r.record.kind === 'binder')).toBe(true);
  });
  it('archives a completed engagement on the next free slot, refuses an active one and a double archive', () => {
    const queue = archiveQueue(base, AUD);
    expect(queue.length).toBe(1);
    const free = nextFreeSlot(base, AUD)!;
    const [s1, rec] = archiveEngagement(base, { engagementId: queue[0].id, kind: 'box', boxCount: 2 });
    expect([rec.bay, rec.shelf, rec.slot]).toEqual([free.bay, free.shelf, free.slot]);
    expect(rec.reference.startsWith(`ARC-${TODAY.slice(0, 4)}-`)).toBe(true);
    expect(archiveQueue(s1, AUD)).toHaveLength(0);
    expect(() => archiveEngagement(s1, { engagementId: queue[0].id })).toThrow(/déjà/);
    const active = base.engagements.find((e) => e.entityId === AUD && e.status === 'active')!;
    expect(() => archiveEngagement(base, { engagementId: active.id })).toThrow(/terminée/);
  });
  it('takes a box out, puts it back, and only destroys past retention by a partner', () => {
    const row = archiveRows(base, AUD, { status: 'archived' })[0];
    const [s1, out] = retrieveArchive(base, row.record.id, 'M.K.');
    expect(out.status).toBe('retrieved');
    expect(out.retrievedBy).toBe('M.K.');
    expect(() => retrieveArchive(s1, row.record.id)).toThrow(DomainError);
    const [s2, back] = returnArchive(s1, row.record.id);
    expect(back.status).toBe('archived');
    expect(() => destroyArchive(s2, row.record.id)).toThrow(/Conservation/);
    const old = archiveRows(base, AUD, { status: 'pending_destruction' })[0];
    const [s3, gone] = destroyArchive(base, old.record.id);
    expect(gone.status).toBe('destroyed');
    expect(s3.engagements.find((e) => e.id === old.engagement.id)?.archiveId).toBeUndefined();
    expect(nextFreeSlot(s3, AUD)).toEqual({ bay: old.record.bay, shelf: old.record.shelf, slot: old.record.slot });
    const staff = { ...base, session: { ...base.session, role: 'manager' as const } };
    expect(() => destroyArchive(staff, old.record.id)).toThrow(/associé/);
    expect(RACK_CAPACITY).toBe(60);
  });
});
