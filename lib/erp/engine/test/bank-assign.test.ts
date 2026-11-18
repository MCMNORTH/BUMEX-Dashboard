import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, accountByCode, mapped, importStatement, suggestFor, assignStatementLine, applyBankRules, addBankRule, updateBankRule, deleteBankRule,
  bookToSuspense, suspenseSummary, createDraft, postEntry, paySupplierInvoice, ruleMatches, r2, DomainError, type State,
} from '..';

// [bumex-one] Banque › Rapprochement (asked by Sidaty on 2026-11-18): a statement line to any account, with its third
// party, split over several; rules on the label; the lines already in the suspense account explained the same way.
const base = buildDemo('2026-10-14');
const AUD = entityByCode(base, 'AUD').id;
const bank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
const usd = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'USD')!;
const acc = (s: State, code: string) => accountByCode(s, AUD, code);
const supplier = base.suppliers.find((x) => x.entityId === AUD)!;
const employee = base.employees.find((x) => x.entityId === AUD)!;

function withLines(s: State, lines: { amount: number; description: string; date?: string }[], bankId = bank.id) {
  const [s1] = importStatement(s, bankId, lines.map((l) => ({ date: l.date ?? '2026-10-10', amount: l.amount, description: l.description })));
  const ids = lines.map((l) => s1.bankTransactions.find((t) => t.bankAccountId === bankId && t.description === l.description)!.id);
  return [s1, ids] as const;
}
const entryOf = (s: State, id: string) => s.entries.find((e) => e.id === id)!;
const lineOf = (s: State, entryId: string, code: string) => entryOf(s, entryId).lines.find((l) => l.accountId === acc(s, code).id)!;
const refused = (f: () => unknown, pattern: RegExp) => {
  try { f(); } catch (err) { expect(err).toBeInstanceOf(DomainError); expect((err as Error).message).toMatch(pattern); return; }
  throw new Error('not refused');
};

describe('a statement line to any account', () => {
  it('splits a payment out over two accounts, each with its third party; the bank credited once, the line booked', () => {
    const [s1, [id]] = withLines(base, [{ amount: -100000, description: 'VIREMENT SALAIRE ET FOURNISSEUR' }]);
    const [s2, entryId] = assignStatementLine(s1, id, [
      { accountId: mapped(s1, AUD, 'NET_PAYABLE').id, amount: 60000, employeeId: employee.id, description: 'Salaire' },
      { accountId: mapped(s1, AUD, 'AP_CONTROL').id, amount: 40000, supplierId: supplier.id },
    ]);
    const e = entryOf(s2, entryId);
    expect(e.status).toBe('posted');
    expect(e.postingRule).toBe('bank_assignment.v1');
    expect(e.journalId).toBe(s2.journals.find((j) => j.entityId === AUD && j.kind === 'bank')!.id);
    const bankLine = e.lines.find((l) => l.accountId === bank.glAccountId)!;
    expect([bankLine.credit, bankLine.bankAccountId]).toEqual([100000, bank.id]);
    expect(lineOf(s2, entryId, mapped(s2, AUD, 'NET_PAYABLE').code)).toMatchObject({ debit: 60000, employeeId: employee.id, description: 'Salaire' });
    expect(lineOf(s2, entryId, mapped(s2, AUD, 'AP_CONTROL').code)).toMatchObject({ debit: 40000, supplierId: supplier.id, description: 'VIREMENT SALAIRE ET FOURNISSEUR' });
    expect(s2.bankTransactions.find((t) => t.id === id)).toMatchObject({ status: 'booked', journalEntryId: entryId });
    refused(() => assignStatementLine(s2, id, [{ accountId: acc(s2, '635000').id, amount: 100000 }]), /déjà comptabilisée/);
  });

  it('a receipt credits the accounts; a split that does not make the amount, a bank account, the suspense account are refused', () => {
    const [s1, [id]] = withLines(base, [{ amount: 25000, description: 'REMBOURSEMENT DIVERS' }]);
    refused(() => assignStatementLine(s1, id, [{ accountId: acc(s1, '635000').id, amount: 20000 }]), /doit faire le montant de la ligne \(25000\)/);
    refused(() => assignStatementLine(s1, id, [{ accountId: usd.glAccountId, amount: 25000 }]), /Virement interne/);
    refused(() => assignStatementLine(s1, id, [{ accountId: acc(s1, '635000').id, amount: -25000 }]), /positif/);
    refused(() => assignStatementLine(s1, id, []), /au moins un compte/);
    const [s2, entryId] = assignStatementLine(s1, id, [{ accountId: acc(s1, '635000').id, amount: 25000 }]);
    expect(lineOf(s2, entryId, '635000').credit).toBe(25000);
    expect(entryOf(s2, entryId).lines.find((l) => l.accountId === bank.glAccountId)!.debit).toBe(25000);
  });
});

