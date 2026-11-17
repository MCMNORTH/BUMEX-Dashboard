// [bumex-one] Exchange rates (asked on 2026-11-17): set by hand or imported (the BCM's daily reference rates), deleted
// while no posted entry used them. Ours, beside the engine as delivered: the lookup stays fxRate() in core.ts (the latest
// rate on or before the date, a pair read inverted when only the other way is known). The rates are the group's.
import type { State, ISODate, Currency, FxRate } from './types';
import { DomainError } from './types';
import { audit, requireRole, PARTNER_ROLES } from './core';

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
