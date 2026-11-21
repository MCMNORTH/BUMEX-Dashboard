import { useEffect, useMemo, useState } from 'react';
import {
  headcount, addEmployee, updateEmployee, simulatePayroll, postPayroll, payrollStatement, payrollRulesFor, setPayrollRules, computePayLine, CATEGORY_FR, planningCalendar, accountBalance, effectiveExemptions,
  fmt, r2, parseAmount, type Id, type Employee, type EmployeeCategory, type PayrollRules, type PayrollRegime,
  canUseModule, // [bumex-one]
} from '@bumex/domain';
import { useStore } from '../../store';
import { Tabs, Field, Chip, D, Money, DeleteButton, downloadXlsx, entryRef } from '../common';
import { People } from '../../one/People'; // [bumex-one] BUMEX One's team, for everyone
import { useSay } from '../../one/say'; // [bumex-one]
// [bumex-one] bilingual: every text follows the person's language, say('français', 'English') (vanguard/one/say.ts, 2026-11-21)

type Tab = 'people' | 'employees' | 'sheet' | 'headcount' | 'payroll' | 'statements' | 'rules'; // [bumex-one] people
const CATS = Object.keys(CATEGORY_FR) as EmployeeCategory[];
import { Select, Suggest } from '../Select';
const CONTRACTS = ['CDI', 'CDD', 'Stage', 'Prestataire', 'Associé'];
// [bumex-one] categories, contracts and a run's status stay stored as they are (codes, French words); English only on screen
const CATEGORY_EN: Record<EmployeeCategory, string> = { partner: 'Partner', manager: 'Manager', senior: 'Senior', assistant: 'Assistant', intern: 'Intern', support: 'Support' };
const CONTRACT_EN: Record<string, string> = { CDI: 'Permanent', CDD: 'Fixed-term', Stage: 'Internship', Prestataire: 'Contractor', 'Associé': 'Partner' };
const RUN_STATUS_EN: Record<string, string> = { 'comptabilisée': 'Posted' };

export function HrPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  // [bumex-one] the room opens to everyone on its "Personnes" tab (lib/erp/vanguard/domain.ts, canOpenRoom); the HR
  // module's tabs stay with the people who have it
  const say = useSay();
  const hrModule = canUseModule(state, 'hr');
  // "person:<id>" opens that person's page on the People tab (BUMEX One's /team/<id> links)
  const personId = initialTab?.startsWith('person:') ? initialTab.slice(7) : null;
  const [tab, setTab] = useState<Tab>(personId || !hrModule ? 'people' : (initialTab as Tab) || 'employees');
  useEffect(() => { if (initialTab && (hrModule || initialTab === 'people' || initialTab.startsWith('person:'))) setTab(initialTab.startsWith('person:') ? 'people' : initialTab as Tab); }, [initialTab, hrModule]);
  const [employeeId, setEmployeeId] = useState<Id | null>(null);
  const hc = headcount(state, entityId);
  const lastMonth = useMemo(() => { const d = new Date(state.today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); }, [state.today]);
  const unposted = !state.payrollRuns.some((r) => r.entityId === entityId && r.month === lastMonth && r.status === 'posted') && hc.active > 0;
  const people = { id: 'people' as Tab, label: say('Personnes', 'People') }; // [bumex-one]
  const tabs = !hrModule ? [people] : [
    people,
    { id: 'employees' as Tab, label: say(`Collaborateurs · ${hc.active}`, `Employees · ${hc.active}`) },
    { id: 'sheet' as Tab, label: employeeId ? say(`Fiche · ${state.employees.find((e) => e.id === employeeId)?.initials ?? ''}`, `Record · ${state.employees.find((e) => e.id === employeeId)?.initials ?? ''}`) : say('Nouvelle fiche', 'New record') },
    { id: 'headcount' as Tab, label: say('Effectifs', 'Headcount') },
    { id: 'payroll' as Tab, label: <>{say('Paie', 'Payroll')} {unposted ? <Chip kind="warn">{lastMonth}</Chip> : null}</> },
    { id: 'statements' as Tab, label: say('États · déclarations', 'Statements · returns') },
    { id: 'rules' as Tab, label: say('Règles de paie', 'Payroll rules') },
  ];
  const open = (id: Id | null) => { setEmployeeId(id); setTab('sheet'); };
  return (
    <>
      <div className="sheet-head"><h1>{t('room_hr')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'people' && <People key={personId ?? ''} entityId={entityId} onOpen={open} personId={personId} />}
        {tab === 'employees' && <Employees entityId={entityId} onOpen={open} />}
        {tab === 'sheet' && <Sheet entityId={entityId} employeeId={employeeId} onSaved={(id) => setEmployeeId(id)} />}
        {tab === 'headcount' && <HeadcountView entityId={entityId} />}
        {tab === 'payroll' && <Payroll entityId={entityId} />}
        {tab === 'statements' && <Statements entityId={entityId} />}
        {tab === 'rules' && <Rules entityId={entityId} />}
      </div>
    </>
  );
}

