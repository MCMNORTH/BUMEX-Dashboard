import { describe, expect, it } from 'vitest';

import { accountingStatus, paymentStatus } from '../invoice-status';

const TODAY = '2026-11-18';
const inv = (patch: Partial<Parameters<typeof paymentStatus>[0]> = {}) => ({ id: 'i1', status: 'posted' as const, netPayable: 1000, amountPaidTxn: 0, dueDate: '2026-12-01', dunningLevel: 0, ...patch });

describe("an invoice's two statuses", () => {
  it('in the books: posted or paid is green; validated but not posted is the orange anomaly; a draft is grey', () => {
    expect(accountingStatus({ status: 'posted' })).toMatchObject({ label: 'Comptabilisée', tone: 'flash-good' });
    expect(accountingStatus({ status: 'paid' })).toMatchObject({ label: 'Comptabilisée', tone: 'flash-good' });
    expect(accountingStatus({ status: 'validated' })).toMatchObject({ label: 'Non comptabilisée', tone: 'flash-warn' });
    expect(accountingStatus({ status: 'draft' })).toMatchObject({ label: 'Non comptabilisée', tone: 'dim' });
  });

  it('payment: draft, unpaid (bright orange once due), partly paid, paid, settled by a credit note', () => {
    expect(paymentStatus(inv({ status: 'draft' }), TODAY, [], [])).toMatchObject({ label: 'Brouillon', tone: 'dim' });
    expect(paymentStatus(inv({ status: 'validated' }), TODAY, [], [])).toMatchObject({ label: 'Non payée', tone: 'warn' });
    expect(paymentStatus(inv({ dueDate: '2026-11-01', dunningLevel: 2 }), TODAY, [], [])).toMatchObject({ label: 'Non payée · relance 2', tone: 'flash-warn' });
    expect(paymentStatus(inv({ amountPaidTxn: 400 }), TODAY, [{ invoiceId: 'i1', amountTxn: 400 }], [])).toMatchObject({ label: 'Partiellement payée', tone: 'warn' });
    expect(paymentStatus(inv({ amountPaidTxn: 1000, status: 'paid' }), TODAY, [{ invoiceId: 'i1', amountTxn: 1000 }], [])).toMatchObject({ label: 'Payée', tone: 'flash-good' });
    // a credit note settles it in the engine: no money came
    expect(paymentStatus(inv({ amountPaidTxn: 1000, status: 'paid' }), TODAY, [], [{ originalInvoiceId: 'i1' }])).toMatchObject({ label: 'Soldée par avoir', tone: 'dim' });
    // partly paid, the rest credited: paid
    expect(paymentStatus(inv({ amountPaidTxn: 1000, status: 'paid' }), TODAY, [{ invoiceId: 'i1', amountTxn: 600 }], [{ originalInvoiceId: 'i1' }])).toMatchObject({ label: 'Payée' });
    // imported as paid, without its receipts: paid
    expect(paymentStatus(inv({ amountPaidTxn: 1000, status: 'paid' }), TODAY, [], [])).toMatchObject({ label: 'Payée', tone: 'flash-good' });
    // another invoice's receipts do not count
    expect(paymentStatus(inv({ amountPaidTxn: 300 }), TODAY, [{ invoiceId: 'other', amountTxn: 300 }], [{ originalInvoiceId: 'i1' }])).toMatchObject({ label: 'Non payée' });
  });
});
