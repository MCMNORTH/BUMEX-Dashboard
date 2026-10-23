import type { State, Id, ISODate, JournalEntry, JournalLine, Currency, Period, Account } from './types';
import { DomainError } from './types';
import { r2, sum } from './money';
import { sha256 } from './sha256';
import { nextId, audit, nextNumber, accountById, requirePost, canPost, PARTNER_ROLES } from './core';

export interface DraftLineInput {
  accountId: Id;
  description?: string;
  debitTxn?: number;
  creditTxn?: number;
  customerId?: Id;
  supplierId?: Id;
  engagementId?: Id;
  taxCodeId?: Id;
  bankAccountId?: Id;
  assetId?: Id;
  employeeId?: Id;
}

export interface DraftInput {
  entityId: Id;
  journalId: Id;
  date: ISODate;
  description: string;
  currency: Currency;
  fxRate?: number;
  sourceType?: string;
  sourceId?: Id;
  postingRule?: string;
  lines: DraftLineInput[];
}

export function periodFor(state: State, entityId: Id, date: ISODate): Period {
  const p = state.periods.find((x) => x.entityId === entityId && date >= x.start && date <= x.end && x.periodNo <= 12);
  if (!p) throw new DomainError('period_missing', `Aucune période pour le ${date} : créez d'abord l'exercice`);
  return p;
}

function buildLines(state: State, input: DraftInput): JournalLine[] {
  const rate = input.fxRate ?? 1;
  return input.lines.map((l, i) => {
    const dt = r2(l.debitTxn ?? 0);
    const ct = r2(l.creditTxn ?? 0);
    return {
      lineNo: i + 1,
      accountId: l.accountId,
      description: l.description ?? input.description,
      currency: input.currency,
      fxRate: rate,
      debitTxn: dt,
      creditTxn: ct,
      debit: r2(dt * rate),
      credit: r2(ct * rate),
      customerId: l.customerId,
      supplierId: l.supplierId,
      engagementId: l.engagementId,
      taxCodeId: l.taxCodeId,
      bankAccountId: l.bankAccountId,
      assetId: l.assetId,
      employeeId: l.employeeId,
    };
  });
}

// Functional-currency rounding: the sum of rounded lines may differ by a cent from the
// rounded total; the difference is pushed to the last line so the entry balances exactly.
function squareRounding(lines: JournalLine[]): JournalLine[] {
  const d = sum(lines.map((l) => l.debit));
  const c = sum(lines.map((l) => l.credit));
  const diff = r2(d - c);
  if (diff === 0 || Math.abs(diff) > 0.05) return lines;
  const out = lines.map((l) => ({ ...l }));
  const last = out[out.length - 1];
  if (last.credit > 0) last.credit = r2(last.credit + diff);
  else last.debit = r2(last.debit - diff);
  return out;
}

export function createDraft(state: State, input: DraftInput): [State, JournalEntry] {
  const period = periodFor(state, input.entityId, input.date);
  const [s1, id] = nextId(state, 'je');
  const lines = squareRounding(buildLines(state, input));
  const entry: JournalEntry = {
    id,
    entityId: input.entityId,
    journalId: input.journalId,
    fiscalYearId: period.fiscalYearId,
    periodId: period.id,
    date: input.date,
    status: 'draft',
    description: input.description,
    currency: input.currency,
    fxRate: input.fxRate ?? 1,
    sourceType: input.sourceType ?? 'manual',
    sourceId: input.sourceId,
    postingRule: input.postingRule,
    createdBy: state.session.actorId,
    lines,
  };
  const s2 = { ...s1, entries: [...s1.entries, entry] };
  return [audit(s2, 'journal_entry', id, 'I', `Brouillon ${input.description}`, input.entityId), entry];
}