describe('rules on the label', () => {
  it('a rule made on "certification cheque" recognises the label whatever its case and accents, and only on its account if it has one', () => {
    const [s1, rule] = addBankRule(base, { entityId: AUD, pattern: '  certification   chèque | CERTIF CHQ ', accountId: acc(base, '635000').id });
    expect(rule).toMatchObject({ pattern: 'certification chèque|CERTIF CHQ', label: 'certification chèque → 635000' });
    expect(ruleMatches(rule, { description: 'CERTIFICATION CHEQUE N°1234', bankAccountId: bank.id })).toBe(true);
    expect(ruleMatches(rule, { description: 'Frais certif chq 22', bankAccountId: usd.id })).toBe(true);
    expect(ruleMatches(rule, { description: 'CHEQUE CERTIFIE', bankAccountId: bank.id })).toBe(false);
    expect(ruleMatches({ ...rule, bankAccountId: usd.id }, { description: 'CERTIFICATION CHEQUE', bankAccountId: bank.id })).toBe(false);
    refused(() => addBankRule(base, { entityId: AUD, pattern: 'ab', accountId: acc(base, '635000').id }), /3 caractères/);
    refused(() => addBankRule(base, { entityId: AUD, pattern: 'VIREMENT', accountId: usd.glAccountId }), /Virement interne/);
    refused(() => addBankRule(base, { entityId: AUD, pattern: 'X PAIE', accountId: acc(base, '635000').id, supplierId: supplier.id, employeeId: employee.id }), /Un seul tiers/);
  });

  it('suggests the rule, books every line it recognises in one go, and leaves the others', () => {
    const [s0] = addBankRule(base, { entityId: AUD, pattern: 'UNITE MIXTE', accountId: mapped(base, AUD, 'AP_CONTROL').id, supplierId: supplier.id, label: 'Unité mixte' });
    const [s1, ids] = withLines(s0, [
      { amount: -12000, description: 'PRLV UNITE MIXTE 10/2026' },
      { amount: -12500, description: 'prlv unité mixte 11/2026', date: '2026-10-11' },
      { amount: -3000, description: 'FRAIS TENUE DE COMPTE OCT' },
      { amount: -999, description: 'LIBELLE INCONNU' },
    ]);
    const sg = suggestFor(s1, s1.bankTransactions.find((t) => t.id === ids[0])!);
    expect(sg).toMatchObject({ kind: 'assign', label: 'Unité mixte' });
    const before = s1.bankTransactions.filter((t) => t.bankAccountId === bank.id && t.status === 'unmatched').length;
    const [s2, done] = applyBankRules(s1, bank.id);
    expect(done.booked).toBeGreaterThanOrEqual(3); // the two "unité mixte", the fee (and the demo's own fee lines)
    expect(s2.bankTransactions.find((t) => t.id === ids[3])!.status).toBe('unmatched');
    for (const id of ids.slice(0, 2)) {
      const t = s2.bankTransactions.find((x) => x.id === id)!;
      expect(t.status).toBe('booked');
      expect(entryOf(s2, t.journalEntryId!).lines.find((l) => l.supplierId === supplier.id)!.debit).toBe(Math.abs(s1.bankTransactions.find((x) => x.id === id)!.amount));
    }
    expect(s2.bankTransactions.filter((t) => t.bankAccountId === bank.id && t.status === 'unmatched').length).toBe(before - done.booked);
  });

  it('a rule is changed and deleted; the chart\'s own are neither', () => {
    const [s1, rule] = addBankRule(base, { entityId: AUD, pattern: 'CERTIFICATION CHEQUE', accountId: acc(base, '635000').id });
    const [s2, changed] = updateBankRule(s1, rule.id!, { pattern: 'CERTIF', accountId: acc(base, '635000').id, bankAccountId: bank.id, label: 'Certifications' });
    expect(changed).toMatchObject({ id: rule.id, pattern: 'CERTIF', bankAccountId: bank.id, label: 'Certifications' });
    const s3 = deleteBankRule(s2, rule.id!);
    expect(s3.bankRules.some((r) => r.id === rule.id)).toBe(false);
    const builtIn = base.bankRules.find((r) => r.entityId === AUD && r.builtIn)!;
    refused(() => deleteBankRule(base, builtIn.id!), /fournie avec le plan/);
  });
});

