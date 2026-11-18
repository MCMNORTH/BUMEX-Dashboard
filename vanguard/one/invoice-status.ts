// [bumex-one] An invoice's two statuses (asked by Sidaty on 2026-11-18): whether it is in the books, and where its
// payment stands, each in its own column; what needs a look in bright orange, what is done in bright green.
//  - Comptabilité: Comptabilisée (its entry is passed) · Non comptabilisée — a draft (grey), or validated, numbered and
//    sent but not in the books (orange: an anomaly to clear).
//  - Paiement: Brouillon (grey) · Non payée (pale orange; bright orange once past due) · Partiellement payée (the same)
//    · Payée (green) · Soldée par avoir (grey: a credit note cancelled it, no money came).
// The engine marks an invoice settled by a credit note "paid" (sales.ts createCreditNote): the money actually received
// is read from its allocations.

import type { Allocation, CreditNote, SalesInvoice } from '@bumex/domain';

export type StatusTone = 'flash-good' | 'flash-warn' | 'warn' | 'dim';
export type InvoiceStatus = { label: string; tone: StatusTone; title?: string };

export function accountingStatus(inv: Pick<SalesInvoice, 'status'>): InvoiceStatus {
  if (inv.status === 'posted' || inv.status === 'paid') return { label: 'Comptabilisée', tone: 'flash-good' };
  if (inv.status === 'validated') return { label: 'Non comptabilisée', tone: 'flash-warn', title: 'Numérotée et figée, mais son écriture n\'est pas passée : à comptabiliser' };
  return { label: 'Non comptabilisée', tone: 'dim', title: 'Brouillon' };
}

export function paymentStatus(
  inv: Pick<SalesInvoice, 'id' | 'status' | 'netPayable' | 'amountPaidTxn' | 'dueDate' | 'dunningLevel'>,
  today: string,
  allocations: Pick<Allocation, 'invoiceId' | 'amountTxn'>[],
  creditNotes: Pick<CreditNote, 'originalInvoiceId'>[],
): InvoiceStatus {
  if (inv.status === 'draft') return { label: 'Brouillon', tone: 'dim' };
  const received = allocations.filter((a) => a.invoiceId === inv.id).reduce((a, x) => a + x.amountTxn, 0);
  const credited = creditNotes.some((c) => c.originalInvoiceId === inv.id);
  const rest = Math.round((inv.netPayable - inv.amountPaidTxn) * 100) / 100;
  if (inv.status === 'paid' || rest <= 0.004) {
    if (received <= 0.004 && credited) return { label: 'Soldée par avoir', tone: 'dim', title: 'Annulée par un avoir, sans encaissement' };
    return { label: 'Payée', tone: 'flash-good' };
  }
  const late = inv.dueDate < today;
  const dunning = inv.dunningLevel ? ` · relance ${inv.dunningLevel}` : '';
  const title = late ? `Échue le ${inv.dueDate}` : `Échéance le ${inv.dueDate}`;
  if (received > 0.004) return { label: `Partiellement payée${dunning}`, tone: late ? 'flash-warn' : 'warn', title };
  return { label: `Non payée${dunning}`, tone: late ? 'flash-warn' : 'warn', title };
}