export function updateDraft(state: State, entryId: Id, patch: Partial<DraftInput>): State {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) throw new DomainError('not_found', 'Écriture inconnue');
  if (e.status !== 'draft') throw new DomainError('immutable', `L'écriture ${e.entryNo} est comptabilisée et immuable`);
  const date = patch.date ?? e.date;
  const period = periodFor(state, e.entityId, date);
  const merged: DraftInput = {
    entityId: e.entityId,
    journalId: patch.journalId ?? e.journalId,
    date,
    description: patch.description ?? e.description,
    currency: patch.currency ?? e.currency,
    fxRate: patch.fxRate ?? e.fxRate,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    postingRule: e.postingRule,
    lines:
      patch.lines ??
      e.lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debitTxn: l.debitTxn,
        creditTxn: l.creditTxn,
        customerId: l.customerId,
        supplierId: l.supplierId,
        engagementId: l.engagementId,
        taxCodeId: l.taxCodeId,
        bankAccountId: l.bankAccountId,
        assetId: l.assetId,
        employeeId: l.employeeId,
      })),
  };
  const updated: JournalEntry = {
    ...e,
    journalId: merged.journalId,
    date,
    fiscalYearId: period.fiscalYearId,
    periodId: period.id,
    description: merged.description,
    currency: merged.currency,
    fxRate: merged.fxRate ?? 1,
    lines: squareRounding(buildLines(state, merged)),
  };
  return { ...state, entries: state.entries.map((x) => (x.id === entryId ? updated : x)) };
}

export function deleteDraft(state: State, entryId: Id): State {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) throw new DomainError('not_found', 'Écriture inconnue');
  if (e.status !== 'draft') throw new DomainError('immutable', 'Seul un brouillon peut être supprimé');
  return audit({ ...state, entries: state.entries.filter((x) => x.id !== entryId) }, 'journal_entry', entryId, 'D', 'Brouillon supprimé', e.entityId);
}

export function entryPayload(e: JournalEntry, accounts: Account[]): string {
  const head = [e.entityId, e.journalId, e.chainSeq, e.entryNo, e.date, e.currency, e.fxRate, e.description, e.sourceType, e.sourceId ?? '', e.postedAt, e.postedBy].join('|');
  const lines = e.lines
    .map((l) => [l.lineNo, accounts.find((a) => a.id === l.accountId)?.code ?? l.accountId, l.debit, l.credit, l.currency, l.debitTxn, l.creditTxn, l.fxRate, l.customerId ?? '', l.supplierId ?? '', l.engagementId ?? '', l.taxCodeId ?? ''].join('|'))
    .join(';');
  return head + '#' + lines;
}

export function entryHash(e: JournalEntry, accounts: Account[]): string {
  return sha256((e.prevHash ?? '') + entryPayload(e, accounts));
}

export interface PostCheck {
  code: string;
  message: string;
}

// Validation without side effects: the UI shows these before the user presses Ctrl+Enter.
export function checkPostable(state: State, entryId: Id): PostCheck[] {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) return [{ code: 'not_found', message: 'Écriture inconnue' }];
  const out: PostCheck[] = [];
  if (e.status !== 'draft') out.push({ code: 'immutable', message: 'Déjà comptabilisée' });
  const d = sum(e.lines.map((l) => l.debit));
  const c = sum(e.lines.map((l) => l.credit));
  if (e.lines.length === 0 || (d === 0 && c === 0)) out.push({ code: 'empty', message: 'Aucune ligne' });
  if (d !== c) out.push({ code: 'unbalanced', message: `Déséquilibrée : débit ${d.toFixed(2)} / crédit ${c.toFixed(2)}` });
  const dt = sum(e.lines.map((l) => l.debitTxn));
  const ct = sum(e.lines.map((l) => l.creditTxn));
  if (dt !== ct) out.push({ code: 'unbalanced_txn', message: 'Déséquilibrée en devise de transaction' });
  for (const l of e.lines) {
    const a = state.accounts.find((x) => x.id === l.accountId);
    if (!a) {
      out.push({ code: 'account', message: `Ligne ${l.lineNo} : compte inconnu` });
      continue;
    }
    if (a.entityId !== e.entityId) out.push({ code: 'account', message: `Ligne ${l.lineNo} : compte d'une autre entité` });
    if (!a.isPostable) out.push({ code: 'account', message: `Ligne ${l.lineNo} : ${a.code} est un compte de regroupement` });
    if (!a.active) out.push({ code: 'account', message: `Ligne ${l.lineNo} : ${a.code} est désactivé` });
    if (a.requiresCustomer && !l.customerId) out.push({ code: 'dimension', message: `Ligne ${l.lineNo} : ${a.code} exige un client` });
    if (a.requiresSupplier && !l.supplierId) out.push({ code: 'dimension', message: `Ligne ${l.lineNo} : ${a.code} exige un fournisseur` });
    if (a.requiresEngagement && !l.engagementId) out.push({ code: 'dimension', message: `Ligne ${l.lineNo} : ${a.code} exige une mission` });
  }
  const period = state.periods.find((p) => p.id === e.periodId);
  if (!period) out.push({ code: 'period', message: 'Période manquante' });
  else {
    if (e.date < period.start || e.date > period.end) out.push({ code: 'period', message: 'Date hors de la période' });
    if (period.status === 'locked') out.push({ code: 'period', message: `Période ${period.periodNo}/${period.start.slice(0, 4)} verrouillée` });
    if (period.status === 'soft_closed' && !PARTNER_ROLES.includes(state.session.role)) out.push({ code: 'period', message: 'Période en clôture douce : associé uniquement' });
    const fy = state.fiscalYears.find((f) => f.id === period.fiscalYearId);
    if (fy?.isClosed) out.push({ code: 'fiscal_year', message: `Exercice ${fy.label} clôturé` });
  }
  if (!canPost(state)) out.push({ code: 'forbidden', message: 'Votre rôle ne permet pas de comptabiliser' });
  return out;
}

