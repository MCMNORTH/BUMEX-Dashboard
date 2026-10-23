import { describe, it, expect } from 'vitest';
import {
  buildDemo, accountByCode, findAccountByCode, addJournal, updateJournal, deleteJournal, journalUsage, chartView, addBankAccount, updateBankAccount, setBankAccountActive, recordPayment,
  addAccount, addLoan, setLoanSchedule, payInstalment, loanSchedule, parseScheduleRows, addCustomer, updateCustomer, addSupplier, nextThirdPartyCode, setThirdPartyRules, createInvoice, validateInvoice, trialBalance, accountBalance,
  computePayLine, payrollRulesFor, setPayrollRules, simulatePayroll, postPayroll, effectiveExemptions, createSupplierInvoice, approveSupplierInvoice, signInAs,
} from '..';

const TODAY = '2026-10-16';
const base = buildDemo(TODAY);
const AUD = base.entities.find((e) => e.code === 'AUD')!.id;
const SA = base.entities.find((e) => e.code === 'SA')!.id;

describe('chart presented on six digits', () => {
  it('template accounts are padded, roots and groupings are not, short lookups still resolve', () => {
    expect(accountByCode(base, AUD, '4100').code).toBe('410000');
    expect(accountByCode(base, AUD, '410000').code).toBe('410000');
    expect(accountByCode(base, AUD, '701722').code).toBe('701722');
    expect(accountByCode(base, AUD, '41').code).toBe('41');
    expect(accountByCode(base, AUD, '41').isPostable).toBe(false);
    const grouping = accountByCode(base, AUD, '7017');
    expect(grouping.code).toBe('7017');
    expect(grouping.isPostable).toBe(false);
    expect(findAccountByCode(base, AUD, '999999')).toBeUndefined();
  });
  it('the main view lists moving postable accounts only; auxiliaries and groupings sit in their own views', () => {
    const moving = chartView(base, AUD, 'moving');
    expect(moving.length).toBeGreaterThan(10);
    expect(moving.every((r) => r.entries > 0 && r.account.isPostable && !r.account.isAuxiliary)).toBe(true);
    const unused = chartView(base, AUD, 'unused');
    expect(unused.some((r) => r.account.code === '41')).toBe(true);
    expect(unused.every((r) => r.entries === 0 || !r.account.isPostable)).toBe(true);
    const aux = chartView(base, AUD, 'auxiliary');
    expect(aux.length).toBe(base.customers.filter((c) => c.entityId === AUD).length + base.suppliers.filter((s) => s.entityId === AUD).length);
    expect(aux.every((r) => r.collective)).toBe(true);
  });
});

describe('journals', () => {
  it('adds, renames and retypes a journal; a used journal keeps its type and cannot be deleted', () => {
    const [s1, j] = addJournal(base, { entityId: AUD, code: 'nd', name: 'Notes de frais', kind: 'purchases' });
    expect(j.code).toBe('ND');
    expect(() => addJournal(s1, { entityId: AUD, code: 'ND', name: 'Doublon', kind: 'misc' })).toThrow(/existe/);
    const [s2, j2] = updateJournal(s1, j.id, { name: 'Notes de frais et déplacements', kind: 'misc', code: 'NDF' });
    expect(j2.kind).toBe('misc');
    expect(j2.code).toBe('NDF');
    const s3 = deleteJournal(s2, j.id);
    expect(s3.journals.some((x) => x.id === j.id)).toBe(false);
    const vt = base.journals.find((x) => x.entityId === AUD && x.kind === 'sales')!;
    expect(journalUsage(base, vt.id).posted).toBeGreaterThan(0);
    expect(() => deleteJournal(base, vt.id)).toThrow(/conservation/);
    expect(() => updateJournal(base, vt.id, { kind: 'misc' })).toThrow(/type ne change plus/);
    const [s4, vt2] = updateJournal(base, vt.id, { name: 'Ventes et honoraires' });
    expect(vt2.name).toBe('Ventes et honoraires');
    expect(s4.auditLog.some((a) => a.table === 'journal')).toBe(true);
  });
});

