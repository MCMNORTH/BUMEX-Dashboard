import type { State, Id, ISODate, Currency, SalesInvoice, SalesInvoiceLine, CreditNote, CustomerPayment, Allocation, Customer, CounterpartyRegime, DeletionRequest } from './types';
import { DomainError } from './types';
import { r2, sum, addDays, daysBetween } from './money';
import { nextId, audit, fxRate, mapped, nextNumber, requirePost, accountById, arAccountFor, bankJournalFor } from './core';
import { nextThirdPartyCode, checkThirdPartyCode, ensureAuxiliaryAccount } from './chart';
import { resolveTaxCode, revenueAccountFor } from './tax';
import { createDraft, postEntry, reverseOnOpenDate, type DraftLineInput } from './ledger';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  serviceCategory: string;
  taxCodeId?: Id; // override
  revenueAccountId?: Id; // override
  withholdingCodeId?: Id | null; // [bumex-one] the line's WHT; none (undefined or null) = not applicable, never the header's (Sidaty, 2026-11-23)
}

export interface InvoiceInput {
  entityId: Id;
  customerId: Id;
  engagementId?: Id;
  date: ISODate;
  dueDays?: number;
  currency: Currency;
  fxRate?: number;
  paymentMode?: string;
  bankAccountId?: Id;
  withholdingCodeId?: Id | null; // [bumex-one] ignored since 2026-11-23: the WHT is each line's (InvoiceLineInput), the invoice's their total
  regime?: CounterpartyRegime; // this invoice's regime for the tax rules; undefined = the customer's
  number?: string; // [bumex-one] typed by hand (importing the old invoices, 2026-11-17); empty = numbered on validation
  lines: InvoiceLineInput[];
}

// [bumex-one] A number typed by hand: kept as typed, unique on its entity (the database's unique (entity_id, number)).
function manualNumber(state: State, entityId: Id, number: string | undefined, selfId?: Id): string | undefined {
  const n = number?.trim();
  if (!n) return undefined;
  if (n.length > 40) throw new DomainError('number', 'Numéro de facture : 40 caractères au plus');
  if (state.salesInvoices.some((i) => i.entityId === entityId && i.id !== selfId && i.number?.toLowerCase() === n.toLowerCase())) throw new DomainError('number', `Le numéro ${n} existe déjà`);
  return n;
}

// [bumex-one] The WHT is set per line (asked on 2026-11-17): the invoice's is its one code, on the HT of the lines
// that bear it (rounded once, as the old invoices did); an invoice carries one WHT code at most.
function withholdingOf(state: State, lines: SalesInvoiceLine[]): { id?: Id; rate: number; amount: number } {
  const bearing = lines.filter((l) => l.withholdingCodeId);
  if (!bearing.length) return { rate: 0, amount: 0 };
  const tc = state.taxCodes.find((t) => t.id === bearing[0].withholdingCodeId)!;
  return { id: tc.id, rate: tc.rate, amount: r2(sum(bearing.map((l) => l.lineHt)) * tc.rate) };
}

// A line's WHT rate: its own. Lines computed since WHT per line (0019) always carry one (0 = none); a line without any
// can only come from an invoice posted before, whose WHT was computed on all its lines: it reads the invoice's, so a
// credit note or the revaluation of such an invoice matches what it posted. Entering or saving an invoice never does
// (computeLines).
export function lineWithholdingRate(inv: Pick<SalesInvoice, 'withholdingAmount' | 'withholdingRate'>, line: Pick<SalesInvoiceLine, 'withholdingRate'>): number {
  return line.withholdingRate ?? (inv.withholdingAmount > 0 ? inv.withholdingRate : 0);
}

function customerOf(state: State, id: Id): Customer {
  const c = state.customers.find((x) => x.id === id);
  if (!c) throw new DomainError('not_found', 'Client inconnu');
  return c;
}

export function computeLines(state: State, input: InvoiceInput): { lines: SalesInvoiceLine[]; mention?: string } {
  const card = customerOf(state, input.customerId);
  const customer = input.regime ? { ...card, regime: input.regime } : card;
  let mention: string | undefined;
  const lines = input.lines.map((l, i) => {
    // [bumex-one] a line without a WHT code bears none: it never takes the header's or the customer card's (asked by
    // Sidaty on 2026-11-23 — a "none" line read back without its code took the header's on the next save, 70 became 140).
    // The card's WHT is the form's proposal for a new line (Clients.tsx), nothing more.
    const whtId = l.withholdingCodeId ?? undefined;
    const wtc = whtId ? state.taxCodes.find((t) => t.id === whtId) : undefined;
    if (whtId && (!wtc || wtc.kind !== 'withholding')) throw new DomainError('tax_code', 'Code de retenue à la source inconnu');
    const tc = l.taxCodeId ? state.taxCodes.find((t) => t.id === l.taxCodeId) : resolveTaxCode(state, input.entityId, customer, l.serviceCategory, input.date);
    if (!tc) throw new DomainError('tax_code', 'Code taxe inconnu');
    if (tc.legalMentionFr) mention = tc.legalMentionFr;
    const ht = r2(l.quantity * l.unitPrice);
    const tax = r2(ht * tc.rate);
    const revenue = l.revenueAccountId ? accountById(state, l.revenueAccountId) : revenueAccountFor(state, input.entityId, l.serviceCategory, tc.revenueStatus ?? 'taxable_standard');
    return {
      lineNo: i + 1,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      serviceCategory: l.serviceCategory,
      taxCodeId: tc.id,
      taxRateSnapshot: tc.rate,
      revenueAccountId: revenue.id,
      lineHt: ht,
      taxAmount: tax,
      lineTtc: r2(ht + tax),
      withholdingCodeId: wtc?.id,
      withholdingRate: wtc?.rate ?? 0,
    };
  });
  if (new Set(lines.map((l) => l.withholdingCodeId).filter(Boolean)).size > 1) throw new DomainError('wht', 'Une seule WHT par facture');
  return { lines, mention };
}

