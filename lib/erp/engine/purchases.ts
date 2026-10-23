import type { State, Id, ISODate, Currency, Supplier, SupplierInvoice, SupplierPayment, CounterpartyRegime, Role } from './types';
import { DomainError } from './types';
import { r2, sum, addDays, daysBetween } from './money';
import { nextId, audit, mapped, fxRate, nextNumber, requirePost, PARTNER_ROLES, apAccountFor, bankJournalFor } from './core';
import { nextThirdPartyCode, checkThirdPartyCode, ensureAuxiliaryAccount } from './chart';
import { createDraft, postEntry, type DraftLineInput } from './ledger';

// Suppliers: the full cycle of a purchase invoice — entry, approval by threshold, posting, payment, payables.

export const APPROVAL_THRESHOLDS = { manager: 100000, partner: 500000 }; // functional currency, TTC

export function addSupplier(state: State, input: { entityId: Id; code?: string; name: string; regime: CounterpartyRegime; withholdingCodeId?: Id; paymentTermsDays?: number; email?: string; phone?: string; nif?: string; address?: string; expenseAccountId?: Id; collectiveId?: Id; groupEntityId?: Id }): [State, Supplier] {
  if (!input.name.trim()) throw new DomainError('name', 'Le nom du fournisseur est obligatoire');
  const existing = state.suppliers.filter((s) => s.entityId === input.entityId);
  if (existing.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase())) throw new DomainError('exists', 'Ce fournisseur existe déjà');
  const code = input.code?.trim() ? checkThirdPartyCode(state, input.entityId, 'supplier', input.code) : nextThirdPartyCode(state, input.entityId, 'supplier');
  const [s1, id] = nextId(state, 'sup');
  const sup: Supplier = { id, entityId: input.entityId, code, name: input.name.trim(), regime: input.regime, withholdingCodeId: input.withholdingCodeId, paymentTermsDays: input.paymentTermsDays ?? 30, email: input.email, phone: input.phone, nif: input.nif, address: input.address, expenseAccountId: input.expenseAccountId, groupEntityId: input.groupEntityId, active: true };
  const s2: State = { ...s1, suppliers: [...s1.suppliers, sup] };
  const [s3, aux] = ensureAuxiliaryAccount(s2, sup.entityId, 'supplier', sup, input.collectiveId);
  return [audit(s3, 'supplier', id, 'I', `Fournisseur ${sup.code} · ${sup.name} · compte auxiliaire ${aux.code}`, sup.entityId), s3.suppliers.find((x) => x.id === id)!];
}

export function updateSupplier(state: State, id: Id, patch: Partial<Omit<Supplier, 'id' | 'entityId'>> & { collectiveId?: Id }): [State, Supplier] {
  const sup = state.suppliers.find((x) => x.id === id);
  if (!sup) throw new DomainError('not_found', 'Fournisseur inconnu');
  const { collectiveId, ...rest } = patch;
  const code = rest.code !== undefined && rest.code.trim().toUpperCase() !== sup.code ? checkThirdPartyCode(state, sup.entityId, 'supplier', rest.code, id) : sup.code;
  const next: Supplier = { ...sup, ...rest, code, name: (rest.name ?? sup.name).trim() };
  if (!next.name) throw new DomainError('name', 'Le nom du fournisseur est obligatoire');
  let s: State = { ...state, suppliers: state.suppliers.map((x) => (x.id === id ? next : x)) };
  if (next.apAccountId) {
    const aux = s.accounts.find((a) => a.id === next.apAccountId);
    if (aux) {
      if (code !== aux.code || next.name !== aux.nameFr) s = { ...s, accounts: s.accounts.map((a) => (a.id === aux.id ? { ...a, code, nameFr: next.name } : a)) };
      if (collectiveId && collectiveId !== aux.collectiveId) {
        const col = s.accounts.find((a) => a.id === collectiveId && a.entityId === sup.entityId && a.active && !a.isAuxiliary);
        if (!col) throw new DomainError('collective', 'Compte collectif inconnu ou inactif');
        s = { ...s, accounts: s.accounts.map((a) => (a.id === aux.id ? { ...a, collectiveId: col.id, kind: col.kind } : a)) };
      }
    }
  } else {
    const [s1] = ensureAuxiliaryAccount(s, sup.entityId, 'supplier', next, collectiveId);
    s = s1;
  }
  return [audit(s, 'supplier', id, 'U', `Fournisseur ${next.code} · ${next.name} modifié`, sup.entityId), s.suppliers.find((x) => x.id === id)!];
}

