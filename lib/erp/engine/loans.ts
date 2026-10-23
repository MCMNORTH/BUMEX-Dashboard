import type { State, Id, ISODate, Loan, LoanPayment, Currency, ManualInstalment } from './types';
import { DomainError } from './types';
import { r2, sum, addMonths } from './money';
import { nextId, audit, mapped, fxRate, requirePost, requireRole, PARTNER_ROLES, bankJournalFor } from './core';
import { createDraft, postEntry, type DraftLineInput } from './ledger';

// Loans: the schedule is computed from the terms (annuity or constant capital) or entered by hand from the bank's
// own table; each paid instalment is recorded and posted; the outstanding capital follows the payments actually made.

export interface Instalment {
  no: number;
  date: ISODate;
  opening: number;
  capital: number;
  interest: number;
  fees: number;
  total: number;
  closing: number;
  paid?: LoanPayment;
}

export function loanSchedule(loan: Loan, payments: LoanPayment[] = []): Instalment[] {
  if (loan.scheduleMode === 'manual') {
    const rows = [...(loan.manualSchedule ?? [])].sort((a, b) => a.no - b.no);
    let outstanding = loan.principal;
    return rows.map((m) => {
      const capital = r2(Math.min(m.capital, outstanding));
      const closing = r2(outstanding - capital);
      const row: Instalment = { no: m.no, date: m.date, opening: outstanding, capital, interest: r2(m.interest), fees: r2(m.fees), total: r2(capital + m.interest + m.fees), closing, paid: payments.find((p) => p.loanId === loan.id && p.instalmentNo === m.no) };
      outstanding = closing;
      return row;
    });
  }
  const perYear = loan.frequency === 'monthly' ? 12 : 4;
  const step = loan.frequency === 'monthly' ? 1 : 3;
  const n = Math.max(1, Math.round(loan.months / step));
  const r = loan.annualRate / perYear;
  const annuity = r === 0 ? r2(loan.principal / n) : r2((loan.principal * r) / (1 - Math.pow(1 + r, -n)));
  const out: Instalment[] = [];
  let outstanding = loan.principal;
  for (let i = 1; i <= n; i++) {
    const interest = r2(outstanding * r);
    let capital = loan.method === 'annuity' ? r2(annuity - interest) : r2(loan.principal / n);
    if (i === n || capital > outstanding) capital = r2(outstanding); // the last instalment clears rounding
    const closing = r2(outstanding - capital);
    out.push({ no: i, date: addMonths(loan.startDate, i * step), opening: outstanding, capital, interest, fees: loan.feePerInstalment, total: r2(capital + interest + loan.feePerInstalment), closing, paid: payments.find((p) => p.loanId === loan.id && p.instalmentNo === i) });
    outstanding = closing;
  }
  return out;
}

export function loanOutstanding(loan: Loan, payments: LoanPayment[]): number {
  return r2(loan.principal - sum(payments.filter((p) => p.loanId === loan.id).map((p) => p.capital)));
}

export interface LoanInput {
  entityId: Id;
  lender: string;
  reference: string;
  currency: Currency;
  principal: number;
  annualRate: number;
  months: number;
  startDate: ISODate;
  frequency: 'monthly' | 'quarterly';
  method: 'annuity' | 'linear';
  feePerInstalment?: number;
  bankAccountId: Id;
  notes?: string;
  postDrawdown?: boolean; // Dr bank / Cr loan at the start date
  scheduleMode?: 'auto' | 'manual';
  manualSchedule?: ManualInstalment[]; // the bank's table, when manual
  interestAccountId?: Id;
  loanAccountId?: Id;
  journalId?: Id;
}