export function createInvoice(state: State, input: InvoiceInput): [State, SalesInvoice] {
  const customer = customerOf(state, input.customerId);
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const rate = input.fxRate ?? fxRate(state, input.currency, entity.functionalCurrency, input.date);
  const { lines, mention } = computeLines(state, { ...input, fxRate: rate });
  const totalHt = sum(lines.map((l) => l.lineHt));
  const totalTtc = sum(lines.map((l) => l.lineTtc));
  const wh = withholdingOf(state, lines);
  const number = manualNumber(state, input.entityId, input.number);
  const [s1, id] = nextId(state, 'inv');
  const inv: SalesInvoice = {
    id,
    entityId: input.entityId,
    customerId: input.customerId,
    engagementId: input.engagementId,
    number,
    status: 'draft',
    date: input.date,
    dueDate: addDays(input.date, input.dueDays ?? customer.paymentTermsDays),
    currency: input.currency,
    fxRate: rate,
    paymentMode: input.paymentMode ?? 'Virement',
    bankAccountId: input.bankAccountId,
    lines,
    totalHt,
    totalTax: sum(lines.map((l) => l.taxAmount)),
    totalTtc,
    withholdingCodeId: wh.id,
    withholdingRate: wh.rate,
    withholdingAmount: wh.amount,
    netPayable: r2(totalTtc - wh.amount),
    amountPaidTxn: 0,
    legalMentionFr: mention,
    dunningLevel: 0,
  };
  return [audit({ ...s1, salesInvoices: [...s1.salesInvoices, inv] }, 'sales_invoice', id, 'I', `Facture brouillon ${customer.name}`, input.entityId), inv];
}

export function updateInvoice(state: State, invoiceId: Id, input: InvoiceInput): [State, SalesInvoice] {
  const old = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!old) throw new DomainError('not_found', 'Facture inconnue');
  if (old.status !== 'draft') throw new DomainError('immutable', 'Facture validée : passer par un avoir');
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const rate = input.fxRate ?? fxRate(state, input.currency, entity.functionalCurrency, input.date);
  const { lines, mention } = computeLines(state, { ...input, fxRate: rate });
  const customer = customerOf(state, input.customerId);
  const totalHt = sum(lines.map((l) => l.lineHt));
  const totalTtc = sum(lines.map((l) => l.lineTtc));
  const wh = withholdingOf(state, lines);
  const inv: SalesInvoice = {
    ...old,
    number: manualNumber(state, old.entityId, input.number, invoiceId),
    customerId: input.customerId,
    engagementId: input.engagementId,
    date: input.date,
    dueDate: addDays(input.date, input.dueDays ?? customer.paymentTermsDays),
    currency: input.currency,
    fxRate: rate,
    paymentMode: input.paymentMode ?? old.paymentMode,
    bankAccountId: input.bankAccountId,
    lines,
    totalHt,
    totalTax: sum(lines.map((l) => l.taxAmount)),
    totalTtc,
    withholdingCodeId: wh.id,
    withholdingRate: wh.rate,
    withholdingAmount: wh.amount,
    netPayable: r2(totalTtc - wh.amount),
    legalMentionFr: mention,
  };
  // [bumex-one] in the history, like its creation
  return [audit({ ...state, salesInvoices: state.salesInvoices.map((i) => (i.id === invoiceId ? inv : i)) }, 'sales_invoice', invoiceId, 'U', `Facture brouillon modifiée ${customer.name}`, inv.entityId), inv];
}

// An invoice is a draft (editable), then validated (numbered and locked, nothing in the books yet), then posted
// (its journal entry). Validating and posting are two steps (asked on 2026-11-17): only posting accounts the invoice.
export const invoiceAccounted = (i: Pick<SalesInvoice, 'status'>) => i.status === 'posted' || i.status === 'paid';

export function validateInvoice(state: State, invoiceId: Id): [State, SalesInvoice] {
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) throw new DomainError('not_found', 'Facture inconnue');
  if (inv.status !== 'draft') throw new DomainError('state', 'Facture déjà validée');
  if (!inv.lines.length) throw new DomainError('empty', 'Facture sans ligne');
  const customer = customerOf(state, inv.customerId);
  // a number typed by hand is kept (checked again: another invoice may have taken it since); else the sequence's
  const [s1, number] = inv.number ? [state, manualNumber(state, inv.entityId, inv.number, inv.id)!] : nextNumber(state, inv.entityId, 'sales_invoice', '', inv.date, 'IN{YY}{MM}-{SEQ4}', 'month');
  const next: SalesInvoice = { ...inv, number, status: 'validated' };
  return [audit({ ...s1, salesInvoices: s1.salesInvoices.map((i) => (i.id === invoiceId ? next : i)) }, 'sales_invoice', inv.id, 'U', `Validée ${number} ${customer.name}`, inv.entityId), next];
}

