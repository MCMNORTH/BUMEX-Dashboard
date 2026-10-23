import type { State, Id, ISODate, Employee, EmployeeCategory, PayrollRules, PayrollRun, PayrollLine } from './types';
import { DomainError } from './types';
import { r2, sum, endOfMonth } from './money';
import { nextId, audit, mapped, requirePost, requireRole, PARTNER_ROLES } from './core';
import { createDraft, postEntry, type DraftLineInput } from './ledger';

// Human resources: employee sheets, headcount, payroll parameters and monthly payroll runs that post
// salaries, contributions and withheld tax to the ledger. Every rate and bracket is a parameter per entity.

export const CATEGORY_FR: Record<EmployeeCategory, string> = { partner: 'Associé', manager: 'Manager', senior: 'Senior', assistant: 'Assistant', intern: 'Stagiaire', support: 'Support' };

// Defaults to verify against the current legislation; everything is editable in the HR settings.
export function defaultPayrollRules(entityId: Id, country: 'MR' | 'MA'): PayrollRules {
  if (country === 'MA')
    return { entityId, cnssEmployeeRate: 0.0448, cnssEmployerRate: 0.0898, cnssCeiling: 6000, cnamEmployeeRate: 0.0226, cnamEmployerRate: 0.0411, itsAbatement: 0, itsBrackets: [{ upTo: 3333.33, rate: 0 }, { upTo: 5000, rate: 0.1 }, { upTo: 6666.67, rate: 0.2 }, { upTo: 8333.33, rate: 0.3 }, { upTo: 15000, rate: 0.34 }, { upTo: null, rate: 0.37 }], labels: { social: 'CNSS', health: 'AMO', tax: 'IR' } };
  return { entityId, cnssEmployeeRate: 0.01, cnssEmployerRate: 0.15, cnssCeiling: 15000, cnamEmployeeRate: 0.04, cnamEmployerRate: 0.05, itsAbatement: 6000, itsBrackets: [{ upTo: 9000, rate: 0.15 }, { upTo: 21000, rate: 0.25 }, { upTo: null, rate: 0.4 }], labels: { social: 'CNSS', health: 'CNAM', tax: 'ITS' } };
}

export function payrollRulesFor(state: State, entityId: Id): PayrollRules {
  const r = state.payrollRules.find((x) => x.entityId === entityId);
  if (r) return r;
  const e = state.entities.find((x) => x.id === entityId)!;
  return defaultPayrollRules(entityId, e.country);
}

export function setPayrollRules(state: State, rules: PayrollRules): State {
  requireRole(state, [...PARTNER_ROLES, 'manager'], 'de paramétrer la paie');
  for (const k of ['cnssEmployeeRate', 'cnssEmployerRate', 'cnamEmployeeRate', 'cnamEmployerRate'] as const) if (rules[k] < 0 || rules[k] > 1) throw new DomainError('rate', 'Taux entre 0 et 100 %');
  if (!rules.itsBrackets.length || rules.itsBrackets[rules.itsBrackets.length - 1].upTo !== null) throw new DomainError('brackets', 'La dernière tranche doit être ouverte (sans plafond)');
  for (let i = 1; i < rules.itsBrackets.length; i++) { const a = rules.itsBrackets[i - 1].upTo!, b = rules.itsBrackets[i].upTo; if (b !== null && b <= a) throw new DomainError('brackets', 'Tranches croissantes attendues'); }
  const others = state.payrollRules.filter((x) => x.entityId !== rules.entityId);
  return audit({ ...state, payrollRules: [...others, rules] }, 'payroll_rules', rules.entityId, 'U', 'Paramètres de paie modifiés', rules.entityId);
}

export interface EmployeeInput {
  entityId: Id;
  code?: string;
  firstName: string;
  lastName: string;
  initials?: string;
  jobTitle: string;
  department: string;
  category: EmployeeCategory;
  hireDate: ISODate;
  email?: string;
  phone?: string;
  contractType?: string;
  grossSalary: number;
  allowances?: number;
}