// A hand-entered schedule: numbered from 1, dated in order, capital that adds up to the principal at most.
export function checkManualSchedule(principal: number, rows: ManualInstalment[]): ManualInstalment[] {
  const sorted = [...rows].map((r) => ({ no: Number(r.no), date: r.date, capital: r2(Number(r.capital) || 0), interest: r2(Number(r.interest) || 0), fees: r2(Number(r.fees) || 0) })).sort((a, b) => a.no - b.no);
  if (!sorted.length) throw new DomainError('schedule', 'Échéancier vide : saisir au moins une échéance');
  sorted.forEach((r, i) => {
    if (r.no !== i + 1) throw new DomainError('schedule', `Échéances numérotées de 1 à ${sorted.length} attendues (trou ou doublon au n° ${r.no})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new DomainError('schedule', `Date invalide sur l'échéance ${r.no}`);
    if (i > 0 && r.date < sorted[i - 1].date) throw new DomainError('schedule', `L'échéance ${r.no} est datée avant la précédente`);
    if (r.capital < 0 || r.interest < 0 || r.fees < 0) throw new DomainError('schedule', `Montants négatifs sur l'échéance ${r.no}`);
  });
  const capital = sum(sorted.map((r) => r.capital));
  if (capital > principal + 0.01) throw new DomainError('schedule', `Le capital de l'échéancier (${capital}) dépasse le montant emprunté (${principal})`);
  return sorted;
}

export function addLoan(state: State, input: LoanInput): [State, Loan] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], "d'enregistrer un emprunt");
  if (!input.lender.trim()) throw new DomainError('lender', 'Le prêteur est obligatoire');
  if (!(input.principal > 0)) throw new DomainError('principal', 'Montant emprunté positif requis');
  if (input.annualRate < 0 || input.annualRate > 1) throw new DomainError('rate', 'Taux annuel entre 0 et 100 %');
  if (!(input.months >= 1 && input.months <= 480)) throw new DomainError('months', 'Durée entre 1 et 480 mois');
  if (input.frequency === 'quarterly' && input.months % 3 !== 0) throw new DomainError('months', 'Durée en mois multiple de 3 pour des échéances trimestrielles');
  const bank = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (bank.currency !== input.currency) throw new DomainError('currency', `Le compte ${bank.name} est en ${bank.currency}`);
  if (state.loans.some((l) => l.entityId === input.entityId && l.reference.toLowerCase() === input.reference.trim().toLowerCase())) throw new DomainError('exists', 'Un emprunt porte déjà cette référence');
  for (const [key, id] of [['interestAccountId', input.interestAccountId], ['loanAccountId', input.loanAccountId]] as const) {
    if (id && !state.accounts.some((a) => a.id === id && a.entityId === input.entityId && a.active && a.isPostable)) throw new DomainError(key, 'Compte comptable inconnu ou non imputable');
  }
  if (input.journalId && !state.journals.some((j) => j.id === input.journalId && j.entityId === input.entityId)) throw new DomainError('journal', 'Journal inconnu');
  const manual = input.scheduleMode === 'manual' ? checkManualSchedule(r2(input.principal), input.manualSchedule ?? []) : undefined;
  const [s1, id] = nextId(state, 'loan');
  let loan: Loan = { id, entityId: input.entityId, lender: input.lender.trim(), reference: input.reference.trim(), currency: input.currency, principal: r2(input.principal), annualRate: input.annualRate, months: input.months, startDate: input.startDate, frequency: input.frequency, method: input.method, feePerInstalment: r2(input.feePerInstalment ?? 0), bankAccountId: bank.id, status: 'active', notes: input.notes, scheduleMode: input.scheduleMode ?? 'auto', manualSchedule: manual, interestAccountId: input.interestAccountId, loanAccountId: input.loanAccountId, journalId: input.journalId };
  let s: State = { ...s1, loans: [...s1.loans, loan] };
  if (input.postDrawdown) {
    requirePost(state);
    const entity = state.entities.find((e) => e.id === input.entityId)!;
    const rate = fxRate(state, input.currency, entity.functionalCurrency, input.startDate);
    const journal = loan.journalId ? state.journals.find((j) => j.id === loan.journalId)! : bankJournalFor(state, bank);
    const lines: DraftLineInput[] = [
      { accountId: bank.glAccountId, description: `Déblocage emprunt ${loan.reference} ${loan.lender}`, debitTxn: loan.principal, bankAccountId: bank.id },
      { accountId: (loan.loanAccountId ?? mapped(state, input.entityId, 'LOAN_PAYABLE').id), description: `Emprunt ${loan.reference} ${loan.lender}`, creditTxn: loan.principal },
    ];
    const [s2, draft] = createDraft(s, { entityId: input.entityId, journalId: journal.id, date: input.startDate, description: `Déblocage emprunt ${loan.reference}`, currency: input.currency, fxRate: rate, sourceType: 'loan', sourceId: id, postingRule: 'loan_drawdown.v1', lines });
    const [s3, posted] = postEntry(s2, draft.id);
    loan = { ...loan, drawdownEntryId: posted.id };
    s = { ...s3, loans: s3.loans.map((l) => (l.id === id ? loan : l)) };
  }
  return [audit(s, 'loan', id, 'I', `Emprunt ${loan.reference} · ${loan.lender} · ${loan.principal} ${loan.currency}`, input.entityId), loan];
}

