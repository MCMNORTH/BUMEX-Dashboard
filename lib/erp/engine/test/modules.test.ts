import { describe, it, expect } from 'vitest';
import {
  buildDemo, entityByCode, accountByCode, r2, type State, DomainError,
  createUser, activateInvite, updateUserAccess, signInAs, requestDeletion, decideDeletion, pendingDeletions, canOpenRoom, canUseModule,
  validateChartImport, applyChartImport, exportChartRows, applyChartTemplate, CHART_TEMPLATES,
  createInvoice, validateInvoice, recordPayment, withholdingStatement, vatStatement, addTaxCode,
  addSupplier, createSupplierInvoice, approveSupplierInvoice, paySupplierInvoice, supplierPayables,
  addLoan, loanSchedule, payInstalment, loanSummaries,
  addAsset, depreciationSchedule, yearDepreciation, postDepreciation, assetRegister, updateAsset,
  addEmployee, headcount, simulatePayroll, postPayroll, payrollStatement, computePayLine, payrollRulesFor, setPayrollRules,
  assign, planningCalendar, availability, removeAssignment,
  verifyChain, trialBalance, cashPosition,
} from '..';

const TODAY = '2026-10-16';
const base = buildDemo(TODAY);
const AUD = entityByCode(base, 'AUD').id;
const admin = base.users.find((u) => u.role === 'admin')!;
const as = (s: State, role: State['session']['role'], extra: Partial<State['session']> = {}): State => ({ ...s, session: { ...s.session, role, actorId: `u_${role}`, actorName: role, ...extra } });

describe('security: accounts, access and deletions', () => {
  it('seeds users with narrowed access and starts as the administrator', () => {
    expect(base.session.role).toBe('admin');
    expect(base.users.length).toBeGreaterThanOrEqual(7);
    const staff = base.users.find((u) => u.role === 'staff')!;
    expect(staff.entityIds).toEqual([AUD]);
    const asStaff = signInAs(base, staff.id);
    expect(canUseModule(asStaff, 'missions')).toBe(true);
    expect(canUseModule(asStaff, 'accounting')).toBe(false);
    expect(canOpenRoom(asStaff, entityByCode(base, 'SA').id, 'missions')).toBe(false);
    expect(canOpenRoom(asStaff, AUD, 'missions')).toBe(true);
  });
  it('creates an invited account with a link, activates it and narrows its modules', () => {
    const [s1, u] = createUser(base, { name: 'Nouveau manager', email: 'nm@bumex.mr', role: 'manager', entityIds: [AUD] });
    expect(u.status).toBe('invited');
    expect(u.inviteToken).toHaveLength(24);
    const [s2, active] = activateInvite(s1, u.inviteToken!);
    expect(active.status).toBe('active');
    expect(s2.session.userId).toBe(u.id);
    expect(() => activateInvite(s2, u.inviteToken!)).toThrow(DomainError);
    const [s3] = updateUserAccess({ ...s2, session: base.session }, u.id, { modules: ['missions', 'tasks'] });
    expect(signInAs(s3, u.id).session.modules).toEqual(['missions', 'tasks']);
    expect(() => createUser(as(base, 'partner'), { name: 'x', email: 'x@y.z', role: 'staff', entityIds: [AUD] })).toThrow(/administrateur/);
    expect(() => createUser(base, { name: 'x', email: 'admin@bumex.mr', role: 'staff', entityIds: [AUD] })).toThrow(/existe déjà/);
  });
  it('a partner deletes with a reason at once; an accountant files a request the partner approves', () => {
    const [s0, sup] = addSupplier(base, { entityId: AUD, name: 'Fournisseur temporaire', regime: 'standard' });
    const r1 = requestDeletion(as(s0, 'partner'), { table: 'supplier', rowId: sup.id, label: sup.name, reason: 'Doublon de fiche', entityId: AUD });
    expect(r1.executed).toBe(true);
    expect(r1.state.suppliers.some((x) => x.id === sup.id)).toBe(false);
    expect(r1.state.auditLog[r1.state.auditLog.length - 1].summary).toMatch(/motif : Doublon/);
    expect(() => requestDeletion(as(s0, 'partner'), { table: 'supplier', rowId: sup.id, label: sup.name, reason: 'x', entityId: AUD })).toThrow(/motif/);
    const r2x = requestDeletion(as(s0, 'accountant'), { table: 'supplier', rowId: sup.id, label: sup.name, reason: 'Fiche créée par erreur', entityId: AUD });
    expect(r2x.executed).toBe(false);
    expect(pendingDeletions(r2x.state, AUD)).toHaveLength(1);
    expect(r2x.state.suppliers.some((x) => x.id === sup.id)).toBe(true);
    expect(() => decideDeletion(as(r2x.state, 'accountant'), r2x.request!.id, 'approved')).toThrow(/associé/);
    const s3 = decideDeletion(as(r2x.state, 'partner'), r2x.request!.id, 'approved');
    expect(s3.suppliers.some((x) => x.id === sup.id)).toBe(false);
    expect(pendingDeletions(s3, AUD)).toHaveLength(0);
    // a supplier with invoices cannot go at all
    const used = base.suppliers.find((x) => base.supplierInvoices.some((i) => i.supplierId === x.id))!;
    expect(() => requestDeletion(as(base, 'partner'), { table: 'supplier', rowId: used.id, label: used.name, reason: 'test test', entityId: AUD })).toThrow(/factures/);
  });
});

