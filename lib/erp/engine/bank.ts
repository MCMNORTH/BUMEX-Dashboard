import type { State, Id, ISODate, Currency, BankTransaction, BankAccount, BankRule, CustomerPayment, SalesInvoice } from './types';
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
  | { kind: 'assign'; rule: BankRule; label: string } // [bumex-one] a rule someone made: its account and third party
  | { kind: 'rule'; mappingKey: string; label: string }
  | { kind: 'transfer'; label: string }
  | { kind: 'none'; label: string };

export function suggestFor(state: State, txn: BankTransaction): Suggestion {
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  // 1. a payment already recorded for the same amount, not yet matched
  const pay = state.customerPayments.find((p) => p.entityId === bank.entityId && p.bankAccountId === bank.id && !p.bankTransactionId && Math.abs(p.amountTxn - txn.amount) < 0.005 && Math.abs(daysBetween(p.date, txn.date)) <= 7);
  if (pay) return { kind: 'payment', payment: pay, label: `Encaissement ${pay.number} · 100 %` };
  // 2. an open invoice whose number appears in the description
  const open = txn.amount > 0 ? openInvoices(state, bank.entityId) : [];
  const byNumber = open.find((o) => o.invoice.number && txn.description.toUpperCase().includes(o.invoice.number.toUpperCase()));
  if (byNumber) return { kind: 'invoice', invoice: byNumber.invoice, label: `Encaisser ${byNumber.invoice.number} · ${byNumber.customer.name}` };
  // 3. [bumex-one] a rule someone made on the label: it says more than an amount that happens to match
  const own = ownRuleFor(state, txn);
  if (own) return { kind: 'assign', rule: own, label: own.label };
  // 4. an open invoice of the same amount
  const byAmount = open.find((o) => o.invoice.currency === bank.currency && Math.abs(o.openTxn - txn.amount) < 0.005);
  if (byAmount) return { kind: 'invoice', invoice: byAmount.invoice, label: `Encaisser ${byAmount.invoice.number} · ${byAmount.customer.name}` };
  // 5. a recognition rule of the chart on the description
  for (const rule of state.bankRules.filter((r) => r.entityId === bank.entityId && !r.accountId && r.mappingKey)) {
    if (ruleMatches(rule, txn)) {
      if (rule.mappingKey === 'TRANSFER') return { kind: 'transfer', label: rule.label };
      return { kind: 'rule', mappingKey: rule.mappingKey!, label: rule.label };
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

// ---- [bumex-one] a statement line to any account (asked by Sidaty on 2026-11-18) ----------------------------------------
// The closed list above (fees, interest, transfer, suspense) stays as quick actions. A line also goes to any account of
// the chart, with its third party (client, supplier, employee), split over several accounts if need be (bank_assignment.v1).
// A line already put into the suspense account is explained the same way: an entry moves it from the suspense account
// to the accounts chosen (bank_reclass.v1), the bank's side untouched. Rules people make on the label (stored: 0020)
// propose the account and third party, and book every line they recognise in one go.

export interface StatementSplit {
  accountId: Id;
  amount: number; // bank currency, > 0: the splits add up to the line's amount without its sign
  description?: string;
  customerId?: Id;
  supplierId?: Id;
  employeeId?: Id;
}

const SUSPENSE_RULE = 'bank_rule.suspense';
const RECLASS_RULE = 'bank_reclass.v1';

// a label as rules read it: no accents, one case, single spaces
const foldLabel = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// The chart's rules are regular expressions; a rule someone made lists the words the label contains ("|" between
// alternatives), whatever the case or accents.
export function ruleMatches(rule: BankRule, txn: Pick<BankTransaction, 'description' | 'bankAccountId'>): boolean {
  if (rule.bankAccountId && rule.bankAccountId !== txn.bankAccountId) return false;
  if (rule.builtIn || !rule.accountId) {
    try { return new RegExp(rule.pattern, 'i').test(txn.description); } catch { return false; }
  }
  const label = foldLabel(txn.description);
  return rule.pattern.split('|').map(foldLabel).filter(Boolean).some((w) => label.includes(w));
}

// the first rule someone made that recognises the line: those of the line's own account first
export function ownRuleFor(state: State, txn: BankTransaction): BankRule | undefined {
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId);
  if (!bank) return undefined;
  const own = state.bankRules.filter((r) => r.entityId === bank.entityId && !r.builtIn && r.accountId);
  return [...own.filter((r) => r.bankAccountId), ...own.filter((r) => !r.bankAccountId)].find((r) => ruleMatches(r, txn));
}

// The lines of an entity put into the suspense account and not explained since. Explained: by Vanguard (a
// bank_reclass.v1 entry), or by hand before it could, by an entry moving the same amount out of the suspense account
// (one for one, oldest first). A reclassification grouping several lines is not recognised: the suspense account's
// balance, given beside, tells.
export interface SuspenseLine { txn: BankTransaction; entryId: Id; amount: number } // functional, the suspense line's debit − credit
export interface SuspenseSummary { accountId?: Id; balance: number; pending: SuspenseLine[]; explainedByHand: number }

export function suspenseSummary(state: State, entityId: Id): SuspenseSummary {
  let account: { id: Id } | undefined;
  try { account = mapped(state, entityId, 'SUSPENSE'); } catch { return { balance: 0, pending: [], explainedByHand: 0 }; }
  const banks = new Set(state.bankAccounts.filter((b) => b.entityId === entityId).map((b) => b.id));
  const entries = new Map(state.entries.map((e) => [e.id, e]));
  const parked: SuspenseLine[] = [];
  for (const t of state.bankTransactions) {
    if (!banks.has(t.bankAccountId) || t.status !== 'booked' || !t.journalEntryId) continue;
    const e = entries.get(t.journalEntryId);
    if (!e || e.status !== 'posted' || e.postingRule !== SUSPENSE_RULE) continue;
    parked.push({ txn: t, entryId: e.id, amount: r2(sum(e.lines.filter((l) => l.accountId === account!.id).map((l) => l.debit - l.credit))) });
  }
  const reclassed = new Set(state.entries.filter((e) => e.status === 'posted' && e.postingRule === RECLASS_RULE && e.sourceType === 'bank_transaction').map((e) => e.sourceId));
  const parkedEntries = new Set(parked.map((p) => p.entryId));
  // the suspense account's other movements: what someone moved out of it by hand
  const byHand: { date: ISODate; amount: number }[] = [];
  let balance = 0;
  for (const e of state.entries) {
    if (e.entityId !== entityId || (e.status !== 'posted' && e.status !== 'reversed')) continue;
    const moved = r2(sum(e.lines.filter((l) => l.accountId === account!.id).map((l) => l.debit - l.credit)));
    if (!moved) continue;
    balance = r2(balance + moved);
    if (e.status === 'posted' && !parkedEntries.has(e.id) && e.postingRule !== RECLASS_RULE && e.sourceType !== 'reversal' && !e.reversalOfId) byHand.push({ date: e.date, amount: moved });
  }
  byHand.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pending: SuspenseLine[] = [];
  let explainedByHand = 0;
  for (const p of [...parked].sort((a, b) => (a.txn.date < b.txn.date ? -1 : a.txn.date > b.txn.date ? 1 : 0))) {
    if (reclassed.has(p.txn.id)) continue;
    const i = byHand.findIndex((m) => m.date >= p.txn.date && Math.abs(m.amount + p.amount) < 0.005);
    if (i >= 0) { byHand.splice(i, 1); explainedByHand++; continue; }
    pending.push(p);
  }
  return { accountId: account.id, balance, pending, explainedByHand };
}

export function assignStatementLine(state: State, txnId: Id, splits: StatementSplit[], note?: string, date?: ISODate): [State, Id] {
  requirePost(state);
  const txn = state.bankTransactions.find((t) => t.id === txnId);
  if (!txn) throw new DomainError('not_found', 'Ligne inconnue');
  const bank = state.bankAccounts.find((b) => b.id === txn.bankAccountId)!;
  const entity = state.entities.find((e) => e.id === bank.entityId)!;
  const parked = txn.status === 'unmatched' ? undefined : suspenseSummary(state, bank.entityId).pending.find((p) => p.txn.id === txn.id);
  if (txn.status !== 'unmatched' && !parked) throw new DomainError('state', txn.status === 'matched' ? 'Ligne déjà rapprochée' : 'Ligne déjà comptabilisée');
  const total = r2(Math.abs(txn.amount));
  const clean = splits.map((s) => ({ ...s, amount: r2(s.amount) })).filter((s) => s.accountId || s.amount);
  if (!clean.length) throw new DomainError('splits', 'Choisissez au moins un compte');
  const bankAccounts = new Map(state.bankAccounts.filter((b) => b.entityId === bank.entityId).map((b) => [b.glAccountId, b]));
  const suspenseId = parked ? mapped(state, bank.entityId, 'SUSPENSE').id : undefined;
  for (const s of clean) {
    if (!(s.amount > 0)) throw new DomainError('amount', 'Chaque montant de la répartition doit être positif');
    const a = state.accounts.find((x) => x.id === s.accountId && x.entityId === bank.entityId);
    if (!a) throw new DomainError('account', 'Compte inconnu pour cette entité');
    if (!a.isPostable || !a.active) throw new DomainError('account', `Le compte ${a.code} n'est pas imputable ou n'est plus actif`);
    const other = bankAccounts.get(a.id);
    if (other) throw new DomainError('account', `${a.code} est le compte de ${other.name} : utilisez « Virement interne »`);
    if (a.id === suspenseId) throw new DomainError('account', `${a.code} est le compte d'attente lui-même`);
    if (s.customerId && !state.customers.some((c) => c.id === s.customerId && c.entityId === bank.entityId)) throw new DomainError('party', 'Client inconnu pour cette entité');
    if (s.supplierId && !state.suppliers.some((c) => c.id === s.supplierId && c.entityId === bank.entityId)) throw new DomainError('party', 'Fournisseur inconnu pour cette entité');
    if (s.employeeId && !state.employees.some((c) => c.id === s.employeeId && c.entityId === bank.entityId)) throw new DomainError('party', 'Salarié inconnu pour cette entité');
  }
  const split = r2(sum(clean.map((s) => s.amount)));
  if (Math.abs(split - total) > 0.004) throw new DomainError('amount', `La répartition (${split}) doit faire le montant de la ligne (${total})`);

  const out = txn.amount < 0; // money out: the accounts are debited
  const parkedEntry = parked ? state.entries.find((e) => e.id === parked.entryId)! : undefined;
  const rate = parkedEntry ? parkedEntry.fxRate : fxRate(state, bank.currency, entity.functionalCurrency, txn.date);
  const counterpart: DraftLineInput = parked
    ? { accountId: suspenseId!, description: txn.description, ...(out ? { creditTxn: total } : { debitTxn: total }) }
    : { accountId: bank.glAccountId, description: txn.description, ...(out ? { creditTxn: total } : { debitTxn: total }), bankAccountId: bank.id };
  const lines: DraftLineInput[] = clean.map((s) => ({
    accountId: s.accountId, description: s.description?.trim() || txn.description, ...(out ? { debitTxn: s.amount } : { creditTxn: s.amount }),
    customerId: s.customerId || undefined, supplierId: s.supplierId || undefined, employeeId: s.employeeId || undefined,
  }));
  const journal = parked ? state.journals.find((j) => j.entityId === bank.entityId && j.kind === 'misc') ?? bankJournalFor(state, bank) : bankJournalFor(state, bank);
  const codes = clean.map((s) => state.accounts.find((a) => a.id === s.accountId)!.code).join(', ');
  const [s1, draft] = createDraft(state, {
    entityId: bank.entityId, journalId: journal.id, date: parked ? date ?? txn.date : txn.date,
    description: parked ? `Reclassement de l'attente : ${txn.description}` : txn.description,
    currency: bank.currency, fxRate: rate, sourceType: 'bank_transaction', sourceId: txn.id, postingRule: parked ? RECLASS_RULE : 'bank_assignment.v1',
    lines: out ? [...lines, counterpart] : [counterpart, ...lines],
  });
  const [s2, posted] = postEntry(s1, draft.id);
  const s3 = parked ? s2 : { ...s2, bankTransactions: s2.bankTransactions.map((t) => (t.id === txnId ? { ...t, status: 'booked' as const, journalEntryId: posted.id } : t)) };
  return [audit(s3, 'bank_transaction', txnId, 'U', `${parked ? 'Attente reclassée' : 'Affectée'} : ${codes}${note ? ` · ${note}` : ''}`, bank.entityId), posted.id];
}

// Every line still to explain on an account that a rule recognises, booked at once: someone's rules (their account and
// third party), the chart's (fees, interest). Lines a recorded payment or an open invoice explains, transfers and lines
// whose booking is refused (a locked period…) are left for the screen.
export function applyBankRules(state: State, bankAccountId: Id): [State, { booked: number; skipped: number }] {
  requirePost(state);
  let s = state;
  let booked = 0, skipped = 0;
  for (const { id } of state.bankTransactions.filter((t) => t.bankAccountId === bankAccountId && t.status === 'unmatched')) {
    const txn = s.bankTransactions.find((t) => t.id === id)!;
    if (txn.status !== 'unmatched') continue;
    const sg = suggestFor(s, txn);
    if (sg.kind !== 'assign' && sg.kind !== 'rule') continue;
    try {
      s = sg.kind === 'assign' ? assignStatementLine(s, txn.id, [splitOf(sg.rule, Math.abs(txn.amount))], sg.rule.label)[0] : bookByRule(s, txn.id, sg.mappingKey)[0];
      booked++;
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      skipped++;
    }
  }
  return [s, { booked, skipped }];
}

// a rule's account and third party, for the whole line
export function splitOf(rule: BankRule, amount: number): StatementSplit {
  return { accountId: rule.accountId!, amount: r2(amount), customerId: rule.customerId, supplierId: rule.supplierId, employeeId: rule.employeeId };
}

export interface BankRuleInput {
  entityId: Id;
  pattern: string;
  label?: string;
  accountId: Id;
  customerId?: Id;
  supplierId?: Id;
  employeeId?: Id;
  bankAccountId?: Id;
}

function checkedRule(state: State, input: BankRuleInput): Omit<BankRule, 'id'> {
  const pattern = input.pattern.split('|').map((w) => w.replace(/\s+/g, ' ').trim()).filter(Boolean).join('|');
  if (pattern.replace(/\|/g, '').length < 3) throw new DomainError('pattern', 'Le libellé à reconnaître doit faire au moins 3 caractères');
  const a = state.accounts.find((x) => x.id === input.accountId && x.entityId === input.entityId);
  if (!a || !a.isPostable || !a.active) throw new DomainError('account', 'Compte inconnu, non imputable ou inactif');
  const bankGl = state.bankAccounts.find((b) => b.entityId === input.entityId && b.glAccountId === a.id);
  if (bankGl) throw new DomainError('account', `${a.code} est le compte de ${bankGl.name} : un virement interne se rapproche par « Virement interne »`);
  if (input.bankAccountId && !state.bankAccounts.some((b) => b.id === input.bankAccountId && b.entityId === input.entityId)) throw new DomainError('bank', 'Compte bancaire inconnu');
  if (input.customerId && !state.customers.some((c) => c.id === input.customerId && c.entityId === input.entityId)) throw new DomainError('party', 'Client inconnu');
  if (input.supplierId && !state.suppliers.some((c) => c.id === input.supplierId && c.entityId === input.entityId)) throw new DomainError('party', 'Fournisseur inconnu');
  if (input.employeeId && !state.employees.some((c) => c.id === input.employeeId && c.entityId === input.entityId)) throw new DomainError('party', 'Salarié inconnu');
  if ([input.customerId, input.supplierId, input.employeeId].filter(Boolean).length > 1) throw new DomainError('party', 'Un seul tiers par règle');
  return {
    entityId: input.entityId, pattern, label: input.label?.trim() || `${pattern.split('|')[0]} → ${a.code}`, accountId: a.id,
    customerId: input.customerId || undefined, supplierId: input.supplierId || undefined, employeeId: input.employeeId || undefined, bankAccountId: input.bankAccountId || undefined,
  };
}

export function addBankRule(state: State, input: BankRuleInput): [State, BankRule] {
  const [s1, id] = nextId(state, 'brule');
  const rule: BankRule = { id, ...checkedRule(state, input) };
  return [audit({ ...s1, bankRules: [...s1.bankRules, rule] }, 'bank_rule', id, 'I', `Règle « ${rule.pattern} » → ${state.accounts.find((a) => a.id === rule.accountId)?.code}`, input.entityId), rule];
}

export function updateBankRule(state: State, id: Id, input: Omit<BankRuleInput, 'entityId'>): [State, BankRule] {
  const old = state.bankRules.find((r) => r.id === id);
  if (!old || old.builtIn) throw new DomainError('not_found', 'Règle inconnue ou fournie avec le plan');
  const rule: BankRule = { id, ...checkedRule(state, { ...input, entityId: old.entityId }) };
  return [audit({ ...state, bankRules: state.bankRules.map((r) => (r.id === id ? rule : r)) }, 'bank_rule', id, 'U', `Règle « ${rule.pattern} » modifiée`, old.entityId), rule];
}

export function deleteBankRule(state: State, id: Id): State {
  const old = state.bankRules.find((r) => r.id === id);
  if (!old || old.builtIn) throw new DomainError('not_found', 'Règle inconnue ou fournie avec le plan');
  return audit({ ...state, bankRules: state.bankRules.filter((r) => r.id !== id) }, 'bank_rule', id, 'D', `Règle « ${old.pattern} » supprimée`, old.entityId);
}

export interface BankSummary {
  account: BankAccount;
  bookBalance: number | null; // bank currency, from the ledger (functional / rate for foreign accounts); null without a rate
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
      // a foreign account without a rate up to today has no balance in its own currency, but its functional balance
      // stands: a missing rate never stops the cash figures (2026-11-17: no EUR/MRU rate crashed the whole building)
      const rate = rateOrNull(state, account.currency, entity.functionalCurrency, state.today);
      return { account, bookBalance: rate ? r2(functional / rate) : null, bookBalanceFunctional: functional, statementBalance: account.statementBalance, unmatched: state.bankTransactions.filter((t) => t.bankAccountId === account.id && t.status === 'unmatched').length };
    });
}

