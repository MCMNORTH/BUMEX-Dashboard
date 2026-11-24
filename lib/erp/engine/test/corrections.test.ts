import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, accountByCode, mapped, createInvoice, postInvoice, recordPayment, letterPayment, unletterAllocation, paymentRemainder, unletteredPayments,
  settlementCandidates, settleInvoiceDifference, settleOverpayment, keepDifferenceOpen, importStatement, bookTransfer, bookByRule, unmatchStatementLine, requestDeletion,
  setFxRate, fxRevaluation, createSupplierInvoice, approveSupplierInvoice, setAccountingOptions, setAccountMapping, createFiscalYear, addAssetCategory, addAsset,
  depreciationSchedule, isLandCategory, addTaxCode, r2, sum, DomainError, type State, type Id,
} from '..';

// [bumex-one] Sidaty's corrections of 2026-11-23 ("Vanguard — corrections restantes"), each with the test he asked for.
const TODAY = '2026-10-14';
const base = buildDemo(TODAY);
const AUD = entityByCode(base, 'AUD').id;
const code = (s: State, c: string) => accountByCode(s, AUD, c).id;
const exo = base.taxCodes.find((t) => t.entityId === AUD && t.code === 'EXO')!.id;
const mruBank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
const eurBank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'EUR')!;
const cash = base.bankAccounts.find((b) => b.entityId === AUD && b.isCash)!;
const client = base.customers.find((c) => c.entityId === AUD && c.name === 'Hôtel M')!;
const asRole = (s: State, role: State['session']['role'], actorId = s.session.actorId): State => ({ ...s, session: { ...s.session, role, actorId } });
const refused = (f: () => unknown, pattern: RegExp) => {
  try { f(); } catch (err) { expect(err).toBeInstanceOf(DomainError); expect((err as Error).message).toMatch(pattern); return; }
  throw new Error('not refused');
};
// an invoice without VAT, posted: its net is its amount
function invoice(s: State, amount: number, date = '2026-10-01'): [State, Id] {
  const [s1, inv] = createInvoice(s, { entityId: AUD, customerId: client.id, date, currency: 'MRU', lines: [{ description: 'Mission', quantity: 1, unitPrice: amount, serviceCategory: 'AUDIT', taxCodeId: exo }] });
  const [s2, posted] = postInvoice(s1, inv.id);
  return [s2, posted.id];
}
function lines(s: State, bankId: Id, rows: { amount: number; description: string; date?: string }[]) {
  const [s1] = importStatement(s, bankId, rows.map((r) => ({ date: r.date ?? '2026-10-10', amount: r.amount, description: r.description })));
  return [s1, rows.map((r) => s1.bankTransactions.find((t) => t.bankAccountId === bankId && t.description === r.description)!.id)] as const;
}
const inv = (s: State, id: Id) => s.salesInvoices.find((i) => i.id === id)!;
const entry = (s: State, id: Id) => s.entries.find((e) => e.id === id)!;

