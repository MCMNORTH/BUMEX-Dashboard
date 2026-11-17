import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, fxRate, setFxRate, importFxRates, deleteFxRate, fxRateUsed, createInvoice, postInvoice, recordPayment, mapped, accountByCode,
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