// loan_instalment.v1 — Dr loan (capital) + Dr interest + Dr fees / Cr bank
export function payInstalment(state: State, input: { loanId: Id; instalmentNo: number; date?: ISODate; bankAccountId?: Id }): [State, LoanPayment] {
  requirePost(state);
  const loan = state.loans.find((l) => l.id === input.loanId);
  if (!loan) throw new DomainError('not_found', 'Emprunt inconnu');
  if (loan.status !== 'active') throw new DomainError('state', 'Emprunt clôturé');
  const schedule = loanSchedule(loan, state.loanPayments);
  const inst = schedule.find((i) => i.no === input.instalmentNo);
  if (!inst) throw new DomainError('not_found', 'Échéance inconnue');
  if (inst.paid) throw new DomainError('state', `Échéance ${inst.no} déjà réglée`);
  const previous = schedule.find((i) => i.no === inst.no - 1);
  if (previous && !previous.paid) throw new DomainError('order', `Régler d'abord l'échéance ${previous.no}`);
  const bank = state.bankAccounts.find((b) => b.id === (input.bankAccountId ?? loan.bankAccountId));
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (bank.currency !== loan.currency) throw new DomainError('currency', `Le compte ${bank.name} est en ${bank.currency}`);
  const date = input.date ?? inst.date;
  const entity = state.entities.find((e) => e.id === loan.entityId)!;
  const rate = fxRate(state, loan.currency, entity.functionalCurrency, date);
  const journal = loan.journalId ? state.journals.find((j) => j.id === loan.journalId)! : bankJournalFor(state, bank);
  const lines: DraftLineInput[] = [];
  if (inst.capital) lines.push({ accountId: loan.loanAccountId ?? mapped(state, loan.entityId, 'LOAN_PAYABLE').id, description: `Capital échéance ${inst.no} ${loan.reference}`, debitTxn: inst.capital });
  if (inst.interest) lines.push({ accountId: loan.interestAccountId ?? mapped(state, loan.entityId, 'LOAN_INTEREST').id, description: `Intérêts échéance ${inst.no} ${loan.reference}`, debitTxn: inst.interest });
  if (inst.fees) lines.push({ accountId: mapped(state, loan.entityId, 'BANK_FEES').id, description: `Frais échéance ${inst.no} ${loan.reference}`, debitTxn: inst.fees });
  lines.push({ accountId: bank.glAccountId, description: `Échéance ${inst.no} ${loan.reference} ${loan.lender}`, creditTxn: inst.total, bankAccountId: bank.id });
  const [s1, id] = nextId(state, 'lpay');
  const [s2, draft] = createDraft(s1, { entityId: loan.entityId, journalId: journal.id, date, description: `Échéance ${inst.no}/${schedule.length} emprunt ${loan.reference}`, currency: loan.currency, fxRate: rate, sourceType: 'loan_payment', sourceId: id, postingRule: 'loan_instalment.v1', lines });
  const [s3, posted] = postEntry(s2, draft.id);
  const payment: LoanPayment = { id, entityId: loan.entityId, loanId: loan.id, instalmentNo: inst.no, date, capital: inst.capital, interest: inst.interest, fees: inst.fees, total: inst.total, bankAccountId: bank.id, journalEntryId: posted.id };
  const closed = inst.no === schedule.length;
  const s4: State = { ...s3, loanPayments: [...s3.loanPayments, payment], loans: closed ? s3.loans.map((l) => (l.id === loan.id ? { ...l, status: 'closed' as const } : l)) : s3.loans };
  return [audit(s4, 'loan_payment', id, 'I', `Échéance ${inst.no} réglée · ${loan.reference} · ${inst.total} ${loan.currency}${closed ? ' · emprunt soldé' : ''}`, loan.entityId), payment];
}

export interface LoanSummary {
  loan: Loan;
  schedule: Instalment[];
  outstanding: number;
  paidCount: number;
  nextDue?: Instalment;
  overdue: Instalment[]; // due and unpaid
  interestPaid: number;
  interestRemaining: number;
}

