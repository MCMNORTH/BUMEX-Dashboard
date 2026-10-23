import type { State, Id, ISODate, Currency, BankTransaction, BankAccount, CustomerPayment, SalesInvoice } from './types';
import { DomainError } from './types';
import { r2, sum, addDays, daysBetween } from './money';
import { nextId, audit, mapped, fxRate, requirePost, bankJournalFor, requireRole, PARTNER_ROLES } from './core';
import { createDraft, postEntry, accountBalance, type DraftLineInput } from './ledger';
import { sha256 } from './sha256';
import { openInvoices } from './sales';

export interface StatementLineInput {
  date: ISODate;
  amount: number;
  description: string;
  reference?: string;
}

// CSV in the common bank export shape: date;libellé;montant (or date,label,amount). Amount may use a comma.
export function parseStatementCsv(text: string): StatementLineInput[] {
  const out: StatementLineInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(';') ? ';' : ',';
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 3) continue;
    const date = normaliseDate(cells[0]);
    if (!date) continue;
    const amount = Number(cells[2].replace(/[\s ]/g, '').replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    out.push({ date, description: cells[1], amount: r2(amount), reference: cells[3] });
  }
  return out;
}

function normaliseDate(s: string): ISODate | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function importStatement(state: State, bankAccountId: Id, lines: StatementLineInput[], closingBalance?: number): [State, number] {
  const bank = state.bankAccounts.find((b) => b.id === bankAccountId);
  if (!bank) throw new DomainError('not_found', 'Compte bancaire inconnu');
  let s = state;
  let added = 0;
  const txns: BankTransaction[] = [];
  for (const l of lines) {
    const hash = sha256(`${bankAccountId}|${l.date}|${l.amount}|${l.description}|${l.reference ?? ''}`).slice(0, 16);
    if (s.bankTransactions.some((t) => t.bankAccountId === bankAccountId && t.importHash === hash) || txns.some((t) => t.importHash === hash)) continue;
    const [s1, id] = nextId(s, 'btx');
    s = s1;
    txns.push({ id, bankAccountId, date: l.date, amount: l.amount, description: l.description, reference: l.reference, status: 'unmatched', importHash: hash });
    added++;
  }
  const last = [...lines].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const banks = s.bankAccounts.map((b) => (b.id === bankAccountId ? { ...b, statementBalance: closingBalance ?? r2(b.statementBalance + sum(txns.map((t) => t.amount))), statementDate: last ? (b.statementDate && b.statementDate > last.date ? b.statementDate : last.date) : b.statementDate } : b));
  return [audit({ ...s, bankTransactions: [...s.bankTransactions, ...txns], bankAccounts: banks }, 'bank_statement', bankAccountId, 'I', `${added} ligne(s) importée(s)`, bank.entityId), added];
}

export type Suggestion =
  | { kind: 'payment'; payment: CustomerPayment; label: string }
  | { kind: 'invoice'; invoice: SalesInvoice; label: string }
  | { kind: 'rule'; mappingKey: string; label: string }
  | { kind: 'transfer'; label: string }
  | { kind: 'none'; label: string };