// sales_invoice.v2 — Dr AR (net payable) + Dr withholding receivable (RAS suffered) / Cr revenue per line (HT) / Cr VAT per rate.
// A draft is validated on the way.
export function postInvoice(state: State, invoiceId: Id): [State, SalesInvoice] {
  requirePost(state);
  const found = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!found) throw new DomainError('not_found', 'Facture inconnue');
  if (found.status !== 'draft' && found.status !== 'validated') throw new DomainError('state', 'Facture déjà comptabilisée');
  const [s1, inv] = found.status === 'draft' ? validateInvoice(state, invoiceId) : [state, found];
  const number = inv.number!;
  const customer = customerOf(s1, inv.customerId);
  const ar = arAccountFor(state, inv.entityId, customer);
  const journal = state.journals.find((j) => j.entityId === inv.entityId && j.kind === 'sales')!;
  const lines: DraftLineInput[] = [{ accountId: ar.id, description: `Facture ${number} ${customer.name}`, debitTxn: inv.netPayable, customerId: inv.customerId }];
  if (inv.withholdingAmount > 0) {
    const wtc = state.taxCodes.find((t) => t.id === inv.withholdingCodeId);
    lines.push({ accountId: wtc?.deductibleAccountId ?? mapped(state, inv.entityId, 'WHT_RECEIVABLE').id, description: `Retenue à la source ${Math.round(inv.withholdingRate * 100)} % ${number}`, debitTxn: inv.withholdingAmount, customerId: inv.customerId, taxCodeId: inv.withholdingCodeId });
  }
  for (const l of inv.lines) lines.push({ accountId: l.revenueAccountId!, description: l.description, creditTxn: l.lineHt, customerId: inv.customerId, engagementId: inv.engagementId, taxCodeId: l.taxCodeId });
  const vat = new Map<Id, number>();
  for (const l of inv.lines) if (l.taxAmount) vat.set(l.taxCodeId!, r2((vat.get(l.taxCodeId!) ?? 0) + l.taxAmount));
  for (const [tcId, amount] of vat) {
    const tc = state.taxCodes.find((t) => t.id === tcId)!;
    lines.push({ accountId: tc.collectedAccountId ?? mapped(state, inv.entityId, 'VAT_COLLECTED').id, description: `TVA ${tc.code}`, creditTxn: amount, taxCodeId: tcId });
  }
  const [s2, draft] = createDraft(s1, { entityId: inv.entityId, journalId: journal.id, date: inv.date, description: `Facture ${number} ${customer.name}`, currency: inv.currency, fxRate: inv.fxRate, sourceType: 'sales_invoice', sourceId: inv.id, postingRule: inv.withholdingAmount > 0 ? 'sales_invoice.v2' : 'sales_invoice.v1', lines });
  const [s3, posted] = postEntry(s2, draft.id);
  const next: SalesInvoice = { ...inv, status: 'posted', journalEntryId: posted.id };
  return [audit({ ...s3, salesInvoices: s3.salesInvoices.map((i) => (i.id === invoiceId ? next : i)) }, 'sales_invoice', inv.id, 'U', `Comptabilisée ${number}`, inv.entityId), next];
}

// credit_note.v1 — mirror of the invoice entry
// [bumex-one] number: typed by hand (importing the old credit notes, 2026-11-17), unique on the entity; empty: the sequence's
export function createCreditNote(state: State, invoiceId: Id, reason: string, date: ISODate, lineNos?: number[], typedNumber?: string): [State, CreditNote] {
  requirePost(state);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv || !invoiceAccounted(inv)) throw new DomainError('state', 'Avoir possible sur une facture comptabilisée uniquement');
  const customer = customerOf(state, inv.customerId);
  const lines = inv.lines.filter((l) => !lineNos || lineNos.includes(l.lineNo)).map((l, i) => ({ ...l, lineNo: i + 1 }));
  const [s1, id] = nextId(state, 'cn');
  const typed = typedNumber?.trim();
  if (typed && typed.length > 40) throw new DomainError('number', "Numéro d'avoir : 40 caractères au plus");
  if (typed && state.creditNotes.some((c) => c.entityId === inv.entityId && c.number?.toLowerCase() === typed.toLowerCase())) throw new DomainError('number', `L'avoir ${typed} existe déjà`);
  const [s2, number] = typed ? [s1, typed] : nextNumber(s1, inv.entityId, 'credit_note', '', date, 'AV{YY}{MM}-{SEQ4}', 'month');
  const ar = arAccountFor(state, inv.entityId, customer);
  const journal = state.journals.find((j) => j.entityId === inv.entityId && j.kind === 'sales')!;
  const totalTtc = sum(lines.map((l) => l.lineTtc));
  // [bumex-one] the WHT of the lines credited (each line's own; an older line: the invoice's)
  const cnWithholding = r2(sum(lines.filter((l) => lineWithholdingRate(inv, l) > 0).map((l) => l.lineHt)) * inv.withholdingRate);
  const dl: DraftLineInput[] = [];
  for (const l of lines) dl.push({ accountId: l.revenueAccountId!, description: l.description, debitTxn: l.lineHt, customerId: inv.customerId, taxCodeId: l.taxCodeId });
  const vat = new Map<Id, number>();
  for (const l of lines) if (l.taxAmount) vat.set(l.taxCodeId!, r2((vat.get(l.taxCodeId!) ?? 0) + l.taxAmount));
  for (const [tcId, amount] of vat) {
    const tc = state.taxCodes.find((t) => t.id === tcId)!;
    dl.push({ accountId: tc.collectedAccountId ?? mapped(state, inv.entityId, 'VAT_COLLECTED').id, description: `TVA ${tc.code}`, debitTxn: amount, taxCodeId: tcId });
  }
  dl.push({ accountId: ar.id, description: `Avoir ${number} sur ${inv.number}`, creditTxn: r2(totalTtc - cnWithholding), customerId: inv.customerId });
  if (cnWithholding > 0) {
    const wtc = state.taxCodes.find((t) => t.id === inv.withholdingCodeId);
    dl.push({ accountId: wtc?.deductibleAccountId ?? mapped(state, inv.entityId, 'WHT_RECEIVABLE').id, description: `Retenue à la source annulée ${number}`, creditTxn: cnWithholding, customerId: inv.customerId, taxCodeId: inv.withholdingCodeId });
  }
  const [s3, draft] = createDraft(s2, { entityId: inv.entityId, journalId: journal.id, date, description: `Avoir ${number} ${customer.name}`, currency: inv.currency, fxRate: inv.fxRate, sourceType: 'credit_note', sourceId: id, postingRule: 'credit_note.v1', lines: dl });
  const [s4, posted] = postEntry(s3, draft.id);
  const cn: CreditNote = { id, entityId: inv.entityId, customerId: inv.customerId, originalInvoiceId: inv.id, number, status: 'posted', date, currency: inv.currency, fxRate: inv.fxRate, reason, lines, totalHt: sum(lines.map((l) => l.lineHt)), totalTax: sum(lines.map((l) => l.taxAmount)), totalTtc, journalEntryId: posted.id };
  // the credit note settles the invoice for its net amount
  const settles = r2(totalTtc - cnWithholding);
  const invoices = s4.salesInvoices.map((i) => (i.id === inv.id ? { ...i, amountPaidTxn: r2(i.amountPaidTxn + settles), status: r2(i.amountPaidTxn + settles) >= i.netPayable - 0.004 ? ('paid' as const) : i.status } : i));
  return [audit({ ...s4, creditNotes: [...s4.creditNotes, cn], salesInvoices: invoices }, 'credit_note', id, 'I', `Avoir ${number}`, inv.entityId), cn];
}

