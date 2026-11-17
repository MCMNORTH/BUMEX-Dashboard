import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, fxRate, setFxRate, importFxRates, deleteFxRate, fxRateUsed, createInvoice, postInvoice, recordPayment, mapped, accountByCode,
  fxRevaluation, postFxRevaluation, createFiscalYear, trialBalance, r2, arAccountFor,
  DomainError, type State, type Currency,
} from '..';

// [bumex-one] The exchange rates (2026-11-17): entered, imported, deleted; the lookup; the realised difference.
const TODAY = '2026-10-14';
const base = buildDemo(TODAY);
const AUD = entityByCode(base, 'AUD').id;

describe('exchange rates', () => {
  it('adds a day’s rate, replaces it on the same day, and checks what is entered', () => {
    const [s1, r] = setFxRate(base, { date: '2026-05-29', from: 'EUR', to: 'MRU', rate: 40.9, source: 'BCM' });
    expect(r).toMatchObject({ date: '2026-05-29', from: 'EUR', to: 'MRU', rate: 40.9, source: 'BCM' });
    const [s2] = setFxRate(s1, { date: '2026-05-29', from: 'eur' as Currency, to: 'mru' as Currency, rate: 40.95, source: 'BCM' }); // a file's lower case
    expect(s2.fxRates.filter((x) => x.date === '2026-05-29' && x.from === 'EUR')).toEqual([expect.objectContaining({ rate: 40.95 })]);
    expect(s2.auditLog.at(-1)!.summary).toMatch(/remplacé/);
    for (const bad of [
      { date: '2026-05-29', from: 'EUR', to: 'MRU', rate: 0 },
      { date: '2026-05-29', from: 'EUR', to: 'MRU', rate: -1 },
      { date: '2026-05-29', from: 'MRU', to: 'MRU', rate: 1 },
      { date: '2026-02-30', from: 'EUR', to: 'MRU', rate: 41 },
      { date: '2026-05-29', from: 'MRU', to: 'EUR', rate: 0.024 }, // EUR is no entity's own currency
    ] as const) expect(() => setFxRate(base, bad), JSON.stringify(bad)).toThrow(DomainError);
    const staff: State = { ...base, session: { ...base.session, role: 'staff' } };
    expect(() => setFxRate(staff, { date: '2026-05-29', from: 'EUR', to: 'MRU', rate: 40.9 })).toThrow(/rôle/);
  });

  it('imports many rates at once: one per pair and day, all checked first, counted', () => {
    const rows = [
      { date: '2024-05-20', from: 'EUR', to: 'MRU', rate: 41 },
      { date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.9 },
      { date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.9 }, // given twice, the same: one
      { date: '2024-05-29', from: 'USD', to: 'MRU', rate: 39.6 },
    ] as const;
    const [s1, out] = importFxRates(base, [...rows], 'BCM');
    expect(out).toEqual({ added: 3, replaced: 0, unchanged: 0, from: '2024-05-20', to: '2024-05-29' });
    expect(s1.fxRates.filter((r) => r.date.startsWith('2024-05'))).toHaveLength(3);
    const [, again] = importFxRates(s1, [{ date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.8 }, { date: '2024-05-20', from: 'EUR', to: 'MRU', rate: 41 }], 'BCM');
    expect(again).toMatchObject({ added: 0, replaced: 1, unchanged: 1 });
    expect(() => importFxRates(base, [{ date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.9 }, { date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 41 }])).toThrow(/Deux taux/);
    expect(() => importFxRates(base, [{ date: '2024-05-29', from: 'EUR', to: 'MRU', rate: 40.9 }, { date: '2024-05-30', from: 'EUR', to: 'MRU', rate: 0 }])).toThrow(DomainError);
  });

  it('looks up the latest rate on or before the date, and a pair the other way round', () => {
    const [s1] = importFxRates(base, [{ date: '2026-05-20', from: 'EUR', to: 'MRU', rate: 41 }, { date: '2026-05-29', from: 'EUR', to: 'MRU', rate: 40.9 }], 'BCM');
    expect(fxRate(s1, 'EUR', 'MRU', '2026-05-29')).toBe(40.9);
    expect(fxRate(s1, 'EUR', 'MRU', '2026-05-30')).toBe(40.9); // none on the 30th: the 29th's
    expect(fxRate(s1, 'EUR', 'MRU', '2026-05-25')).toBe(41);
    expect(fxRate(s1, 'MRU', 'EUR', '2026-05-30')).toBeCloseTo(1 / 40.9, 12); // only EUR→MRU entered
  });

  it('values an invoice at its own rate and books the realised difference on the receipt (the PPS case)', () => {
    const [s0] = importFxRates(base, [{ date: '2026-10-05', from: 'EUR', to: 'MRU', rate: 41 }, { date: '2026-10-09', from: 'EUR', to: 'MRU', rate: 40.9 }], 'BCM');
    const customer = s0.customers.find((c) => c.entityId === AUD && c.regime === 'non_resident')!;
    const eur = s0.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'EUR' && !b.isCash)!;
    const [s1, inv] = createInvoice(s0, { entityId: AUD, customerId: customer.id, date: '2026-10-05', currency: 'EUR', fxRate: 41, withholdingCodeId: null, lines: [{ description: 'Mission PPS', quantity: 1, unitPrice: 925841.82, serviceCategory: 'AUDIT' }] });
    const [s2, posted] = postInvoice(s1, inv.id);
    const entry = s2.entries.find((e) => e.id === posted.journalEntryId)!;
    expect(entry.lines.find((l) => l.debit > 0)!.debit).toBe(37959514.62);
    const [s3] = recordPayment(s2, { entityId: AUD, customerId: customer.id, date: '2026-10-09', currency: 'EUR', amountTxn: 898644.23, bankAccountId: eur.id, invoiceId: inv.id });
    const fx = s3.entries.find((e) => e.postingRule === 'allocation.v1' && e.date === '2026-10-09' && e.lines.some((l) => l.description.includes(posted.number!)))!;
    const loss = fx.lines.find((l) => l.accountId === mapped(s3, AUD, 'FX_LOSS').id)!;
    expect(loss.debit).toBe(89864.42); // 898 644,23 € × (41,0 − 40,9)
    expect(accountByCode(s3, AUD, '678').id).toBe(loss.accountId);
    // the receipt's rate served a posted entry: it can no longer be deleted; a rate no entry used can
    const r29 = s3.fxRates.find((r) => r.date === '2026-10-09' && r.from === 'EUR')!;
    expect(fxRateUsed(s3, r29)).toBe(true);
    expect(() => deleteFxRate(s3, r29)).toThrow(/comptabilisée/);
    const [s4] = setFxRate(s3, { date: '2026-10-07', from: 'EUR', to: 'MRU', rate: 40.95, source: 'BCM' });
    const s5 = deleteFxRate(s4, { date: '2026-10-07', from: 'EUR', to: 'MRU' });
    expect(s5.fxRates.some((r) => r.date === '2026-10-07')).toBe(false);
  });

});