function Employees({ entityId, onOpen }: { entityId: Id; onOpen: (id: Id | null) => void }) {
  const { state, t, toast } = useStore();
  const say = useSay();
  const [q, setQ] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const rules = payrollRulesFor(state, entityId);
  const cal = useMemo(() => planningCalendar(state, entityId, state.today, 1), [state, entityId]);
  const rows = state.employees.filter((e) => e.entityId === entityId && (showLeft || e.status === 'active') && (!q.trim() || `${e.firstName} ${e.lastName} ${e.jobTitle} ${e.department} ${e.code}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => a.lastName.localeCompare(b.lastName));
  const entity = state.entities.find((e) => e.id === entityId)!;
  const exportXlsx = () => downloadXlsx(`collaborateurs-${entity.code}-${state.today}.xlsx`, [{ name: 'Collaborateurs', rows: [['Matricule', 'Nom', 'Prénom', 'Initiales', 'Fonction', 'Service', 'Catégorie', 'Contrat', 'Entrée', 'Sortie', 'Statut', 'E-mail', 'Téléphone', 'Salaire brut', 'Indemnités'], ...rows.map((e) => [e.code, e.lastName, e.firstName, e.initials, e.jobTitle, e.department, CATEGORY_FR[e.category], e.contractType, e.hireDate, e.endDate ?? '', e.status === 'active' ? 'Actif' : 'Sorti', e.email ?? '', e.phone ?? '', e.grossSalary, e.allowances])] }], toast);
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ maxWidth: 280 }} placeholder={say('Rechercher un collaborateur…', 'Search for an employee…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="small"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> {say('Inclure les sorties', 'Include leavers')}</label>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn sm" onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
        <button className="btn sm primary" onClick={() => onOpen(null)}>{say('Nouveau collaborateur', 'New employee')}</button>
      </div>
      <table>
        <thead><tr><th>{say('Matricule', 'Employee ID')}</th><th>{say('Collaborateur', 'Employee')}</th><th>{say('Fonction', 'Job title')}</th><th>{say('Service', 'Department')}</th><th>{say('Catégorie', 'Category')}</th><th>{say('Contrat', 'Contract')}</th><th>{say('Entrée', 'Hire date')}</th><th className="num">{say('Brut mensuel', 'Monthly gross')}</th><th className="num">{say('Net estimé', 'Estimated net')}</th><th>{say('Planning', 'Planning')}</th><th>{say('Compte', 'Account')}</th><th></th></tr></thead>
        <tbody>
          {rows.map((e) => {
            const line = computePayLine(e, rules);
            const plan = cal.rows.find((r) => r.employee.id === e.id);
            const user = state.users.find((u) => u.employeeId === e.id);
            return (
              <tr key={e.id} onClick={() => onOpen(e.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{e.code}</td><td><b>{e.lastName.toUpperCase()}</b> {e.firstName}<div className="small muted">{e.initials}{e.email ? ` · ${e.email}` : ''}</div></td><td>{e.jobTitle}</td><td>{e.department}</td><td>{say(CATEGORY_FR[e.category], CATEGORY_EN[e.category])}</td><td>{say(e.contractType, CONTRACT_EN[e.contractType] ?? e.contractType)}</td><td><D iso={e.hireDate} />{e.status === 'left' && <Chip kind="dim">{say(' sorti', ' left')}</Chip>}</td>
                <td className="num">{fmt(r2(e.grossSalary + e.allowances), 0)}</td><td className="num">{fmt(line.net, 0)}</td>
                <td>{plan ? <Chip kind={plan.status === 'free' ? 'good' : plan.status === 'overloaded' ? 'crit' : 'dim'}>{plan.status === 'free' ? say('Disponible', 'Available') : plan.status === 'overloaded' ? say(`${Math.round(plan.loadNow * 100)} % · surcharge`, `${Math.round(plan.loadNow * 100)} % · overload`) : say(`${Math.round(plan.loadNow * 100)} % affecté`, `${Math.round(plan.loadNow * 100)} % assigned`)}</Chip> : '—'}</td>
                <td className="small">{user ? `${t(user.role)}` : <span className="muted">{say('aucun', 'none')}</span>}</td>
                <td onClick={(ev) => ev.stopPropagation()}><DeleteButton table="employee" rowId={e.id} label={`Collaborateur ${e.firstName} ${e.lastName}`} entityId={entityId} /></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={12} className="muted small">{say('Aucun collaborateur', 'No employees')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Sheet({ entityId, employeeId, onSaved }: { entityId: Id; employeeId: Id | null; onSaved: (id: Id) => void }) {
  const { state, apply } = useStore();
  const say = useSay();
  const e = employeeId ? state.employees.find((x) => x.id === employeeId) : undefined;
  const departments = [...new Set(state.employees.filter((x) => x.entityId === entityId).map((x) => x.department))].sort();
  const [firstName, setFirst] = useState(e?.firstName ?? '');
  const [lastName, setLast] = useState(e?.lastName ?? '');
  const [jobTitle, setJob] = useState(e?.jobTitle ?? '');
  const [department, setDep] = useState(e?.department ?? departments[0] ?? 'Audit');
  const [category, setCat] = useState<EmployeeCategory>(e?.category ?? 'senior');
  const [contractType, setContract] = useState(e?.contractType ?? 'CDI');
  const [hireDate, setHire] = useState(e?.hireDate ?? state.today);
  const [endDate, setEnd] = useState(e?.endDate ?? '');
  const [status, setStatus] = useState<Employee['status']>(e?.status ?? 'active');
  const [email, setEmail] = useState(e?.email ?? '');
  const [phone, setPhone] = useState(e?.phone ?? '');
  const [gross, setGross] = useState(e ? String(e.grossSalary) : '');
  const [allow, setAllow] = useState(e ? String(e.allowances) : '0');
  const [tracked, setTracked] = useState(employeeId);
  if (tracked !== employeeId) { setTracked(employeeId); setFirst(e?.firstName ?? ''); setLast(e?.lastName ?? ''); setJob(e?.jobTitle ?? ''); setDep(e?.department ?? departments[0] ?? 'Audit'); setCat(e?.category ?? 'senior'); setContract(e?.contractType ?? 'CDI'); setHire(e?.hireDate ?? state.today); setEnd(e?.endDate ?? ''); setStatus(e?.status ?? 'active'); setEmail(e?.email ?? ''); setPhone(e?.phone ?? ''); setGross(e ? String(e.grossSalary) : ''); setAllow(e ? String(e.allowances) : '0'); }
  const rules = payrollRulesFor(state, entityId);
  const preview = computePayLine({ id: 'x', entityId, code: '', firstName, lastName, initials: '', jobTitle, department, category, hireDate, status: 'active', contractType, grossSalary: parseAmount(gross) ?? 0, allowances: parseAmount(allow) ?? 0 }, rules);
  const assignments = e ? state.assignments.filter((a) => a.employeeId === e.id).sort((a, b) => (a.start < b.start ? 1 : -1)) : [];
  const runs = e ? state.payrollRuns.filter((r) => r.entityId === entityId && r.status === 'posted' && r.lines.some((l) => l.employeeId === e.id)).sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 12) : [];
  const save = () => {
    apply((s) => {
      const base = { firstName, lastName, jobTitle, department, category, contractType, hireDate, email: email || undefined, phone: phone || undefined, grossSalary: parseAmount(gross) ?? 0, allowances: parseAmount(allow) ?? 0 };
      if (e) return updateEmployee(s, e.id, { ...base, endDate: endDate || undefined, status });
      const [s1, emp] = addEmployee(s, { entityId, ...base });
      window.setTimeout(() => onSaved(emp.id), 0);
      return s1;
    }, e ? say('Fiche mise à jour', 'Record updated') : say('Collaborateur créé', 'Employee created'));
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>{e ? `${e.code} · ${e.firstName} ${e.lastName}` : say('Nouveau collaborateur', 'New employee')}</h2>
          <div className="grid3">
            <Field label={say('Prénom', 'First name')}><input className="in" value={firstName} onChange={(ev) => setFirst(ev.target.value)} /></Field>
            <Field label={say('Nom', 'Last name')}><input className="in" value={lastName} onChange={(ev) => setLast(ev.target.value)} /></Field>
            <Field label={say('Fonction', 'Job title')}><input className="in" value={jobTitle} onChange={(ev) => setJob(ev.target.value)} placeholder={say('Auditeur senior', 'Senior auditor')} /></Field>
            <Field label={say('Service · département', 'Department')}><Suggest options={departments} value={department} onChange={(ev) => setDep(ev.target.value)} aria-label={say('Service · département', 'Department')} /></Field>
            <Field label={say('Catégorie', 'Category')}><Select className="in" value={category} onChange={(ev) => setCat(ev.target.value as EmployeeCategory)}>{CATS.map((c) => <option key={c} value={c}>{say(CATEGORY_FR[c], CATEGORY_EN[c])}</option>)}</Select></Field>
            <Field label={say('Contrat', 'Contract')}><Select className="in" value={contractType} onChange={(ev) => setContract(ev.target.value)}>{CONTRACTS.map((c) => <option key={c} value={c}>{say(c, CONTRACT_EN[c] ?? c)}</option>)}</Select></Field>
            <Field label={say("Date d'entrée", 'Hire date')}><input className="in mono" type="date" value={hireDate} onChange={(ev) => setHire(ev.target.value)} /></Field>
            {e && <Field label={say('Date de sortie', 'Leave date')}><input className="in mono" type="date" value={endDate} onChange={(ev) => setEnd(ev.target.value)} /></Field>}
            {e && <Field label={say('Statut', 'Status')}><Select className="in" value={status} onChange={(ev) => setStatus(ev.target.value as Employee['status'])}><option value="active">{say('Actif', 'Active')}</option><option value="left">{say('Sorti des effectifs', 'Left the company')}</option></Select></Field>}
            <Field label={say('E-mail', 'Email')}><input className="in" value={email} onChange={(ev) => setEmail(ev.target.value)} /></Field>
            <Field label={say('Téléphone', 'Phone')}><input className="in" value={phone} onChange={(ev) => setPhone(ev.target.value)} /></Field>
            <Field label={say('Salaire brut mensuel', 'Monthly gross salary')}><input className="in num" value={gross} onChange={(ev) => setGross(ev.target.value)} /></Field>
            <Field label={say('Indemnités et primes mensuelles', 'Monthly allowances and bonuses')}><input className="in num" value={allow} onChange={(ev) => setAllow(ev.target.value)} /></Field>
          </div>
          <div className="actions"><button type="submit" className="btn primary" disabled={!firstName.trim() || !lastName.trim()}>{e ? say('Enregistrer', 'Save') : say('Créer la fiche', 'Create record')}</button></div>
        </div>
        {e && (
          <div className="grid2">
            <div className="card flush">
              <table><thead><tr><th>{say('Affectations', 'Assignments')}</th><th>{say('Période', 'Period')}</th><th className="num">{say('Charge', 'Load')}</th></tr></thead><tbody>{assignments.map((a) => { const eng = state.engagements.find((x) => x.id === a.engagementId); return <tr key={a.id}><td>{eng?.code} · {eng?.name}</td><td><D iso={a.start} /> → <D iso={a.end} /></td><td className="num">{Math.round(a.load * 100)} %</td></tr>; })}{assignments.length === 0 && <tr><td colSpan={3} className="muted small">{say('Aucune affectation · voir Missions › Planning', 'No assignments · see Missions › Planning')}</td></tr>}</tbody></table>
            </div>
            <div className="card flush">
              <table><thead><tr><th>{say('Bulletins comptabilisés', 'Posted payslips')}</th><th className="num">{say('Brut', 'Gross')}</th><th className="num">{say('Retenues', 'Deductions')}</th><th className="num">Net</th></tr></thead><tbody>{runs.map((r) => { const l = r.lines.find((x) => x.employeeId === e.id)!; return <tr key={r.id}><td>{r.month}</td><td className="num">{fmt(l.gross, 0)}</td><td className="num">{fmt(r2(l.cnssEmployee + l.cnamEmployee + l.its), 0)}</td><td className="num">{fmt(l.net, 0)}</td></tr>; })}{runs.length === 0 && <tr><td colSpan={4} className="muted small">{say('Aucune paie comptabilisée', 'No posted payroll')}</td></tr>}</tbody></table>
            </div>
          </div>
        )}
      </form>
      <aside className="side">
        <div className="card">
          <h2>{say('Bulletin estimé · règles', 'Estimated payslip · rules')} {rules.labels.social} / {rules.labels.health} / {rules.labels.tax}</h2>
          <div className="kv">
            <span className="k">{say('Brut (salaire + indemnités)', 'Gross (salary + allowances)')}</span><Money v={preview.gross} />
            <span className="k">{rules.labels.social} {say('salarié', 'employee')} ({(rules.cnssEmployeeRate * 100).toFixed(2)} %)</span><Money v={-preview.cnssEmployee} />
            <span className="k">{rules.labels.health} {say('salarié', 'employee')} ({(rules.cnamEmployeeRate * 100).toFixed(2)} %)</span><Money v={-preview.cnamEmployee} />
            <span className="k">{say('Base imposable', 'Taxable base')}</span><Money v={preview.taxable} />
            <span className="k">{rules.labels.tax} {say('(barème)', '(brackets)')}</span><Money v={-preview.its} />
            <span className="k"><b>{say('Net à payer', 'Net pay')}</b></span><b><Money v={preview.net} /></b>
            <span className="k">{rules.labels.social} {say('employeur', 'employer')}</span><Money v={preview.cnssEmployer} />
            <span className="k">{rules.labels.health} {say('employeur', 'employer')}</span><Money v={preview.cnamEmployer} />
            <span className="k">{say('Coût employeur', 'Employer cost')}</span><Money v={r2(preview.gross + preview.cnssEmployer + preview.cnamEmployer)} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function HeadcountView({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const say = useSay();
  const hc = headcount(state, entityId);
  const rules = payrollRulesFor(state, entityId);
  const active =state.employees.filter((e) => e.entityId === entityId && e.status === 'active');
  const byContract = [...new Set(active.map((e) => e.contractType))].map((c) => ({ c, n: active.filter((e) => e.contractType === c).length }));
  const yearIn = active.filter((e) => e.hireDate.slice(0, 4) === state.today.slice(0, 4)).length;
  const yearOut = state.employees.filter((e) => e.entityId === entityId && e.status === 'left' && e.endDate?.slice(0, 4) === state.today.slice(0, 4)).length;
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">{say('Effectif actif', 'Active headcount')}</div><div className="v">{hc.active}</div><div className="l">{say(`${hc.total - hc.active} sorti(s) · ${yearIn} entrée(s) et ${yearOut} sortie(s) cette année`, `${hc.total - hc.active} left · ${yearIn} hired and ${yearOut} left this year`)}</div></div>
        <div className="kpi"><div className="l">{say('Masse salariale brute mensuelle', 'Monthly gross payroll cost')}</div><div className="v">{fmt(hc.monthlyGross, 0)}</div></div>
        <div className="kpi"><div className="l">{say('Coût employeur mensuel', 'Monthly employer cost')}</div><div className="v">{fmt(hc.monthlyEmployerCost, 0)}</div><div className="l">{rules.labels.social} + {rules.labels.health} {say('employeur inclus', 'employer share included')}</div></div>
        <div className="kpi"><div className="l">{say('Coût annuel projeté', 'Projected annual cost')}</div><div className="v">{fmt(r2(hc.monthlyEmployerCost * 12), 0)}</div></div>
      </div>
      <div className="grid3">
        <div className="card flush"><table><thead><tr><th>{say('Par service', 'By department')}</th><th className="num">{say('Effectif', 'Headcount')}</th><th className="num">{say('Brut mensuel', 'Monthly gross')}</th></tr></thead><tbody>{hc.byDepartment.map((d) => <tr key={d.name}><td>{d.name}</td><td className="num">{d.count}</td><td className="num">{fmt(d.payroll, 0)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td className="num">{hc.active}</td><td className="num">{fmt(hc.monthlyGross, 0)}</td></tr></tfoot></table></div>
        <div className="card flush"><table><thead><tr><th>{say('Par catégorie', 'By category')}</th><th className="num">{say('Effectif', 'Headcount')}</th><th className="num">{say('Part', 'Share')}</th></tr></thead><tbody>{hc.byCategory.map((c) => <tr key={c.category}><td>{say(CATEGORY_FR[c.category], CATEGORY_EN[c.category])}</td><td className="num">{c.count}</td><td className="num">{Math.round((c.count / Math.max(1, hc.active)) * 100)} %</td></tr>)}</tbody></table></div>
        <div className="card flush"><table><thead><tr><th>{say('Par contrat', 'By contract')}</th><th className="num">{say('Effectif', 'Headcount')}</th></tr></thead><tbody>{byContract.map((c) => <tr key={c.c}><td>{say(c.c, CONTRACT_EN[c.c] ?? c.c)}</td><td className="num">{c.n}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}

function Payroll({ entityId }: { entityId: Id }) {
  const { state, apply, toast } = useStore();
  const say = useSay();
  const [month, setMonth] = useState(() => { const d = new Date(state.today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); });
  const [date, setDate] = useState('');
  const rules = payrollRulesFor(state, entityId);
  const posted = state.payrollRuns.find((r) => r.entityId === entityId && r.month === month && r.status === 'posted');
  const sim = useMemo(() => { try { return posted ?? simulatePayroll(state, entityId, month); } catch { return null; } }, [state, entityId, month, posted]);
  const emp = (id: Id) => state.employees.find((e) => e.id === id);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const entry = posted?.journalEntryId ? state.entries.find((e) => e.id === posted.journalEntryId) : undefined;
  const exportXlsx = () => sim && downloadXlsx(`paie-${entity.code}-${month}.xlsx`, [{ name: `Paie ${month}`, rows: [['Matricule', 'Collaborateur', 'Brut', `${rules.labels.social} salarié`, `${rules.labels.health} salarié`, 'Base imposable', rules.labels.tax, 'Net', `${rules.labels.social} employeur`, `${rules.labels.health} employeur`], ...sim.lines.map((l) => [emp(l.employeeId)?.code ?? '', `${emp(l.employeeId)?.firstName ?? ''} ${emp(l.employeeId)?.lastName ?? ''}`, l.gross, l.cnssEmployee, l.cnamEmployee, l.taxable, l.its, l.net, l.cnssEmployer, l.cnamEmployer]), ['', 'Total', sim.totals.gross, sim.totals.cnssEmployee, sim.totals.cnamEmployee, '', sim.totals.its, sim.totals.net, sim.totals.cnssEmployer, sim.totals.cnamEmployer]] }], toast);
  const t = sim?.totals;
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label={say('Mois', 'Month')}><input className="in mono" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            {posted ? <Chip kind="good">{say('Comptabilisée le', 'Posted on')} {posted.date} · {say('écriture', 'journal entry')} {entryRef(state, entry)}</Chip> : <Chip kind="warn">{say('Simulation · non comptabilisée', 'Simulation · not posted')}</Chip>}
            <Chip kind={rules.regime === 'gta' ? 'warn' : 'dim'}>{rules.regime === 'gta' ? `${say('Régime GTA · exonéré', 'GTA regime · exempt from')} ${[effectiveExemptions(rules).social ? rules.labels.social : '', effectiveExemptions(rules).health ? rules.labels.health : '', effectiveExemptions(rules).tax ? rules.labels.tax : ''].filter(Boolean).join(', ')}` : say('Régime normal', 'Standard regime')}</Chip>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx} disabled={!sim}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          </div>
          <table>
            <thead><tr><th>{say('Collaborateur', 'Employee')}</th><th className="num">{say('Brut', 'Gross')}</th><th className="num">{rules.labels.social} {say('sal.', 'employee')}</th><th className="num">{rules.labels.health} {say('sal.', 'employee')}</th><th className="num">{say('Imposable', 'Taxable')}</th><th className="num">{rules.labels.tax}</th><th className="num">{say('Net à payer', 'Net pay')}</th><th className="num">{rules.labels.social} {say('empl.', 'employer')}</th><th className="num">{rules.labels.health} {say('empl.', 'employer')}</th><th className="num">{say('Coût', 'Cost')}</th></tr></thead>
            <tbody>{sim?.lines.map((l) => { const e = emp(l.employeeId); return <tr key={l.employeeId}><td>{e?.lastName.toUpperCase()} {e?.firstName}<div className="small muted">{e?.code} · {e?.jobTitle}</div></td><td className="num">{fmt(l.gross, 0)}</td><td className="num">{fmt(l.cnssEmployee, 0)}</td><td className="num">{fmt(l.cnamEmployee, 0)}</td><td className="num">{fmt(l.taxable, 0)}</td><td className="num">{fmt(l.its, 0)}</td><td className="num"><b>{fmt(l.net, 0)}</b></td><td className="num">{fmt(l.cnssEmployer, 0)}</td><td className="num">{fmt(l.cnamEmployer, 0)}</td><td className="num">{fmt(r2(l.gross + l.cnssEmployer + l.cnamEmployer), 0)}</td></tr>; })}</tbody>
            {t && <tfoot><tr><td>{say(`Total · ${sim?.lines.length} collaborateurs`, `Total · ${sim?.lines.length} employees`)}</td><td className="num">{fmt(t.gross, 0)}</td><td className="num">{fmt(t.cnssEmployee, 0)}</td><td className="num">{fmt(t.cnamEmployee, 0)}</td><td></td><td className="num">{fmt(t.its, 0)}</td><td className="num">{fmt(t.net, 0)}</td><td className="num">{fmt(t.cnssEmployer, 0)}</td><td className="num">{fmt(t.cnamEmployer, 0)}</td><td className="num">{fmt(t.employerCost, 0)}</td></tr></tfoot>}
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Montants dus', 'Amounts due')} · {month}</h2>
          {t && (
            <div className="kv">
              <span className="k">{say('Aux collaborateurs (nets)', 'To employees (net)')}</span><Money v={t.net} />
              <span className="k">{say(`À la ${rules.labels.social} (salarié + employeur)`, `To ${rules.labels.social} (employee + employer)`)}</span><Money v={r2(t.cnssEmployee + t.cnssEmployer)} />
              <span className="k">{say(`À la ${rules.labels.health}`, `To ${rules.labels.health}`)}</span><Money v={r2(t.cnamEmployee + t.cnamEmployer)} />
              <span className="k">{say(`Au Trésor (${rules.labels.tax} retenu)`, `To the Treasury (${rules.labels.tax} withheld)`)}</span><Money v={t.its} />
              <span className="k"><b>{say('Coût employeur', 'Employer cost')}</b></span><b><Money v={t.employerCost} /></b>
            </div>
          )}
          {!posted && (
            <>
              <Field label={say("Date de l'écriture (défaut : fin de mois)", 'Entry date (default: end of month)')} style={{ marginTop: 10 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!sim || !sim.lines.length} onClick={() => apply((s) => postPayroll(s, entityId, month, date || undefined), say(`Paie ${month} comptabilisée`, `Payroll ${month} posted`))}>{say('Comptabiliser la paie', 'Post payroll')} {month}</button>
            </>
          )}
          {entry && (
            <>
              <h2 style={{ marginTop: 12 }}>{say('Écriture', 'Journal entry')} {entryRef(state, entry)}</h2>
              <table><tbody>{entry.lines.map((l) => <tr key={l.lineNo}><td className="mono">{state.accounts.find((a) => a.id === l.accountId)?.code}</td><td className="small">{l.description}</td><td className="num">{l.debit ? fmt(l.debit, 0) : ''}</td><td className="num">{l.credit ? fmt(l.credit, 0) : ''}</td></tr>)}</tbody></table>
            </>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>{say(`Charges 64 D (brut, part employeur) · 42 nets à payer C · 43 organismes C · 44 ${rules.labels.tax} C. Les règlements se saisissent ensuite en trésorerie.`, `Expenses 64 D (gross, employer share) · 42 net pay C · 43 social bodies C · 44 ${rules.labels.tax} C. Payments are then entered in Treasury.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Statements({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const say = useSay();
  const year = state.today.slice(0, 4);
  const [from, setFrom] = useState(`${year}-01`);
  const [to, setTo] = useState(state.today.slice(0, 7));
  const st = useMemo(() => payrollStatement(state, entityId, from, to), [state, entityId, from, to]);
  const rules = payrollRulesFor(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const bal = (key: string) => { try { const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && !x.qualifier); const acc = m ? state.accounts.find((a) => a.id === m.accountId) : undefined; if (!acc) return null; return { acc, balance: r2(-accountBalance(state, entityId, acc.id)) }; } catch { return null; } };
  // [bumex-one] l stays French (the key and the Excel file); en is only the screen's English
  const due = [['Nets à payer', 'Net salaries to pay', 'NET_PAYABLE'], [`${rules.labels.social} à verser`, `${rules.labels.social} to pay`, 'SOCIAL_PAYABLE'], [`${rules.labels.health} à verser`, `${rules.labels.health} to pay`, 'HEALTH_PAYABLE'], [`${rules.labels.tax} à reverser`, `${rules.labels.tax} to remit`, 'TAX_WITHHELD_PAYABLE']].map(([l, en, k]) => ({ l, en, b: bal(k) }));
  const exportXlsx = () => downloadXlsx(`etats-paie-${entity.code}-${from}-${to}.xlsx`, [{ name: 'Par mois', rows: [['Mois', 'Brut', 'Net', rules.labels.social, rules.labels.health, rules.labels.tax, 'Statut'], ...st.byMonth.map((m) => [m.month, m.gross, m.net, m.social, m.health, m.tax, m.status])] }, { name: 'Soldes', rows: [['Poste', 'Compte', 'Solde dû'], ...due.map((d) => [d.l, d.b?.acc.code ?? '', d.b?.balance ?? 0])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label={say('Du', 'From')}><input className="in mono" type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={say('Au', 'To')}><input className="in mono" type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>{say('Exporter (Excel)', 'Export (Excel)')}</button>
          </div>
          <table>
            <thead><tr><th>{say('Mois', 'Month')}</th><th className="num">{say('Salaires bruts', 'Gross salaries')}</th><th className="num">{say('Nets versés', 'Net paid')}</th><th className="num">{rules.labels.social}</th><th className="num">{rules.labels.health}</th><th className="num">{rules.labels.tax}</th><th>{say('Statut', 'Status')}</th></tr></thead>
            <tbody>{st.byMonth.map((m) => <tr key={m.month}><td>{m.month}</td><td className="num">{fmt(m.gross, 0)}</td><td className="num">{fmt(m.net, 0)}</td><td className="num">{fmt(m.social, 0)}</td><td className="num">{fmt(m.health, 0)}</td><td className="num">{fmt(m.tax, 0)}</td><td><Chip kind="good">{say(m.status.charAt(0).toUpperCase() + m.status.slice(1), RUN_STATUS_EN[m.status] ?? m.status)}</Chip></td></tr>)}{st.byMonth.length === 0 && <tr><td colSpan={7} className="muted small">{say('Aucune paie comptabilisée sur la période', 'No posted payroll in this period')}</td></tr>}</tbody>
            <tfoot><tr><td>{say(`Total ${st.months.length} mois`, `Total ${st.months.length} month${st.months.length === 1 ? '' : 's'}`)}</td><td className="num">{fmt(st.gross, 0)}</td><td className="num">{fmt(st.net, 0)}</td><td className="num">{fmt(st.social, 0)}</td><td className="num">{fmt(st.health, 0)}</td><td className="num">{fmt(st.tax, 0)}</td><td className="small">{say('coût employeur', 'employer cost')} {fmt(st.employerCost, 0)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say('Restant dû (soldes des comptes)', 'Outstanding (account balances)')}</h2>
          <div className="kv">{due.map((d) => <span key={d.l} style={{ display: 'contents' }}><span className="k">{say(d.l, d.en)}{d.b ? <span className="mono muted"> · {d.b.acc.code}</span> : ''}</span><Money v={d.b?.balance ?? 0} /></span>)}</div>
          <div className="small muted" style={{ marginTop: 8 }}>{say(`Déclaration ${rules.labels.social} / ${rules.labels.health} : part salariale + part patronale du mois ; ${rules.labels.tax} : montant retenu. Les soldes ci-dessus baissent avec les règlements saisis en trésorerie.`, `${rules.labels.social} / ${rules.labels.health} return: employee share + employer share for the month; ${rules.labels.tax}: amount withheld. The balances above go down as payments are entered in Treasury.`)}</div>
        </div>
      </aside>
    </div>
  );
}

function Rules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const rules = payrollRulesFor(state, entityId);
  const [r, setR] = useState<PayrollRules>(rules);
  const [tracked, setTracked] = useState(entityId);
  if (tracked !== entityId) { setTracked(entityId); setR(rules); }
  const pct = (v: number) => String(r2(v * 100));
  const setPct = (k: keyof PayrollRules) => (e: React.ChangeEvent<HTMLInputElement>) => setR({ ...r, [k]: (parseAmount(e.target.value) ?? 0) / 100 });
  const acc = (key: string) => { const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && !x.qualifier); const a = m ? state.accounts.find((x) => x.id === m.accountId) : undefined; return a ? `${a.code} ${a.nameFr}` : say('— (clé ' + key + ' à paramétrer)', '— (key ' + key + ' to set up)'); };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <h2>{say('Régime de paie', 'Payroll regime')} · {state.entities.find((e) => e.id === entityId)?.name}</h2>
          <div className="grid3">
            <Field label={say('Régime applicable à la société', 'Regime applicable to the company')}><Select className="in" value={r.regime ?? 'normal'} onChange={(e) => { const regime = e.target.value as PayrollRegime; setR({ ...r, regime, socialExempt: regime === 'gta', healthExempt: regime === 'gta', taxExempt: regime === 'gta' }); }}><option value="normal">{say('Régime normal · impôts et cotisations', 'Standard regime · taxes and contributions')}</option><option value="gta">{say('Régime GTA · exonérations', 'GTA regime · exemptions')}</option></Select></Field>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
              <label className="small"><input type="checkbox" checked={!!(r.socialExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, socialExempt: e.target.checked })} /> {say(`Exonération ${r.labels.social} (aucune cotisation salarié ni employeur)`, `${r.labels.social} exemption (no employee or employer contributions)`)}</label>
              <label className="small"><input type="checkbox" checked={!!(r.healthExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, healthExempt: e.target.checked })} /> {say(`Exonération ${r.labels.health}`, `${r.labels.health} exemption`)}</label>
              <label className="small"><input type="checkbox" checked={!!(r.taxExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, taxExempt: e.target.checked })} /> {say(`Exonération ${r.labels.tax} (aucune retenue sur salaires)`, `${r.labels.tax} exemption (nothing withheld from salaries)`)}</label>
            </div>
          </div>
          <div className={`banner ${(r.regime ?? 'normal') === 'gta' ? 'warn' : 'info'}`} style={{ marginTop: 8 }}>{(r.regime ?? 'normal') === 'gta' ? say('Régime GTA : les prélèvements cochés exonérés ne sont ni calculés ni comptabilisés ; les taux ci-dessous ne servent qu\'aux prélèvements restants.', 'GTA regime: the levies ticked as exempt are neither calculated nor posted; the rates below apply only to the remaining levies.') : say('Régime normal : impôt sur les salaires, cotisations sociales et assurance maladie selon les taux et le barème ci-dessous.', 'Standard regime: payroll tax, social contributions and health insurance at the rates and brackets below.')} {say('Chaque société garde son propre paramétrage.', 'Each company keeps its own settings.')}</div>
          <h2 style={{ marginTop: 14 }}>{say('Taux et barème', 'Rates and brackets')}</h2>
          <div className="grid3">
            <Field label={say('Libellé organisme social', 'Social security label')}><input className="in" value={r.labels.social} onChange={(e) => setR({ ...r, labels: { ...r.labels, social: e.target.value } })} /></Field>
            <Field label={say('Libellé assurance maladie', 'Health insurance label')}><input className="in" value={r.labels.health} onChange={(e) => setR({ ...r, labels: { ...r.labels, health: e.target.value } })} /></Field>
            <Field label={say('Libellé impôt sur salaires', 'Payroll tax label')}><input className="in" value={r.labels.tax} onChange={(e) => setR({ ...r, labels: { ...r.labels, tax: e.target.value } })} /></Field>
            <Field label={say(`${r.labels.social} salarié (%)`, `${r.labels.social} employee (%)`)}><input className="in num" value={pct(r.cnssEmployeeRate)} onChange={setPct('cnssEmployeeRate')} /></Field>
            <Field label={say(`${r.labels.social} employeur (%)`, `${r.labels.social} employer (%)`)}><input className="in num" value={pct(r.cnssEmployerRate)} onChange={setPct('cnssEmployerRate')} /></Field>
            <Field label={say(`Plafond mensuel ${r.labels.social} (0 = aucun)`, `Monthly ${r.labels.social} ceiling (0 = none)`)}><input className="in num" value={String(r.cnssCeiling)} onChange={(e) => setR({ ...r, cnssCeiling: parseAmount(e.target.value) ?? 0 })} /></Field>
            <Field label={say(`${r.labels.health} salarié (%)`, `${r.labels.health} employee (%)`)}><input className="in num" value={pct(r.cnamEmployeeRate)} onChange={setPct('cnamEmployeeRate')} /></Field>
            <Field label={say(`${r.labels.health} employeur (%)`, `${r.labels.health} employer (%)`)}><input className="in num" value={pct(r.cnamEmployerRate)} onChange={setPct('cnamEmployerRate')} /></Field>
            <Field label={say(`Abattement mensuel ${r.labels.tax}`, `Monthly ${r.labels.tax} deduction`)}><input className="in num" value={String(r.itsAbatement)} onChange={(e) => setR({ ...r, itsAbatement: parseAmount(e.target.value) ?? 0 })} /></Field>
          </div>
          <h2 style={{ marginTop: 14 }}>{say('Barème progressif mensuel', 'Monthly progressive brackets')} · {r.labels.tax}</h2>
          <table>
            <thead><tr><th>{say('Tranche', 'Bracket')}</th><th className="num">{say("Jusqu'à (vide = au-delà)", 'Up to (empty = above)')}</th><th className="num">{say('Taux (%)', 'Rate (%)')}</th><th></th></tr></thead>
            <tbody>{r.itsBrackets.map((b, i) => <tr key={i}><td>{i + 1}</td><td><input className="in num" value={b.upTo === null ? '' : String(b.upTo)} onChange={(e) => setR({ ...r, itsBrackets: r.itsBrackets.map((x, k) => (k === i ? { ...x, upTo: e.target.value.trim() ? parseAmount(e.target.value) ?? 0 : null } : x)) })} /></td><td><input className="in num" value={String(r2(b.rate * 100))} onChange={(e) => setR({ ...r, itsBrackets: r.itsBrackets.map((x, k) => (k === i ? { ...x, rate: (parseAmount(e.target.value) ?? 0) / 100 } : x)) })} /></td><td><button className="btn sm" onClick={() => setR({ ...r, itsBrackets: r.itsBrackets.filter((_, k) => k !== i) })} disabled={r.itsBrackets.length <= 1}>×</button></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}><button className="btn sm" onClick={() => setR({ ...r, itsBrackets: [...r.itsBrackets.slice(0, -1), { upTo: (r.itsBrackets[r.itsBrackets.length - 2]?.upTo ?? 0) + 100000, rate: r.itsBrackets[r.itsBrackets.length - 1].rate }, r.itsBrackets[r.itsBrackets.length - 1]] })}>{say('+ tranche', '+ bracket')}</button></td></tr></tfoot>
          </table>
          <div className="actions" style={{ marginTop: 10 }}><button className="btn" onClick={() => setR(rules)}>{say('Annuler', 'Cancel')}</button><button className="btn primary" onClick={() => apply((s) => setPayrollRules(s, { ...r, entityId }), say('Règles de paie enregistrées', 'Payroll rules saved'))}>{say('Enregistrer les règles', 'Save rules')}</button></div>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>{say("Comptes utilisés par l'écriture de paie", 'Accounts used by the payroll entry')}</h2>
          <div className="kv small">
            <span className="k">{say('Salaires bruts', 'Gross salaries')}</span><span className="mono">{acc('SALARY_EXPENSE')}</span>
            <span className="k">{say('Indemnités', 'Allowances')}</span><span className="mono">{acc('ALLOWANCE_EXPENSE')}</span>
            <span className="k">{r.labels.social} {say('employeur', 'employer')}</span><span className="mono">{acc('SOCIAL_EXPENSE')}</span>
            <span className="k">{r.labels.health} {say('employeur', 'employer')}</span><span className="mono">{acc('HEALTH_EXPENSE')}</span>
            <span className="k">{say('Nets à payer', 'Net salaries to pay')}</span><span className="mono">{acc('NET_PAYABLE')}</span>
            <span className="k">{r.labels.social} {say('à verser', 'to pay')}</span><span className="mono">{acc('SOCIAL_PAYABLE')}</span>
            <span className="k">{r.labels.health} {say('à verser', 'to pay')}</span><span className="mono">{acc('HEALTH_PAYABLE')}</span>
            <span className="k">{r.labels.tax} {say('retenu', 'withheld')}</span><span className="mono">{acc('TAX_WITHHELD_PAYABLE')}</span>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{say("Les comptes se changent dans Comptabilité › Plan comptable (clés de paramétrage). Les taux s'appliquent aux bulletins futurs ; une paie déjà comptabilisée n'est jamais recalculée.", 'Accounts are changed in Accounting › Chart of accounts (setup keys). Rates apply to future payslips; a payroll already posted is never recalculated.')}</div>
        </div>
      </aside>
    </div>
  );
}