// customer_payment.v1 + allocation.v1 — Dr bank / Cr AR at the payment-date rate; the FX difference
// between the invoice-date value and the payment-date value of the settled amount goes to 778 / 678.
// [bumex-one] A receipt settles one invoice, several, or none yet (asked by Sidaty on 2026-11-23): `allocations` spreads
// it ([{invoiceId, amountTxn}]), what is left stays to letter later (letterPayment); `invoiceId` is the one-invoice
// form. A small difference left over is proposed to the administrator (settlementCandidates), never booked on its own.
export interface PaymentAllocationInput { invoiceId: Id; amountTxn: number }

export function recordPayment(
  state: State,
  input: { entityId: Id; customerId: Id; date: ISODate; currency: Currency; amountTxn: number; bankAccountId: Id; method?: string; reference?: string; invoiceId?: Id; allocations?: PaymentAllocationInput[]; bankTransactionId?: Id },
): [State, CustomerPayment] {
  requirePost(state);
  const customer = customerOf(state, input.customerId);
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const bank = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (bank.currency !== input.currency) throw new DomainError('currency', `Le compte ${bank.name} est en ${bank.currency}`);
  if (!(r2(input.amountTxn) > 0)) throw new DomainError('amount', 'Montant positif requis');
  const rate = fxRate(state, input.currency, entity.functionalCurrency, input.date);
  const [s1, id] = nextId(state, 'pay');
  const [s2, number] = nextNumber(s1, input.entityId, 'customer_payment', '', input.date, 'EN{YY}{MM}-{SEQ4}', 'month');
  const ar = arAccountFor(state, input.entityId, customer);
  const journal = bankJournalFor(state, bank);
  const lines: DraftLineInput[] = [
    { accountId: bank.glAccountId, description: `Encaissement ${number} ${customer.name}`, debitTxn: input.amountTxn, bankAccountId: bank.id, customerId: customer.id },
    { accountId: ar.id, description: `Encaissement ${number} ${customer.name}`, creditTxn: input.amountTxn, customerId: customer.id },
  ];
  const [s3, draft] = createDraft(s2, { entityId: input.entityId, journalId: journal.id, date: input.date, description: `Encaissement ${number} ${customer.name}`, currency: input.currency, fxRate: rate, sourceType: 'customer_payment', sourceId: id, postingRule: 'customer_payment.v1', lines });
  const [s4, posted] = postEntry(s3, draft.id);
  const payment: CustomerPayment = { id, entityId: input.entityId, customerId: input.customerId, number, status: 'posted', date: input.date, currency: input.currency, amountTxn: r2(input.amountTxn), fxRate: rate, amount: r2(input.amountTxn * rate), bankAccountId: bank.id, method: input.method ?? 'Virement', reference: input.reference, journalEntryId: posted.id, bankTransactionId: input.bankTransactionId };
  let s5: State = { ...s4, customerPayments: [...s4.customerPayments, payment] };
  if (input.bankTransactionId) s5 = { ...s5, bankTransactions: s5.bankTransactions.map((t) => (t.id === input.bankTransactionId ? { ...t, status: 'matched' as const, journalEntryId: posted.id } : t)) };
  s5 = audit(s5, 'customer_payment', id, 'I', `Encaissement ${number}`, input.entityId);
  // one invoice: what it still owes at most (the rest of the receipt stays to letter, or is a small overpayment)
  const wanted = input.allocations ?? (input.invoiceId ? [{ invoiceId: input.invoiceId, amountTxn: Math.min(input.amountTxn, openOf(s5, input.invoiceId)) }] : []);
  if (wanted.length) s5 = letterPayment(s5, id, wanted)[0];
  return [s5, s5.customerPayments.find((p) => p.id === id)!];
}

// what an invoice still owes, in its currency
function openOf(state: State, invoiceId: Id): number {
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) throw new DomainError('not_found', 'Facture inconnue');
  return r2(inv.netPayable - inv.amountPaidTxn);
}

// [bumex-one] What a receipt has not settled yet: its amount, less its allocations and what was taken to income.
export function paymentRemainder(state: State, payment: Pick<CustomerPayment, 'id' | 'amountTxn' | 'writeOffTxn'>): number {
  return r2(payment.amountTxn - sum(state.allocations.filter((a) => a.paymentId === payment.id).map((a) => a.amountTxn)) - (payment.writeOffTxn ?? 0));
}

// The receipts of an entity (or a client) not wholly lettered, with what is left of each.
export function unletteredPayments(state: State, entityId: Id, customerId?: Id): { payment: CustomerPayment; remainder: number }[] {
  return state.customerPayments
    .filter((p) => p.entityId === entityId && (!customerId || p.customerId === customerId) && p.status !== 'cancelled')
    .map((payment) => ({ payment, remainder: paymentRemainder(state, payment) }))
    .filter((x) => x.remainder > 0.004)
    .sort((a, b) => (a.payment.date < b.payment.date ? -1 : 1));
}