function rateOrNull(state: State, from: Currency, to: Currency, date: ISODate): number | null {
  try {
    return fxRate(state, from, to, date);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'fx_missing') return null;
    throw e;
  }
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
  accountHolder?: string; // [bumex-one]
  bic?: string; // [bumex-one]
  favorite?: boolean; // [bumex-one]
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
  const b: BankAccount = { id, entityId: input.entityId, name: input.name.trim(), bankName: input.bankName.trim(), accountNumber: input.accountNumber?.trim() || undefined, rib: input.rib?.trim() || undefined, iban: input.iban?.trim() || undefined, bankAddress: input.bankAddress?.trim() || undefined, accountHolder: input.accountHolder?.trim() || undefined, bic: input.bic?.trim().toUpperCase() || undefined, favorite: !!input.favorite, currency: input.currency, glAccountId: input.glAccountId, journalId: input.journalId || undefined, isCash: !!input.isCash, showOnInvoices: !!input.showOnInvoices, active: true, statementBalance: 0 };
  return [audit({ ...s1, bankAccounts: [...s1.bankAccounts, b] }, 'bank_account', id, 'I', `Compte bancaire ${b.name} · ${b.bankName} · ${b.currency}`, b.entityId), b];
}

export function updateBankAccount(state: State, id: Id, patch: Partial<Omit<BankAccountInput, 'entityId'>>): [State, BankAccount] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de modifier un compte bancaire');
  const b = state.bankAccounts.find((x) => x.id === id);
  if (!b) throw new DomainError('not_found', 'Compte bancaire inconnu');
  const used = state.entries.some((e) => e.status !== 'draft' && e.lines.some((l) => l.bankAccountId === id));
  if (used && patch.currency && patch.currency !== b.currency) throw new DomainError('in_use', 'Des opérations existent : la devise ne change plus');
  if (used && patch.glAccountId && patch.glAccountId !== b.glAccountId) throw new DomainError('in_use', 'Des opérations existent : le compte comptable ne change plus');
  const merged: BankAccountInput = { entityId: b.entityId, name: patch.name ?? b.name, bankName: patch.bankName ?? b.bankName, accountNumber: patch.accountNumber ?? b.accountNumber, rib: patch.rib ?? b.rib, iban: patch.iban ?? b.iban, bankAddress: patch.bankAddress ?? b.bankAddress, currency: patch.currency ?? b.currency, glAccountId: patch.glAccountId ?? b.glAccountId, journalId: patch.journalId === undefined ? b.journalId : patch.journalId || undefined, isCash: patch.isCash ?? b.isCash, showOnInvoices: patch.showOnInvoices ?? b.showOnInvoices, accountHolder: patch.accountHolder ?? b.accountHolder, bic: patch.bic ?? b.bic, favorite: patch.favorite ?? b.favorite };
  checkBankAccount(state, merged, id);
  const next: BankAccount = { ...b, ...merged, name: merged.name.trim(), bankName: merged.bankName.trim(), accountNumber: merged.accountNumber?.trim() || undefined, rib: merged.rib?.trim() || undefined, iban: merged.iban?.trim() || undefined, bankAddress: merged.bankAddress?.trim() || undefined, journalId: merged.journalId || undefined, isCash: !!merged.isCash, showOnInvoices: !!merged.showOnInvoices, accountHolder: merged.accountHolder?.trim() || undefined, bic: merged.bic?.trim().toUpperCase() || undefined, favorite: !!merged.favorite };
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

// [bumex-one] The favourite accounts first (asked on 2026-11-17), then by name.
export function favoritesFirst<T extends Pick<BankAccount, 'favorite' | 'name'>>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name));
}

// [bumex-one] The bank printed on an invoice when none is chosen: a favourite in the invoice's currency, a favourite,
// one printed on invoices in its currency, one in its currency, then any; bank accounts only (no cash box), active
// ones. (The same order in SQL: lib/erp/invoice-link.ts.)
export function invoiceBankFor(state: State, entityId: Id, currency: Currency): BankAccount | undefined {
  const banks = favoritesFirst(state.bankAccounts.filter((b) => b.entityId === entityId && b.active !== false && !b.isCash));
  return banks.find((b) => b.favorite && b.currency === currency) ?? banks.find((b) => b.favorite) ?? banks.find((b) => b.showOnInvoices && b.currency === currency) ?? banks.find((b) => b.currency === currency) ?? banks[0];
}