export function postEntry(state: State, entryId: Id): [State, JournalEntry] {
  requirePost(state);
  const checks = checkPostable(state, entryId);
  if (checks.length) throw new DomainError(checks[0].code, checks.map((c) => c.message).join(' · '));
  const e = state.entries.find((x) => x.id === entryId)!;
  const [s1, , seq] = nextNumber(state, e.entityId, 'journal_entry', e.journalId, e.date, '{SEQ6}', 'fiscal_year');
  const chainKey = `${e.entityId}|${e.journalId}`;
  const head = s1.chains[chainKey] ?? { lastHash: '', length: 0 };
  const posted: JournalEntry = {
    ...e,
    status: 'posted',
    entryNo: seq,
    chainSeq: head.length + 1,
    postedAt: new Date().toISOString(),
    postedBy: state.session.actorId,
    prevHash: head.lastHash,
  };
  posted.hash = entryHash(posted, state.accounts);
  const s2: State = {
    ...s1,
    entries: s1.entries.map((x) => (x.id === entryId ? posted : x)),
    chains: { ...s1.chains, [chainKey]: { lastHash: posted.hash, length: head.length + 1 } },
  };
  return [audit(s2, 'journal_entry', entryId, 'U', `Comptabilisée n° ${seq}`, e.entityId), posted];
}

export function reverseEntry(state: State, entryId: Id, date: ISODate, reason: string): [State, JournalEntry] {
  requirePost(state);
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) throw new DomainError('not_found', 'Écriture inconnue');
  if (e.status !== 'posted') throw new DomainError('state', 'Seule une écriture comptabilisée peut être extournée');
  const [s1, draft] = createDraft(state, {
    entityId: e.entityId,
    journalId: e.journalId,
    date,
    description: `Extourne de ${e.entryNo} : ${reason}`,
    currency: e.currency,
    fxRate: e.fxRate,
    sourceType: 'reversal',
    sourceId: e.id,
    postingRule: 'reversal.v1',
    lines: e.lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debitTxn: l.creditTxn,
      creditTxn: l.debitTxn,
      customerId: l.customerId,
      supplierId: l.supplierId,
      engagementId: l.engagementId,
      taxCodeId: l.taxCodeId,
      bankAccountId: l.bankAccountId,
      assetId: l.assetId,
      employeeId: l.employeeId,
    })),
  });
  const withLink: State = { ...s1, entries: s1.entries.map((x) => (x.id === draft.id ? { ...x, reversalOfId: e.id } : x)) };
  const [s2, rev] = postEntry(withLink, draft.id);
  const s3: State = {
    ...s2,
    entries: s2.entries.map((x) => (x.id === e.id ? { ...x, status: 'reversed' as const, reversedById: rev.id } : x)),
  };
  return [audit(s3, 'journal_entry', e.id, 'U', `Extournée par ${rev.entryNo}`, e.entityId), rev];
}

