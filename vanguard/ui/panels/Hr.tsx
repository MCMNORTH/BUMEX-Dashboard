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

type Tab = 'people' | 'employees' | 'sheet' | 'headcount' | 'payroll' | 'statements' | 'rules'; // [bumex-one] people
const CATS = Object.keys(CATEGORY_FR) as EmployeeCategory[];
const CONTRACTS = ['CDI', 'CDD', 'Stage', 'Prestataire', 'Associé'];

export function HrPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t } = useStore();
  // [bumex-one] the room opens to everyone on its "Personnes" tab (lib/erp/vanguard/domain.ts, canOpenRoom); the HR
  // module's tabs stay with the people who have it
  const say = useSay();
  const hrModule = canUseModule(state, 'hr');
  const [tab, setTab] = useState<Tab>(hrModule ? (initialTab as Tab) || 'employees' : 'people');
  useEffect(() => { if (initialTab && (hrModule || initialTab === 'people')) setTab(initialTab as Tab); }, [initialTab, hrModule]);
  const [employeeId, setEmployeeId] = useState<Id | null>(null);
  const hc = headcount(state, entityId);
  const lastMonth = useMemo(() => { const d = new Date(state.today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); }, [state.today]);
  const unposted = !state.payrollRuns.some((r) => r.entityId === entityId && r.month === lastMonth && r.status === 'posted') && hc.active > 0;
  const people = { id: 'people' as Tab, label: say('Personnes', 'People') }; // [bumex-one]
  const tabs = !hrModule ? [people] : [
    people,
    { id: 'employees' as Tab, label: `Collaborateurs · ${hc.active}` },
    { id: 'sheet' as Tab, label: employeeId ? `Fiche · ${state.employees.find((e) => e.id === employeeId)?.initials ?? ''}` : 'Nouvelle fiche' },
    { id: 'headcount' as Tab, label: 'Effectifs' },
    { id: 'payroll' as Tab, label: <>Paie {unposted ? <Chip kind="warn">{lastMonth}</Chip> : null}</> },
    { id: 'statements' as Tab, label: 'États · déclarations' },
    { id: 'rules' as Tab, label: 'Règles de paie' },
  ];
  const open = (id: Id | null) => { setEmployeeId(id); setTab('sheet'); };
  return (
    <>
      <div className="sheet-head"><h1>{t('room_hr')}</h1><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="sheet-body">
        {tab === 'people' && <People entityId={entityId} onOpen={open} />}
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
        <input className="in" style={{ maxWidth: 280 }} placeholder="Rechercher un collaborateur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="small"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> inclure les sorties</label>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn sm" onClick={exportXlsx}>Exporter (Excel)</button>
        <button className="btn sm primary" onClick={() => onOpen(null)}>Nouveau collaborateur</button>
      </div>
      <table>
        <thead><tr><th>Matricule</th><th>Collaborateur</th><th>Fonction</th><th>Service</th><th>Catégorie</th><th>Contrat</th><th>Entrée</th><th className="num">Brut mensuel</th><th className="num">Net estimé</th><th>Planning</th><th>Compte</th><th></th></tr></thead>
        <tbody>
          {rows.map((e) => {
            const line = computePayLine(e, rules);
            const plan = cal.rows.find((r) => r.employee.id === e.id);
            const user = state.users.find((u) => u.employeeId === e.id);
            return (
              <tr key={e.id} onClick={() => onOpen(e.id)} style={{ cursor: 'pointer' }}>
                <td className="mono">{e.code}</td><td><b>{e.lastName.toUpperCase()}</b> {e.firstName}<div className="small muted">{e.initials}{e.email ? ` · ${e.email}` : ''}</div></td><td>{e.jobTitle}</td><td>{e.department}</td><td>{CATEGORY_FR[e.category]}</td><td>{e.contractType}</td><td><D iso={e.hireDate} />{e.status === 'left' && <Chip kind="dim"> sorti</Chip>}</td>
                <td className="num">{fmt(r2(e.grossSalary + e.allowances), 0)}</td><td className="num">{fmt(line.net, 0)}</td>
                <td>{plan ? <Chip kind={plan.status === 'free' ? 'good' : plan.status === 'overloaded' ? 'crit' : 'dim'}>{plan.status === 'free' ? 'disponible' : plan.status === 'overloaded' ? `${Math.round(plan.loadNow * 100)} % · surcharge` : `${Math.round(plan.loadNow * 100)} % affecté`}</Chip> : '—'}</td>
                <td className="small">{user ? `${t(user.role)}` : <span className="muted">aucun</span>}</td>
                <td onClick={(ev) => ev.stopPropagation()}><DeleteButton table="employee" rowId={e.id} label={`Collaborateur ${e.firstName} ${e.lastName}`} entityId={entityId} /></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={12} className="muted small">Aucun collaborateur</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Sheet({ entityId, employeeId, onSaved }: { entityId: Id; employeeId: Id | null; onSaved: (id: Id) => void }) {
  const { state, apply } = useStore();
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
    }, e ? 'Fiche mise à jour' : 'Collaborateur créé');
  };
  return (
    <div className="cols">
      <form className="grow" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>{e ? `${e.code} · ${e.firstName} ${e.lastName}` : 'Nouveau collaborateur'}</h2>
          <div className="grid3">
            <Field label="Prénom"><input className="in" value={firstName} onChange={(ev) => setFirst(ev.target.value)} /></Field>
            <Field label="Nom"><input className="in" value={lastName} onChange={(ev) => setLast(ev.target.value)} /></Field>
            <Field label="Fonction"><input className="in" value={jobTitle} onChange={(ev) => setJob(ev.target.value)} placeholder="Auditeur senior" /></Field>
            <Field label="Service · département"><input className="in" list="hr-departments" value={department} onChange={(ev) => setDep(ev.target.value)} /><datalist id="hr-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist></Field>
            <Field label="Catégorie"><select className="in" value={category} onChange={(ev) => setCat(ev.target.value as EmployeeCategory)}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_FR[c]}</option>)}</select></Field>
            <Field label="Contrat"><select className="in" value={contractType} onChange={(ev) => setContract(ev.target.value)}>{CONTRACTS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Date d'entrée"><input className="in mono" type="date" value={hireDate} onChange={(ev) => setHire(ev.target.value)} /></Field>
            {e && <Field label="Date de sortie"><input className="in mono" type="date" value={endDate} onChange={(ev) => setEnd(ev.target.value)} /></Field>}
            {e && <Field label="Statut"><select className="in" value={status} onChange={(ev) => setStatus(ev.target.value as Employee['status'])}><option value="active">Actif</option><option value="left">Sorti des effectifs</option></select></Field>}
            <Field label="E-mail"><input className="in" value={email} onChange={(ev) => setEmail(ev.target.value)} /></Field>
            <Field label="Téléphone"><input className="in" value={phone} onChange={(ev) => setPhone(ev.target.value)} /></Field>
            <Field label="Salaire brut mensuel"><input className="in num" value={gross} onChange={(ev) => setGross(ev.target.value)} /></Field>
            <Field label="Indemnités et primes mensuelles"><input className="in num" value={allow} onChange={(ev) => setAllow(ev.target.value)} /></Field>
          </div>
          <div className="actions"><button type="submit" className="btn primary" disabled={!firstName.trim() || !lastName.trim()}>{e ? 'Enregistrer' : 'Créer la fiche'}</button></div>
        </div>
        {e && (
          <div className="grid2">
            <div className="card flush">
              <table><thead><tr><th>Affectations</th><th>Période</th><th className="num">Charge</th></tr></thead><tbody>{assignments.map((a) => { const eng = state.engagements.find((x) => x.id === a.engagementId); return <tr key={a.id}><td>{eng?.code} · {eng?.name}</td><td><D iso={a.start} /> → <D iso={a.end} /></td><td className="num">{Math.round(a.load * 100)} %</td></tr>; })}{assignments.length === 0 && <tr><td colSpan={3} className="muted small">Aucune affectation · voir Missions › Planning</td></tr>}</tbody></table>
            </div>
            <div className="card flush">
              <table><thead><tr><th>Bulletins comptabilisés</th><th className="num">Brut</th><th className="num">Retenues</th><th className="num">Net</th></tr></thead><tbody>{runs.map((r) => { const l = r.lines.find((x) => x.employeeId === e.id)!; return <tr key={r.id}><td>{r.month}</td><td className="num">{fmt(l.gross, 0)}</td><td className="num">{fmt(r2(l.cnssEmployee + l.cnamEmployee + l.its), 0)}</td><td className="num">{fmt(l.net, 0)}</td></tr>; })}{runs.length === 0 && <tr><td colSpan={4} className="muted small">Aucune paie comptabilisée</td></tr>}</tbody></table>
            </div>
          </div>
        )}
      </form>
      <aside className="side">
        <div className="card">
          <h2>Bulletin estimé · règles {rules.labels.social} / {rules.labels.health} / {rules.labels.tax}</h2>
          <div className="kv">
            <span className="k">Brut (salaire + indemnités)</span><Money v={preview.gross} />
            <span className="k">{rules.labels.social} salarié ({(rules.cnssEmployeeRate * 100).toFixed(2)} %)</span><Money v={-preview.cnssEmployee} />
            <span className="k">{rules.labels.health} salarié ({(rules.cnamEmployeeRate * 100).toFixed(2)} %)</span><Money v={-preview.cnamEmployee} />
            <span className="k">Base imposable</span><Money v={preview.taxable} />
            <span className="k">{rules.labels.tax} (barème)</span><Money v={-preview.its} />
            <span className="k"><b>Net à payer</b></span><b><Money v={preview.net} /></b>
            <span className="k">{rules.labels.social} employeur</span><Money v={preview.cnssEmployer} />
            <span className="k">{rules.labels.health} employeur</span><Money v={preview.cnamEmployer} />
            <span className="k">Coût employeur</span><Money v={r2(preview.gross + preview.cnssEmployer + preview.cnamEmployer)} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function HeadcountView({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const hc = headcount(state, entityId);
  const rules = payrollRulesFor(state, entityId);
  const active = state.employees.filter((e) => e.entityId === entityId && e.status === 'active');
  const byContract = [...new Set(active.map((e) => e.contractType))].map((c) => ({ c, n: active.filter((e) => e.contractType === c).length }));
  const yearIn = active.filter((e) => e.hireDate.slice(0, 4) === state.today.slice(0, 4)).length;
  const yearOut = state.employees.filter((e) => e.entityId === entityId && e.status === 'left' && e.endDate?.slice(0, 4) === state.today.slice(0, 4)).length;
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">Effectif actif</div><div className="v">{hc.active}</div><div className="l">{hc.total - hc.active} sorti(s) · {yearIn} entrée(s) et {yearOut} sortie(s) cette année</div></div>
        <div className="kpi"><div className="l">Masse salariale brute mensuelle</div><div className="v">{fmt(hc.monthlyGross, 0)}</div></div>
        <div className="kpi"><div className="l">Coût employeur mensuel</div><div className="v">{fmt(hc.monthlyEmployerCost, 0)}</div><div className="l">{rules.labels.social} + {rules.labels.health} employeur inclus</div></div>
        <div className="kpi"><div className="l">Coût annuel projeté</div><div className="v">{fmt(r2(hc.monthlyEmployerCost * 12), 0)}</div></div>
      </div>
      <div className="grid3">
        <div className="card flush"><table><thead><tr><th>Par service</th><th className="num">Effectif</th><th className="num">Brut mensuel</th></tr></thead><tbody>{hc.byDepartment.map((d) => <tr key={d.name}><td>{d.name}</td><td className="num">{d.count}</td><td className="num">{fmt(d.payroll, 0)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td className="num">{hc.active}</td><td className="num">{fmt(hc.monthlyGross, 0)}</td></tr></tfoot></table></div>
        <div className="card flush"><table><thead><tr><th>Par catégorie</th><th className="num">Effectif</th><th className="num">Part</th></tr></thead><tbody>{hc.byCategory.map((c) => <tr key={c.category}><td>{CATEGORY_FR[c.category]}</td><td className="num">{c.count}</td><td className="num">{Math.round((c.count / Math.max(1, hc.active)) * 100)} %</td></tr>)}</tbody></table></div>
        <div className="card flush"><table><thead><tr><th>Par contrat</th><th className="num">Effectif</th></tr></thead><tbody>{byContract.map((c) => <tr key={c.c}><td>{c.c}</td><td className="num">{c.n}</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}

function Payroll({ entityId }: { entityId: Id }) {
  const { state, apply, toast } = useStore();
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
            <Field label="Mois"><input className="in mono" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            {posted ? <Chip kind="good">Comptabilisée le {posted.date} · écriture {entryRef(state, entry)}</Chip> : <Chip kind="warn">Simulation · non comptabilisée</Chip>}
            <Chip kind={rules.regime === 'gta' ? 'warn' : 'dim'}>{rules.regime === 'gta' ? `Régime GTA · exonéré ${[effectiveExemptions(rules).social ? rules.labels.social : '', effectiveExemptions(rules).health ? rules.labels.health : '', effectiveExemptions(rules).tax ? rules.labels.tax : ''].filter(Boolean).join(', ')}` : 'Régime normal'}</Chip>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx} disabled={!sim}>Exporter (Excel)</button>
          </div>
          <table>
            <thead><tr><th>Collaborateur</th><th className="num">Brut</th><th className="num">{rules.labels.social} sal.</th><th className="num">{rules.labels.health} sal.</th><th className="num">Imposable</th><th className="num">{rules.labels.tax}</th><th className="num">Net à payer</th><th className="num">{rules.labels.social} empl.</th><th className="num">{rules.labels.health} empl.</th><th className="num">Coût</th></tr></thead>
            <tbody>{sim?.lines.map((l) => { const e = emp(l.employeeId); return <tr key={l.employeeId}><td>{e?.lastName.toUpperCase()} {e?.firstName}<div className="small muted">{e?.code} · {e?.jobTitle}</div></td><td className="num">{fmt(l.gross, 0)}</td><td className="num">{fmt(l.cnssEmployee, 0)}</td><td className="num">{fmt(l.cnamEmployee, 0)}</td><td className="num">{fmt(l.taxable, 0)}</td><td className="num">{fmt(l.its, 0)}</td><td className="num"><b>{fmt(l.net, 0)}</b></td><td className="num">{fmt(l.cnssEmployer, 0)}</td><td className="num">{fmt(l.cnamEmployer, 0)}</td><td className="num">{fmt(r2(l.gross + l.cnssEmployer + l.cnamEmployer), 0)}</td></tr>; })}</tbody>
            {t && <tfoot><tr><td>Total · {sim?.lines.length} collaborateurs</td><td className="num">{fmt(t.gross, 0)}</td><td className="num">{fmt(t.cnssEmployee, 0)}</td><td className="num">{fmt(t.cnamEmployee, 0)}</td><td></td><td className="num">{fmt(t.its, 0)}</td><td className="num">{fmt(t.net, 0)}</td><td className="num">{fmt(t.cnssEmployer, 0)}</td><td className="num">{fmt(t.cnamEmployer, 0)}</td><td className="num">{fmt(t.employerCost, 0)}</td></tr></tfoot>}
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Montants dus · {month}</h2>
          {t && (
            <div className="kv">
              <span className="k">Aux collaborateurs (nets)</span><Money v={t.net} />
              <span className="k">À la {rules.labels.social} (salarié + employeur)</span><Money v={r2(t.cnssEmployee + t.cnssEmployer)} />
              <span className="k">À la {rules.labels.health}</span><Money v={r2(t.cnamEmployee + t.cnamEmployer)} />
              <span className="k">Au Trésor ({rules.labels.tax} retenu)</span><Money v={t.its} />
              <span className="k"><b>Coût employeur</b></span><b><Money v={t.employerCost} /></b>
            </div>
          )}
          {!posted && (
            <>
              <Field label="Date de l'écriture (défaut : fin de mois)" style={{ marginTop: 10 }}><input className="in mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!sim || !sim.lines.length} onClick={() => apply((s) => postPayroll(s, entityId, month, date || undefined), `Paie ${month} comptabilisée`)}>Comptabiliser la paie {month}</button>
            </>
          )}
          {entry && (
            <>
              <h2 style={{ marginTop: 12 }}>Écriture {entryRef(state, entry)}</h2>
              <table><tbody>{entry.lines.map((l) => <tr key={l.lineNo}><td className="mono">{state.accounts.find((a) => a.id === l.accountId)?.code}</td><td className="small">{l.description}</td><td className="num">{l.debit ? fmt(l.debit, 0) : ''}</td><td className="num">{l.credit ? fmt(l.credit, 0) : ''}</td></tr>)}</tbody></table>
            </>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>Charges 64 D (brut, part employeur) · 42 nets à payer C · 43 organismes C · 44 {rules.labels.tax} C. Les règlements se saisissent ensuite en trésorerie.</div>
        </div>
      </aside>
    </div>
  );
}

function Statements({ entityId }: { entityId: Id }) {
  const { state, toast } = useStore();
  const year = state.today.slice(0, 4);
  const [from, setFrom] = useState(`${year}-01`);
  const [to, setTo] = useState(state.today.slice(0, 7));
  const st = useMemo(() => payrollStatement(state, entityId, from, to), [state, entityId, from, to]);
  const rules = payrollRulesFor(state, entityId);
  const entity = state.entities.find((e) => e.id === entityId)!;
  const bal = (key: string) => { try { const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && !x.qualifier); const acc = m ? state.accounts.find((a) => a.id === m.accountId) : undefined; if (!acc) return null; return { acc, balance: r2(-accountBalance(state, entityId, acc.id)) }; } catch { return null; } };
  const due = [['Nets à payer', 'NET_PAYABLE'], [`${rules.labels.social} à verser`, 'SOCIAL_PAYABLE'], [`${rules.labels.health} à verser`, 'HEALTH_PAYABLE'], [`${rules.labels.tax} à reverser`, 'TAX_WITHHELD_PAYABLE']].map(([l, k]) => ({ l, b: bal(k) }));
  const exportXlsx = () => downloadXlsx(`etats-paie-${entity.code}-${from}-${to}.xlsx`, [{ name: 'Par mois', rows: [['Mois', 'Brut', 'Net', rules.labels.social, rules.labels.health, rules.labels.tax, 'Statut'], ...st.byMonth.map((m) => [m.month, m.gross, m.net, m.social, m.health, m.tax, m.status])] }, { name: 'Soldes', rows: [['Poste', 'Compte', 'Solde dû'], ...due.map((d) => [d.l, d.b?.acc.code ?? '', d.b?.balance ?? 0])] }], toast);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label="Du"><input className="in mono" type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Au"><input className="in mono" type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Exporter (Excel)</button>
          </div>
          <table>
            <thead><tr><th>Mois</th><th className="num">Salaires bruts</th><th className="num">Nets versés</th><th className="num">{rules.labels.social}</th><th className="num">{rules.labels.health}</th><th className="num">{rules.labels.tax}</th><th>Statut</th></tr></thead>
            <tbody>{st.byMonth.map((m) => <tr key={m.month}><td>{m.month}</td><td className="num">{fmt(m.gross, 0)}</td><td className="num">{fmt(m.net, 0)}</td><td className="num">{fmt(m.social, 0)}</td><td className="num">{fmt(m.health, 0)}</td><td className="num">{fmt(m.tax, 0)}</td><td><Chip kind="good">{m.status}</Chip></td></tr>)}{st.byMonth.length === 0 && <tr><td colSpan={7} className="muted small">Aucune paie comptabilisée sur la période</td></tr>}</tbody>
            <tfoot><tr><td>Total {st.months.length} mois</td><td className="num">{fmt(st.gross, 0)}</td><td className="num">{fmt(st.net, 0)}</td><td className="num">{fmt(st.social, 0)}</td><td className="num">{fmt(st.health, 0)}</td><td className="num">{fmt(st.tax, 0)}</td><td className="small">coût employeur {fmt(st.employerCost, 0)}</td></tr></tfoot>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Restant dû (soldes des comptes)</h2>
          <div className="kv">{due.map((d) => <span key={d.l} style={{ display: 'contents' }}><span className="k">{d.l}{d.b ? <span className="mono muted"> · {d.b.acc.code}</span> : ''}</span><Money v={d.b?.balance ?? 0} /></span>)}</div>
          <div className="small muted" style={{ marginTop: 8 }}>Déclaration {rules.labels.social} / {rules.labels.health} : part salariale + part patronale du mois ; {rules.labels.tax} : montant retenu. Les soldes ci-dessus baissent avec les règlements saisis en trésorerie.</div>
        </div>
      </aside>
    </div>
  );
}

function Rules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const rules = payrollRulesFor(state, entityId);
  const [r, setR] = useState<PayrollRules>(rules);
  const [tracked, setTracked] = useState(entityId);
  if (tracked !== entityId) { setTracked(entityId); setR(rules); }
  const pct = (v: number) => String(r2(v * 100));
  const setPct = (k: keyof PayrollRules) => (e: React.ChangeEvent<HTMLInputElement>) => setR({ ...r, [k]: (parseAmount(e.target.value) ?? 0) / 100 });
  const acc = (key: string) => { const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && !x.qualifier); const a = m ? state.accounts.find((x) => x.id === m.accountId) : undefined; return a ? `${a.code} ${a.nameFr}` : '— (clé ' + key + ' à paramétrer)'; };
  return (
    <div className="cols">
      <div className="grow">
        <div className="card">
          <h2>Régime de paie · {state.entities.find((e) => e.id === entityId)?.name}</h2>
          <div className="grid3">
            <Field label="Régime applicable à la société"><select className="in" value={r.regime ?? 'normal'} onChange={(e) => { const regime = e.target.value as PayrollRegime; setR({ ...r, regime, socialExempt: regime === 'gta', healthExempt: regime === 'gta', taxExempt: regime === 'gta' }); }}><option value="normal">Régime normal · impôts et cotisations</option><option value="gta">Régime GTA · exonérations</option></select></Field>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
              <label className="small"><input type="checkbox" checked={!!(r.socialExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, socialExempt: e.target.checked })} /> Exonération {r.labels.social} (aucune cotisation salarié ni employeur)</label>
              <label className="small"><input type="checkbox" checked={!!(r.healthExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, healthExempt: e.target.checked })} /> Exonération {r.labels.health}</label>
              <label className="small"><input type="checkbox" checked={!!(r.taxExempt ?? r.regime === 'gta')} onChange={(e) => setR({ ...r, taxExempt: e.target.checked })} /> Exonération {r.labels.tax} (aucune retenue sur salaires)</label>
            </div>
          </div>
          <div className={`banner ${(r.regime ?? 'normal') === 'gta' ? 'warn' : 'info'}`} style={{ marginTop: 8 }}>{(r.regime ?? 'normal') === 'gta' ? 'Régime GTA : les prélèvements cochés exonérés ne sont ni calculés ni comptabilisés ; les taux ci-dessous ne servent qu\'aux prélèvements restants.' : 'Régime normal : impôt sur les salaires, cotisations sociales et assurance maladie selon les taux et le barème ci-dessous.'} Chaque société garde son propre paramétrage.</div>
          <h2 style={{ marginTop: 14 }}>Taux et barème</h2>
          <div className="grid3">
            <Field label="Libellé organisme social"><input className="in" value={r.labels.social} onChange={(e) => setR({ ...r, labels: { ...r.labels, social: e.target.value } })} /></Field>
            <Field label="Libellé assurance maladie"><input className="in" value={r.labels.health} onChange={(e) => setR({ ...r, labels: { ...r.labels, health: e.target.value } })} /></Field>
            <Field label="Libellé impôt sur salaires"><input className="in" value={r.labels.tax} onChange={(e) => setR({ ...r, labels: { ...r.labels, tax: e.target.value } })} /></Field>
            <Field label={`${r.labels.social} salarié (%)`}><input className="in num" value={pct(r.cnssEmployeeRate)} onChange={setPct('cnssEmployeeRate')} /></Field>
            <Field label={`${r.labels.social} employeur (%)`}><input className="in num" value={pct(r.cnssEmployerRate)} onChange={setPct('cnssEmployerRate')} /></Field>
            <Field label={`Plafond mensuel ${r.labels.social} (0 = aucun)`}><input className="in num" value={String(r.cnssCeiling)} onChange={(e) => setR({ ...r, cnssCeiling: parseAmount(e.target.value) ?? 0 })} /></Field>
            <Field label={`${r.labels.health} salarié (%)`}><input className="in num" value={pct(r.cnamEmployeeRate)} onChange={setPct('cnamEmployeeRate')} /></Field>
            <Field label={`${r.labels.health} employeur (%)`}><input className="in num" value={pct(r.cnamEmployerRate)} onChange={setPct('cnamEmployerRate')} /></Field>
            <Field label={`Abattement mensuel ${r.labels.tax}`}><input className="in num" value={String(r.itsAbatement)} onChange={(e) => setR({ ...r, itsAbatement: parseAmount(e.target.value) ?? 0 })} /></Field>
          </div>
          <h2 style={{ marginTop: 14 }}>Barème progressif mensuel · {r.labels.tax}</h2>
          <table>
            <thead><tr><th>Tranche</th><th className="num">Jusqu'à (vide = au-delà)</th><th className="num">Taux (%)</th><th></th></tr></thead>
            <tbody>{r.itsBrackets.map((b, i) => <tr key={i}><td>{i + 1}</td><td><input className="in num" value={b.upTo === null ? '' : String(b.upTo)} onChange={(e) => setR({ ...r, itsBrackets: r.itsBrackets.map((x, k) => (k === i ? { ...x, upTo: e.target.value.trim() ? parseAmount(e.target.value) ?? 0 : null } : x)) })} /></td><td><input className="in num" value={String(r2(b.rate * 100))} onChange={(e) => setR({ ...r, itsBrackets: r.itsBrackets.map((x, k) => (k === i ? { ...x, rate: (parseAmount(e.target.value) ?? 0) / 100 } : x)) })} /></td><td><button className="btn sm" onClick={() => setR({ ...r, itsBrackets: r.itsBrackets.filter((_, k) => k !== i) })} disabled={r.itsBrackets.length <= 1}>×</button></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}><button className="btn sm" onClick={() => setR({ ...r, itsBrackets: [...r.itsBrackets.slice(0, -1), { upTo: (r.itsBrackets[r.itsBrackets.length - 2]?.upTo ?? 0) + 100000, rate: r.itsBrackets[r.itsBrackets.length - 1].rate }, r.itsBrackets[r.itsBrackets.length - 1]] })}>+ tranche</button></td></tr></tfoot>
          </table>
          <div className="actions" style={{ marginTop: 10 }}><button className="btn" onClick={() => setR(rules)}>Annuler</button><button className="btn primary" onClick={() => apply((s) => setPayrollRules(s, { ...r, entityId }), 'Règles de paie enregistrées')}>Enregistrer les règles</button></div>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Comptes utilisés par l'écriture de paie</h2>
          <div className="kv small">
            <span className="k">Salaires bruts</span><span className="mono">{acc('SALARY_EXPENSE')}</span>
            <span className="k">Indemnités</span><span className="mono">{acc('ALLOWANCE_EXPENSE')}</span>
            <span className="k">{r.labels.social} employeur</span><span className="mono">{acc('SOCIAL_EXPENSE')}</span>
            <span className="k">{r.labels.health} employeur</span><span className="mono">{acc('HEALTH_EXPENSE')}</span>
            <span className="k">Nets à payer</span><span className="mono">{acc('NET_PAYABLE')}</span>
            <span className="k">{r.labels.social} à verser</span><span className="mono">{acc('SOCIAL_PAYABLE')}</span>
            <span className="k">{r.labels.health} à verser</span><span className="mono">{acc('HEALTH_PAYABLE')}</span>
            <span className="k">{r.labels.tax} retenu</span><span className="mono">{acc('TAX_WITHHELD_PAYABLE')}</span>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Les comptes se changent dans Comptabilité › Plan comptable (clés de paramétrage). Les taux s'appliquent aux bulletins futurs ; une paie déjà comptabilisée n'est jamais recalculée.</div>
        </div>
      </aside>
    </div>
  );
}