describe('chart of accounts: templates, import and export', () => {
  it('lists three templates and completes an entity with another plan without touching its entries', () => {
    expect(CHART_TEMPLATES.map((t) => t.id)).toEqual(['PCM', 'CGNC', 'SYSCOHADA']);
    const before = base.accounts.filter((a) => a.entityId === AUD).length;
    const [s1, r] = applyChartTemplate(base, AUD, 'SYSCOHADA', 'merge');
    expect(r.added).toBeGreaterThan(20);
    expect(s1.accounts.filter((a) => a.entityId === AUD).length).toBe(before + r.added);
    expect(() => applyChartTemplate(base, AUD, 'CGNC', 'replace')).toThrow(/écritures/);
  });
  it('validates an import: duplicates, bad codes, class mismatch, unknown type; then applies creations and updates', () => {
    const rows = [
      { code: '6400', nameFr: 'Charges diverses nouvelles', kind: 'Charge' },
      { code: '6400', nameFr: 'Doublon' },
      { code: '12AB', nameFr: 'Mauvais code' },
      { code: '4100', nameFr: 'Clients ordinaires (renommé)', cls: '4', kind: 'Actif', dimension: 'client' },
      { code: '7100', nameFr: 'Classe fausse', cls: '6' },
      { code: '4600', nameFr: 'Type requis' },
      { code: '5504', nameFr: 'Banque, compte MAD', kind: 'Bidule' },
      { code: '', nameFr: '' },
    ];
    const report = validateChartImport(base, AUD, rows);
    expect(report.errors.map((e) => e.code)).toEqual(['640000', '12AB', '710000', '460000', '550400']);
    expect(report.toCreate).toBe(1);
    expect(report.toUpdate).toBe(1);
    expect(() => applyChartImport(base, AUD, report)).toThrow(/erreur/);
    const good = validateChartImport(base, AUD, rows.filter((r) => ['6400', '4100'].includes(r.code)).filter((r, i, a) => a.findIndex((x) => x.code === r.code) === i));
    expect(good.errors).toHaveLength(0);
    const [s1, res] = applyChartImport(base, AUD, good);
    expect(res).toEqual({ created: 1, updated: 1 });
    expect(accountByCode(s1, AUD, '6400').kind).toBe('expense');
    expect(accountByCode(s1, AUD, '4100').nameFr).toBe('Clients ordinaires (renommé)');
    const exported = exportChartRows(s1, AUD);
    expect(exported[0]).toHaveLength(8);
    expect(exported.some((r) => r[0] === '640000')).toBe(true); // presented on six digits
  });
});

