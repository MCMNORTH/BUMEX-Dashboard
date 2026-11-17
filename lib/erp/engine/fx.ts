// [bumex-one] Exchange rates (asked on 2026-11-17): set by hand or imported (the BCM's daily reference rates), deleted
// while no posted entry used them. Ours, beside the engine as delivered: the lookup stays fxRate() in core.ts (the latest
// rate on or before the date, a pair read inverted when only the other way is known). The rates are the group's.
import type { State, ISODate, Currency, FxRate, Id, FxMethod, JournalEntry } from './types';
import { DomainError } from './types';
import { r2, sum } from './money';
import { audit, requireRole, PARTNER_ROLES, fxRate, mapped, requirePost, arAccountFor, apAccountFor } from './core';
import { postedLines, accountFamily, createDraft, postEntry, type DraftLineInput } from './ledger';
import { invoiceAccounted, lineWithholdingRate } from './sales';

export const FX_CURRENCIES: Currency[] = ['MRU', 'EUR', 'USD', 'MAD'];
const FX_ROLES = [...PARTNER_ROLES, 'accountant' as const, 'manager' as const];

export interface FxRateInput {
  date: ISODate;
  from: Currency;
  to: Currency;
  rate: number;
  source?: string;
}

export type FxKey = Pick<FxRate, 'date' | 'from' | 'to'>;
export const fxKey = (r: FxKey) => `${r.date}|${r.from}|${r.to}`;