export function suggestFor(state: State, txn: BankTransaction): Suggestion {
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  // 1. a payment already recorded for the same amount, not yet matched
  const pay = state.customerPayments.find((p) => p.entityId === bank.entityId && p.bankAccountId === bank.id && !p.bankTransactionId && Math.abs(p.amountTxn - txn.amount) < 0.005 && Math.abs(daysBetween(p.date, txn.date)) <= 7);
  if (pay) return { kind: 'payment', payment: pay, label: `Encaissement ${pay.number} · 100 %` };
  // 2. an open invoice whose number or amount appears in the description
  if (txn.amount > 0) {
    const open = openInvoices(state, bank.entityId);
    const byNumber = open.find((o) => o.invoice.number && txn.description.toUpperCase().includes(o.invoice.number.toUpperCase()));
    if (byNumber) return { kind: 'invoice', invoice: byNumber.invoice, label: `Encaisser ${byNumber.invoice.number} · ${byNumber.customer.name}` };
    const byAmount = open.find((o) => o.invoice.currency === bank.currency && Math.abs(o.openTxn - txn.amount) < 0.005);
    if (byAmount) return { kind: 'invoice', invoice: byAmount.invoice, label: `Encaisser ${byAmount.invoice.number} · ${byAmount.customer.name}` };
  }
  // 3. a recognition rule on the description
  for (const rule of state.bankRules.filter((r) => r.entityId === bank.entityId)) {
    if (new RegExp(rule.pattern, 'i').test(txn.description)) {
      if (rule.mappingKey === 'TRANSFER') return { kind: 'transfer', label: rule.label };
      return { kind: 'rule', mappingKey: rule.mappingKey, label: rule.label };
    }
  }
  return { kind: 'none', label: 'Aucune correspondance' };
}

export function matchToPayment(state: State, txnId: Id, paymentId: Id): State {
  const txn = state.bankTransactions.find((t) => t.id === txnId);
  const pay = state.customerPayments.find((p) => p.id === paymentId);
  if (!txn || !pay) throw new DomainError('not_found', 'Ligne ou paiement inconnu');
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  return audit(
    { ...state, bankTransactions: state.bankTransactions.map((t) => (t.id === txnId ? { ...t, status: 'matched' as const, journalEntryId: pay.journalEntryId } : t)), customerPayments: state.customerPayments.map((p) => (p.id === paymentId ? { ...p, bankTransactionId: txnId } : p)) },
    'reconciliation_match', txnId, 'I', `Rapprochée avec ${pay.number}`, bank.entityId,
  );
}

// bank_fee.v1 / bank_interest.v1 — Dr expense (or Cr income) / Cr bank, from a recognition rule
export function bookByRule(state: State, txnId: Id, mappingKey: string): [State, Id] {
  requirePost(state);
  const txn = state.bankTransactions.find((t) => t.id === txnId);
  if (!txn) throw new DomainError('not_found', 'Ligne inconnue');
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  const entity = state.entities.find((e) => e.id === bank.entityId)!;
  const other = mapped(state, bank.entityId, mappingKey);
  const rate = fxRate(state, bank.currency, entity.functionalCurrency, txn.date);
  const journal = bankJournalFor(state, bank);
  const amt = Math.abs(txn.amount);
  const lines: DraftLineInput[] = txn.amount < 0
    ? [{ accountId: other.id, description: txn.description, debitTxn: amt }, { accountId: bank.glAccountId, description: txn.description, creditTxn: amt, bankAccountId: bank.id }]
    : [{ accountId: bank.glAccountId, description: txn.description, debitTxn: amt, bankAccountId: bank.id }, { accountId: other.id, description: txn.description, creditTxn: amt }];
  const [s1, draft] = createDraft(state, { entityId: bank.entityId, journalId: journal.id, date: txn.date, description: txn.description, currency: bank.currency, fxRate: rate, sourceType: 'bank_transaction', sourceId: txn.id, postingRule: `bank_rule.${mappingKey.toLowerCase()}`, lines });
  const [s2, posted] = postEntry(s1, draft.id);
  return [audit({ ...s2, bankTransactions: s2.bankTransactions.map((t) => (t.id === txnId ? { ...t, status: 'booked' as const, journalEntryId: posted.id } : t)) }, 'bank_transaction', txnId, 'U', `Comptabilisée via ${mappingKey}`, bank.entityId), posted.id];
}

// bank_suspense.v1 — the line is booked against 488 until someone explains it (reversal + repost)
export function bookToSuspense(state: State, txnId: Id): [State, Id] {
  return bookByRule(state, txnId, 'SUSPENSE');
}