describe('year-end revaluation', () => {
  // an EUR invoice of 10 000 € at 41.0, 4 000 € received at 40.9; the 31/12 rate 42.0; the next year exists
  const setup = () => {
    let s = createFiscalYear(base, AUD, 2027);
    [s] = importFxRates(s, [{ date: '2026-10-05', from: 'EUR', to: 'MRU', rate: 41 }, { date: '2026-10-09', from: 'EUR', to: 'MRU', rate: 40.9 }, { date: '2026-12-31', from: 'EUR', to: 'MRU', rate: 42 }, { date: '2026-12-31', from: 'USD', to: 'MRU', rate: 40 }], 'BCM');
    const customer = s.customers.find((c) => c.entityId === AUD && c.regime === 'non_resident')!;
    const eur = s.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'EUR' && !b.isCash)!;
    const [s1, inv] = createInvoice(s, { entityId: AUD, customerId: customer.id, date: '2026-10-05', currency: 'EUR', fxRate: 41, withholdingCodeId: null, lines: [{ description: 'Mission', quantity: 1, unitPrice: 10000, serviceCategory: 'AUDIT' }] });
    const [s2] = postInvoice(s1, inv.id);
    const [s3] = recordPayment(s2, { entityId: AUD, customerId: customer.id, date: '2026-10-09', currency: 'EUR', amountTxn: 4000, bankAccountId: eur.id, invoiceId: inv.id });
    return { s: s3, inv, customer, eur, fy: s3.fiscalYears.find((f) => f.entityId === AUD && f.label === '2026')! };
  };

  it('values the open invoices and the foreign-currency accounts at the 31/12 rate (a preview, nothing posted)', () => {
    const { s, inv, eur, fy } = setup();
    const rv = fxRevaluation(s, AUD, fy.id);
    expect(rv).toMatchObject({ date: '2026-12-31', reversalDate: '2027-01-01', method: 'conversion_accounts', missing: [], done: false });
    expect(rv.rows.find((r) => r.kind === 'receivable' && r.label.startsWith(s.salesInvoices.find((i) => i.id === inv.id)!.number!))).toMatchObject({ currency: 'EUR', amountTxn: 6000, rate: 42, book: 246000, revalued: 252000, diff: 6000 });
    const bank = rv.rows.find((r) => r.kind === 'bank' && r.accountId === eur.glAccountId)!;
    expect(bank.rate).toBe(42);
    expect(bank.diff).toBe(r2(bank.amountTxn * 42 - bank.book));
    for (const r of rv.rows) expect(r.diff).toBe(r2(r.revalued - r.book));
  });

  it('posts the bank differences to 778 / 678, the open invoices’ to 484 / 485 reversed on 1 January; once', () => {
    const { s, inv, customer, fy } = setup();
    const before = fxRevaluation(s, AUD, fy.id);
    const [s1, after] = postFxRevaluation(s, AUD, fy.id);
    expect(after.done).toBe(true);
    const mine = s1.entries.filter((e) => e.sourceType === 'fx_revaluation' && e.sourceId === fy.id);
    const bankEntry = mine.find((e) => e.postingRule === 'fx_revaluation.v1')!;
    const banks = before.rows.filter((r) => r.kind === 'bank' && r.diff);
    const net = (e: typeof bankEntry, code: string) => r2(e.lines.filter((l) => l.accountId === accountByCode(s1, AUD, code).id).reduce((a, l) => a + l.credit - l.debit, 0));
    // credit − debit on 778 and 678 together = the accounts' differences (a gain credited to 778, a loss debited to 678)
    expect(r2(net(bankEntry, '778') + net(bankEntry, '678'))).toBe(r2(banks.reduce((a, r) => a + r.diff, 0)));
    for (const r of banks) expect(bankEntry.lines.some((l) => l.accountId === accountByCode(s1, AUD, r.diff > 0 ? '778' : '678').id)).toBe(true);
    const [translation, reversal] = mine.filter((e) => e.postingRule === 'fx_translation.v1').sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(translation.date).toBe('2026-12-31');
    const ar = arAccountFor(s1, AUD, customer).id;
    expect(translation.lines.find((l) => l.accountId === ar && l.customerId === customer.id && l.description.includes(s1.salesInvoices.find((i) => i.id === inv.id)!.number!))!.debit).toBe(6000);
    expect(translation.lines.some((l) => l.accountId === mapped(s1, AUD, 'FX_CONV_LIAB').id && l.credit > 0)).toBe(true);
    expect(reversal.date).toBe('2027-01-01');
    expect(reversal.lines.map((l) => [l.accountId, l.debit, l.credit])).toEqual(translation.lines.map((l) => [l.accountId, l.credit, l.debit]));
    expect(r2(trialBalance(s1, AUD).reduce((a, r) => a + r.balance, 0))).toBe(0);
    expect(() => postFxRevaluation(s1, AUD, fy.id)).toThrow(/déjà comptabilisée/);
  });

  it('refuses without a closing rate, or without the next year to reverse into; direct_to_income goes to 778 / 678', () => {
    const { s, fy } = setup();
    const noEur: State = { ...s, fxRates: s.fxRates.filter((r) => r.from !== 'EUR') };
    expect(fxRevaluation(noEur, AUD, fy.id).missing).toEqual(['EUR']);
    expect(() => postFxRevaluation(noEur, AUD, fy.id)).toThrow(/Pas de taux EUR/);
    const noNext: State = { ...s, fiscalYears: s.fiscalYears.filter((f) => !(f.entityId === AUD && f.label === '2027')) };
    expect(() => postFxRevaluation(noNext, AUD, fy.id)).toThrow(/exercice suivant/);
    const direct: State = { ...s, entities: s.entities.map((e) => (e.id === AUD ? { ...e, fxMethod: 'direct_to_income' as const } : e)) };
    const [s1] = postFxRevaluation(direct, AUD, fy.id);
    const tr = s1.entries.filter((e) => e.sourceType === 'fx_revaluation' && e.postingRule === 'fx_translation.v1');
    expect(tr).toHaveLength(1); // not reversed
    expect(tr[0].lines.some((l) => l.accountId === accountByCode(s1, AUD, '778').id)).toBe(true);
  });
});