describe('2. lettering receipts', () => {
  it('a transfer of 1 000 spread over invoices of 600 and 400 settles both, one statement line matched', () => {
    const [s1, a] = invoice(base, 600);
    const [s2, b] = invoice(s1, 400);
    const [s3, [line]] = lines(s2, mruBank.id, [{ amount: 1000, description: 'VIR HOTEL M FACTURES' }]);
    const [s4, pay] = recordPayment(s3, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 1000, bankAccountId: mruBank.id, bankTransactionId: line, allocations: [{ invoiceId: a, amountTxn: 600 }, { invoiceId: b, amountTxn: 400 }] });
    expect([inv(s4, a).status, inv(s4, b).status]).toEqual(['paid', 'paid']);
    expect(s4.allocations.filter((x) => x.paymentId === pay.id).map((x) => x.amountTxn)).toEqual([600, 400]);
    expect(s4.bankTransactions.find((t) => t.id === line)).toMatchObject({ status: 'matched', journalEntryId: pay.journalEntryId });
    expect(paymentRemainder(s4, pay)).toBe(0);
  });

  it('a receipt of 500 entered without an invoice is lettered to an invoice of 500, then unlettered with its reason', () => {
    const [s1, a] = invoice(base, 500);
    const [s2, pay] = recordPayment(s1, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 500, bankAccountId: mruBank.id });
    expect(unletteredPayments(s2, AUD, client.id).map((x) => [x.payment.id, x.remainder])).toEqual([[pay.id, 500]]);
    const [s3, [alloc]] = letterPayment(s2, pay.id, [{ invoiceId: a, amountTxn: 500 }]);
    expect(inv(s3, a).status).toBe('paid');
    expect(alloc.label).toContain(inv(s3, a).number!);
    expect(unletteredPayments(s3, AUD, client.id)).toHaveLength(0);
    const s4 = unletterAllocation(s3, alloc.id, 'mauvaise facture');
    expect(inv(s4, a)).toMatchObject({ status: 'posted', amountPaidTxn: 0 });
    expect(paymentRemainder(s4, s4.customerPayments.find((p) => p.id === pay.id)!)).toBe(500);
    expect(s4.deletionRequests.at(-1)).toMatchObject({ table: 'allocation', rowId: alloc.id, reason: 'mauvaise facture', status: 'approved' });
  });

  it('refuses another client’s invoice, more than the receipt has left, and an invoice twice', () => {
    const other = base.customers.find((c) => c.entityId === AUD && c.name === 'Pharmacie N')!;
    const [s1, a] = invoice(base, 500);
    const [s2, foreign] = createInvoice(s1, { entityId: AUD, customerId: other.id, date: '2026-10-01', currency: 'MRU', lines: [{ description: 'x', quantity: 1, unitPrice: 300, serviceCategory: 'AUDIT', taxCodeId: exo }] });
    const [s3] = postInvoice(s2, foreign.id);
    const [s4, pay] = recordPayment(s3, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 400, bankAccountId: mruBank.id });
    refused(() => letterPayment(s4, pay.id, [{ invoiceId: foreign.id, amountTxn: 300 }]), /autre client/);
    refused(() => letterPayment(s4, pay.id, [{ invoiceId: a, amountTxn: 450 }]), /dépasse le reste/);
    refused(() => letterPayment(s4, pay.id, [{ invoiceId: a, amountTxn: 100 }, { invoiceId: a, amountTxn: 100 }]), /deux fois/);
  });
});