export function loanSummaries(state: State, entityId: Id): LoanSummary[] {
  return state.loans
    .filter((l) => l.entityId === entityId)
    .map((loan) => {
      const schedule = loanSchedule(loan, state.loanPayments);
      const unpaid = schedule.filter((i) => !i.paid);
      return {
        loan,
        schedule,
        outstanding: loanOutstanding(loan, state.loanPayments),
        paidCount: schedule.length - unpaid.length,
        nextDue: unpaid[0],
        overdue: unpaid.filter((i) => i.date < state.today),
        interestPaid: sum(schedule.filter((i) => i.paid).map((i) => i.interest)),
        interestRemaining: sum(unpaid.map((i) => i.interest)),
      };
    });
}


// Manual schedules can be edited until an instalment is paid; the loan's terms stay informative.
export function setLoanSchedule(state: State, loanId: Id, rows: ManualInstalment[]): [State, Loan] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], "de modifier l'échéancier");
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) throw new DomainError('not_found', 'Emprunt inconnu');
  const sorted = checkManualSchedule(loan.principal, rows);
  const paid = state.loanPayments.filter((p) => p.loanId === loanId);
  for (const p of paid) {
    const r = sorted.find((x) => x.no === p.instalmentNo);
    if (!r || Math.abs(r.capital - p.capital) > 0.004 || Math.abs(r.interest - p.interest) > 0.004 || Math.abs(r.fees - p.fees) > 0.004) throw new DomainError('paid', `L'échéance ${p.instalmentNo} est réglée et comptabilisée : elle ne change plus`);
  }
  const next: Loan = { ...loan, scheduleMode: 'manual', manualSchedule: sorted };
  return [audit({ ...state, loans: state.loans.map((l) => (l.id === loanId ? next : l)) }, 'loan', loanId, 'U', `Échéancier manuel · ${sorted.length} échéances · ${loan.reference}`, loan.entityId), next];
}

export function updateLoan(state: State, loanId: Id, patch: Partial<Pick<Loan, 'lender' | 'reference' | 'notes' | 'interestAccountId' | 'loanAccountId' | 'journalId' | 'feePerInstalment' | 'annualRate' | 'months' | 'frequency' | 'method' | 'scheduleMode'>>): [State, Loan] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de modifier un emprunt');
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) throw new DomainError('not_found', 'Emprunt inconnu');
  const paid = state.loanPayments.some((p) => p.loanId === loanId);
  if (paid && (patch.annualRate !== undefined || patch.months !== undefined || patch.frequency !== undefined || patch.method !== undefined || (patch.scheduleMode && patch.scheduleMode !== loan.scheduleMode))) throw new DomainError('paid', 'Des échéances sont réglées : les conditions de calcul ne changent plus');
  const next: Loan = { ...loan, ...patch, lender: (patch.lender ?? loan.lender).trim(), reference: (patch.reference ?? loan.reference).trim() };
  if (next.scheduleMode === 'manual' && !next.manualSchedule?.length) next.manualSchedule = loanSchedule({ ...next, scheduleMode: 'auto' }).map((i) => ({ no: i.no, date: i.date, capital: i.capital, interest: i.interest, fees: i.fees }));
  return [audit({ ...state, loans: state.loans.map((l) => (l.id === loanId ? next : l)) }, 'loan', loanId, 'U', `Emprunt ${next.reference} modifié`, loan.entityId), next];
}

// Rows from a spreadsheet (date, capital, intérêts, frais[, total]) become a manual schedule.
export function parseScheduleRows(rows: Record<string, string>[]): ManualInstalment[] {
  const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of Object.keys(r)) if (keys.some((x) => k.trim().toLowerCase().startsWith(x))) return String(r[k] ?? '').trim(); return ''; };
  const num = (v: string) => Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
  const toIso = (v: string) => {
    const t = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    const m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(t);
    return isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
  };
  return rows
    .map((r, i) => ({ no: Number(pick(r, 'n°', 'no', 'num', '#')) || i + 1, date: toIso(pick(r, 'date', 'échéance', 'echeance')), capital: num(pick(r, 'capital', 'amortissement', 'principal')), interest: num(pick(r, 'intér', 'inter')), fees: num(pick(r, 'frais', 'fees', 'assurance')) }))
    .filter((r) => r.date);
}