describe('bank accounts', () => {
  it('creates an account with its ledger account and journal; duplicates and bad ledger accounts are refused', () => {
    const gl = accountByCode(base, AUD, '5503');
    const taken = base.bankAccounts.find((b) => b.entityId === AUD)!;
    expect(() => addBankAccount(base, { entityId: AUD, name: taken.name, bankName: 'X', currency: 'MRU', glAccountId: gl.id })).toThrow(/existe déjà/);
    expect(() => addBankAccount(base, { entityId: AUD, name: 'Nouveau', bankName: 'X', currency: 'MRU', glAccountId: accountByCode(base, AUD, '55').id })).toThrow(/imputable/);
    expect(() => addBankAccount(base, { entityId: AUD, name: 'Nouveau', bankName: 'X', currency: 'MRU', glAccountId: 'acc_nope' })).toThrow(/inconnu/);
    const [s0, glNew] = addAccount(base, AUD, '5504', 'Attijari, compte MRU', 'asset');
    expect(glNew.code).toBe('550400');
    const [s1, acc] = addBankAccount(s0, { entityId: AUD, name: 'Attijari compte MRU', bankName: 'Attijari', accountNumber: '00012 345678', rib: 'MR13 00012 345678 11', bankAddress: 'Nouakchott', currency: 'MRU', glAccountId: glNew.id, journalId: base.journals.find((j) => j.entityId === AUD && j.kind === 'bank')!.id });
    expect(acc.active).toBe(true);
    expect(() => addBankAccount(s1, { entityId: AUD, name: 'Autre', bankName: 'X', currency: 'MRU', glAccountId: acc.glAccountId })).toThrow(/déjà le compte comptable/);
    const [s1b, glOther] = addAccount(s1, AUD, '5505', 'Autre banque', 'asset');
    expect(() => addBankAccount(s1b, { entityId: AUD, name: 'Autre', bankName: 'X', accountNumber: '00012345678', currency: 'MRU', glAccountId: glOther.id })).toThrow(/numéro de compte/);
    // a payment on the new account posts on its journal and its ledger account
    const cust = s1.customers.find((c) => c.entityId === AUD)!;
    const [s2, pay] = recordPayment(s1, { entityId: AUD, customerId: cust.id, date: TODAY, currency: 'MRU', amountTxn: 1000, bankAccountId: acc.id });
    const e = s2.entries.find((x) => x.id === pay.journalEntryId)!;
    expect(e.journalId).toBe(acc.journalId);
    expect(e.lines.some((l) => l.accountId === acc.glAccountId && l.debit === 1000)).toBe(true);
    const [s3] = updateBankAccount(s2, acc.id, { name: 'Attijari principal', bankAddress: 'Tevragh Zeina' });
    expect(s3.bankAccounts.find((b) => b.id === acc.id)!.name).toBe('Attijari principal');
    expect(() => updateBankAccount(s3, acc.id, { currency: 'USD' })).toThrow(/devise/);
    const [s4, off] = setBankAccountActive(s3, acc.id, false);
    expect(off.active).toBe(false);
    expect(() => setBankAccountActive(s4, base.bankAccounts.find((b) => b.entityId === AUD && !b.isCash)!.id, false)).toThrow(/rapprocher|emprunt/);
  });
});

describe('loans with a manual schedule', () => {
  const bank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
  it('takes the bank table as given, checks it, posts instalments on the configured accounts and journal', () => {
    const rows = parseScheduleRows([
      { 'N°': '1', Date: '16/10/2026', Capital: '30 000', Intérêts: '2 500', Frais: '150' },
      { 'N°': '2', Date: '15/11/2026', Capital: '30 500', Intérêts: '2 000', Frais: '150' },
      { 'N°': '3', Date: '15/12/2026', Capital: '39 500', Intérêts: '1 500,50', Frais: '150' },
    ]);
    expect(rows[0]).toEqual({ no: 1, date: '2026-10-16', capital: 30000, interest: 2500, fees: 150 });
    expect(() => addLoan(base, { entityId: AUD, lender: 'BNM', reference: 'EMP-M1', currency: 'MRU', principal: 90000, annualRate: 0.1, months: 3, startDate: '2026-10-01', frequency: 'monthly', method: 'annuity', bankAccountId: bank.id, scheduleMode: 'manual', manualSchedule: rows })).toThrow(/dépasse/);
    const interest = accountByCode(base, AUD, '673');
    const [s1, loan] = addLoan(base, { entityId: AUD, lender: 'BNM', reference: 'EMP-M1', currency: 'MRU', principal: 100000, annualRate: 0.1, months: 3, startDate: '2026-10-01', frequency: 'monthly', method: 'annuity', bankAccountId: bank.id, scheduleMode: 'manual', manualSchedule: rows, interestAccountId: interest.id, postDrawdown: true });
    const sched = loanSchedule(loan, []);
    expect(sched.map((i) => i.total)).toEqual([32650, 32650, 41150.5]);
    expect(sched[2].closing).toBe(0);
    const [s2, p] = payInstalment(s1, { loanId: loan.id, instalmentNo: 1, date: '2026-10-16' });
    expect(p.interest).toBe(2500);
    const e = s2.entries.find((x) => x.id === p.journalEntryId)!;
    expect(e.lines.some((l) => l.accountId === interest.id && l.debit === 2500)).toBe(true);
    expect(e.journalId).toBe(bank.journalId);
    expect(() => setLoanSchedule(s2, loan.id, rows.map((r) => (r.no === 1 ? { ...r, capital: 1 } : r)))).toThrow(/réglée/);
    const [s3, l3] = setLoanSchedule(s2, loan.id, rows.map((r) => (r.no === 3 ? { ...r, interest: 1000 } : r)));
    expect(loanSchedule(l3, s3.loanPayments)[2].interest).toBe(1000);
    expect(() => setLoanSchedule(s3, loan.id, [{ no: 2, date: '2026-11-01', capital: 1, interest: 0, fees: 0 }])).toThrow(/numérotées/);
  });
});