export function allocate(state: State, paymentId: Id, invoiceId: Id, amountTxn: number, date?: ISODate): [State, Allocation] {
  const pay = state.customerPayments.find((p) => p.id === paymentId);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!pay || !inv) throw new DomainError('not_found', 'Paiement ou facture inconnu');
  if (!invoiceAccounted(inv)) throw new DomainError('state', 'Lettrage possible sur une facture comptabilisée uniquement');
  if (inv.currency !== pay.currency) throw new DomainError('currency', 'Devises différentes entre la facture et le paiement');
  // [bumex-one] the same client, and never more than the receipt has left
  if (inv.customerId !== pay.customerId || inv.entityId !== pay.entityId) throw new DomainError('customer', `La facture ${inv.number ?? ''} est celle d'un autre client`);
  const open = r2(inv.netPayable - inv.amountPaidTxn);
  const amt = r2(Math.min(amountTxn, open));
  if (amt <= 0) throw new DomainError('amount', 'Rien à lettrer');
  if (amt > paymentRemainder(state, pay) + 0.004) throw new DomainError('amount', `Le lettrage (${amt}) dépasse le reste de l'encaissement (${paymentRemainder(state, pay)})`);
  const atDoc = r2(amt * inv.fxRate);
  const atPay = r2(amt * pay.fxRate);
  const diff = r2(atPay - atDoc);
  const [s1, id] = nextId(state, 'alloc');
  let s = s1;
  let entryId: Id | undefined;
  if (diff !== 0) {
    const entity = state.entities.find((e) => e.id === inv.entityId)!;
    const customer = customerOf(state, inv.customerId);
    const ar = arAccountFor(state, inv.entityId, customer);
    const journal = state.journals.find((j) => j.entityId === inv.entityId && j.kind === 'misc')!;
    // diff > 0: the payment is worth more in functional currency than the receivable booked → gain
    const gainLoss = diff > 0 ? mapped(state, inv.entityId, 'FX_GAIN') : mapped(state, inv.entityId, 'FX_LOSS');
    const lines: DraftLineInput[] = diff > 0
      ? [{ accountId: ar.id, description: `Écart de change ${inv.number}`, debitTxn: Math.abs(diff), customerId: customer.id }, { accountId: gainLoss.id, description: `Gain de change ${inv.number}`, creditTxn: Math.abs(diff) }]
      : [{ accountId: gainLoss.id, description: `Perte de change ${inv.number}`, debitTxn: Math.abs(diff) }, { accountId: ar.id, description: `Écart de change ${inv.number}`, creditTxn: Math.abs(diff), customerId: customer.id }];
    const [s2, draft] = createDraft(s, { entityId: inv.entityId, journalId: journal.id, date: date ?? pay.date, description: `Écart de change sur ${inv.number}`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'allocation', sourceId: id, postingRule: 'allocation.v1', lines });
    const [s3, posted] = postEntry(s2, draft.id);
    s = s3;
    entryId = posted.id;
  }
  const alloc: Allocation = { id, entityId: inv.entityId, paymentId, invoiceId, amountTxn: amt, amountAtDocRate: atDoc, amountAtPayRate: atPay, fxDifference: diff, journalEntryId: entryId, label: `${pay.number ?? ''} → ${inv.number ?? ''} · ${amt} ${inv.currency}` };
  const paid = r2(inv.amountPaidTxn + amt);
  const invoices = s.salesInvoices.map((i) => (i.id === invoiceId ? { ...i, amountPaidTxn: paid, status: paid >= i.netPayable - 0.004 ? ('paid' as const) : i.status } : i));
  return [audit({ ...s, allocations: [...s.allocations, alloc], salesInvoices: invoices }, 'allocation', id, 'I', `Lettrage ${inv.number} ${amt}`, inv.entityId), alloc];
}

// [bumex-one] Lettering a receipt afterwards, or spreading it: all or part of what it has left, to one or more open
// invoices of the same client and currency. The FX differences, invoice by invoice, are dated the receipt's day (or
// `date`, when that day's period is closed).
export function letterPayment(state: State, paymentId: Id, allocations: PaymentAllocationInput[], opts: { date?: ISODate } = {}): [State, Allocation[]] {
  requirePost(state);
  const pay = state.customerPayments.find((p) => p.id === paymentId);
  if (!pay) throw new DomainError('not_found', 'Encaissement inconnu');
  const wanted = allocations.map((a) => ({ invoiceId: a.invoiceId, amountTxn: r2(a.amountTxn) })).filter((a) => a.amountTxn > 0);
  if (!wanted.length) throw new DomainError('amount', 'Rien à lettrer');
  if (new Set(wanted.map((a) => a.invoiceId)).size !== wanted.length) throw new DomainError('amount', 'Une facture apparaît deux fois');
  const total = r2(sum(wanted.map((a) => a.amountTxn)));
  const left = paymentRemainder(state, pay);
  if (total > left + 0.004) throw new DomainError('amount', `Le lettrage (${total}) dépasse le reste de l'encaissement (${left})`);
  let s = state;
  const made: Allocation[] = [];
  for (const a of wanted) {
    const [s1, alloc] = allocate(s, paymentId, a.invoiceId, a.amountTxn, opts.date);
    s = s1;
    made.push(alloc);
  }
  // a receipt that changes what an invoice owes reopens the administrator's decision on its small difference
  const touched = new Set(wanted.map((a) => a.invoiceId));
  s = { ...s, salesInvoices: s.salesInvoices.map((i) => (touched.has(i.id) && i.writeOffRefused ? { ...i, writeOffRefused: false } : i)), customerPayments: s.customerPayments.map((p) => (p.id === paymentId && p.writeOffRefused ? { ...p, writeOffRefused: false } : p)) };
  return [s, made];
}

// [bumex-one] Small settlement differences (Sidaty, 2026-11-23; decided by the administrator, asked on 2026-11-24): an
// invoice its receipts left open by up to the entity's tolerance (500 MRU, or its value in the currency), or a receipt
// that paid its invoices and a little more, is listed; the administrator books it — a loss to SETTLEMENT_LOSS (638001
// at BUMEX SA), a gain to SETTLEMENT_GAIN (748000) — or keeps it open. Nothing moves the bank.
export function settlementTolerance(state: State, entityId: Id): number {
  return state.entities.find((e) => e.id === entityId)?.settlementTolerance ?? 500;
}

export type SettlementCandidate =
  | { kind: 'invoice'; invoice: SalesInvoice; customer: Customer; amount: number; functional: number }
  | { kind: 'payment'; payment: CustomerPayment; customer: Customer; amount: number; functional: number };