export interface ChainCheck {
  entryId: Id;
  chainSeq: number;
  entryNo: number;
  ok: boolean;
}

export function verifyChain(state: State, entityId: Id, journalId: Id): ChainCheck[] {
  const rows = state.entries
    .filter((e) => e.entityId === entityId && e.journalId === journalId && e.status !== 'draft')
    .sort((a, b) => (a.chainSeq ?? 0) - (b.chainSeq ?? 0));
  let prev = '';
  let expect = 1;
  return rows.map((e) => {
    const ok = e.chainSeq === expect && e.prevHash === prev && e.hash === entryHash(e, state.accounts);
    prev = e.hash ?? '';
    expect++;
    return { entryId: e.id, chainSeq: e.chainSeq ?? 0, entryNo: e.entryNo ?? 0, ok };
  });
}

// ---- periods and fiscal years ------------------------------------------------------

export function setPeriodStatus(state: State, periodId: Id, status: Period['status']): State {
  const p = state.periods.find((x) => x.id === periodId);
  if (!p) throw new DomainError('not_found', 'Période inconnue');
  if (status === p.status) return state;
  if (status === 'locked') {
    if (!PARTNER_ROLES.includes(state.session.role)) throw new DomainError('forbidden', 'Seul un associé peut verrouiller une période');
    const drafts = state.entries.filter((e) => e.periodId === periodId && e.status === 'draft').length;
    if (drafts > 0) throw new DomainError('drafts', `${drafts} brouillon(s) dans la période : à comptabiliser ou supprimer`);
  }
  if (p.status === 'locked' && !PARTNER_ROLES.includes(state.session.role)) throw new DomainError('forbidden', 'Seul un associé peut déverrouiller une période');
  const next: Period = { ...p, status, lockedBy: status === 'locked' ? state.session.actorId : undefined };
  return audit({ ...state, periods: state.periods.map((x) => (x.id === periodId ? next : x)) }, 'period', periodId, 'U', `Période ${p.periodNo}/${p.start.slice(0, 4)} → ${status}`, p.entityId);
}

export function setFiscalYearClosed(state: State, fyId: Id, closed: boolean): State {
  const fy = state.fiscalYears.find((x) => x.id === fyId);
  if (!fy) throw new DomainError('not_found', 'Exercice inconnu');
  if (!PARTNER_ROLES.includes(state.session.role)) throw new DomainError('forbidden', "Seul un associé peut clôturer ou rouvrir un exercice");
  if (closed) {
    const open = state.periods.filter((p) => p.fiscalYearId === fyId && p.status !== 'locked').length;
    if (open) throw new DomainError('periods', `${open} période(s) non verrouillée(s)`);
    const drafts = state.entries.filter((e) => e.fiscalYearId === fyId && e.status === 'draft').length;
    if (drafts) throw new DomainError('drafts', `${drafts} brouillon(s) dans l'exercice`);
  }
  const next = { ...fy, isClosed: closed, closedBy: closed ? state.session.actorId : undefined };
  return audit({ ...state, fiscalYears: state.fiscalYears.map((x) => (x.id === fyId ? next : x)) }, 'fiscal_year', fyId, 'U', `Exercice ${fy.label} ${closed ? 'clôturé' : 'rouvert'}`, fy.entityId);
}

