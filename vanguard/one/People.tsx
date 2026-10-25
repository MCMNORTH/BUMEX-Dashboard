import { useEffect, useMemo, useState } from 'react';
import { canUseModule, fmt, r2, type Id } from '@bumex/domain';
import { peopleAction, type PersonRow } from '@/lib/erp/vanguard/people-actions';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { PersonPanel } from './Person';
import { useSay } from './say';

// The HR room's "Personnes" tab, open to everyone: BUMEX One's team (its Team page moved here), each person with their
// Vanguard role, their load and, when they have one, their HR record. The records and their salaries are in the
// state of people with the HR module only (the database sends no one else the employee rows).
const AVAILABILITY: Record<string, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  available: ['Disponible', 'Available', 'good'],
  busy: ['Occupé', 'Busy', 'dim'],
  overloaded: ['Surchargé', 'Overloaded', 'crit'],
  away: ['Absent', 'Away', 'warn'],
  inactive: ['Inactif', 'Inactive', 'dim'],
};
const WORKLOAD: Record<string, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  light: ['Légère', 'Light', 'good'],
  balanced: ['Équilibrée', 'Balanced', 'dim'],
  high: ['Élevée', 'High', 'warn'],
  critical: ['Critique', 'Critical', 'crit'],
};

export function People({ entityId, onOpen, personId }: { entityId: Id; onOpen: (employeeId: Id) => void; personId?: string | null }) {
  const { state, t } = useStore();
  const say = useSay();
  const [person, setPerson] = useState<string | null>(personId ?? null);
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [q, setQ] = useState('');
  const [floor, setFloor] = useState('all');
  const hr = canUseModule(state, 'hr');
  const here = state.entities.find((e) => e.id === entityId);

  useEffect(() => {
    let live = true;
    peopleAction().then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => { live = false; };
  }, []);

  const recordOf = useMemo(() => {
    const byEmail = new Map(state.employees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]));
    return (p: PersonRow) => byEmail.get(p.email.toLowerCase()) ?? state.employees.find((e) => e.id === state.users.find((u) => u.email === p.email)?.employeeId);
  }, [state.employees, state.users]);
  const shown = (rows ?? []).filter((p) => (floor === 'all' || p.floor === floor) && (!q.trim() || `${p.name} ${p.email} ${p.jobTitle ?? ''} ${p.department ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));

  if (person) return <PersonPanel key={person} personId={person} onClose={() => setPerson(null)} />;
  return (
    <div className="card flush">
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ maxWidth: 280 }} placeholder={say('Rechercher une personne…', 'Search for a person…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ width: 220 }} value={floor} onChange={(e) => setFloor(e.target.value)} aria-label={say('Étage', 'Floor')}>
          <option value="all">{say('Tout le groupe', 'The whole group')}</option>
          {state.entities.map((e) => <option key={e.id} value={e.code}>{e.name}</option>)}
        </select>
        {here && floor !== here.code && <button className="btn sm" onClick={() => setFloor(here.code)}>{say('Cet étage', 'This floor')}</button>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>{rows ? `${shown.length} / ${rows.length}` : ''}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>{say('Personne', 'Person')}</th><th>{say('Étage', 'Floor')}</th><th>{say('Fonction · service', 'Role · department')}</th><th>{say('Rôle Vanguard', 'Vanguard role')}</th>
            <th>{say('Disponibilité', 'Availability')}</th><th className="num">{say('Tâches', 'Tasks')}</th><th className="num">{say('En retard', 'Late')}</th><th>{say('Charge', 'Load')}</th>
            <th>{say('Fiche RH', 'HR record')}</th>{hr && <th className="num">{say('Brut mensuel', 'Monthly gross')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows === null && <tr><td colSpan={hr ? 10 : 9} className="muted small">{say('Chargement…', 'Loading…')}</td></tr>}
          {rows !== null && shown.length === 0 && <tr><td colSpan={hr ? 10 : 9} className="muted small">{say('Personne', 'No one')}</td></tr>}
          {shown.map((p) => {
            const record = recordOf(p);
            const availability = AVAILABILITY[p.availability] ?? AVAILABILITY.available;
            const workload = WORKLOAD[p.workload] ?? WORKLOAD.balanced;
            return (
              <tr key={p.id} onClick={() => setPerson(p.id)} style={{ cursor: 'pointer' }}>
                <td><b>{p.name}</b><div className="small muted">{p.email}</div></td>
                <td className="mono">{p.floor ?? '—'}</td>
                <td>{record?.jobTitle || p.jobTitle || '—'}<div className="small muted">{record?.department || p.department || ''}</div></td>
                <td className="small">{p.role ? t(p.role) : <span className="muted">{say('aucun', 'none')}</span>}</td>
                <td><Chip kind={availability[2]}>{say(availability[0], availability[1])}</Chip></td>
                <td className="num">{p.tasks}</td>
                <td className="num" style={{ color: p.overdue ? 'var(--crit)' : undefined }}>{p.overdue}</td>
                <td><Chip kind={workload[2]}>{say(workload[0], workload[1])}</Chip></td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  {/* the sheet opens on the record's own floor (its payroll rules and departments are that entity's) */}
                  {record && record.entityId === entityId && <button className="btn sm" onClick={() => onOpen(record.id)}><span className="mono">{record.code}</span> · {record.contractType} · <D iso={record.hireDate} /></button>}
                  {record && record.entityId !== entityId && <span className="small"><span className="mono">{record.code}</span> · {record.contractType} · <D iso={record.hireDate} /></span>}
                  {!record && <span className="small muted">—</span>}
                </td>
                {hr && <td className="num">{record ? fmt(r2(record.grossSalary + record.allowances), 0) : ''}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