// bank_transfer.v1 — Dr target bank / Cr source bank; both statement lines matched at once
export function bookTransfer(state: State, txnId: Id, targetBankAccountId: Id): [State, Id] {
  requirePost(state);
  const txn = state.bankTransactions.find((t) => t.id === txnId);
  if (!txn) throw new DomainError('not_found', 'Ligne inconnue');
  const source = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  const target = state.bankAccounts.find((b) => b.id === targetBankAccountId);
  if (!target || target.entityId !== source.entityId) throw new DomainError('not_found', 'Compte cible inconnu');
  const entity = state.entities.find((e) => e.id === source.entityId)!;
  const amt = Math.abs(txn.amount);
  const rateSrc = fxRate(state, source.currency, entity.functionalCurrency, txn.date);
  const rateTgt = fxRate(state, target.currency, entity.functionalCurrency, txn.date);
  const amtTgt = r2((amt * rateSrc) / rateTgt);
  const journal = bankJournalFor(state, source);
  // booked in functional currency so that two currencies can meet in one entry
  const lines: DraftLineInput[] = [
    { accountId: target.glAccountId, description: `Virement interne vers ${target.name}`, debitTxn: r2(amtTgt * rateTgt), bankAccountId: target.id },
    { accountId: source.glAccountId, description: `Virement interne depuis ${source.name}`, creditTxn: r2(amt * rateSrc), bankAccountId: source.id },
  ];
  const [s1, draft] = createDraft(state, { entityId: source.entityId, journalId: journal.id, date: txn.date, description: `Virement interne ${source.name} → ${target.name}`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'bank_transaction', sourceId: txn.id, postingRule: 'bank_transfer.v1', lines });
  const [s2, posted] = postEntry(s1, draft.id);
  const counterpart = s2.bankTransactions.find((t) => t.bankAccountId === target.id && t.status === 'unmatched' && Math.abs(t.amount - amtTgt) < 0.01 && Math.abs(daysBetween(t.date, txn.date)) <= 3);
  const txns = s2.bankTransactions.map((t) => (t.id === txnId || (counterpart && t.id === counterpart.id) ? { ...t, status: 'matched' as const, journalEntryId: posted.id } : t));
  return [audit({ ...s2, bankTransactions: txns }, 'bank_transaction', txnId, 'U', 'Virement interne comptabilisé', source.entityId), posted.id];
}

export interface BankSummary {
  account: BankAccount;
  bookBalance: number; // bank currency, from the ledger (functional / rate for foreign accounts)
  bookBalanceFunctional: number;
  statementBalance: number;
  unmatched: number;
}

export function bankSummary(state: State, entityId: Id): BankSummary[] {
  const entity = state.entities.find((e) => e.id === entityId)!;
  return state.bankAccounts
    .filter((b) => b.entityId === entityId)
    .map((account) => {
      const functional = accountBalance(state, entityId, account.glAccountId);
      const rate = fxRate(state, account.currency, entity.functionalCurrency, state.today);
      return { account, bookBalance: r2(functional / rate), bookBalanceFunctional: functional, statementBalance: account.statementBalance, unmatched: state.bankTransactions.filter((t) => t.bankAccountId === account.id && t.status === 'unmatched').length };
    });
}

export function cashPosition(state: State, entityId: Id): number {
  return sum(bankSummary(state, entityId).map((b) => b.bookBalanceFunctional));
}

export interface ForecastWeek {
  weekStart: ISODate;
  label: string;
  inflow: number;
  outflow: number;
  balance: number;
}