describe('the lines already in the suspense account', () => {
  it('are listed, explained by an entry out of the suspense account (the bank untouched), then no longer listed', () => {
    const [s1, [id]] = withLines(base, [{ amount: -45000, description: 'PRLV INCONNU 4521' }]);
    const [s2, parkedId] = bookToSuspense(s1, id);
    const sum0 = suspenseSummary(s2, AUD);
    expect(sum0.pending.map((p) => p.txn.id)).toContain(id);
    expect(sum0.pending.find((p) => p.txn.id === id)!.amount).toBe(45000);
    const [s3, entryId] = assignStatementLine(s2, id, [{ accountId: acc(s2, '635000').id, amount: 45000 }], undefined, '2026-10-12');
    const e = entryOf(s3, entryId);
    expect([e.postingRule, e.date, e.journalId]).toEqual(['bank_reclass.v1', '2026-10-12', s3.journals.find((j) => j.entityId === AUD && j.kind === 'misc')!.id]);
    expect(e.lines.some((l) => l.accountId === bank.glAccountId)).toBe(false);
    expect(lineOf(s3, entryId, '488000').credit).toBe(45000);
    expect(lineOf(s3, entryId, '635000').debit).toBe(45000);
    expect(s3.bankTransactions.find((t) => t.id === id)).toMatchObject({ status: 'booked', journalEntryId: parkedId });
    expect(suspenseSummary(s3, AUD).pending.some((p) => p.txn.id === id)).toBe(false);
    expect(r2(suspenseSummary(s3, AUD).balance)).toBe(r2(sum0.balance - 45000));
    refused(() => assignStatementLine(s3, id, [{ accountId: acc(s3, '635000').id, amount: 45000 }]), /déjà comptabilisée/);
  });

  it('a line someone reclassified by hand (the same amount out of the suspense account) is not listed', () => {
    const [s1, [id]] = withLines(base, [{ amount: -7300, description: 'PRLV MYSTERE' }]);
    const [s2] = bookToSuspense(s1, id);
    const od = s2.journals.find((j) => j.entityId === AUD && j.kind === 'misc')!.id;
    const [s3, d] = createDraft(s2, { entityId: AUD, journalId: od, date: '2026-10-13', description: 'Reclassement', currency: 'MRU', lines: [{ accountId: acc(s2, '635000').id, debitTxn: 7300 }, { accountId: acc(s2, '488000').id, creditTxn: 7300 }] });
    const [s4] = postEntry(s3, d.id);
    const after = suspenseSummary(s4, AUD);
    expect(after.pending.some((p) => p.txn.id === id)).toBe(false);
    expect(after.explainedByHand).toBe(suspenseSummary(s2, AUD).explainedByHand + 1);
  });
});

describe('a supplier invoice paid from a statement line', () => {
  it('matches the line; a line already treated or coming in is refused', () => {
    const si = base.supplierInvoices.find((i) => i.entityId === AUD && i.status === 'posted' && i.currency === 'MRU')!;
    const [s1, [out, inn]] = withLines(base, [{ amount: -si.netPayable, description: 'VIR FOURNISSEUR X' }, { amount: si.netPayable, description: 'VIR RECU Y' }]);
    refused(() => paySupplierInvoice(s1, { invoiceId: si.id, date: '2026-10-10', bankAccountId: bank.id, bankTransactionId: inn }), /sortie de ce compte/);
    const [s2, pay] = paySupplierInvoice(s1, { invoiceId: si.id, date: '2026-10-10', bankAccountId: bank.id, bankTransactionId: out });
    expect(s2.bankTransactions.find((t) => t.id === out)).toMatchObject({ status: 'matched', journalEntryId: pay.journalEntryId });
    expect(s2.supplierInvoices.find((i) => i.id === si.id)!.status).toBe('paid');
  });
});