describe('third parties: codes and auxiliary accounts', () => {
  it('generates codes from the rules, accepts custom ones, refuses duplicates and attaches the auxiliary to the collective', () => {
    expect(nextThirdPartyCode(base, AUD, 'customer')).toMatch(/^C\d{3}$/);
    expect(nextThirdPartyCode(base, AUD, 'supplier')).toMatch(/^F\d{3}$/);
    const [s1, c] = addCustomer(base, { entityId: AUD, name: 'Client personnalisé', regime: 'standard', country: 'MR', defaultCurrency: 'MRU', paymentTermsDays: 30, code: 'alpha-01' });
    expect(c.code).toBe('ALPHA-01');
    const aux = s1.accounts.find((a) => a.id === c.arAccountId)!;
    expect(aux.code).toBe('ALPHA-01');
    expect(aux.isAuxiliary).toBe(true);
    expect(aux.collectiveId).toBe(accountByCode(s1, AUD, '4100').id);
    expect(() => addCustomer(s1, { entityId: AUD, name: 'Autre', regime: 'standard', country: 'MR', defaultCurrency: 'MRU', paymentTermsDays: 30, code: 'ALPHA-01' })).toThrow(/existe déjà/);
    expect(() => addCustomer(s1, { entityId: AUD, name: 'Autre', regime: 'standard', country: 'MR', defaultCurrency: 'MRU', paymentTermsDays: 30, code: 'x' })).toThrow(/Code tiers/);
    // customer and supplier sequences are distinct (C… / F…); a custom code is unique across the auxiliary accounts of the entity
    expect(() => addSupplier(s1, { entityId: AUD, name: 'Fournisseur alpha', regime: 'standard', code: 'ALPHA-01' })).toThrow(/existe déjà/);
    const [s2, sup] = addSupplier(s1, { entityId: AUD, name: 'Fournisseur alpha', regime: 'standard', code: 'F-ALPHA' });
    expect(sup.code).toBe('F-ALPHA');
    expect(s2.accounts.find((a) => a.id === sup.apAccountId)!.collectiveId).toBe(accountByCode(s2, AUD, '4000').id);
    // renaming the code renames the auxiliary account; moving the collective re-attaches it
    const [s3, c2] = updateCustomer(s2, c.id, { code: 'ALPHA-02', collectiveId: accountByCode(s2, AUD, '4105').id });
    expect(c2.code).toBe('ALPHA-02');
    const aux2 = s3.accounts.find((a) => a.id === c2.arAccountId)!;
    expect(aux2.code).toBe('ALPHA-02');
    expect(aux2.collectiveId).toBe(accountByCode(s3, AUD, '4105').id);
    // rules: prefix and digits per entity
    const s4 = setThirdPartyRules(s3, AUD, { customerPrefix: 'CL', digits: 4 });
    expect(nextThirdPartyCode(s4, AUD, 'customer')).toMatch(/^CL\d{4}$/);
    expect(() => setThirdPartyRules(s4, AUD, { digits: 9 })).toThrow(/chiffres/);
  });
  it('postings go to the auxiliary; the trial balance folds them into the collective unless asked otherwise', () => {
    const cust = base.customers.find((c) => c.entityId === AUD && c.name === 'Banque C')!;
    const [s1, inv] = createInvoice(base, { entityId: AUD, customerId: cust.id, date: TODAY, currency: 'MRU', lines: [{ description: 'Audit', quantity: 1, unitPrice: 100000, serviceCategory: 'AUDIT' }] });
    const [s2] = validateInvoice(s1, inv.id);
    const collective = accountByCode(s2, AUD, '4100');
    const folded = trialBalance(s2, AUD);
    expect(folded.some((r) => r.accountId === cust.arAccountId)).toBe(false);
    const detailed = trialBalance(s2, AUD, { auxiliaries: true });
    expect(detailed.some((r) => r.accountId === cust.arAccountId)).toBe(true);
    const auxBalance = detailed.find((r) => r.accountId === cust.arAccountId)!.balance;
    expect(auxBalance).toBeGreaterThan(0);
    // the collective's balance includes every auxiliary attached to it
    const collBalance = accountBalance(s2, AUD, collective.id);
    const sumAux = detailed.filter((r) => s2.accounts.find((a) => a.id === r.accountId)?.collectiveId === collective.id).reduce((a, r) => a + r.balance, 0);
    expect(Math.round(collBalance)).toBe(Math.round(sumAux + (detailed.find((r) => r.accountId === collective.id)?.balance ?? 0)));
    // a supplier invoice credits the supplier's auxiliary account
    const sup = s2.suppliers.find((x) => x.entityId === AUD)!;
    const exp = s2.accounts.find((a) => a.entityId === AUD && a.isPostable && a.kind === 'expense')!;
    const [s3, si] = createSupplierInvoice(s2, { entityId: AUD, supplierId: sup.id, supplierRef: 'AUX-1', date: TODAY, currency: 'MRU', totalHt: 5000, taxCodeId: null, expenseAccountId: exp.id, description: 'x' });
    const s4 = si.status === 'pending_approval' ? approveSupplierInvoice(signInAs(s3, s3.users.find((u) => u.role === 'partner')!.id), si.id) : s3;
    const posted = s4.supplierInvoices.find((x) => x.id === si.id)!;
    const e = s4.entries.find((x) => x.id === posted.journalEntryId)!;
    expect(e.lines.some((l) => l.accountId === sup.apAccountId && l.credit === posted.netPayable)).toBe(true);
  });
});