describe('clients: withholding at source (RAS 7 %)', () => {
  it('an invoice to a withholding customer books the net receivable and the RAS receivable', () => {
    const bank = base.customers.find((c) => c.entityId === AUD && c.name === 'Banque C')!;
    expect(bank.withholdingCodeId).toBeDefined();
    const [s1, inv] = createInvoice(base, { entityId: AUD, customerId: bank.id, date: TODAY, currency: 'MRU', lines: [{ description: 'Audit', quantity: 1, unitPrice: 1000000, serviceCategory: 'AUDIT' }] });
    expect(inv.totalTtc).toBe(1160000);
    expect(inv.withholdingRate).toBe(0.07);
    expect(inv.withholdingAmount).toBe(70000);
    expect(inv.netPayable).toBe(1090000);
    const [s2, posted] = validateInvoice(s1, inv.id);
    const e = s2.entries.find((x) => x.id === posted.journalEntryId)!;
    expect(e.postingRule).toBe('sales_invoice.v2');
    expect(e.lines.find((l) => l.accountId === bank.arAccountId)!.debit).toBe(1090000);
    expect(e.lines.find((l) => l.accountId === accountByCode(s2, AUD, '4421').id)!.debit).toBe(70000);
    expect(r2(e.lines.reduce((a, l) => a + l.debit - l.credit, 0))).toBe(0);
    // the customer pays the net and the invoice is settled
    const bankAcc = s2.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
    const [s3] = recordPayment(s2, { entityId: AUD, customerId: bank.id, date: TODAY, currency: 'MRU', amountTxn: 1090000, bankAccountId: bankAcc.id, invoiceId: posted.id });
    expect(s3.salesInvoices.find((i) => i.id === posted.id)!.status).toBe('paid');
    // an exempt customer can still be subject to withholding: the two notions are separate
    const ong = base.customers.find((c) => c.entityId === AUD && c.regime === 'exempt')!;
    const ras = base.taxCodes.find((t) => t.entityId === AUD && t.code === 'RAS-7')!;
    const [, inv2] = createInvoice(base, { entityId: AUD, customerId: ong.id, date: TODAY, currency: 'EUR', withholdingCodeId: ras.id, lines: [{ description: 'Audit', quantity: 1, unitPrice: 1000, serviceCategory: 'AUDIT' }] });
    expect(inv2.totalTax).toBe(0);
    expect(inv2.withholdingAmount).toBe(70);
    // and a withholding customer can be invoiced without it
    const [, inv3] = createInvoice(base, { entityId: AUD, customerId: bank.id, date: TODAY, currency: 'MRU', withholdingCodeId: null, lines: [{ description: 'Audit', quantity: 1, unitPrice: 1000, serviceCategory: 'AUDIT' }] });
    expect(inv3.withholdingAmount).toBe(0);
  });
  it('statements separate withholding suffered on sales from withholding due on purchases, and VAT', () => {
    const w = withholdingStatement(base, AUD);
    expect(w.suffered.length).toBeGreaterThan(0);
    expect(w.sufferedTotal).toBeGreaterThan(0);
    expect(w.due.length).toBeGreaterThan(0);
    const v = vatStatement(base, AUD);
    expect(v.collected).toBeGreaterThan(v.deductible);
    const [s1, tc] = addTaxCode(base, { entityId: AUD, code: 'RAS-5', nameFr: 'Retenue 5 %', kind: 'withholding', rate: 0.05, deductibleAccountId: accountByCode(base, AUD, '4421').id });
    expect(s1.taxCodes.some((t) => t.id === tc.id)).toBe(true);
    expect(() => addTaxCode(base, { entityId: AUD, code: 'RAS-7', nameFr: 'x', kind: 'withholding', rate: 0.07 })).toThrow(/existe/);
  });
});

