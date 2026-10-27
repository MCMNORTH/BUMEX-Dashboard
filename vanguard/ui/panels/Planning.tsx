import { useMemo, useState } from 'react';
import { planningCalendar, availability, assign, updateAssignment, removeAssignment, addDays, fmt, type Id, type Assignment } from '@bumex/domain';
import { useStore } from '../../store';
import { Field, Chip, D, downloadXlsx } from '../common';
import { Select } from '../Select';

// Napta-like planning: a week grid per person, one bar per assignment, conflicts in red; assignment form on the side.

function weekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function PlanningView({ entityId }: { entityId: Id }) {
  const { state, apply, toast, setUi } = useStore();
  const [from, setFrom] = useState(addDays(state.today, -14));
  const [weeks, setWeeks] = useState(12);
  const [filter, setFilter] = useState<'all' | 'free' | 'assigned' | 'overloaded'>('all');
  const [engagementFilter, setEngagementFilter] = useState('');
  const [sel, setSel] = useState<Assignment | null>(null);
  const [newFor, setNewFor] = useState<Id | null>(null);
  const cal = useMemo(() => planningCalendar(state, entityId, from, weeks), [state, entityId, from, weeks]);
  const rows = cal.rows.filter((r) => (filter === 'all' || r.status === filter) && (!engagementFilter || r.assignments.some((a) => a.engagement.id === engagementFilter)));
  const entity = state.entities.find((e) => e.id === entityId)!;
  const exportXlsx = () => downloadXlsx(`planning-${entity.code}-${from}.xlsx`, [{ name: 'Affectations', rows: [['Collaborateur', 'Mission', 'Client', 'Début', 'Fin', 'Charge', 'Rôle'], ...cal.rows.flatMap((r) => r.assignments.map((a) => [`${r.employee.firstName} ${r.employee.lastName}`, `${a.engagement.code} ${a.engagement.name}`, state.customers.find((c) => c.id === a.engagement.customerId)?.name ?? '', a.assignment.start, a.assignment.end, a.assignment.load, a.assignment.role ?? '']))] }, { name: 'Charge par semaine', rows: [['Collaborateur', ...cal.weeks.map(weekLabel)], ...cal.rows.map((r) => [`${r.employee.firstName} ${r.employee.lastName}`, ...r.weeks.map((w) => Math.round(w.load * 100))])] }], toast);
  const todayCol = cal.weeks.findIndex((w) => w <= state.today && addDays(w, 6) >= state.today);
  const cols = `220px repeat(${cal.weeks.length}, minmax(64px, 1fr))`;
  return (
    <div className="cols">
      <div className="grow">
        <div className="grid4">
          <div className="kpi"><div className="l">Collaborateurs planifiables</div><div className="v">{cal.rows.length}</div></div>
          <div className="kpi"><div className="l">Disponibles aujourd'hui</div><div className="v" style={{ color: 'var(--good)' }}>{cal.free}</div></div>
          <div className="kpi"><div className="l">Affectés</div><div className="v">{cal.assigned}</div></div>
          <div className="kpi"><div className="l">En surcharge · chevauchements</div><div className="v" style={{ color: cal.overloaded ? 'var(--crit)' : undefined }}>{cal.overloaded} · {cal.conflicts.length}</div></div>
        </div>
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label="À partir du"><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Semaines"><Select className="in" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>{[8, 12, 16, 26].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            <Field label="Statut"><Select className="in" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Tous</option><option value="free">Disponibles</option><option value="assigned">Affectés</option><option value="overloaded">Surcharge</option></Select></Field>
            <Field label="Mission"><Select recent="missions" className="in" value={engagementFilter} onChange={(e) => setEngagementFilter(e.target.value)}><option value="">Toutes</option>{cal.engagements.map((e) => <option key={e.engagement.id} value={e.engagement.id}>{e.engagement.code} · {e.engagement.name}</option>)}</Select></Field>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Exporter (Excel)</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div className="gantt" style={{ gridTemplateColumns: cols, minWidth: 220 + cal.weeks.length * 64 }}>
              <div className="head" style={{ borderLeft: 0 }}>Collaborateur · charge actuelle</div>
              {cal.weeks.map((w, i) => <div key={w} className={`head ${i === todayCol ? 'today' : ''}`}>S {weekLabel(w)}</div>)}
              {rows.map((r) => (
                <RowCells key={r.employee.id} row={r} todayCol={todayCol} onPick={(a) => { setSel(a); setNewFor(null); }} onNew={() => { setNewFor(r.employee.id); setSel(null); }} selected={sel?.id ?? null} />
              ))}
              {rows.length === 0 && <div className="name" style={{ gridColumn: `1 / span ${cal.weeks.length + 1}` }}><span className="muted small">Aucun collaborateur dans ce filtre</span></div>}
            </div>
          </div>
          <div className="small muted" style={{ padding: 10 }}>Une barre par affectation (charge en %). Rouge : deux missions la même semaine ou charge au-delà de 100 %. Cliquer une barre pour la modifier, « + » en bout de ligne pour affecter.</div>
        </div>
        {cal.conflicts.length > 0 && (
          <div className="card flush">
            <table><thead><tr><th>Chevauchements</th><th>Semaine</th><th>Missions</th></tr></thead><tbody>{cal.conflicts.slice(0, 20).map((c, i) => <tr key={i}><td>{c.employee.firstName} {c.employee.lastName}</td><td>S {weekLabel(c.weekStart)}</td><td>{c.engagements.join(' + ')}</td></tr>)}</tbody></table>
          </div>
        )}
        <div className="card flush">
          <table>
            <thead><tr><th>Missions en cours</th><th>Client</th><th>Étape</th><th>Échéance</th><th className="num">Budget</th><th className="num">Affectés</th><th></th></tr></thead>
            <tbody>{cal.engagements.map((e) => <tr key={e.engagement.id}><td><b>{e.engagement.name}</b><div className="small muted mono">{e.engagement.code}</div></td><td>{state.customers.find((c) => c.id === e.engagement.customerId)?.name}</td><td>{e.engagement.stage}/5</td><td><D iso={e.engagement.deadline} /></td><td className="num">{e.engagement.budgetHours} h</td><td className="num">{e.assigned ? <Chip kind="good">{e.assigned}</Chip> : <Chip kind="warn">0</Chip>}</td><td><button className="btn sm" onClick={() => setUi({ focusEngagementId: e.engagement.id })}>Voir</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        {sel ? <EditAssignment a={sel} onClose={() => setSel(null)} /> : <NewAssignment entityId={entityId} employeeId={newFor} from={from} onDone={() => setNewFor(null)} apply={apply} />}
      </aside>
    </div>
  );
}

function RowCells({ row, todayCol, onPick, onNew, selected }: { row: ReturnType<typeof planningCalendar>['rows'][number]; todayCol: number; onPick: (a: Assignment) => void; onNew: () => void; selected: Id | null }) {
  return (
    <>
      <div className="name" style={{ borderLeft: 0 }}>
        <Chip kind={row.status === 'free' ? 'good' : row.status === 'overloaded' ? 'crit' : 'dim'}>{Math.round(row.loadNow * 100)} %</Chip>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${row.employee.jobTitle} · ${row.employee.department}`}><b>{row.employee.initials}</b> {row.employee.firstName} {row.employee.lastName}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onNew} aria-label={`Affecter ${row.employee.initials}`}>+</button>
      </div>
      {row.weeks.map((w, i) => (
        <div key={w.weekStart} className={`cell ${i === todayCol ? 'today' : ''}`}>
          {w.assignments.map((x, k) => (
            <div key={x.assignment.id} className={`bar ${w.overlap ? 'conflict' : x.assignment.load >= 1 ? 'full' : 'light'} ${selected === x.assignment.id ? 'sel' : ''}`} style={{ top: 3 + k * 12, height: w.assignments.length > 1 ? 11 : 22, lineHeight: w.assignments.length > 1 ? '11px' : '22px', fontSize: w.assignments.length > 1 ? 9 : 11 }} title={`${x.engagement.code} · ${x.engagement.name} · ${x.assignment.start} → ${x.assignment.end} · ${Math.round(x.assignment.load * 100)} %`} onClick={() => onPick(x.assignment)}>
              {x.engagement.code}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function NewAssignment({ entityId, employeeId, from, onDone, apply }: { entityId: Id; employeeId: Id | null; from: string; onDone: () => void; apply: ReturnType<typeof useStore.getState>['apply'] }) {
  const { state } = useStore();
  const employees = state.employees.filter((e) => e.entityId === entityId && e.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName));
  const engagements = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed');
  const [emp, setEmp] = useState(employeeId ?? employees[0]?.id ?? '');
  const [tracked, setTracked] = useState(employeeId);
  if (tracked !== employeeId) { setTracked(employeeId); if (employeeId) setEmp(employeeId); }
  const [eng, setEng] = useState(engagements[0]?.id ?? '');
  const [start, setStart] = useState(from > state.today ? from : state.today);
  const [end, setEnd] = useState(addDays(state.today, 13));
  const [load, setLoad] = useState('100');
  const [role, setRole] = useState('');
  const avail = useMemo(() => availability(state, entityId, start, end), [state, entityId, start, end]);
  const mine = avail.find((a) => a.employee.id === emp);
  const save = () => { if (apply((s) => assign(s, { entityId, engagementId: eng, employeeId: emp, start, end, load: (Number(load) || 100) / 100, role: role || undefined }), 'Affectation enregistrée')) onDone(); };
  return (
    <div className="card">
      <h2>Nouvelle affectation</h2>
      <Field label="Collaborateur"><Select recent="people" className="in" value={emp} onChange={(e) => setEmp(e.target.value)}>{employees.map((e) => <option key={e.id} value={e.id}>{e.initials} · {e.firstName} {e.lastName} · {e.jobTitle}</option>)}</Select></Field>
      <Field label="Mission" style={{ marginTop: 8 }}><Select recent="missions" className="in" value={eng} onChange={(e) => setEng(e.target.value)}>{engagements.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</Select></Field>
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="Début"><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fin"><input className="in mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Charge (%)"><Select className="in" value={load} onChange={(e) => setLoad(e.target.value)}>{[100, 80, 60, 50, 40, 25, 20].map((n) => <option key={n} value={n}>{n} %</option>)}</Select></Field>
        <Field label="Rôle sur la mission"><input className="in" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Chef de mission, senior…" /></Field>
      </div>
      {mine && <div className={`banner ${mine.free ? 'info' : mine.load + (Number(load) || 100) / 100 > 1.001 ? 'crit' : 'warn'}`} style={{ marginTop: 10 }}>{mine.free ? 'Disponible sur toute la période.' : `Déjà chargé à ${Math.round(mine.load * 100)} % en moyenne sur la période (${mine.busyDays} jour(s) occupés)${mine.load + (Number(load) || 100) / 100 > 1.001 ? ' · cette affectation créera une surcharge' : ''}.`}</div>}
      <div className="actions" style={{ marginTop: 10 }}><button className="btn primary" disabled={!emp || !eng || end < start} onClick={save}>Affecter</button></div>
      <h2 style={{ marginTop: 14 }}>Disponibles sur la période</h2>
      <div className="small">{avail.filter((a) => a.free).map((a) => <Chip key={a.employee.id} kind="good">{a.employee.initials}</Chip>)}{avail.every((a) => !a.free) && <span className="muted">personne n'est entièrement libre</span>}</div>
    </div>
  );
}

function EditAssignment({ a, onClose }: { a: Assignment; onClose: () => void }) {
  const { state, apply } = useStore();
  const emp = state.employees.find((e) => e.id === a.employeeId);
  const eng = state.engagements.find((e) => e.id === a.engagementId);
  const [start, setStart] = useState(a.start);
  const [end, setEnd] = useState(a.end);
  const [load, setLoad] = useState(String(Math.round(a.load * 100)));
  const [role, setRole] = useState(a.role ?? '');
  const [tracked, setTracked] = useState(a.id);
  if (tracked !== a.id) { setTracked(a.id); setStart(a.start); setEnd(a.end); setLoad(String(Math.round(a.load * 100))); setRole(a.role ?? ''); }
  return (
    <div className="card">
      <h2>Affectation · {emp?.initials} · {eng?.code}</h2>
      <div className="small muted">{emp?.firstName} {emp?.lastName} · {eng?.name} · {state.customers.find((c) => c.id === eng?.customerId)?.name}</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="Début"><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fin"><input className="in mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Charge (%)"><Select className="in" value={load} onChange={(e) => setLoad(e.target.value)}>{[100, 80, 60, 50, 40, 25, 20].map((n) => <option key={n} value={n}>{n} %</option>)}</Select></Field>
        <Field label="Rôle"><input className="in" value={role} onChange={(e) => setRole(e.target.value)} /></Field>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" onClick={onClose}>Fermer</button>
        <button className="btn danger" onClick={() => { if (apply((s) => removeAssignment(s, a.id), 'Affectation retirée')) onClose(); }}>Retirer</button>
        <button className="btn primary" onClick={() => { if (apply((s) => updateAssignment(s, a.id, { start, end, load: (Number(load) || 100) / 100, role: role || undefined }), 'Affectation modifiée')) onClose(); }}>Enregistrer</button>
      </div>
      {eng && <div className="small muted" style={{ marginTop: 8 }}>Budget {eng.budgetHours} h · réalisé {eng.actualHours} h · échéance {eng.deadline}</div>}
    </div>
  );
}

export function AvailabilityView({ entityId }: { entityId: Id }) {
  const { state } = useStore();
  const [from, setFrom] = useState(state.today);
  const [to, setTo] = useState(addDays(state.today, 27));
  const rows = useMemo(() => availability(state, entityId, from, to), [state, entityId, from, to]);
  const cal = useMemo(() => planningCalendar(state, entityId, from, 1), [state, entityId, from]);
  return (
    <div className="cols">
      <div className="grow">
        <div className="card flush">
          <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Field label="Du"><input className="in mono" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Au"><input className="in mono" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <span className="small muted" style={{ marginLeft: 'auto' }}>{rows.filter((r) => r.free).length} libre(s) · {rows.filter((r) => !r.free && r.load <= 1).length} partiellement ou totalement pris · {rows.filter((r) => r.load > 1.001).length} en surcharge</span>
          </div>
          <table>
            <thead><tr><th>Collaborateur</th><th>Fonction</th><th>Service</th><th className="num">Charge moyenne</th><th className="num">Jours occupés</th><th>Prochaine disponibilité</th><th>Missions sur la période</th></tr></thead>
            <tbody>{rows.map((r) => { const plan = cal.rows.find((x) => x.employee.id === r.employee.id); const missions = state.assignments.filter((a) => a.employeeId === r.employee.id && a.start <= to && a.end >= from).map((a) => state.engagements.find((e) => e.id === a.engagementId)?.code).filter(Boolean); return <tr key={r.employee.id}><td><b>{r.employee.initials}</b> {r.employee.firstName} {r.employee.lastName}</td><td>{r.employee.jobTitle}</td><td>{r.employee.department}</td><td className="num"><Chip kind={r.free ? 'good' : r.load > 1.001 ? 'crit' : r.load >= 0.8 ? 'warn' : 'dim'}>{Math.round(r.load * 100)} %</Chip></td><td className="num">{r.busyDays}</td><td>{plan?.nextFree ? <D iso={plan.nextFree} /> : '—'}</td><td className="small">{missions.join(', ') || <span className="muted">libre</span>}</td></tr>; })}</tbody>
          </table>
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <h2>Lecture</h2>
          <div className="small">La charge moyenne rapporte les jours affectés (pondérés par la charge) aux jours de la période. 0 % = libre pour toute la période ; au-delà de 100 % = chevauchement à arbitrer dans le planning.</div>
          <div className="small muted" style={{ marginTop: 8 }}>Les collaborateurs viennent du module RH ; une sortie des effectifs les retire du planning sans effacer l'historique. Total heures budget des missions en cours : {fmt(cal.engagements.reduce((a, e) => a + e.engagement.budgetHours, 0), 0)} h.</div>
        </div>
      </aside>
    </div>
  );
}