function validDate(d: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

// One rate per pair and per day (whatever its source); strictly positive; into an entity's own currency.
function checked(state: State, input: FxRateInput): FxRate {
  const from = String(input.from ?? '').trim().toUpperCase() as Currency;
  const to = String(input.to ?? '').trim().toUpperCase() as Currency;
  if (!FX_CURRENCIES.includes(from) || !FX_CURRENCIES.includes(to)) throw new DomainError('fx_currency', `Devise inconnue : ${from}/${to}`);
  if (from === to) throw new DomainError('fx_currency', 'Un taux relie deux devises différentes');
  if (!state.entities.some((e) => e.functionalCurrency === to)) throw new DomainError('fx_currency', `${to} n'est la devise d'aucune entité : saisir le taux vers ${[...new Set(state.entities.map((e) => e.functionalCurrency))].join(' ou ')}`);
  if (!validDate(String(input.date))) throw new DomainError('fx_date', `Date invalide : ${input.date}`);
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new DomainError('fx_rate', `Taux ${from}/${to} du ${input.date} : strictement positif`);
  const source = (input.source ?? '').trim() || 'manual';
  if (source.length > 20) throw new DomainError('fx_source', 'Source : 20 caractères au plus');
  return { date: input.date, from, to, rate: Math.round(rate * 1e10) / 1e10, source };
}

function upsert(rates: FxRate[], r: FxRate): { rates: FxRate[]; outcome: 'added' | 'replaced' | 'unchanged' } {
  const i = rates.findIndex((x) => fxKey(x) === fxKey(r));
  if (i < 0) return { rates: [...rates, r], outcome: 'added' };
  if (rates[i].rate === r.rate && rates[i].source === r.source) return { rates, outcome: 'unchanged' };
  return { rates: rates.map((x, k) => (k === i ? r : x)), outcome: 'replaced' };
}

const sorted = (rates: FxRate[]) => [...rates].sort((a, b) => (a.date === b.date ? fxKey(a).localeCompare(fxKey(b)) : a.date < b.date ? -1 : 1));

// Adds the day's rate of a pair, or replaces it.
export function setFxRate(state: State, input: FxRateInput): [State, FxRate] {
  requireRole(state, FX_ROLES, 'de saisir les taux de change');
  const r = checked(state, input);
  const { rates, outcome } = upsert(state.fxRates, r);
  if (outcome === 'unchanged') return [state, r];
  const verb = outcome === 'added' ? 'saisi' : 'remplacé';
  return [audit({ ...state, fxRates: sorted(rates) }, 'fx_rate', fxKey(r), outcome === 'added' ? 'I' : 'U', `Taux ${r.from}/${r.to} du ${r.date} ${verb} : ${r.rate} (${r.source})`), r];
}

export interface FxImport {
  added: number;
  replaced: number;
  unchanged: number;
  from?: ISODate;
  to?: ISODate;
}

// Many rates at once (a file): all checked first, nothing kept if one is wrong; a day given twice must agree.
export function importFxRates(state: State, rows: FxRateInput[], source?: string): [State, FxImport] {
  requireRole(state, FX_ROLES, "d'importer des taux de change");
  if (!rows.length) throw new DomainError('fx_import', 'Aucun taux à importer');
  if (rows.length > 20000) throw new DomainError('fx_import', 'Trop de taux pour un import (20 000 au plus) : importer par année');
  const seen = new Map<string, FxRate>();
  for (const row of rows) {
    const r = checked(state, { ...row, source: row.source ?? source });
    const before = seen.get(fxKey(r));
    if (before && before.rate !== r.rate) throw new DomainError('fx_import', `Deux taux différents pour ${r.from}/${r.to} le ${r.date} : ${before.rate} et ${r.rate}`);
    seen.set(fxKey(r), r);
  }
  let rates = state.fxRates;
  const out: FxImport = { added: 0, replaced: 0, unchanged: 0 };
  for (const r of seen.values()) {
    const u = upsert(rates, r);
    rates = u.rates;
    out[u.outcome]++;
    if (!out.from || r.date < out.from) out.from = r.date;
    if (!out.to || r.date > out.to) out.to = r.date;
  }
  if (!out.added && !out.replaced) return [state, out];
  const pairs = [...new Set([...seen.values()].map((r) => `${r.from}/${r.to}`))].join(', ');
  return [audit({ ...state, fxRates: sorted(rates) }, 'fx_rate', `${out.from}..${out.to}`, 'I', `Taux de change importés · ${pairs} · du ${out.from} au ${out.to} · ${out.added} ajoutés, ${out.replaced} remplacés`), out];
}

// A posted entry valued at this rate: in its currency, dated from the rate's day to the next rate of the pair, at
// exactly that rate (a document carrying its own rate, an invoice for one, does not count).
export function fxRateUsed(state: State, r: FxRate): boolean {
  const next = state.fxRates.filter((x) => x.from === r.from && x.to === r.to && x.date > r.date).map((x) => x.date).sort()[0];
  return state.entries.some((e) => e.status !== 'draft' && e.currency === r.from && e.date >= r.date && (!next || e.date < next) && Math.abs((e.fxRate ?? 0) - r.rate) < 1e-9);
}

export function deleteFxRate(state: State, key: FxKey): State {
  requireRole(state, FX_ROLES, 'de supprimer un taux de change');
  const r = state.fxRates.find((x) => fxKey(x) === fxKey(key));
  if (!r) throw new DomainError('not_found', `Pas de taux ${key.from}/${key.to} le ${key.date}`);
  if (fxRateUsed(state, r)) throw new DomainError('in_use', `Le taux ${r.from}/${r.to} du ${r.date} a servi à une écriture comptabilisée : il ne se supprime plus (une correction se saisit comme nouveau taux du jour)`);
  return audit({ ...state, fxRates: state.fxRates.filter((x) => x !== r) }, 'fx_rate', fxKey(r), 'D', `Taux ${r.from}/${r.to} du ${r.date} supprimé (${r.rate})`);
}

// ---- year-end revaluation (asked on 2026-11-17) --------------------------------------------------------------------
// At the fiscal year's last day, what is held or owed in a foreign currency is valued at that day's rate:
//  - a foreign-currency bank account: its balance in its currency (its posted lines in that currency) × the rate, against
//    its book value; the difference to the exchange gain (778) or loss (678) — the accountant's rule; not reversed;
//  - an invoice still open on that day (customer or supplier; receipts, payments, credit notes dated after it do not
//    count): its open amount × the rate against its book value; the difference to the translation accounts
//    (FX_CONV_ASSET / FX_CONV_LIAB, 484 / 485), reversed on the next fiscal year's first day — or, for an entity whose
//    method is direct_to_income, to 778 / 678 and not reversed.
// Once per fiscal year and entity: to run it again, reverse its entries first.

export interface FxRevaluationRow {
  kind: 'bank' | 'receivable' | 'payable';
  label: string;
  currency: Currency;
  amountTxn: number; // the balance or the open amount, in its currency
  rate: number; // the closing rate (0 when missing)
  book: number; // its value in the books (a payable: what is owed, positive)
  revalued: number;
  diff: number; // revalued − book: an asset worth more (gain) or a debt grown (loss)
  accountId: Id;
  customerId?: Id;
  supplierId?: Id;
}

export interface FxRevaluation {
  fiscalYearId: Id;
  date: ISODate;
  reversalDate?: ISODate;
  method: FxMethod;
  rows: FxRevaluationRow[];
  missing: Currency[]; // currencies without a rate on or before the date
  done: boolean;
  entryIds: Id[];
}

const SOURCE = 'fx_revaluation';

export function fxRevaluation(state: State, entityId: Id, fiscalYearId: Id): FxRevaluation {
  const fy = state.fiscalYears.find((f) => f.id === fiscalYearId && f.entityId === entityId);
  if (!fy) throw new DomainError('not_found', 'Exercice inconnu');
  const entity = state.entities.find((e) => e.id === entityId)!;
  const func = entity.functionalCurrency;
  const date = fy.end;
  const next = state.fiscalYears.filter((f) => f.entityId === entityId && f.start > fy.end).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  const missing = new Set<Currency>();
  const rateOf = (c: Currency) => { try { return fxRate(state, c, func, date); } catch (e) { if (e instanceof DomainError && e.code === 'fx_missing') { missing.add(c); return 0; } throw e; } };
  const rows: FxRevaluationRow[] = [];
  const row = (r: Omit<FxRevaluationRow, 'revalued' | 'diff'>) => {
    const revalued = r.rate ? r2(r.amountTxn * r.rate) : r.book;
    rows.push({ ...r, revalued, diff: r2(revalued - r.book) });
  };
  const lines = postedLines(state, entityId, { to: date });

  for (const bank of state.bankAccounts.filter((b) => b.entityId === entityId && b.currency !== func)) {
    const family = accountFamily(state, bank.glAccountId);
    const shared = state.bankAccounts.some((b) => b.id !== bank.id && b.glAccountId === bank.glAccountId);
    const mine = lines.filter(({ line }) => family.has(line.accountId) && (line.bankAccountId === bank.id || (!line.bankAccountId && !shared)));
    const amountTxn = r2(sum(mine.filter(({ line }) => line.currency === bank.currency).map(({ line }) => line.debitTxn - line.creditTxn)));
    const book = r2(sum(mine.map(({ line }) => line.debit - line.credit)));
    if (!amountTxn && !book) continue;
    row({ kind: 'bank', label: `${bank.bankName} · ${bank.name}`, currency: bank.currency, amountTxn, rate: rateOf(bank.currency), book, accountId: bank.glAccountId });
  }

  for (const inv of state.salesInvoices.filter((i) => i.entityId === entityId && i.currency !== func && invoiceAccounted(i) && i.date <= date)) {
    const paid = sum(state.allocations.filter((a) => a.invoiceId === inv.id && (state.customerPayments.find((p) => p.id === a.paymentId)?.date ?? '9999') <= date).map((a) => a.amountTxn));
    const credited = sum(state.creditNotes.filter((c) => c.originalInvoiceId === inv.id && c.date <= date).map((c) => r2(c.totalTtc - r2(sum(c.lines.filter((l) => lineWithholdingRate(inv, l) > 0).map((l) => l.lineHt)) * inv.withholdingRate))));
    const open = r2(inv.netPayable - paid - credited);
    if (open <= 0.004) continue;
    const customer = state.customers.find((c) => c.id === inv.customerId)!;
    row({ kind: 'receivable', label: `${inv.number ?? '—'} · ${customer.name}`, currency: inv.currency, amountTxn: open, rate: rateOf(inv.currency), book: r2(open * inv.fxRate), accountId: arAccountFor(state, entityId, customer).id, customerId: customer.id });
  }

  for (const si of state.supplierInvoices.filter((i) => i.entityId === entityId && i.currency !== func && (i.status === 'posted' || i.status === 'paid') && i.date <= date)) {
    const payments = state.supplierPayments.filter((p) => p.invoiceId === si.id && p.date <= date);
    const open = r2(si.netPayable - sum(payments.map((p) => p.amount)));
    if (open <= 0.004) continue;
    const payRate = (p: (typeof payments)[number]) => state.entries.find((e) => e.id === p.journalEntryId)?.fxRate ?? si.fxRate;
    const book = r2(r2(si.netPayable * si.fxRate) - sum(payments.map((p) => r2(p.amount * payRate(p)))));
    const supplier = state.suppliers.find((s) => s.id === si.supplierId)!;
    row({ kind: 'payable', label: `${si.number ?? si.supplierRef} · ${supplier.name}`, currency: si.currency, amountTxn: open, rate: rateOf(si.currency), book, accountId: apAccountFor(state, entityId, supplier).id, supplierId: supplier.id });
  }

  const mineDone = state.entries.filter((e: JournalEntry) => e.entityId === entityId && e.sourceType === SOURCE && e.sourceId === fy.id && e.status === 'posted');
  return { fiscalYearId: fy.id, date, reversalDate: next?.start, method: entity.fxMethod, rows, missing: [...missing], done: mineDone.length > 0, entryIds: mineDone.map((e) => e.id) };
}

// fx_revaluation.v1 (bank accounts) and fx_translation.v1 (open invoices, and their reversal on the next first day)
export function postFxRevaluation(state: State, entityId: Id, fiscalYearId: Id): [State, FxRevaluation] {
  requirePost(state);
  const rv = fxRevaluation(state, entityId, fiscalYearId);
  if (rv.done) throw new DomainError('state', `Réévaluation au ${rv.date} déjà comptabilisée : extourner ses écritures pour la refaire`);
  if (rv.missing.length) throw new DomainError('fx_missing', `Pas de taux ${rv.missing.join(', ')} au ${rv.date} : à saisir dans Réglages › Taux de change`);
  const rows = rv.rows.filter((r) => r.diff !== 0);
  if (!rows.length) throw new DomainError('nothing', `Rien à réévaluer au ${rv.date}`);
  const conversion = rv.method === 'conversion_accounts';
  if (rows.some((r) => r.kind !== 'bank') && conversion && !rv.reversalDate) throw new DomainError('fy_missing', `Créer l'exercice suivant : les écarts de conversion s'y contre-passent au premier jour`);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const journal = state.journals.find((j) => j.entityId === entityId && j.kind === 'misc');
  if (!journal) throw new DomainError('journal', 'Pas de journal des opérations diverses');
  const gain = mapped(state, entityId, 'FX_GAIN').id, loss = mapped(state, entityId, 'FX_LOSS').id;
  const post = (s: State, date: ISODate, description: string, rule: string, lines: DraftLineInput[]): State => {
    const [s1, draft] = createDraft(s, { entityId, journalId: journal.id, date, description, currency: entity.functionalCurrency, fxRate: 1, sourceType: SOURCE, sourceId: fiscalYearId, postingRule: rule, lines });
    return postEntry(s1, draft.id)[0];
  };
  const counterpart = (lines: DraftLineInput[], up: Id, down: Id, label: string) => {
    // the other side of each line, summed per account: a value going up is credited to `up`, going down debited to `down`
    const ups = r2(sum(lines.map((l) => l.debitTxn ?? 0))), downs = r2(sum(lines.map((l) => l.creditTxn ?? 0)));
    if (ups) lines.push({ accountId: up, description: label, creditTxn: ups });
    if (downs) lines.push({ accountId: down, description: label, debitTxn: downs });
    return lines;
  };
  let s = state;
  const bank = rows.filter((r) => r.kind === 'bank');
  if (bank.length) {
    const lines: DraftLineInput[] = bank.map((r) => ({ accountId: r.accountId, description: `Réévaluation ${r.label} · ${r.amountTxn} ${r.currency} × ${r.rate}`, ...(r.diff > 0 ? { debitTxn: r.diff } : { creditTxn: -r.diff }) }));
    s = post(s, rv.date, `Réévaluation des comptes en devises au ${rv.date}`, 'fx_revaluation.v1', counterpart(lines, gain, loss, `Écart de change · comptes en devises au ${rv.date}`));
  }
  const open = rows.filter((r) => r.kind !== 'bank');
  if (open.length) {
    const upAcc = conversion ? mapped(state, entityId, 'FX_CONV_LIAB').id : gain; // 485: a latent gain
    const downAcc = conversion ? mapped(state, entityId, 'FX_CONV_ASSET').id : loss; // 484: a latent loss
    // a receivable worth more: debit it; a debt grown: credit it (its diff counts as a loss)
    const lines: DraftLineInput[] = open.map((r) => {
      const third = { accountId: r.accountId, customerId: r.customerId, supplierId: r.supplierId, description: `Écart de conversion ${r.label} · ${r.amountTxn} ${r.currency} × ${r.rate}` };
      const assetUp = r.kind === 'receivable' ? r.diff > 0 : r.diff < 0;
      return { ...third, ...(assetUp ? { debitTxn: Math.abs(r.diff) } : { creditTxn: Math.abs(r.diff) }) };
    });
    const withCounterpart = counterpart(lines, upAcc, downAcc, `Écarts de conversion au ${rv.date}`);
    s = post(s, rv.date, `Écarts de conversion · créances et dettes en devises au ${rv.date}`, 'fx_translation.v1', withCounterpart);
    if (conversion) {
      const reversed = withCounterpart.map((l) => ({ ...l, description: `Contre-passation · ${l.description}`, debitTxn: l.creditTxn, creditTxn: l.debitTxn }));
      s = post(s, rv.reversalDate!, `Contre-passation des écarts de conversion du ${rv.date}`, 'fx_translation.v1', reversed);
    }
  }
  const after = fxRevaluation(s, entityId, fiscalYearId);
  return [audit(s, 'fiscal_year', fiscalYearId, 'U', `Réévaluation des devises au ${rv.date} · ${rows.length} élément(s)`, entityId), after];
}