export interface SupplierInvoiceInput {
  entityId: Id;
  supplierId: Id;
  supplierRef: string;
  date: ISODate;
  dueDays?: number;
  currency: Currency;
  fxRate?: number;
  totalHt: number;
  taxCodeId?: Id | null; // VAT code, null = no VAT
  withholdingCodeId?: Id | null; // undefined = the supplier's default
  expenseAccountId: Id;
  description: string;
}

function approverFor(state: State, entityId: Id, ttcFunctional: number): Role | null {
  void state; void entityId;
  if (ttcFunctional >= APPROVAL_THRESHOLDS.partner) return 'partner';
  if (ttcFunctional >= APPROVAL_THRESHOLDS.manager) return 'manager';
  return null;
}

// supplier_invoice.v1 — Dr expense (HT) + Dr VAT deductible / Cr AP (net payable) + Cr withholding payable
function postingLines(state: State, si: SupplierInvoice): DraftLineInput[] {
  const supplier = state.suppliers.find((x) => x.id === si.supplierId)!;
  const ap = apAccountFor(state, si.entityId, supplier);
  const lines: DraftLineInput[] = [{ accountId: si.expenseAccountId, description: si.description, debitTxn: si.totalHt, supplierId: supplier.id }];
  if (si.totalTax) {
    const tc = si.taxCodeId ? state.taxCodes.find((t) => t.id === si.taxCodeId) : undefined;
    lines.push({ accountId: tc?.deductibleAccountId ?? mapped(state, si.entityId, 'VAT_DEDUCTIBLE').id, description: `TVA ${si.supplierRef}`, debitTxn: si.totalTax, taxCodeId: si.taxCodeId });
  }
  lines.push({ accountId: ap.id, description: `${supplier.name} ${si.supplierRef}`, creditTxn: si.netPayable, supplierId: supplier.id });
  if (si.withholdingAmount) {
    const wtc = si.withholdingCodeId ? state.taxCodes.find((t) => t.id === si.withholdingCodeId) : undefined;
    lines.push({ accountId: wtc?.collectedAccountId ?? mapped(state, si.entityId, 'WHT_PAYABLE').id, description: `Retenue à la source ${si.supplierRef}`, creditTxn: si.withholdingAmount, taxCodeId: si.withholdingCodeId });
  }
  return lines;
}

function postSupplierInvoice(state: State, si: SupplierInvoice, summary: string): [State, SupplierInvoice] {
  requirePost(state);
  const supplier = state.suppliers.find((x) => x.id === si.supplierId)!;
  const journal = state.journals.find((j) => j.entityId === si.entityId && j.kind === 'purchases')!;
  const [s0, number] = nextNumber(state, si.entityId, 'supplier_invoice', '', si.date, 'FA{YY}{MM}-{SEQ4}', 'month');
  const [s1, draft] = createDraft(s0, { entityId: si.entityId, journalId: journal.id, date: si.date, description: `Facture ${supplier.name} ${si.supplierRef}`, currency: si.currency, fxRate: si.fxRate, sourceType: 'supplier_invoice', sourceId: si.id, postingRule: 'supplier_invoice.v1', lines: postingLines(s0, si) });
  const [s2, posted] = postEntry(s1, draft.id);
  const next: SupplierInvoice = { ...si, number, status: 'posted', journalEntryId: posted.id };
  return [audit({ ...s2, supplierInvoices: s2.supplierInvoices.map((x) => (x.id === si.id ? next : x)) }, 'supplier_invoice', si.id, 'U', `${summary} ${number}`, si.entityId), next];
}