export function createFiscalYear(state: State, entityId: Id, year: number): State {
  const label = String(year);
  if (state.fiscalYears.some((f) => f.entityId === entityId && f.label === label)) return state;
  const [s1, fyId] = nextId(state, 'fy');
  const fy = { id: fyId, entityId, label, start: `${year}-01-01`, end: `${year}-12-31`, isClosed: false };
  let s = { ...s1, fiscalYears: [...s1.fiscalYears, fy] };
  const periods: Period[] = [];
  for (let m = 1; m <= 12; m++) {
    const [s2, pid] = nextId(s, 'pe');
    s = s2;
    const start = `${year}-${String(m).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
    periods.push({ id: pid, entityId, fiscalYearId: fyId, periodNo: m, start, end, status: 'open' });
  }
  return audit({ ...s, periods: [...s.periods, ...periods] }, 'fiscal_year', fyId, 'I', `Exercice ${label} créé`, entityId);
}

// ---- reports -----------------------------------------------------------------------

export interface BalanceRow {
  accountId: Id;
  code: string;
  name: string;
  kind: Account['kind'];
  debit: number;
  credit: number;
  balance: number; // debit - credit
}

export function postedLines(state: State, entityId: Id, opts: { from?: ISODate; to?: ISODate; fiscalYearId?: Id } = {}) {
  const out: { entry: JournalEntry; line: JournalLine }[] = [];
  for (const e of state.entries) {
    if (e.entityId !== entityId || e.status === 'draft') continue;
    if (opts.fiscalYearId && e.fiscalYearId !== opts.fiscalYearId) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.to && e.date > opts.to) continue;
    for (const l of e.lines) out.push({ entry: e, line: l });
  }
  return out;
}

// The trial balance presents the general ledger: auxiliary accounts fold into their collective unless asked otherwise.
export function trialBalance(state: State, entityId: Id, opts: { from?: ISODate; to?: ISODate; fiscalYearId?: Id; auxiliaries?: boolean } = {}): BalanceRow[] {
  const acc = new Map<Id, BalanceRow>();
  for (const { line } of postedLines(state, entityId, opts)) {
    let target = line.accountId;
    if (!opts.auxiliaries) {
      const a0 = accountById(state, line.accountId);
      if (a0.isAuxiliary && a0.collectiveId) target = a0.collectiveId;
    }
    let row = acc.get(target);
    if (!row) {
      const a = accountById(state, target);
      row = { accountId: a.id, code: a.code, name: a.nameFr, kind: a.kind, debit: 0, credit: 0, balance: 0 };
      acc.set(target, row);
    }
    row.debit = r2(row.debit + line.debit);
    row.credit = r2(row.credit + line.credit);
    row.balance = r2(row.debit - row.credit);
  }
  return [...acc.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// A collective's balance includes its auxiliary accounts.
export function accountBalance(state: State, entityId: Id, accountId: Id, to?: ISODate): number {
  const ids = accountFamily(state, accountId);
  let b = 0;
  for (const { line } of postedLines(state, entityId, { to })) if (ids.has(line.accountId)) b = r2(b + line.debit - line.credit);
  return b;
}

export function accountFamily(state: State, accountId: Id): Set<Id> {
  const ids = new Set<Id>([accountId]);
  for (const a of state.accounts) if (a.isAuxiliary && a.collectiveId === accountId) ids.add(a.id);
  return ids;
}

export function balanceByPrefix(state: State, entityId: Id, prefix: string, to?: ISODate): number {
  let b = 0;
  for (const { line } of postedLines(state, entityId, { to })) {
    const a = accountById(state, line.accountId);
    if (a.code.startsWith(prefix)) b = r2(b + line.debit - line.credit);
  }
  return b;
}

export interface LedgerRow {
  entry: JournalEntry;
  line: JournalLine;
  running: number;
}

export function generalLedger(state: State, entityId: Id, accountId: Id, opts: { from?: ISODate; to?: ISODate } = {}): LedgerRow[] {
  const ids = accountFamily(state, accountId);
  const rows = postedLines(state, entityId, opts)
    .filter((x) => ids.has(x.line.accountId))
    .sort((a, b) => (a.entry.date === b.entry.date ? (a.entry.chainSeq ?? 0) - (b.entry.chainSeq ?? 0) : a.entry.date < b.entry.date ? -1 : 1));
  let running = 0;
  return rows.map(({ entry, line }) => {
    running = r2(running + line.debit - line.credit);
    return { entry, line, running };
  });
}

export function journalEntries(state: State, entityId: Id, opts: { journalId?: Id; status?: JournalEntry['status']; fiscalYearId?: Id } = {}) {
  return state.entries
    .filter((e) => e.entityId === entityId && (!opts.journalId || e.journalId === opts.journalId) && (!opts.status || e.status === opts.status) && (!opts.fiscalYearId || e.fiscalYearId === opts.fiscalYearId))
    .sort((a, b) => (a.date === b.date ? (b.chainSeq ?? 1e9) - (a.chainSeq ?? 1e9) : a.date < b.date ? 1 : -1));
}
