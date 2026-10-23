import type { State, Id, ISODate, TaxCode, TaxKind, Customer, RevenueStatus, Account, CounterpartyRegime } from './types';
import { DomainError } from './types';
import { mapped, nextId, audit, requireRole, PARTNER_ROLES } from './core';
import { r2, sum } from './money';

// Resolution order: document override (handled by the caller) > rule matching the customer's
// regime and the service category > rule matching the regime alone > entity default (rule with
// regime null and category null).
export function resolveTaxCode(state: State, entityId: Id, customer: Customer, serviceCategory: string, _date: ISODate): TaxCode {
  const rules = state.taxRules.filter((r) => r.entityId === entityId);
  const score = (r: (typeof rules)[number]) => {
    if (r.regime !== null && r.regime !== customer.regime) return -1;
    if (r.serviceCategory !== null && r.serviceCategory !== serviceCategory) return -1;
    return (r.regime !== null ? 2 : 0) + (r.serviceCategory !== null ? 1 : 0) + r.priority / 1000;
  };
  const best = rules.map((r) => ({ r, s: score(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
  if (!best) throw new DomainError('tax_rule', 'Aucune règle de taxe applicable');
  const tc = state.taxCodes.find((t) => t.id === best.r.taxCodeId);
  if (!tc) throw new DomainError('tax_code', 'Code taxe introuvable');
  return tc;
}

export function revenueAccountFor(state: State, entityId: Id, serviceCategory: string, status: RevenueStatus): Account {
  try {
    return mapped(state, entityId, 'REVENUE', `${serviceCategory}:${status}`);
  } catch {
    return mapped(state, entityId, 'REVENUE', status);
  }
}

export const REVENUE_STATUS_LABEL: Record<RevenueStatus, string> = {
  taxable_standard: 'soumis au taux normal',
  taxable_reduced: 'soumis au taux réduit',
  exempt_domestic: "exonéré à l'intérieur",
  export_exempt: 'exportation exonérée',
  export_taxable: 'exportation imposable',
};

// ---- tax codes and rules are configurable per entity ------------------------------------------------------

export function addTaxCode(state: State, input: { entityId: Id; code: string; nameFr: string; kind: TaxKind; rate: number; collectedAccountId?: Id; deductibleAccountId?: Id; revenueStatus?: RevenueStatus; legalMentionFr?: string }): [State, TaxCode] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les taxes');
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) throw new DomainError('tax_code', 'Code taxe : 2 à 12 caractères (lettres, chiffres, tiret)');
  if (state.taxCodes.some((t) => t.entityId === input.entityId && t.code === code)) throw new DomainError('tax_code', `Le code ${code} existe déjà`);
  if (input.rate < 0 || input.rate > 1) throw new DomainError('tax_rate', 'Taux entre 0 et 100 %');
  if (!input.nameFr.trim()) throw new DomainError('tax_name', 'Libellé obligatoire');
  const [s1, id] = nextId(state, 'tax');
  const tc: TaxCode = { ...input, id, code, nameFr: input.nameFr.trim(), collectedAccountId: input.collectedAccountId ?? (input.kind === 'vat' ? mapped(state, input.entityId, 'VAT_COLLECTED').id : input.deductibleAccountId ? undefined : mapped(state, input.entityId, 'WHT_PAYABLE').id) };
  return [audit({ ...s1, taxCodes: [...s1.taxCodes, tc] }, 'tax_code', id, 'I', `Code taxe ${code} · ${Math.round(input.rate * 1000) / 10} %`, input.entityId), tc];
}

export function updateTaxCode(state: State, id: Id, patch: Partial<Pick<TaxCode, 'nameFr' | 'rate' | 'collectedAccountId' | 'deductibleAccountId' | 'revenueStatus' | 'legalMentionFr'>>): [State, TaxCode] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les taxes');
  const tc = state.taxCodes.find((t) => t.id === id);
  if (!tc) throw new DomainError('not_found', 'Code taxe inconnu');
  if (patch.rate !== undefined && (patch.rate < 0 || patch.rate > 1)) throw new DomainError('tax_rate', 'Taux entre 0 et 100 %');
  const next = { ...tc, ...patch };
  return [audit({ ...state, taxCodes: state.taxCodes.map((t) => (t.id === id ? next : t)) }, 'tax_code', id, 'U', `Code taxe ${tc.code} modifié`, tc.entityId), next];
}

export function setTaxRule(state: State, input: { entityId: Id; regime: CounterpartyRegime | null; serviceCategory: string | null; taxCodeId: Id }): State {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les taxes');
  const rules = state.taxRules.filter((r) => !(r.entityId === input.entityId && r.regime === input.regime && r.serviceCategory === input.serviceCategory));
  return audit({ ...state, taxRules: [...rules, { ...input, priority: 100 }] }, 'tax_rule', `${input.entityId}:${input.regime ?? '*'}:${input.serviceCategory ?? '*'}`, 'U', `Règle de taxe ${input.regime ?? 'défaut'} / ${input.serviceCategory ?? 'toutes catégories'}`, input.entityId);
}

// ---- withholding statements: suffered on our sales (to recover), due on our purchases (to remit) ---------------

export interface WithholdingRow {
  date: ISODate;
  document: string;
  counterparty: string;
  base: number;
  rate: number;
  amount: number;
  status: string;
  currency: string;
}

export interface WithholdingStatement {
  suffered: WithholdingRow[];
  sufferedTotal: number; // functional currency
  due: WithholdingRow[];
  dueTotal: number;
  byMonth: { month: string; suffered: number; due: number }[];
}

export function withholdingStatement(state: State, entityId: Id, from?: ISODate, to?: ISODate): WithholdingStatement {
  const inRange = (d: ISODate) => (!from || d >= from) && (!to || d <= to);
  const suffered: WithholdingRow[] = state.salesInvoices
    .filter((i) => i.entityId === entityId && i.status !== 'draft' && i.withholdingAmount > 0 && inRange(i.date))
    .map((i) => ({ date: i.date, document: i.number ?? '—', counterparty: state.customers.find((c) => c.id === i.customerId)?.name ?? '', base: r2(i.totalHt * i.fxRate), rate: i.withholdingRate, amount: r2(i.withholdingAmount * i.fxRate), status: i.status === 'paid' ? 'réglée' : 'ouverte', currency: i.currency }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const due: WithholdingRow[] = state.supplierInvoices
    .filter((i) => i.entityId === entityId && (i.status === 'posted' || i.status === 'paid' || i.status === 'approved') && i.withholdingAmount > 0 && inRange(i.date))
    .map((i) => ({ date: i.date, document: i.number ?? i.supplierRef, counterparty: state.suppliers.find((c) => c.id === i.supplierId)?.name ?? '', base: r2(i.totalHt * i.fxRate), rate: i.totalHt ? r2(i.withholdingAmount / i.totalHt) : 0, amount: r2(i.withholdingAmount * i.fxRate), status: i.status === 'paid' ? 'réglée' : 'à reverser', currency: i.currency }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const months = [...new Set([...suffered, ...due].map((r) => r.date.slice(0, 7)))].sort();
  return {
    suffered,
    sufferedTotal: sum(suffered.map((r) => r.amount)),
    due,
    dueTotal: sum(due.map((r) => r.amount)),
    byMonth: months.map((m) => ({ month: m, suffered: sum(suffered.filter((r) => r.date.startsWith(m)).map((r) => r.amount)), due: sum(due.filter((r) => r.date.startsWith(m)).map((r) => r.amount)) })),
  };
}

export interface VatStatement {
  collected: number;
  deductible: number;
  net: number;
  byMonth: { month: string; collected: number; deductible: number }[];
}

export function vatStatement(state: State, entityId: Id, from?: ISODate, to?: ISODate): VatStatement {
  const inRange = (d: ISODate) => (!from || d >= from) && (!to || d <= to);
  const sales = state.salesInvoices.filter((i) => i.entityId === entityId && i.status !== 'draft' && inRange(i.date));
  const purchases = state.supplierInvoices.filter((i) => i.entityId === entityId && (i.status === 'posted' || i.status === 'paid') && inRange(i.date));
  const months = [...new Set([...sales.map((i) => i.date.slice(0, 7)), ...purchases.map((i) => i.date.slice(0, 7))])].sort();
  const collected = sum(sales.map((i) => r2(i.totalTax * i.fxRate)));
  const deductible = sum(purchases.map((i) => r2(i.totalTax * i.fxRate)));
  return { collected, deductible, net: r2(collected - deductible), byMonth: months.map((m) => ({ month: m, collected: sum(sales.filter((i) => i.date.startsWith(m)).map((i) => r2(i.totalTax * i.fxRate))), deductible: sum(purchases.filter((i) => i.date.startsWith(m)).map((i) => r2(i.totalTax * i.fxRate))) })) };
}