export function settlementCandidates(state: State, entityId: Id): SettlementCandidate[] {
  const tolerance = settlementTolerance(state, entityId);
  const out: SettlementCandidate[] = [];
  for (const inv of state.salesInvoices) {
    if (inv.entityId !== entityId || !invoiceAccounted(inv) || inv.writeOffRefused) continue;
    const open = r2(inv.netPayable - inv.amountPaidTxn);
    if (open <= 0.004 || r2(open * inv.fxRate) > tolerance || !state.allocations.some((a) => a.invoiceId === inv.id)) continue;
    out.push({ kind: 'invoice', invoice: inv, customer: customerOf(state, inv.customerId), amount: open, functional: r2(open * inv.fxRate) });
  }
  for (const pay of state.customerPayments) {
    if (pay.entityId !== entityId || pay.writeOffRefused) continue;
    const mine = state.allocations.filter((a) => a.paymentId === pay.id);
    if (!mine.length) continue; // a receipt on account is lettered later, never written off
    const rest = paymentRemainder(state, pay);
    if (rest <= 0.004 || r2(rest * pay.fxRate) > tolerance) continue;
    if (!mine.every((a) => { const i = state.salesInvoices.find((x) => x.id === a.invoiceId); return !!i && i.netPayable - i.amountPaidTxn <= 0.004; })) continue;
    out.push({ kind: 'payment', payment: pay, customer: customerOf(state, pay.customerId), amount: rest, functional: r2(rest * pay.fxRate) });
  }
  return out;
}

function requireAdmin(state: State) {
  if (state.session.role !== 'admin') throw new DomainError('forbidden', "Décision réservée à l'administrateur");
}

// The administrator keeps a small difference open: it leaves the list until a receipt changes it.
export function keepDifferenceOpen(state: State, kind: 'invoice' | 'payment', id: Id): State {
  requireAdmin(state);
  if (kind === 'invoice') {
    const inv = state.salesInvoices.find((i) => i.id === id);
    if (!inv) throw new DomainError('not_found', 'Facture inconnue');
    return audit({ ...state, salesInvoices: state.salesInvoices.map((i) => (i.id === id ? { ...i, writeOffRefused: true } : i)) }, 'sales_invoice', id, 'U', `Écart de règlement laissé ouvert ${inv.number ?? ''}`, inv.entityId);
  }
  const pay = state.customerPayments.find((p) => p.id === id);
  if (!pay) throw new DomainError('not_found', 'Encaissement inconnu');
  return audit({ ...state, customerPayments: state.customerPayments.map((p) => (p.id === id ? { ...p, writeOffRefused: true } : p)) }, 'customer_payment', id, 'U', `Trop-perçu laissé ouvert ${pay.number ?? ''}`, pay.entityId);
}

// The administrator takes a receipt's small overpayment to income.
export function settleOverpayment(state: State, paymentId: Id, date?: ISODate): [State, Id] {
  requirePost(state);
  requireAdmin(state);
  const pay = state.customerPayments.find((p) => p.id === paymentId);
  if (!pay) throw new DomainError('not_found', 'Encaissement inconnu');
  const rest = paymentRemainder(state, pay);
  if (rest <= 0.004) throw new DomainError('amount', 'Rien à solder');
  if (r2(rest * pay.fxRate) > settlementTolerance(state, pay.entityId)) throw new DomainError('amount', 'Reste au-delà du seuil : le lettrer sur une facture');
  const s = writeOffOverpayment(state, paymentId, rest, date ?? state.today);
  return [s, s.customerPayments.find((p) => p.id === paymentId)!.writeOffEntryId!];
}

// settlement_difference.v1 — Dr the account chosen (SETTLEMENT_LOSS by default) / Cr the client, at the invoice's rate
function writeOffInvoice(state: State, inv: SalesInvoice, amount: number, date: ISODate, label: string, accountId?: Id): [State, Id] {
  const customer = customerOf(state, inv.customerId);
  const ar = arAccountFor(state, inv.entityId, customer);
  const target = accountId ? accountById(state, accountId) : mapped(state, inv.entityId, 'SETTLEMENT_LOSS');
  const journal = state.journals.find((j) => j.entityId === inv.entityId && j.kind === 'misc')!;
  const [s1, draft] = createDraft(state, {
    entityId: inv.entityId, journalId: journal.id, date, description: `${label} ${inv.number ?? ''} ${customer.name}`, currency: inv.currency, fxRate: inv.fxRate,
    sourceType: 'sales_invoice', sourceId: inv.id, postingRule: 'settlement_difference.v1',
    lines: [{ accountId: target.id, description: `${label} ${inv.number ?? ''}`, debitTxn: amount }, { accountId: ar.id, description: `${label} ${inv.number ?? ''}`, creditTxn: amount, customerId: customer.id }],
  });
  const [s2, posted] = postEntry(s1, draft.id);
  const paid = r2(inv.amountPaidTxn + amount);
  const invoices = s2.salesInvoices.map((i) => (i.id === inv.id ? { ...i, amountPaidTxn: paid, status: paid >= i.netPayable - 0.004 ? ('paid' as const) : i.status, writeOffTxn: r2((i.writeOffTxn ?? 0) + amount), writeOffEntryId: posted.id } : i));
  return [audit({ ...s2, salesInvoices: invoices }, 'sales_invoice', inv.id, 'U', `${label} ${amount} ${inv.currency} soldé en ${target.code}`, inv.entityId), posted.id];
}

// settlement_difference.v1 — Dr the client / Cr SETTLEMENT_GAIN, at the receipt's rate
function writeOffOverpayment(state: State, paymentId: Id, amount: number, date: ISODate): State {
  const pay = state.customerPayments.find((p) => p.id === paymentId)!;
  const customer = customerOf(state, pay.customerId);
  const ar = arAccountFor(state, pay.entityId, customer);
  const gain = mapped(state, pay.entityId, 'SETTLEMENT_GAIN');
  const journal = state.journals.find((j) => j.entityId === pay.entityId && j.kind === 'misc')!;
  const [s1, draft] = createDraft(state, {
    entityId: pay.entityId, journalId: journal.id, date, description: `Trop-perçu ${pay.number ?? ''} ${customer.name}`, currency: pay.currency, fxRate: pay.fxRate,
    sourceType: 'customer_payment', sourceId: pay.id, postingRule: 'settlement_difference.v1',
    lines: [{ accountId: ar.id, description: `Trop-perçu ${pay.number ?? ''}`, debitTxn: amount, customerId: customer.id }, { accountId: gain.id, description: `Trop-perçu ${pay.number ?? ''}`, creditTxn: amount }],
  });
  const [s2, posted] = postEntry(s1, draft.id);
  const payments = s2.customerPayments.map((p) => (p.id === paymentId ? { ...p, writeOffTxn: r2((p.writeOffTxn ?? 0) + amount), writeOffEntryId: posted.id } : p));
  return audit({ ...s2, customerPayments: payments }, 'customer_payment', paymentId, 'U', `Trop-perçu ${amount} ${pay.currency} soldé en ${gain.code}`, pay.entityId);
}