describe('suppliers: the full invoice cycle', () => {
  it('enters, approves by threshold, posts and pays a supplier invoice; payables follow', () => {
    const sup = base.suppliers.find((s) => s.entityId === AUD && s.name.startsWith('Télécoms'))!;
    const vat = base.taxCodes.find((t) => t.entityId === AUD && t.code === 'TVA-16')!;
    const asAcc = as(base, 'accountant', { actorId: 'u_acc' });
    const [s1, small] = createSupplierInvoice(asAcc, { entityId: AUD, supplierId: sup.id, supplierRef: 'T-999', date: TODAY, currency: 'MRU', totalHt: 50000, taxCodeId: vat.id, expenseAccountId: accountByCode(base, AUD, '632').id, description: 'Internet' });
    expect(small.status).toBe('posted'); // below the threshold
    expect(small.number).toMatch(/^FA2610-\d{4}$/);
    const [s2, big] = createSupplierInvoice(s1, { entityId: AUD, supplierId: sup.id, supplierRef: 'T-1000', date: TODAY, currency: 'MRU', totalHt: 600000, taxCodeId: vat.id, expenseAccountId: accountByCode(base, AUD, '632').id, description: 'Équipement réseau' });
    expect(big.status).toBe('pending_approval');
    expect(big.approverRole).toBe('partner');
    expect(() => createSupplierInvoice(s2, { entityId: AUD, supplierId: sup.id, supplierRef: 't-1000', date: TODAY, currency: 'MRU', totalHt: 1, expenseAccountId: accountByCode(base, AUD, '632').id, description: 'dup' })).toThrow(/déjà enregistrée/);
    const s3 = approveSupplierInvoice(as(s2, 'partner'), big.id);
    const posted = s3.supplierInvoices.find((i) => i.id === big.id)!;
    expect(posted.status).toBe('posted');
    const before = supplierPayables(s3, AUD);
    const bank = s3.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
    const [s4, pay] = paySupplierInvoice(as(s3, 'partner'), { invoiceId: big.id, date: TODAY, bankAccountId: bank.id, amount: 300000 });
    expect(pay.number).toMatch(/^DE2610-/);
    expect(s4.supplierInvoices.find((i) => i.id === big.id)!.status).toBe('posted');
    const [s5] = paySupplierInvoice(as(s4, 'partner'), { invoiceId: big.id, date: TODAY, bankAccountId: bank.id });
    expect(s5.supplierInvoices.find((i) => i.id === big.id)!.status).toBe('paid');
    const after = supplierPayables(s5, AUD);
    expect(r2(before.total - after.total)).toBe(696000);
    expect(after.bySupplier.every((b) => b.open > 0)).toBe(true);
    for (const key of Object.keys(s5.chains)) { const [e, j] = key.split('|'); expect(verifyChain(s5, e, j).every((c) => c.ok)).toBe(true); }
  });
});