describe('payroll regime per company', () => {
  it('BUMEX SA runs under the GTA regime: no contribution, no withheld tax, no such entry line; Audit under the normal one', () => {
    const sa = payrollRulesFor(base, SA);
    expect(sa.regime).toBe('gta');
    expect(effectiveExemptions(sa)).toEqual({ social: true, health: true, tax: true });
    const emp = base.employees.find((e) => e.entityId === SA)!;
    const line = computePayLine(emp, sa);
    expect(line.cnssEmployee + line.cnamEmployee + line.its + line.cnssEmployer + line.cnamEmployer).toBe(0);
    expect(line.net).toBe(line.gross);
    const aud = payrollRulesFor(base, AUD);
    expect(aud.regime ?? 'normal').toBe('normal');
    const l2 = computePayLine(base.employees.find((e) => e.entityId === AUD)!, aud);
    expect(l2.its + l2.cnssEmployee).toBeGreaterThan(0);
    const sim = simulatePayroll(base, SA, '2026-09');
    expect(sim.totals.its).toBe(0);
    expect(sim.totals.net).toBe(sim.totals.gross);
    const [s1, run] = postPayroll(base, SA, '2026-09');
    const e = s1.entries.find((x) => x.id === run.journalEntryId)!;
    expect(e.lines).toHaveLength(2); // gross expense / net payable only
    // switching a company to the normal regime changes only that company
    const s2 = setPayrollRules(s1, { ...sa, regime: 'normal', socialExempt: false, healthExempt: false, taxExempt: false });
    expect(computePayLine(emp, payrollRulesFor(s2, SA)).its).toBeGreaterThan(0);
    expect(payrollRulesFor(s2, AUD).regime ?? 'normal').toBe('normal');
    // partial exemptions under GTA stay configurable
    const s3 = setPayrollRules(s2, { ...sa, regime: 'gta', socialExempt: false, healthExempt: true, taxExempt: true });
    const l3 = computePayLine(emp, payrollRulesFor(s3, SA));
    expect(l3.cnssEmployee).toBeGreaterThan(0);
    expect(l3.its).toBe(0);
  });
});
