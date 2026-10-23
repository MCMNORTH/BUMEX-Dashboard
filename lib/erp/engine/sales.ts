import type { State, Id, ISODate, Currency, SalesInvoice, SalesInvoiceLine, CreditNote, CustomerPayment, Allocation, Customer } from './types';
import { DomainError } from './types';
import { r2, sum, addDays, daysBetween } from './money';
import { nextId, audit, fxRate, mapped, nextNumber, requirePost, accountById, arAccountFor, bankJournalFor } from './core';
import { nextThirdPartyCode, checkThirdPartyCode, ensureAuxiliaryAccount } from './chart';
import { resolveTaxCode, revenueAccountFor } from './tax';
import { createDraft, postEntry, type DraftLineInput } from './ledger';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  serviceCategory: string;
  taxCodeId?: Id; // override
  revenueAccountId?: Id; // override
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
  withholdingCodeId?: Id | null; // undefined = the customer's default, null = none
  lines: InvoiceLineInput[];
}

function withholdingFor(state: State, customer: Customer, input: InvoiceInput, totalHt: number): { id?: Id; rate: number; amount: number } {
  const id = input.withholdingCodeId === undefined ? customer.withholdingCodeId : input.withholdingCodeId ?? undefined;
  if (!id) return { rate: 0, amount: 0 };
  const tc = state.taxCodes.find((t) => t.id === id);
  if (!tc || tc.kind !== 'withholding') throw new DomainError('tax_code', 'Code de retenue à la source inconnu');
  return { id, rate: tc.rate, amount: r2(totalHt * tc.rate) };
}

function customerOf(state: State, id: Id): Customer {
  const c = state.customers.find((x) => x.id === id);
  if (!c) throw new DomainError('not_found', 'Client inconnu');
  return c;
}

export function computeLines(state: State, input: InvoiceInput): { lines: SalesInvoiceLine[]; mention?: string } {
  const customer = customerOf(state, input.customerId);
  let mention: string | undefined;
  const lines = input.lines.map((l, i) => {
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
    };
  });
  return { lines, mention };
}

export function createInvoice(state: State, input: InvoiceInput): [State, SalesInvoice] {
  const customer = customerOf(state, input.customerId);
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const rate = input.fxRate ?? fxRate(state, input.currency, entity.functionalCurrency, input.date);
  const { lines, mention } = computeLines(state, { ...input, fxRate: rate });
  const totalHt = sum(lines.map((l) => l.lineHt));
  const totalTtc = sum(lines.map((l) => l.lineTtc));
  const wh = withholdingFor(state, customer, input, totalHt);
  const [s1, id] = nextId(state, 'inv');
  const inv: SalesInvoice = {
    id,
    entityId: input.entityId,
    customerId: input.customerId,
    engagementId: input.engagementId,
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
  const wh = withholdingFor(state, customer, input, totalHt);
  const inv: SalesInvoice = {
    ...old,
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
  return [{ ...state, salesInvoices: state.salesInvoices.map((i) => (i.id === invoiceId ? inv : i)) }, inv];
}

// sales_invoice.v2 — Dr AR (net payable) + Dr withholding receivable (RAS suffered) / Cr revenue per line (HT) / Cr VAT per rate
export function validateInvoice(state: State, invoiceId: Id): [State, SalesInvoice] {
  requirePost(state);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) throw new DomainError('not_found', 'Facture inconnue');
  if (inv.status !== 'draft') throw new DomainError('state', 'Facture déjà validée');
  if (!inv.lines.length) throw new DomainError('empty', 'Facture sans ligne');
  const customer = customerOf(state, inv.customerId);
  const [s1, number] = nextNumber(state, inv.entityId, 'sales_invoice', '', inv.date, 'IN{YY}{MM}-{SEQ4}', 'month');
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
  const next: SalesInvoice = { ...inv, number, status: 'posted', journalEntryId: posted.id };
  return [audit({ ...s3, salesInvoices: s3.salesInvoices.map((i) => (i.id === invoiceId ? next : i)) }, 'sales_invoice', inv.id, 'U', `Validée ${number}`, inv.entityId), next];
}

// credit_note.v1 — mirror of the invoice entry
export function createCreditNote(state: State, invoiceId: Id, reason: string, date: ISODate, lineNos?: number[]): [State, CreditNote] {
  requirePost(state);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv || inv.status === 'draft') throw new DomainError('state', 'Avoir possible sur une facture validée uniquement');
  const customer = customerOf(state, inv.customerId);
  const lines = inv.lines.filter((l) => !lineNos || lineNos.includes(l.lineNo)).map((l, i) => ({ ...l, lineNo: i + 1 }));
  const [s1, id] = nextId(state, 'cn');
  const [s2, number] = nextNumber(s1, inv.entityId, 'credit_note', '', date, 'AV{YY}{MM}-{SEQ4}', 'month');
  const ar = arAccountFor(state, inv.entityId, customer);
  const journal = state.journals.find((j) => j.entityId === inv.entityId && j.kind === 'sales')!;
  const totalTtc = sum(lines.map((l) => l.lineTtc));
  const cnHt = sum(lines.map((l) => l.lineHt));
  const cnWithholding = r2(cnHt * inv.withholdingRate);
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
export function recordPayment(
  state: State,
  input: { entityId: Id; customerId: Id; date: ISODate; currency: Currency; amountTxn: number; bankAccountId: Id; method?: string; reference?: string; invoiceId?: Id; bankTransactionId?: Id },
): [State, CustomerPayment] {
  requirePost(state);
  const customer = customerOf(state, input.customerId);
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const bank = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (bank.currency !== input.currency) throw new DomainError('currency', `Le compte ${bank.name} est en ${bank.currency}`);
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
  if (input.invoiceId) s5 = allocate(s5, id, input.invoiceId, input.amountTxn)[0];
  return [s5, payment];
}

export function allocate(state: State, paymentId: Id, invoiceId: Id, amountTxn: number): [State, Allocation] {
  const pay = state.customerPayments.find((p) => p.id === paymentId);
  const inv = state.salesInvoices.find((i) => i.id === invoiceId);
  if (!pay || !inv) throw new DomainError('not_found', 'Paiement ou facture inconnu');
  if (inv.currency !== pay.currency) throw new DomainError('currency', 'Devises différentes entre la facture et le paiement');
  const open = r2(inv.netPayable - inv.amountPaidTxn);
  const amt = r2(Math.min(amountTxn, open));
  if (amt <= 0) throw new DomainError('amount', 'Rien à lettrer');
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
    const [s2, draft] = createDraft(s, { entityId: inv.entityId, journalId: journal.id, date: pay.date, description: `Écart de change sur ${inv.number}`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'allocation', sourceId: id, postingRule: 'allocation.v1', lines });
    const [s3, posted] = postEntry(s2, draft.id);
    s = s3;
    entryId = posted.id;
  }
  const alloc: Allocation = { id, entityId: inv.entityId, paymentId, invoiceId, amountTxn: amt, amountAtDocRate: atDoc, amountAtPayRate: atPay, fxDifference: diff, journalEntryId: entryId };
  const paid = r2(inv.amountPaidTxn + amt);
  const invoices = s.salesInvoices.map((i) => (i.id === invoiceId ? { ...i, amountPaidTxn: paid, status: paid >= i.netPayable - 0.004 ? ('paid' as const) : i.status } : i));
  return [audit({ ...s, allocations: [...s.allocations, alloc], salesInvoices: invoices }, 'allocation', id, 'I', `Lettrage ${inv.number} ${amt}`, inv.entityId), alloc];
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