export function createSupplierInvoice(state: State, input: SupplierInvoiceInput): [State, SupplierInvoice] {
  const supplier = state.suppliers.find((x) => x.id === input.supplierId);
  if (!supplier) throw new DomainError('not_found', 'Fournisseur inconnu');
  if (!input.supplierRef.trim()) throw new DomainError('ref', 'Le numéro de facture du fournisseur est obligatoire');
  if (!(input.totalHt > 0)) throw new DomainError('amount', 'Montant HT positif requis');
  if (state.supplierInvoices.some((i) => i.supplierId === supplier.id && i.supplierRef.trim().toLowerCase() === input.supplierRef.trim().toLowerCase())) throw new DomainError('duplicate', `La facture ${input.supplierRef} de ${supplier.name} est déjà enregistrée`);
  const entity = state.entities.find((e) => e.id === input.entityId)!;
  const rate = input.fxRate ?? fxRate(state, input.currency, entity.functionalCurrency, input.date);
  const vat = input.taxCodeId ? state.taxCodes.find((t) => t.id === input.taxCodeId) : undefined;
  if (input.taxCodeId && (!vat || vat.kind !== 'vat')) throw new DomainError('tax_code', 'Code TVA inconnu');
  const whId = input.withholdingCodeId === undefined ? supplier.withholdingCodeId : input.withholdingCodeId ?? undefined;
  const wh = whId ? state.taxCodes.find((t) => t.id === whId) : undefined;
  if (whId && (!wh || wh.kind !== 'withholding')) throw new DomainError('tax_code', 'Code de retenue inconnu');
  const ht = r2(input.totalHt);
  const tax = r2(ht * (vat?.rate ?? 0));
  const whAmount = r2(ht * (wh?.rate ?? 0));
  const ttc = r2(ht + tax);
  const [s1, id] = nextId(state, 'sinv');
  const si: SupplierInvoice = {
    id,
    entityId: input.entityId,
    supplierId: supplier.id,
    supplierRef: input.supplierRef.trim(),
    status: 'pending_approval',
    date: input.date,
    dueDate: addDays(input.date, input.dueDays ?? supplier.paymentTermsDays),
    currency: input.currency,
    fxRate: rate,
    totalHt: ht,
    taxCodeId: vat?.id,
    totalTax: tax,
    totalTtc: ttc,
    withholdingCodeId: wh?.id,
    withholdingAmount: whAmount,
    netPayable: r2(ttc - whAmount),
    amountPaid: 0,
    expenseAccountId: input.expenseAccountId,
    description: input.description.trim() || `Facture ${supplier.name}`,
    preparedBy: state.session.actorId,
    approverRole: approverFor(state, input.entityId, r2(ttc * rate)),
  };
  let s: State = audit({ ...s1, supplierInvoices: [...s1.supplierInvoices, si] }, 'supplier_invoice', id, 'I', `Facture fournisseur ${supplier.name} ${si.supplierRef} · ${si.approverRole ? 'à approuver (' + si.approverRole + ')' : 'sans approbation'}`, si.entityId);
  if (!si.approverRole) {
    const [s2, posted] = postSupplierInvoice(s, si, 'Comptabilisée');
    return [s2, posted];
  }
  return [s, si];
}

export function approveSupplierInvoice(state: State, id: Id): State {
  requirePost(state);
  const si = state.supplierInvoices.find((s) => s.id === id);
  if (!si) throw new DomainError('not_found', 'Facture fournisseur inconnue');
  if (si.status !== 'pending_approval') throw new DomainError('state', 'Facture déjà traitée');
  if (si.preparedBy === state.session.actorId) throw new DomainError('segregation', 'Le préparateur ne peut pas approuver sa propre facture');
  if (si.approverRole === 'partner' && !PARTNER_ROLES.includes(state.session.role)) throw new DomainError('forbidden', 'Approbation réservée à un associé (seuil dépassé)');
  if (si.approverRole === 'manager' && !['admin', 'partner', 'raf', 'manager'].includes(state.session.role)) throw new DomainError('forbidden', 'Approbation réservée à un manager');
  return postSupplierInvoice(state, si, 'Approuvée et comptabilisée')[0];
}

export function rejectSupplierInvoice(state: State, id: Id, reason: string): State {
  const si = state.supplierInvoices.find((s) => s.id === id);
  if (!si) throw new DomainError('not_found', 'Facture fournisseur inconnue');
  if (si.status !== 'pending_approval') throw new DomainError('state', 'Facture déjà traitée');
  if (!reason.trim()) throw new DomainError('reason', 'Motif du rejet requis');
  return audit({ ...state, supplierInvoices: state.supplierInvoices.map((x) => (x.id === id ? { ...x, status: 'rejected' as const } : x)) }, 'supplier_invoice', id, 'U', `Rejetée · ${reason.trim()}`, si.entityId);
}