describe('3 and 4.3. internal transfers', () => {
  it("a currency sale (Sidaty's 18/04/2024, here in October 2026): EUR out at the table rate, MRU in for the real amount, the transit account at zero, the difference a loss, both lines matched", () => {
    const [s0] = setFxRate(base, { date: '2026-10-09', from: 'EUR', to: 'MRU', rate: 42.2256, source: 'BCM' });
    const [s1, [eurLine]] = lines(s0, eurBank.id, [{ amount: -11664.19, description: 'CESSION DEVISES EUR' }]);
    const [s2, [mruLine]] = lines(s1, mruBank.id, [{ amount: 478931.64, description: 'CESSION DEVISES CONTREVALEUR' }]);
    const before = fxRevaluation(s2, AUD, s2.fiscalYears.find((f) => f.entityId === AUD && f.label === '2026')!.id).rows.find((r) => r.kind === 'bank' && r.currency === 'EUR')!;
    const [s3] = bookTransfer(s2, eurLine, mruBank.id, { counterpartTxnId: mruLine });
    const e1 = entry(s3, s3.bankTransactions.find((t) => t.id === eurLine)!.journalEntryId!);
    const e2 = entry(s3, s3.bankTransactions.find((t) => t.id === mruLine)!.journalEntryId!);
    // each in its own currency, the EUR at the table's rate
    expect([e1.currency, e1.fxRate, e2.currency]).toEqual(['EUR', 42.2256, 'MRU']);
    expect(e1.lines.find((l) => l.accountId === eurBank.glAccountId)).toMatchObject({ creditTxn: 11664.19, currency: 'EUR', bankAccountId: eurBank.id });
    expect(e2.lines.find((l) => l.accountId === mruBank.glAccountId)).toMatchObject({ debitTxn: 478931.64, bankAccountId: mruBank.id });
    // the transit account back at zero, the difference (about 13 600 MRU) a loss on 678
    const transit = mapped(s3, AUD, 'TRANSFER_TRANSIT').id;
    expect(r2(sum([...e1.lines, ...e2.lines].filter((l) => l.accountId === transit).map((l) => l.debit - l.credit)))).toBe(0);
    const value = r2(11664.19 * 42.2256);
    expect(e2.lines.find((l) => l.accountId === mapped(s3, AUD, 'FX_LOSS').id)!.debit).toBe(r2(value - 478931.64));
    expect(value - 478931.64).toBeGreaterThan(13000);
    expect(s3.bankTransactions.filter((t) => t.id === eurLine || t.id === mruLine).map((t) => t.status)).toEqual(['matched', 'matched']);
    // the revaluation now sees the EUR leave the account
    const after = fxRevaluation(s3, AUD, s3.fiscalYears.find((f) => f.entityId === AUD && f.label === '2026')!.id).rows.find((r) => r.kind === 'bank' && r.currency === 'EUR')!;
    expect(r2(before.amountTxn - after.amountTxn)).toBe(11664.19);
    // the difference as a currency-sale commission instead, when chosen
    const [s4] = bookTransfer(s2, eurLine, mruBank.id, { counterpartTxnId: mruLine, difference: 'fee' });
    const fee = entry(s4, s4.bankTransactions.find((t) => t.id === mruLine)!.journalEntryId!);
    expect(fee.lines.find((l) => l.accountId === mapped(s4, AUD, 'FX_SALE_FEE').id)!.debit).toBe(r2(value - 478931.64));
  });

  it("a cash deposit (Sidaty's 37 000 MRU of 16/08/2024): the bank's incoming line, from the cash desk — bank +, cash −, matched", () => {
    const [s1, [line]] = lines(base, mruBank.id, [{ amount: 37000, description: 'VERSEMENT ESPECES' }]);
    const [s2, entryId] = bookTransfer(s1, line, cash.id);
    const e = entry(s2, entryId);
    expect(e.lines.find((l) => l.accountId === mruBank.glAccountId)).toMatchObject({ debit: 37000, bankAccountId: mruBank.id });
    expect(e.lines.find((l) => l.accountId === cash.glAccountId)).toMatchObject({ credit: 37000, bankAccountId: cash.id });
    expect(s2.bankTransactions.find((t) => t.id === line)!.status).toBe('matched');
  });

  it('the same currency with different amounts is refused; the other line must go the other way', () => {
    const [s1, [out, other]] = lines(base, mruBank.id, [{ amount: -5000, description: 'VIR VERS CAISSE' }, { amount: -5000, description: 'AUTRE SORTIE' }]);
    refused(() => bookTransfer(s1, out, cash.id, { amount: 4000 }), /Montants différents/);
    const usd = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'USD')!;
    const [s2, [usdOut]] = lines(s1, usd.id, [{ amount: -100, description: 'SORTIE USD' }]);
    refused(() => bookTransfer(s2, out, usd.id, { counterpartTxnId: usdOut }), /sens inverse/);
    void other;
  });
});

describe('4.2. un-matching and deleting a statement line', () => {
  it('a fee booked by rule is un-matched (its entry reversed), then the line deleted with its reason; the statement balance loses it', () => {
    const [s1, [line]] = lines(base, mruBank.id, [{ amount: -2500, description: 'FRAIS TENUE DE COMPTE NOV' }]);
    const [s2, entryId] = bookByRule(s1, line, 'BANK_FEES');
    refused(() => requestDeletion(s2, { table: 'bank_transaction', rowId: line, label: 'frais', reason: 'import en double' }), /dérapprocher/);
    const s3 = unmatchStatementLine(s2, line, 'saisie en sortie au lieu d’entrée');
    expect(entry(s3, entryId).status).toBe('reversed');
    expect(s3.entries.find((e) => e.reversalOfId === entryId)!.description).toContain('saisie en sortie');
    expect(s3.bankTransactions.find((t) => t.id === line)).toMatchObject({ status: 'unmatched', journalEntryId: undefined });
    const balance = s3.bankAccounts.find((b) => b.id === mruBank.id)!.statementBalance;
    const done = requestDeletion(s3, { table: 'bank_transaction', rowId: line, label: 'FRAIS TENUE DE COMPTE NOV', reason: 'import en double', entityId: AUD });
    expect(done.executed).toBe(true);
    expect(done.state.bankTransactions.some((t) => t.id === line)).toBe(false);
    expect(done.state.bankAccounts.find((b) => b.id === mruBank.id)!.statementBalance).toBe(r2(balance + 2500));
    // a direct deletion is kept with its reason, as decided by whoever did it
    expect(done.state.deletionRequests.at(-1)).toMatchObject({ table: 'bank_transaction', rowId: line, reason: 'import en double', status: 'approved' });
  });

  it('un-matching one line of a transfer un-matches the other and reverses both entries', () => {
    const [s0] = setFxRate(base, { date: '2026-10-09', from: 'EUR', to: 'MRU', rate: 42.2256, source: 'BCM' });
    const [s1, [eurLine]] = lines(s0, eurBank.id, [{ amount: -1000, description: 'CESSION EUR' }]);
    const [s2, [mruLine]] = lines(s1, mruBank.id, [{ amount: 42000, description: 'CESSION MRU' }]);
    const [s3] = bookTransfer(s2, eurLine, mruBank.id, { counterpartTxnId: mruLine });
    const ids = [eurLine, mruLine].map((id) => s3.bankTransactions.find((t) => t.id === id)!.journalEntryId!);
    const s4 = unmatchStatementLine(s3, mruLine, 'mauvais compte');
    expect(s4.bankTransactions.filter((t) => t.id === eurLine || t.id === mruLine).map((t) => t.status)).toEqual(['unmatched', 'unmatched']);
    expect(ids.map((id) => entry(s4, id).status)).toEqual(['reversed', 'reversed']);
  });
});

