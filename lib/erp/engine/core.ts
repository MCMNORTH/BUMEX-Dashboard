import type { State, Id, Currency, ISODate, Account, Role, Journal } from './types';
import { DomainError } from './types';

// Deterministic ids: a counter in the state, so the seed and the tests are reproducible.
export function nextId(state: State, prefix: string): [State, Id] {
  const seq = state.seq + 1;
  return [{ ...state, seq }, `${prefix}_${seq.toString(36).padStart(5, '0')}`];
}

export function audit(state: State, table: string, rowId: Id, action: 'I' | 'U' | 'D', summary: string, entityId?: Id): State {
  const row = {
    at: new Date().toISOString(),
    actorId: state.session.actorId,
    role: state.session.role,
    table,
    rowId,
    entityId,
    action,
    summary,
  };
  return { ...state, auditLog: [...state.auditLog, row] };
}

export function fxRate(state: State, from: Currency, to: Currency, date: ISODate): number {
  if (from === to) return 1;
  const candidates = state.fxRates
    .filter((r) => r.from === from && r.to === to && r.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (candidates.length) return candidates[0].rate;
  const inverse = state.fxRates
    .filter((r) => r.from === to && r.to === from && r.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (inverse.length) return 1 / inverse[0].rate;
  throw new DomainError('fx_missing', `Pas de taux ${from}/${to} au ${date}`);
}

export function entityOf(state: State, entityId: Id) {
  const e = state.entities.find((x) => x.id === entityId);
  if (!e) throw new DomainError('entity_missing', `Entité inconnue ${entityId}`);
  return e;
}

// Presentation length of general-ledger accounts (6 digits by default): a code shorter than that is padded with
// zeros on the right ("4100" → "410000"); roots (2 digits) and auxiliary accounts are never padded.
export const DEFAULT_CODE_LENGTH = 6;
export function codeLength(state: State, entityId: Id): number {
  return state.entities.find((e) => e.id === entityId)?.accountCodeLength ?? DEFAULT_CODE_LENGTH;
}
export function normalizeCode(code: string, length: number): string {
  const c = code.trim();
  if (!/^\d+$/.test(c) || c.length <= 2 || c.length >= length) return c;
  return c.padEnd(length, '0');
}

// Lookup by code, tolerant of the short form: "6310" finds "631000" when the chart is presented on six digits.
export function findAccountByCode(state: State, entityId: Id, code: string): Account | undefined {
  const c = code.trim();
  if (!c) return undefined;
  const exact = state.accounts.find((x) => x.entityId === entityId && x.code === c);
  if (exact) return exact;
  const padded = normalizeCode(c, codeLength(state, entityId));
  if (padded !== c) {
    const p = state.accounts.find((x) => x.entityId === entityId && x.code === padded);
    if (p) return p;
  }
  // "631000" typed where the chart holds "6310" (an entity presented on fewer digits)
  const stripped = c.replace(/0+$/, '');
  if (stripped.length >= 3 && stripped !== c) return state.accounts.find((x) => x.entityId === entityId && x.code === stripped && !x.isAuxiliary);
  return undefined;
}

export function accountByCode(state: State, entityId: Id, code: string): Account {
  const a = findAccountByCode(state, entityId, code);
  if (!a) throw new DomainError('account_missing', `Compte ${code} absent du plan de l'entité`);
  return a;
}

// The journal a bank account posts to: its own, else the entity's first bank (or cash) journal.
export function bankJournalFor(state: State, bank: { entityId: Id; journalId?: Id; isCash?: boolean }): Journal {
  const own = bank.journalId ? state.journals.find((j) => j.id === bank.journalId) : undefined;
  if (own) return own;
  const j = state.journals.find((x) => x.entityId === bank.entityId && x.kind === (bank.isCash ? 'cash' : 'bank')) ?? state.journals.find((x) => x.entityId === bank.entityId && x.kind === 'bank');
  if (!j) throw new DomainError('journal_missing', "Aucun journal de banque paramétré pour l'entité");
  return j;
}

// Auxiliary accounting: a third party posts to its own account when it has one, else to the collective.
export function arAccountFor(state: State, entityId: Id, customer: { arAccountId?: Id; groupEntityId?: Id }): Account {
  const own = customer.arAccountId ? state.accounts.find((a) => a.id === customer.arAccountId && a.active) : undefined;
  return own ?? (customer.groupEntityId ? mapped(state, entityId, 'AR_GROUP') : mapped(state, entityId, 'AR_CONTROL'));
}
export function apAccountFor(state: State, entityId: Id, supplier: { apAccountId?: Id; groupEntityId?: Id }): Account {
  const own = supplier.apAccountId ? state.accounts.find((a) => a.id === supplier.apAccountId && a.active) : undefined;
  return own ?? (supplier.groupEntityId ? mapped(state, entityId, 'AP_GROUP') : mapped(state, entityId, 'AP_CONTROL'));
}

export function accountById(state: State, id: Id): Account {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) throw new DomainError('account_missing', `Compte ${id} inconnu`);
  return a;
}

export function mapped(state: State, entityId: Id, key: string, qualifier = ''): Account {
  const m =
    state.mappings.find((x) => x.entityId === entityId && x.key === key && x.qualifier === qualifier) ??
    state.mappings.find((x) => x.entityId === entityId && x.key === key && x.qualifier === '');
  if (!m) throw new DomainError('mapping_missing', `Aucun compte paramétré pour ${key}${qualifier ? ':' + qualifier : ''}`);
  return accountById(state, m.accountId);
}

export function canSee(state: State, entityId: Id): boolean {
  const s = state.session;
  if (s.entityIds === '*') return true;
  return s.entityIds.includes(entityId);
}

// Modules a person may open: the admin narrows each account; '*' = everything the role allows.
export const COMMON_MODULES = ['tasks', 'reports', 'settings'];
export const CONSOLIDATION_ROLES: Role[] = ['admin', 'partner', 'raf'];

export function canUseModule(state: State, module: string): boolean {
  if (COMMON_MODULES.includes(module)) return true;
  if (module === 'penthouse') return CONSOLIDATION_ROLES.includes(state.session.role) && (state.session.modules === '*' || state.session.modules.includes('penthouse'));
  const mods = state.session.modules;
  return mods === '*' || mods.includes(module);
}

export function canOpenRoom(state: State, entityId: Id, room: string): boolean {
  if (!canSee(state, entityId)) return false;
  return canUseModule(state, room);
}

export const POSTING_ROLES: Role[] = ['admin', 'partner', 'raf', 'manager', 'accountant'];
// Partner-level decisions (closing, approvals above the threshold): the partners, the RAF and the administrator
export const PARTNER_ROLES: Role[] = ['admin', 'partner', 'raf'];

export function canPost(state: State): boolean {
  return POSTING_ROLES.includes(state.session.role);
}

export function requirePost(state: State) {
  if (!canPost(state)) throw new DomainError('forbidden', 'Votre rôle ne permet pas de comptabiliser');
}

export function requireRole(state: State, roles: Role[], what = 'cette opération') {
  if (!roles.includes(state.session.role)) throw new DomainError('forbidden', `Votre rôle ne permet pas ${what}`);
}

// Gapless numbering with patterns; counters live in the state (row-locked sequence in PostgreSQL).
export function nextNumber(
  state: State,
  entityId: Id,
  scope: string,
  scopeRef: string,
  date: ISODate,
  pattern: string,
  resetOn: 'fiscal_year' | 'month' | 'year',
): [State, string, number] {
  let key: string;
  if (resetOn === 'fiscal_year') {
    const fy = state.fiscalYears.find((f) => f.entityId === entityId && date >= f.start && date <= f.end);
    key = fy ? fy.label : date.slice(0, 4);
  } else if (resetOn === 'month') key = date.slice(0, 7);
  else key = date.slice(0, 4);
  const counterKey = `${entityId}|${scope}|${scopeRef}|${key}`;
  const seq = (state.counters[counterKey] ?? 0) + 1;
  const n = pattern
    .replace('{YYYY}', date.slice(0, 4))
    .replace('{YY}', date.slice(2, 4))
    .replace('{MM}', date.slice(5, 7))
    .replace('{SEQ3}', String(seq).padStart(3, '0'))
    .replace('{SEQ4}', String(seq).padStart(4, '0'))
    .replace('{SEQ6}', String(seq).padStart(6, '0'));
  return [{ ...state, counters: { ...state.counters, [counterKey]: seq } }, n, seq];
}