function initialsOf(first: string, last: string): string {
  return `${first.trim().slice(0, 1).toUpperCase()}.${last.trim().split(/\s+/).map((p) => p.slice(0, 1).toUpperCase()).join('')}.`;
}

export function addEmployee(state: State, input: EmployeeInput): [State, Employee] {
  requireRole(state, [...PARTNER_ROLES, 'manager'], "d'ajouter un collaborateur");
  if (!input.firstName.trim() || !input.lastName.trim()) throw new DomainError('name', 'Prénom et nom obligatoires');
  if (!(input.grossSalary >= 0)) throw new DomainError('salary', 'Salaire brut positif ou nul');
  const existing = state.employees.filter((e) => e.entityId === input.entityId);
  const code = input.code?.trim() || `P${String(existing.length + 1).padStart(3, '0')}`;
  if (existing.some((e) => e.code === code)) throw new DomainError('exists', `Le matricule ${code} existe déjà`);
  const [s1, id] = nextId(state, 'emp');
  const emp: Employee = { id, entityId: input.entityId, code, firstName: input.firstName.trim(), lastName: input.lastName.trim(), initials: input.initials?.trim() || initialsOf(input.firstName, input.lastName), jobTitle: input.jobTitle.trim(), department: input.department.trim(), category: input.category, hireDate: input.hireDate, status: 'active', email: input.email, phone: input.phone, contractType: input.contractType ?? 'CDI', grossSalary: r2(input.grossSalary), allowances: r2(input.allowances ?? 0) };
  return [audit({ ...s1, employees: [...s1.employees, emp] }, 'employee', id, 'I', `Collaborateur ${emp.firstName} ${emp.lastName} · ${emp.jobTitle}`, emp.entityId), emp];
}

export function updateEmployee(state: State, id: Id, patch: Partial<Omit<Employee, 'id' | 'entityId' | 'code'>>): [State, Employee] {
  requireRole(state, [...PARTNER_ROLES, 'manager'], 'de modifier un collaborateur');
  const e = state.employees.find((x) => x.id === id);
  if (!e) throw new DomainError('not_found', 'Collaborateur inconnu');
  if (patch.grossSalary !== undefined && !(patch.grossSalary >= 0)) throw new DomainError('salary', 'Salaire brut positif ou nul');
  const next: Employee = { ...e, ...patch, status: patch.endDate ? 'left' : patch.status ?? e.status };
  return [audit({ ...state, employees: state.employees.map((x) => (x.id === id ? next : x)) }, 'employee', id, 'U', `Collaborateur ${next.firstName} ${next.lastName} modifié`, e.entityId), next];
}

export interface Headcount {
  total: number;
  active: number;
  byDepartment: { name: string; count: number; payroll: number }[];
  byCategory: { category: EmployeeCategory; count: number }[];
  monthlyGross: number;
  monthlyEmployerCost: number;
}

export function headcount(state: State, entityId: Id): Headcount {
  const all = state.employees.filter((e) => e.entityId === entityId);
  const active = all.filter((e) => e.status === 'active');
  const rules = payrollRulesFor(state, entityId);
  const deps = [...new Set(active.map((e) => e.department))].sort();
  const cats = (['partner', 'manager', 'senior', 'assistant', 'intern', 'support'] as EmployeeCategory[]).map((category) => ({ category, count: active.filter((e) => e.category === category).length })).filter((c) => c.count);
  const lines = active.map((e) => computePayLine(e, rules));
  return {
    total: all.length,
    active: active.length,
    byDepartment: deps.map((name) => ({ name, count: active.filter((e) => e.department === name).length, payroll: sum(active.filter((e) => e.department === name).map((e) => r2(e.grossSalary + e.allowances))) })),
    byCategory: cats,
    monthlyGross: sum(lines.map((l) => l.gross)),
    monthlyEmployerCost: sum(lines.map((l) => r2(l.gross + l.cnssEmployer + l.cnamEmployer))),
  };
}