describe('4.1. small settlement differences, the administrator\u2019s decision', () => {
  it('an invoice left open by 0,01 is proposed; only the administrator settles it as a loss, or keeps it open', () => {
    const [s1, a] = invoice(base, 1000);
    const [s2] = recordPayment(s1, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 999.99, bankAccountId: mruBank.id, invoiceId: a });
    expect(inv(s2, a).status).toBe('posted'); // nothing automatic
    const proposed = settlementCandidates(s2, AUD).find((c) => c.kind === 'invoice' && c.invoice.id === a)!;
    expect(proposed).toMatchObject({ amount: 0.01, functional: 0.01 });
    refused(() => settleInvoiceDifference(asRole(s2, 'accountant'), a), /administrateur/);
    const [s3, entryId] = settleInvoiceDifference(s2, a, { date: '2026-10-10' });
    expect(inv(s3, a)).toMatchObject({ status: 'paid', writeOffTxn: 0.01, writeOffEntryId: entryId });
    expect(entry(s3, entryId).lines.find((l) => l.accountId === mapped(s3, AUD, 'SETTLEMENT_LOSS').id)!.debit).toBe(0.01);
    expect(settlementCandidates(s3, AUD).some((c) => c.kind === 'invoice' && c.invoice.id === a)).toBe(false);
    // kept open instead: it leaves the list
    const s4 = keepDifferenceOpen(s2, 'invoice', a);
    expect(settlementCandidates(s4, AUD).some((c) => c.kind === 'invoice' && c.invoice.id === a)).toBe(false);
    expect(inv(s4, a).status).toBe('posted');
  });

  it('a client who paid 300 too much: proposed, taken to income by the administrator; beyond the threshold, a reason and the account chosen', () => {
    const [s1, a] = invoice(base, 10000);
    const [s2, pay] = recordPayment(s1, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 10300, bankAccountId: mruBank.id, invoiceId: a });
    expect(settlementCandidates(s2, AUD).find((c) => c.kind === 'payment' && c.payment.id === pay.id)).toMatchObject({ amount: 300 });
    const [s3, entryId] = settleOverpayment(s2, pay.id, '2026-10-10');
    expect(entry(s3, entryId).lines.find((l) => l.accountId === mapped(s3, AUD, 'SETTLEMENT_GAIN').id)!.credit).toBe(300);
    expect(paymentRemainder(s3, s3.customerPayments.find((p) => p.id === pay.id)!)).toBe(0);
    // Tullow: 70 USD kept by the bank, beyond 500 MRU — a reason, to the bank fees
    const [s4, b] = invoice(base, 30000);
    const [s5] = recordPayment(s4, { entityId: AUD, customerId: client.id, date: '2026-10-10', currency: 'MRU', amountTxn: 27000, bankAccountId: mruBank.id, invoiceId: b });
    refused(() => settleInvoiceDifference(s5, b), /motif/);
    const [s6, feeId] = settleInvoiceDifference(s5, b, { reason: 'frais retenus par la banque', accountId: mapped(s5, AUD, 'BANK_FEES').id, date: '2026-10-10' });
    expect(entry(s6, feeId).lines.find((l) => l.accountId === mapped(s6, AUD, 'BANK_FEES').id)!.debit).toBe(3000);
    expect(inv(s6, b).status).toBe('paid');
  });
});