// 13-week forecast: opening cash, receivables by due date (overdue ones weighted 60 %), approved supplier
// invoices by due date, plus a monthly payroll estimate on the 28th.
export function cashForecast(state: State, entityId: Id, weeks = 13, payrollMonthly = 0): ForecastWeek[] {
  let balance = cashPosition(state, entityId);
  const out: ForecastWeek[] = [];
  const start = state.today;
  const receivables = openInvoices(state, entityId);
  const payables = state.supplierInvoices.filter((s) => s.entityId === entityId && (s.status === 'approved' || s.status === 'posted') && s.netPayable - s.amountPaid > 0);
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 6);
    const inWeek = (d: ISODate) => (w === 0 ? d <= we : d >= ws && d <= we);
    // overdue receivables: expected in week 2 at 60 %; current ones on their due date
    const inflow = sum(receivables.filter((r) => (r.daysOverdue > 0 ? w === 1 : inWeek(r.invoice.dueDate))).map((r) => r2(r.openFunctional * (r.daysOverdue > 0 ? 0.6 : 1))));
    let outflow = sum(payables.filter((p) => inWeek(p.dueDate)).map((p) => r2((p.netPayable - p.amountPaid) * p.fxRate)));
    let hasPayday = false;
    for (let k = 0; k < 7; k++) if (addDays(ws, k).slice(8, 10) === '28') hasPayday = true;
    if (payrollMonthly && hasPayday) outflow = r2(outflow + payrollMonthly);
    balance = r2(balance + inflow - outflow);
    out.push({ weekStart: ws, label: `S${isoWeek(ws)}`, inflow, outflow, balance });
  }
  return out;
}

function isoWeek(iso: ISODate): number {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}


// ---- bank accounts: created and maintained per entity, each with its ledger account and its journal ----------------

export interface BankAccountInput {
  entityId: Id;
  name: string;
  bankName: string;
  accountNumber?: string;
  rib?: string;
  iban?: string;
  bankAddress?: string;
  currency: Currency;
  glAccountId: Id;
  journalId?: Id;
  isCash?: boolean;
  showOnInvoices?: boolean;
}