// Gross → contributions → progressive tax → net. The ceiling applies to the social contribution base.
// The regime decides which deductions exist: under the GTA regime the configured exemptions switch the social, health
// and tax deductions off (no contribution, no withheld tax, no entry line for them); the normal regime applies the rates.
export function effectiveExemptions(rules: PayrollRules): { social: boolean; health: boolean; tax: boolean } {
  const gta = rules.regime === 'gta';
  return { social: rules.socialExempt ?? gta, health: rules.healthExempt ?? gta, tax: rules.taxExempt ?? gta };
}

export function computePayLine(e: Employee, rules: PayrollRules): PayrollLine {
  const gross = r2(e.grossSalary + e.allowances);
  const ex = effectiveExemptions(rules);
  const socialBase = rules.cnssCeiling > 0 ? Math.min(gross, rules.cnssCeiling) : gross;
  const cnssEmployee = ex.social ? 0 : r2(socialBase * rules.cnssEmployeeRate);
  const cnssEmployer = ex.social ? 0 : r2(socialBase * rules.cnssEmployerRate);
  const cnamEmployee = ex.health ? 0 : r2(gross * rules.cnamEmployeeRate);
  const cnamEmployer = ex.health ? 0 : r2(gross * rules.cnamEmployerRate);
  const taxable = ex.tax ? 0 : r2(Math.max(0, gross - cnssEmployee - cnamEmployee - rules.itsAbatement));
  let its = 0;
  let lower = 0;
  if (!ex.tax) for (const b of rules.itsBrackets) {
    const upper = b.upTo ?? Infinity;
    if (taxable > lower) its += (Math.min(taxable, upper) - lower) * b.rate;
    if (taxable <= upper) break;
    lower = upper;
  }
  its = r2(its);
  return { employeeId: e.id, gross, cnssEmployee, cnamEmployee, taxable, its, net: r2(gross - cnssEmployee - cnamEmployee - its), cnssEmployer, cnamEmployer };
}

function totalsOf(lines: PayrollLine[]): PayrollRun['totals'] {
  const t = { gross: sum(lines.map((l) => l.gross)), cnssEmployee: sum(lines.map((l) => l.cnssEmployee)), cnamEmployee: sum(lines.map((l) => l.cnamEmployee)), its: sum(lines.map((l) => l.its)), net: sum(lines.map((l) => l.net)), cnssEmployer: sum(lines.map((l) => l.cnssEmployer)), cnamEmployer: sum(lines.map((l) => l.cnamEmployer)), employerCost: 0 };
  t.employerCost = r2(t.gross + t.cnssEmployer + t.cnamEmployer);
  return t;
}

export function simulatePayroll(state: State, entityId: Id, month: string): PayrollRun {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new DomainError('month', 'Mois attendu au format AAAA-MM');
  const rules = payrollRulesFor(state, entityId);
  const monthEnd = endOfMonth(`${month}-01`);
  const employees = state.employees.filter((e) => e.entityId === entityId && e.hireDate <= monthEnd && (e.status === 'active' || (e.endDate && e.endDate >= `${month}-01`)));
  const lines = employees.map((e) => computePayLine(e, rules));
  return { id: '', entityId, month, date: monthEnd, status: 'simulated', lines, totals: totalsOf(lines) };
}