describe('5. settings and deletions', () => {
  it('5.1 the preparer approves their own supplier invoice only where the entity allows it', () => {
    const supplier = base.suppliers.find((x) => x.entityId === AUD)!;
    const [s1, si] = createSupplierInvoice(base, { entityId: AUD, supplierId: supplier.id, supplierRef: 'F-1', date: '2026-10-10', currency: 'MRU', totalHt: 600000, taxCodeId: null, expenseAccountId: code(base, '638000'), description: 'Loyer' });
    expect(si.status).toBe('pending_approval');
    refused(() => approveSupplierInvoice(s1, si.id), /préparateur/);
    refused(() => setAccountingOptions(asRole(s1, 'accountant'), AUD, { preparerMayApprove: true }), /règles de gestion/);
    const s2 = setAccountingOptions(s1, AUD, { preparerMayApprove: true });
    expect(approveSupplierInvoice(s2, si.id).supplierInvoices.find((x) => x.id === si.id)!.status).toBe('posted');
  });

  it('5.3 the administrator deletes an empty last fiscal year, never one with entries or followed by another', () => {
    const s1 = createFiscalYear(base, AUD, 2027);
    const fy27 = s1.fiscalYears.find((f) => f.entityId === AUD && f.label === '2027')!;
    const fy26 = s1.fiscalYears.find((f) => f.entityId === AUD && f.label === '2026')!;
    refused(() => requestDeletion(s1, { table: 'fiscal_year', rowId: fy26.id, label: '2026', reason: 'créé trop tôt' }), /exercice suivant/);
    refused(() => requestDeletion(asRole(s1, 'partner'), { table: 'fiscal_year', rowId: fy27.id, label: '2027', reason: 'créé trop tôt' }), /administrateur/);
    const done = requestDeletion(s1, { table: 'fiscal_year', rowId: fy27.id, label: '2027', reason: 'créé trop tôt', entityId: AUD });
    expect(done.state.fiscalYears.some((f) => f.id === fy27.id)).toBe(false);
    expect(done.state.periods.some((p) => p.fiscalYearId === fy27.id)).toBe(false);
    refused(() => requestDeletion(done.state, { table: 'fiscal_year', rowId: fy26.id, label: '2026', reason: 'créé trop tôt' }), /écritures/);
  });

  it('5.4 a non-depreciable category: no depreciation, no residual value asked, the land stays at cost', () => {
    const asset = code(base, '2183');
    const [s1, cat] = addAssetCategory(base, { entityId: AUD, code: 'FONCIER', name: 'Foncier', lifeMonths: 0, method: 'linear', assetAccountId: asset, nonDepreciable: true });
    expect(isLandCategory(cat)).toBe(true);
    const [, land] = addAsset(s1, { entityId: AUD, categoryId: cat.id, name: 'Terrain Tevragh Zeina', cost: 1500000, acquisitionDate: '2026-10-01', location: 'Nouakchott' });
    expect(land.residual).toBe(0);
    expect(depreciationSchedule(land, cat)).toEqual([]);
  });

  it('an account that cannot go says why', () => {
    const [s1] = addTaxCode(base, { entityId: AUD, code: 'TEST-0', nameFr: 'Test', kind: 'vat', rate: 0, collectedAccountId: code(base, '638000') });
    refused(() => requestDeletion(s1, { table: 'account', rowId: code(s1, '638000'), label: '638000', reason: 'créé par erreur' }), /paramétrage SETTLEMENT_LOSS|code taxe/);
    refused(() => requestDeletion(base, { table: 'account', rowId: mruBank.glAccountId, label: 'banque', reason: 'créé par erreur' }), /mouvementé|compte bancaire/);
  });

  it('the four accounts of the corrections are chosen per entity', () => {
    const s1 = setAccountMapping(base, AUD, 'SETTLEMENT_LOSS', code(base, '635000'));
    expect(mapped(s1, AUD, 'SETTLEMENT_LOSS').id).toBe(code(base, '635000'));
    refused(() => setAccountMapping(asRole(base, 'accountant'), AUD, 'SETTLEMENT_LOSS', code(base, '635000')), /paramétrage des comptes/);
  });
});