function checkBankAccount(state: State, input: BankAccountInput, selfId?: Id) {
  if (!input.name.trim()) throw new DomainError('name', "L'intitulé du compte est obligatoire");
  if (!input.isCash && !input.bankName.trim()) throw new DomainError('bank', 'Le nom de la banque est obligatoire');
  const gl = state.accounts.find((a) => a.id === input.glAccountId && a.entityId === input.entityId);
  if (!gl) throw new DomainError('gl', 'Compte comptable inconnu pour cette entité');
  if (!gl.active || !gl.isPostable || gl.isAuxiliary) throw new DomainError('gl', `Le compte ${gl.code} n'est pas imputable ou n'est plus actif`);
  if (input.journalId) {
    const j = state.journals.find((x) => x.id === input.journalId && x.entityId === input.entityId);
    if (!j) throw new DomainError('journal', 'Journal inconnu pour cette entité');
    if (j.kind !== 'bank' && j.kind !== 'cash') throw new DomainError('journal', `Le journal ${j.code} n'est pas un journal de banque ou de caisse`);
  }
  const others = state.bankAccounts.filter((b) => b.entityId === input.entityId && b.id !== selfId);
  if (others.some((b) => b.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new DomainError('duplicate', `Un compte « ${input.name.trim()} » existe déjà`);
  const num = (input.accountNumber ?? '').replace(/\s/g, '');
  if (num && others.some((b) => (b.accountNumber ?? '').replace(/\s/g, '') === num)) throw new DomainError('duplicate', `Le numéro de compte ${input.accountNumber} est déjà enregistré`);
  const iban = (input.iban ?? '').replace(/\s/g, '').toUpperCase();
  if (iban && others.some((b) => (b.iban ?? '').replace(/\s/g, '').toUpperCase() === iban)) throw new DomainError('duplicate', `L'IBAN ${input.iban} est déjà enregistré`);
  if (others.some((b) => b.glAccountId === input.glAccountId)) throw new DomainError('duplicate', `Le compte ${gl.code} est déjà le compte comptable d'un autre compte bancaire`);
}

export function addBankAccount(state: State, input: BankAccountInput): [State, BankAccount] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de créer un compte bancaire');
  checkBankAccount(state, input);
  const [s1, id] = nextId(state, 'bank');
  const b: BankAccount = { id, entityId: input.entityId, name: input.name.trim(), bankName: input.bankName.trim(), accountNumber: input.accountNumber?.trim() || undefined, rib: input.rib?.trim() || undefined, iban: input.iban?.trim() || undefined, bankAddress: input.bankAddress?.trim() || undefined, currency: input.currency, glAccountId: input.glAccountId, journalId: input.journalId || undefined, isCash: !!input.isCash, showOnInvoices: !!input.showOnInvoices, active: true, statementBalance: 0 };
  return [audit({ ...s1, bankAccounts: [...s1.bankAccounts, b] }, 'bank_account', id, 'I', `Compte bancaire ${b.name} · ${b.bankName} · ${b.currency}`, b.entityId), b];
}

export function updateBankAccount(state: State, id: Id, patch: Partial<Omit<BankAccountInput, 'entityId'>>): [State, BankAccount] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de modifier un compte bancaire');
  const b = state.bankAccounts.find((x) => x.id === id);
  if (!b) throw new DomainError('not_found', 'Compte bancaire inconnu');
  const used = state.entries.some((e) => e.status !== 'draft' && e.lines.some((l) => l.bankAccountId === id));
  if (used && patch.currency && patch.currency !== b.currency) throw new DomainError('in_use', 'Des opérations existent : la devise ne change plus');
  if (used && patch.glAccountId && patch.glAccountId !== b.glAccountId) throw new DomainError('in_use', 'Des opérations existent : le compte comptable ne change plus');
  const merged: BankAccountInput = { entityId: b.entityId, name: patch.name ?? b.name, bankName: patch.bankName ?? b.bankName, accountNumber: patch.accountNumber ?? b.accountNumber, rib: patch.rib ?? b.rib, iban: patch.iban ?? b.iban, bankAddress: patch.bankAddress ?? b.bankAddress, currency: patch.currency ?? b.currency, glAccountId: patch.glAccountId ?? b.glAccountId, journalId: patch.journalId === undefined ? b.journalId : patch.journalId || undefined, isCash: patch.isCash ?? b.isCash, showOnInvoices: patch.showOnInvoices ?? b.showOnInvoices };
  checkBankAccount(state, merged, id);
  const next: BankAccount = { ...b, ...merged, name: merged.name.trim(), bankName: merged.bankName.trim(), accountNumber: merged.accountNumber?.trim() || undefined, rib: merged.rib?.trim() || undefined, iban: merged.iban?.trim() || undefined, bankAddress: merged.bankAddress?.trim() || undefined, journalId: merged.journalId || undefined, isCash: !!merged.isCash, showOnInvoices: !!merged.showOnInvoices };
  return [audit({ ...state, bankAccounts: state.bankAccounts.map((x) => (x.id === id ? next : x)) }, 'bank_account', id, 'U', `Compte bancaire ${next.name} modifié`, b.entityId), next];
}

export function setBankAccountActive(state: State, id: Id, active: boolean): [State, BankAccount] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de désactiver un compte bancaire');
  const b = state.bankAccounts.find((x) => x.id === id);
  if (!b) throw new DomainError('not_found', 'Compte bancaire inconnu');
  if (!active && state.bankTransactions.some((t) => t.bankAccountId === id && t.status === 'unmatched')) throw new DomainError('in_use', 'Des lignes de relevé restent à rapprocher sur ce compte');
  if (!active && state.loans.some((l) => l.bankAccountId === id && l.status === 'active')) throw new DomainError('in_use', 'Un emprunt actif est domicilié sur ce compte');
  const next = { ...b, active };
  return [audit({ ...state, bankAccounts: state.bankAccounts.map((x) => (x.id === id ? next : x)) }, 'bank_account', id, 'U', `Compte bancaire ${b.name} ${active ? 'réactivé' : 'désactivé'}`, b.entityId), next];
}

export function activeBankAccounts(state: State, entityId: Id): BankAccount[] {
  return state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false);
}