// [bumex-one] "Solder avec écart", the administrator's decision: what an invoice still owes, settled without money. Within
// the tolerance, a loss to SETTLEMENT_LOSS with no reason; beyond it (70 USD the client's bank kept), to the account
// chosen, with a reason.
export function settleInvoiceDifference(state: State, invoiceId: Id, opts: { accountId?: Id; reason?: string; date?: ISODate } = {}): [State, Id] {
  requirePost(state);
  requireAdmin(state);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) throw new DomainError('not_found', 'Facture inconnue');
  if (!invoiceAccounted(inv)) throw new DomainError('state', 'Lettrage possible sur une facture comptabilisée uniquement');
  const open = r2(inv.netPayable - inv.amountPaidTxn);
  if (open <= 0.004) throw new DomainError('amount', 'Rien à solder');
  const within = r2(open * inv.fxRate) <= settlementTolerance(state, inv.entityId);
  const reason = opts.reason?.trim() ?? '';
  if (!within && reason.length < 4) throw new DomainError('reason', 'Écart au-delà du seuil : indiquer le motif');
  if (opts.accountId) {
    const a = state.accounts.find((x) => x.id === opts.accountId && x.entityId === inv.entityId);
    if (!a || !a.isPostable || !a.active) throw new DomainError('account', 'Compte inconnu, non imputable ou inactif');
  }
  return writeOffInvoice(state, inv, open, opts.date ?? state.today, reason ? `Écart de règlement (${reason})` : 'Écart de règlement', opts.accountId);
}

// [bumex-one] Unlettering: an allocation undone, its invoice open again, with a reason kept (Réglages › Suppressions).
// Its FX difference is reversed; so is a small difference settled with it (the invoice's, the receipt's), the
// settlement no longer standing.
export function unletterAllocation(state: State, allocationId: Id, reason: string): State {
  requirePost(state);
  if (reason.trim().length < 4) throw new DomainError('reason', 'Indiquer le motif du délettrage');
  const alloc = state.allocations.find((a) => a.id === allocationId);
  if (!alloc) throw new DomainError('not_found', 'Lettrage inconnu');
  const inv = state.salesInvoices.find((i) => i.id === alloc.invoiceId)!;
  const pay = state.customerPayments.find((p) => p.id === alloc.paymentId)!;
  const why = `délettrage : ${reason.trim()}`;
  let s = state;
  if (alloc.journalEntryId && s.entries.find((e) => e.id === alloc.journalEntryId)?.status === 'posted') s = reverseOnOpenDate(s, alloc.journalEntryId, why)[0];
  let invWriteOff = 0;
  if ((inv.writeOffTxn ?? 0) > 0 && inv.writeOffEntryId) {
    if (s.entries.find((e) => e.id === inv.writeOffEntryId)?.status === 'posted') s = reverseOnOpenDate(s, inv.writeOffEntryId, why)[0];
    invWriteOff = inv.writeOffTxn!;
  }
  if ((pay.writeOffTxn ?? 0) > 0 && pay.writeOffEntryId) {
    if (s.entries.find((e) => e.id === pay.writeOffEntryId)?.status === 'posted') s = reverseOnOpenDate(s, pay.writeOffEntryId, why)[0];
    s = { ...s, customerPayments: s.customerPayments.map((p) => (p.id === pay.id ? { ...p, writeOffTxn: 0, writeOffEntryId: undefined } : p)) };
  }
  const paid = r2(inv.amountPaidTxn - alloc.amountTxn - invWriteOff);
  s = {
    ...s,
    allocations: s.allocations.filter((a) => a.id !== allocationId),
    salesInvoices: s.salesInvoices.map((i) => (i.id === inv.id ? { ...i, amountPaidTxn: paid, status: i.status === 'paid' && paid < i.netPayable - 0.004 ? ('posted' as const) : i.status, writeOffTxn: invWriteOff ? 0 : i.writeOffTxn, writeOffEntryId: invWriteOff ? undefined : i.writeOffEntryId, writeOffRefused: false } : i)),
  };
  const [s1, id] = nextId(s, 'del');
  const now = new Date().toISOString();
  const label = alloc.label ?? `${pay.number ?? ''} → ${inv.number ?? ''} · ${alloc.amountTxn} ${inv.currency}`;
  const trace: DeletionRequest = { id, entityId: inv.entityId, table: 'allocation', rowId: allocationId, label: `Lettrage ${label}`, reason: reason.trim(), requestedBy: state.session.actorId, requestedByName: state.session.actorName, requestedAt: now, status: 'approved', decidedBy: state.session.actorId, decidedAt: now, decisionNote: 'délettrage' };
  return audit({ ...s1, deletionRequests: [...s1.deletionRequests, trace] }, 'allocation', allocationId, 'D', `Délettrage ${label} · motif : ${reason.trim()}`, inv.entityId);
}

// ---- receivables reports ----------------------------------------------------------

export interface OpenInvoice {
  invoice: SalesInvoice;
  customer: Customer;
  openTxn: number;
  openFunctional: number;
  daysOverdue: number; // 0 when not due
  bucket: 'current' | '1-30' | '31-90' | '90+';
}

export function openInvoices(state: State, entityId: Id, asOf = state.today): OpenInvoice[] {
  return state.salesInvoices
    .filter((i) => i.entityId === entityId && i.status === 'posted' && i.netPayable - i.amountPaidTxn > 0.004)
    .map((invoice) => {
      const customer = customerOf(state, invoice.customerId);
      const openTxn = r2(invoice.netPayable - invoice.amountPaidTxn);
      const days = Math.max(0, daysBetween(invoice.dueDate, asOf));
      const bucket: OpenInvoice['bucket'] = days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 90 ? '31-90' : '90+';
      return { invoice, customer, openTxn, openFunctional: r2(openTxn * invoice.fxRate), daysOverdue: days, bucket };
    })
    .sort((a, b) => (a.invoice.dueDate < b.invoice.dueDate ? -1 : 1));
}