// supplier_payment.v1 — Dr AP / Cr bank, in the invoice currency
export function paySupplierInvoice(state: State, input: { invoiceId: Id; date: ISODate; bankAccountId: Id; amount?: number; reference?: string }): [State, SupplierPayment] {
  requirePost(state);
  const si = state.supplierInvoices.find((s) => s.id === input.invoiceId);
  if (!si) throw new DomainError('not_found', 'Facture fournisseur inconnue');
  if (si.status !== 'posted') throw new DomainError('state', si.status === 'paid' ? 'Facture déjà réglée' : 'Facture non comptabilisée : approuver d\'abord');
  const bank = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (bank.currency !== si.currency) throw new DomainError('currency', `Le compte ${bank.name} est en ${bank.currency}`);
  const open = r2(si.netPayable - si.amountPaid);
  const amount = r2(input.amount ?? open);
  if (amount <= 0 || amount > open + 0.004) throw new DomainError('amount', `Montant entre 0 et ${open}`);
  const supplier = state.suppliers.find((x) => x.id === si.supplierId)!;
  const entity = state.entities.find((e) => e.id === si.entityId)!;
  const rate = fxRate(state, si.currency, entity.functionalCurrency, input.date);
  const [s1, id] = nextId(state, 'spay');
  const [s2, number] = nextNumber(s1, si.entityId, 'supplier_payment', '', input.date, 'DE{YY}{MM}-{SEQ4}', 'month');
  const journal = bankJournalFor(state, bank);
  const lines: DraftLineInput[] = [
    { accountId: apAccountFor(state, si.entityId, supplier).id, description: `Règlement ${number} ${supplier.name} ${si.supplierRef}`, debitTxn: amount, supplierId: supplier.id },
    { accountId: bank.glAccountId, description: `Règlement ${number} ${supplier.name}`, creditTxn: amount, bankAccountId: bank.id, supplierId: supplier.id },
  ];
  const [s3, draft] = createDraft(s2, { entityId: si.entityId, journalId: journal.id, date: input.date, description: `Règlement ${number} ${supplier.name} ${si.supplierRef}`, currency: si.currency, fxRate: rate, sourceType: 'supplier_payment', sourceId: id, postingRule: 'supplier_payment.v1', lines });
  const [s4, posted] = postEntry(s3, draft.id);
  const paid = r2(si.amountPaid + amount);
  const payment: SupplierPayment = { id, entityId: si.entityId, supplierId: supplier.id, invoiceId: si.id, number, date: input.date, amount, bankAccountId: bank.id, reference: input.reference, journalEntryId: posted.id };
  const next: SupplierInvoice = { ...si, amountPaid: paid, status: paid >= si.netPayable - 0.004 ? 'paid' : 'posted', paidAt: paid >= si.netPayable - 0.004 ? input.date : si.paidAt };
  return [audit({ ...s4, supplierPayments: [...s4.supplierPayments, payment], supplierInvoices: s4.supplierInvoices.map((x) => (x.id === si.id ? next : x)) }, 'supplier_payment', id, 'I', `Règlement ${number} · ${supplier.name} · ${amount} ${si.currency}`, si.entityId), payment];
}

export interface PayableRow {
  invoice: SupplierInvoice;
  supplier: Supplier;
  openTxn: number;
  openFunctional: number;
  daysOverdue: number;
  bucket: 'current' | '1-30' | '31-90' | '90+';
}

export interface Payables {
  rows: PayableRow[];
  total: number;
  overdue: number;
  overdueCount: number;
  bySupplier: { supplier: Supplier; open: number; count: number }[];
  pendingApproval: number; // functional, not yet posted
}

export function supplierPayables(state: State, entityId: Id, asOf = state.today): Payables {
  const rows: PayableRow[] = state.supplierInvoices
    .filter((i) => i.entityId === entityId && i.status === 'posted' && i.netPayable - i.amountPaid > 0.004)
    .map((invoice) => {
      const supplier = state.suppliers.find((s) => s.id === invoice.supplierId)!;
      const openTxn = r2(invoice.netPayable - invoice.amountPaid);
      const days = Math.max(0, daysBetween(invoice.dueDate, asOf));
      const bucket: PayableRow['bucket'] = days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 90 ? '31-90' : '90+';
      return { invoice, supplier, openTxn, openFunctional: r2(openTxn * invoice.fxRate), daysOverdue: days, bucket };
    })
    .sort((a, b) => (a.invoice.dueDate < b.invoice.dueDate ? -1 : 1));
  const suppliers = new Map<Id, { supplier: Supplier; open: number; count: number }>();
  for (const r of rows) {
    const cur = suppliers.get(r.supplier.id) ?? { supplier: r.supplier, open: 0, count: 0 };
    cur.open = r2(cur.open + r.openFunctional);
    cur.count++;
    suppliers.set(r.supplier.id, cur);
  }
  return {
    rows,
    total: sum(rows.map((r) => r.openFunctional)),
    overdue: sum(rows.filter((r) => r.daysOverdue > 0).map((r) => r.openFunctional)),
    overdueCount: rows.filter((r) => r.daysOverdue > 0).length,
    bySupplier: [...suppliers.values()].sort((a, b) => b.open - a.open),
    pendingApproval: sum(state.supplierInvoices.filter((i) => i.entityId === entityId && i.status === 'pending_approval').map((i) => r2(i.netPayable * i.fxRate))),
  };
}