// payroll.v1 — Dr salaries + allowances (gross) + Dr employer contributions / Cr net payable + Cr social + Cr health + Cr tax withheld
export function postPayroll(state: State, entityId: Id, month: string, date?: ISODate): [State, PayrollRun] {
  requirePost(state);
  requireRole(state, [...PARTNER_ROLES, 'manager', 'accountant'], 'de comptabiliser la paie');
  if (state.payrollRuns.some((r) => r.entityId === entityId && r.month === month && r.status === 'posted')) throw new DomainError('exists', `La paie de ${month} est déjà comptabilisée`);
  const sim = simulatePayroll(state, entityId, month);
  if (!sim.lines.length) throw new DomainError('empty', 'Aucun collaborateur actif sur ce mois');
  const when = date ?? sim.date;
  const entity = state.entities.find((e) => e.id === entityId)!;
  const rules = payrollRulesFor(state, entityId);
  const journal = state.journals.find((j) => j.entityId === entityId && j.kind === 'misc')!;
  const t = sim.totals;
  const salaries = sum(sim.lines.map((l) => { const e = state.employees.find((x) => x.id === l.employeeId)!; return e.grossSalary; }));
  const allowances = r2(t.gross - salaries);
  const lines: DraftLineInput[] = [{ accountId: mapped(state, entityId, 'SALARY_EXPENSE').id, description: `Salaires bruts ${month}`, debitTxn: salaries }];
  if (allowances) lines.push({ accountId: mapped(state, entityId, 'ALLOWANCE_EXPENSE').id, description: `Indemnités et primes ${month}`, debitTxn: allowances });
  if (t.cnssEmployer) lines.push({ accountId: mapped(state, entityId, 'SOCIAL_EXPENSE').id, description: `${rules.labels.social} part employeur ${month}`, debitTxn: t.cnssEmployer });
  if (t.cnamEmployer) lines.push({ accountId: mapped(state, entityId, 'HEALTH_EXPENSE').id, description: `${rules.labels.health} part employeur ${month}`, debitTxn: t.cnamEmployer });
  lines.push({ accountId: mapped(state, entityId, 'NET_PAYABLE').id, description: `Salaires nets à payer ${month}`, creditTxn: t.net });
  if (t.cnssEmployee + t.cnssEmployer) lines.push({ accountId: mapped(state, entityId, 'SOCIAL_PAYABLE').id, description: `${rules.labels.social} à verser ${month}`, creditTxn: r2(t.cnssEmployee + t.cnssEmployer) });
  if (t.cnamEmployee + t.cnamEmployer) lines.push({ accountId: mapped(state, entityId, 'HEALTH_PAYABLE').id, description: `${rules.labels.health} à verser ${month}`, creditTxn: r2(t.cnamEmployee + t.cnamEmployer) });
  if (t.its) lines.push({ accountId: mapped(state, entityId, 'TAX_WITHHELD_PAYABLE').id, description: `${rules.labels.tax} retenu ${month}`, creditTxn: t.its });
  const [s1, draft] = createDraft(state, { entityId, journalId: journal.id, date: when, description: `Paie ${month} · ${sim.lines.length} collaborateur(s)`, currency: entity.functionalCurrency, fxRate: 1, sourceType: 'payroll', sourceId: month, postingRule: 'payroll.v1', lines });
  const [s2, posted] = postEntry(s1, draft.id);
  const [s3, id] = nextId(s2, 'prun');
  const run: PayrollRun = { ...sim, id, date: when, status: 'posted', journalEntryId: posted.id };
  return [audit({ ...s3, payrollRuns: [...s3.payrollRuns, run] }, 'payroll_run', id, 'I', `Paie ${month} comptabilisée · brut ${t.gross} · net ${t.net}`, entityId), run];
}

// Summary for a period of months: what was paid to staff and what is due to each administration.
export interface PayrollStatement {
  months: string[];
  gross: number;
  net: number;
  social: number; // employee + employer
  health: number;
  tax: number;
  employerCost: number;
  byMonth: { month: string; gross: number; net: number; social: number; health: number; tax: number; status: string }[];
}

export function payrollStatement(state: State, entityId: Id, from?: string, to?: string): PayrollStatement {
  const runs = state.payrollRuns.filter((r) => r.entityId === entityId && r.status === 'posted' && (!from || r.month >= from) && (!to || r.month <= to)).sort((a, b) => (a.month < b.month ? -1 : 1));
  const byMonth = runs.map((r) => ({ month: r.month, gross: r.totals.gross, net: r.totals.net, social: r2(r.totals.cnssEmployee + r.totals.cnssEmployer), health: r2(r.totals.cnamEmployee + r.totals.cnamEmployer), tax: r.totals.its, status: 'comptabilisée' }));
  return { months: runs.map((r) => r.month), gross: sum(byMonth.map((m) => m.gross)), net: sum(byMonth.map((m) => m.net)), social: sum(byMonth.map((m) => m.social)), health: sum(byMonth.map((m) => m.health)), tax: sum(byMonth.map((m) => m.tax)), employerCost: sum(runs.map((r) => r.totals.employerCost)), byMonth };
}