export interface Aging {
  total: number;
  current: number;
  d1to30: number;
  d31to90: number;
  d90plus: number;
  overdue: number;
  overdueCount: number;
  over90Count: number;
}

export function aging(state: State, entityId: Id, asOf = state.today): Aging {
  const rows = openInvoices(state, entityId, asOf);
  const by = (b: OpenInvoice['bucket']) => sum(rows.filter((r) => r.bucket === b).map((r) => r.openFunctional));
  const a: Aging = { total: sum(rows.map((r) => r.openFunctional)), current: by('current'), d1to30: by('1-30'), d31to90: by('31-90'), d90plus: by('90+'), overdue: 0, overdueCount: 0, over90Count: 0 };
  a.overdue = r2(a.d1to30 + a.d31to90 + a.d90plus);
  a.overdueCount = rows.filter((r) => r.daysOverdue > 0).length;
  a.over90Count = rows.filter((r) => r.bucket === '90+').length;
  return a;
}

export const DUNNING_LEVELS = [
  { level: 1, afterDays: 15, label: 'Rappel courtois', template: 'Courriel + PDF' },
  { level: 2, afterDays: 45, label: 'Mise en demeure', template: 'Courrier signé associé' },
  { level: 3, afterDays: 90, label: 'Contentieux', template: 'Transfert BUMEX Avocats' },
];

export function dunningQueue(state: State, entityId: Id) {
  return openInvoices(state, entityId)
    .map((r) => {
      const due = DUNNING_LEVELS.filter((l) => r.daysOverdue >= l.afterDays).pop();
      return { ...r, nextLevel: due && due.level > r.invoice.dunningLevel ? due : undefined };
    })
    .filter((r) => r.nextLevel);
}

export function sendDunning(state: State, invoiceId: Id): State {
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) throw new DomainError('not_found', 'Facture inconnue');
  const next = { ...inv, dunningLevel: inv.dunningLevel + 1, lastDunningDate: state.today };
  return audit({ ...state, salesInvoices: state.salesInvoices.map((i) => (i.id === invoiceId ? next : i)) }, 'sales_invoice', inv.id, 'U', `Relance niveau ${next.dunningLevel}`, inv.entityId);
}

// A customer gets a unique auxiliary code (generated from the entity's rules unless given) and an auxiliary account
// under the customers' collective; every posting of the customer goes to that account.
export function addCustomer(state: State, input: Omit<Customer, 'id' | 'active' | 'code'> & { code?: string; collectiveId?: Id }): [State, Customer] {
  if (!input.name.trim()) throw new DomainError('name', 'Le nom du client est obligatoire');
  if (input.withholdingCodeId && !state.taxCodes.some((t) => t.id === input.withholdingCodeId && t.kind === 'withholding')) throw new DomainError('tax_code', 'Code de retenue inconnu');
  const code = input.code?.trim() ? checkThirdPartyCode(state, input.entityId, 'customer', input.code) : nextThirdPartyCode(state, input.entityId, 'customer');
  const [s1, id] = nextId(state, 'cus');
  const { collectiveId, ...rest } = input;
  const c: Customer = { ...rest, code, name: input.name.trim(), id, active: true };
  const s2: State = { ...s1, customers: [...s1.customers, c] };
  const [s3, aux] = ensureAuxiliaryAccount(s2, c.entityId, 'customer', c, collectiveId);
  const created = s3.customers.find((x) => x.id === id)!;
  return [audit(s3, 'customer', id, 'I', `Client ${c.code} · ${c.name} · compte auxiliaire ${aux.code}`, c.entityId), created];
}

export function updateCustomer(state: State, id: Id, patch: Partial<Omit<Customer, 'id' | 'entityId'>> & { collectiveId?: Id }): [State, Customer] {
  const c = state.customers.find((x) => x.id === id);
  if (!c) throw new DomainError('not_found', 'Client inconnu');
  if (patch.withholdingCodeId && !state.taxCodes.some((t) => t.id === patch.withholdingCodeId && t.kind === 'withholding')) throw new DomainError('tax_code', 'Code de retenue inconnu');
  const { collectiveId, ...rest } = patch;
  const code = rest.code !== undefined && rest.code.trim().toUpperCase() !== c.code ? checkThirdPartyCode(state, c.entityId, 'customer', rest.code, id) : c.code;
  const next: Customer = { ...c, ...rest, code, name: (rest.name ?? c.name).trim() };
  if (!next.name) throw new DomainError('name', 'Le nom du client est obligatoire');
  let s: State = { ...state, customers: state.customers.map((x) => (x.id === id ? next : x)) };
  // the auxiliary account follows the code and the name; it can be moved under another collective
  if (next.arAccountId) {
    const aux = s.accounts.find((a) => a.id === next.arAccountId);
    if (aux) {
      if ((code !== aux.code || next.name !== aux.nameFr)) s = { ...s, accounts: s.accounts.map((a) => (a.id === aux.id ? { ...a, code, nameFr: next.name } : a)) };
      if (collectiveId && collectiveId !== aux.collectiveId) {
        const col = s.accounts.find((a) => a.id === collectiveId && a.entityId === c.entityId && a.active && !a.isAuxiliary);
        if (!col) throw new DomainError('collective', 'Compte collectif inconnu ou inactif');
        s = { ...s, accounts: s.accounts.map((a) => (a.id === aux.id ? { ...a, collectiveId: col.id, kind: col.kind } : a)) };
      }
    }
  } else {
    const [s1] = ensureAuxiliaryAccount(s, c.entityId, 'customer', next, collectiveId);
    s = s1;
  }
  return [audit(s, 'customer', id, 'U', `Client ${next.code} · ${next.name} modifié`, c.entityId), s.customers.find((x) => x.id === id)!];
}