describe('treasury: loans', () => {
  it('computes an annuity schedule that clears the principal, posts the drawdown and the instalments', () => {
    const loan = base.loans.find((l) => l.entityId === AUD)!;
    const sched = loanSchedule(loan, base.loanPayments);
    expect(sched).toHaveLength(36);
    expect(sched[35].closing).toBe(0);
    expect(r2(sched.reduce((a, i) => a + i.capital, 0))).toBe(loan.principal);
    expect(sched[0].interest).toBe(r2((loan.principal * loan.annualRate) / 12));
    const sum = loanSummaries(base, AUD)[0];
    expect(sum.paidCount).toBeGreaterThanOrEqual(6);
    expect(sum.outstanding).toBeLessThan(loan.principal);
    expect(sum.nextDue!.no).toBe(sum.paidCount + 1);
    expect(() => payInstalment(base, { loanId: loan.id, instalmentNo: sum.paidCount + 2 })).toThrow(/d'abord/);
    const [s1, p] = payInstalment(base, { loanId: loan.id, instalmentNo: sum.paidCount + 1, date: TODAY });
    expect(p.total).toBe(sched[sum.paidCount].total);
    expect(loanSummaries(s1, AUD)[0].outstanding).toBe(r2(sum.outstanding - p.capital));
    const bank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
    const [s2, l2] = addLoan(base, { entityId: AUD, lender: 'SGM', reference: 'EMP-TEST', currency: 'MRU', principal: 1200000, annualRate: 0.06, months: 12, startDate: TODAY, frequency: 'quarterly', method: 'linear', bankAccountId: bank.id, postDrawdown: true });
    const s2sched = loanSchedule(l2);
    expect(s2sched).toHaveLength(4);
    expect(s2sched.every((i) => i.capital === 300000)).toBe(true);
    expect(cashPosition(s2, AUD)).toBe(r2(cashPosition(base, AUD) + 1200000));
  });
});

describe('fixed assets: sheets, schedules, year-end dotations', () => {
  it('linear and declining schedules with monthly prorata add up to the cost', () => {
    const vehicle = base.assets.find((a) => a.entityId === AUD && a.method === 'declining')!;
    const rows = depreciationSchedule(vehicle);
    expect(r2(rows.reduce((a, r) => a + r.dotation, 0))).toBe(r2(vehicle.cost - vehicle.residual));
    expect(rows[0].months).toBe(8); // acquired in May
    expect(rows[0].dotation).toBeGreaterThan(rows[1].dotation * 0.5);
    const linear = base.assets.find((a) => a.entityId === AUD && a.method === 'linear' && a.lifeMonths === 36 && a.status === 'in_service' && a.accumulated > 0)!;
    const lr = depreciationSchedule(linear);
    expect(r2(lr.reduce((a, r) => a + r.dotation, 0))).toBe(linear.cost);
    expect(linear.accumulated).toBe(r2(lr.filter((r) => r.year < 2026).reduce((a, r) => a + r.dotation, 0)));
    expect(linear.endDate < linear.startDate.replace(/^\d{4}/, (y) => String(Number(y) + 3))).toBe(true);
  });
  it('simulates then posts the year-end dotations once, updating the register and the ledger', () => {
    const fy = base.fiscalYears.find((f) => f.entityId === AUD && f.label === '2026')!;
    const sim = yearDepreciation(base, AUD, fy.id);
    expect(sim.length).toBeGreaterThanOrEqual(5);
    expect(sim.every((r) => r.alreadyPosted === 0)).toBe(true);
    const total = r2(sim.reduce((a, r) => a + r.toPost, 0));
    const [s1, run] = postDepreciation(base, AUD, fy.id, TODAY);
    expect(run.total).toBe(total);
    const e = s1.entries.find((x) => x.id === run.journalEntryId)!;
    expect(e.lines.filter((l) => l.assetId).length).toBe(run.lines.length * 2);
    expect(r2(e.lines.reduce((a, l) => a + l.debit - l.credit, 0))).toBe(0);
    expect(() => postDepreciation(s1, AUD, fy.id, TODAY)).toThrow(/Aucune/);
    const reg = assetRegister(s1, AUD);
    expect(reg.every((r) => r.nbv >= 0)).toBe(true);
    expect(r2(trialBalance(s1, AUD).reduce((a, r) => a + r.balance, 0))).toBe(0);
  });
  it('adds an asset with its acquisition entry and refuses plan changes once depreciated', () => {
    const cat = base.assetCategories.find((c) => c.entityId === AUD && c.code === 'FURNITURE')!;
    const bank = base.bankAccounts.find((b) => b.entityId === AUD && b.currency === 'MRU' && !b.isCash)!;
    const [s1, a] = addAsset(base, { entityId: AUD, name: 'Bureaux open space', serial: 'MOB-2026-77', categoryId: cat.id, acquisitionDate: TODAY, cost: 540000, location: 'Siège', acquisition: { credit: 'bank', bankAccountId: bank.id, vatAmount: 86400 } });
    expect(a.code).toMatch(/^IMM-2026-\d{3}$/);
    expect(a.rate).toBe(10);
    expect(a.endDate).toBe('2036-10-15');
    expect(cashPosition(s1, AUD)).toBe(r2(cashPosition(base, AUD) - 626400));
    expect(() => addAsset(s1, { entityId: AUD, name: 'dup', serial: 'mob-2026-77', categoryId: cat.id, acquisitionDate: TODAY, cost: 1, location: '' })).toThrow(/série/);
    const depreciated = base.assets.find((x) => x.entityId === AUD && x.accumulated > 0)!;
    expect(() => updateAsset(base, depreciated.id, { lifeMonths: 48 })).toThrow(/déjà comptabilisés/);
    const [s2, up] = updateAsset(base, depreciated.id, { location: 'Nouveau site' });
    expect(up.location).toBe('Nouveau site');
    void s2;
  });
});

describe('HR: employees, payroll, headcount', () => {
  it('seeds the Audit team, computes gross → net with contributions and progressive tax', () => {
    const hc = headcount(base, AUD);
    expect(hc.active).toBe(12);
    expect(hc.byDepartment.find((d) => d.name === 'Audit')!.count).toBeGreaterThanOrEqual(6);
    const rules = payrollRulesFor(base, AUD);
    const partner = base.employees.find((e) => e.entityId === AUD && e.category === 'partner')!;
    const line = computePayLine(partner, rules);
    expect(line.gross).toBe(220000);
    expect(line.cnssEmployee).toBe(150); // 1 % of the 15,000 ceiling
    expect(line.cnamEmployee).toBe(8800);
    expect(line.taxable).toBe(r2(220000 - 150 - 8800 - 6000));
    expect(line.its).toBe(r2(9000 * 0.15 + 12000 * 0.25 + (line.taxable - 21000) * 0.4));
    expect(line.net).toBe(r2(line.gross - line.cnssEmployee - line.cnamEmployee - line.its));
  });
  it('posted the monthly payrolls of the year and refuses a second run for the same month', () => {
    const runs = base.payrollRuns.filter((r) => r.entityId === AUD && r.status === 'posted');
    expect(runs.length).toBeGreaterThanOrEqual(9);
    expect(() => postPayroll(base, AUD, runs[0].month)).toThrow(/déjà/);
    const st = payrollStatement(base, AUD);
    expect(st.gross).toBe(r2(runs.reduce((a, r) => a + r.totals.gross, 0)));
    const sim = simulatePayroll(base, AUD, '2026-11');
    expect(sim.lines).toHaveLength(12);
    expect(sim.totals.employerCost).toBeGreaterThan(sim.totals.gross);
    const [s1, run] = postPayroll(base, AUD, '2026-10', '2026-10-16');
    const e = s1.entries.find((x) => x.id === run.journalEntryId)!;
    expect(e.postingRule).toBe('payroll.v1');
    expect(r2(e.lines.reduce((a, l) => a + l.debit - l.credit, 0))).toBe(0);
    expect(e.lines.find((l) => l.accountId === accountByCode(s1, AUD, '421').id)!.credit).toBe(run.totals.net);
  });
  it('adds an employee and reparameterises the rules', () => {
    const [s1, e] = addEmployee(base, { entityId: AUD, firstName: 'Test', lastName: 'Personne', jobTitle: 'Auditeur', department: 'Audit', category: 'assistant', hireDate: TODAY, grossSalary: 40000 });
    expect(e.code).toBe('P013');
    expect(e.initials).toBe('T.P.');
    expect(headcount(s1, AUD).active).toBe(13);
    const rules = payrollRulesFor(base, AUD);
    const s2 = setPayrollRules(base, { ...rules, cnssEmployeeRate: 0.02 });
    expect(computePayLine(base.employees[0], payrollRulesFor(s2, AUD)).cnssEmployee).toBeGreaterThan(computePayLine(base.employees[0], rules).cnssEmployee);
    expect(() => setPayrollRules(base, { ...rules, itsBrackets: [{ upTo: 100, rate: 0.1 }] })).toThrow(/ouverte/);
  });
});

describe('planning: assignments, calendar, availability', () => {
  it('builds the calendar from assignments and flags the double booking', () => {
    const cal = planningCalendar(base, AUD, TODAY, 8);
    expect(cal.rows).toHaveLength(12);
    expect(cal.weeks).toHaveLength(8);
    expect(cal.free + cal.assigned + cal.overloaded).toBe(12);
    const aa = cal.rows.find((r) => r.employee.initials === 'A.A.')!;
    expect(aa.status).toBe('overloaded');
    expect(cal.conflicts.some((c) => c.employee.initials === 'A.A.')).toBe(true);
    const av = availability(base, AUD, TODAY, '2026-10-31');
    expect(av.some((x) => x.free)).toBe(true);
  });
  it('assigns, refuses duplicates and inactive people, and removes', () => {
    const eng = base.engagements.find((e) => e.entityId === AUD && e.status === 'active')!;
    const free = availability(base, AUD, TODAY, '2026-12-31').find((x) => x.free)!.employee;
    const [s1, a] = assign(base, { entityId: AUD, engagementId: eng.id, employeeId: free.id, start: TODAY, end: '2026-11-30', load: 0.5 });
    expect(s1.engagements.find((e) => e.id === eng.id)!.staff).toContain(free.initials);
    expect(() => assign(s1, { entityId: AUD, engagementId: eng.id, employeeId: free.id, start: '2026-11-01', end: '2026-11-10' })).toThrow(/déjà affecté/);
    expect(() => assign(as(base, 'staff'), { entityId: AUD, engagementId: eng.id, employeeId: free.id, start: TODAY, end: TODAY })).toThrow(/rôle/);
    const s2 = removeAssignment(s1, a.id);
    expect(s2.assignments.some((x) => x.id === a.id)).toBe(false);
  });
});
