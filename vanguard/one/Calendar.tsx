import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, type Id } from '@bumex/domain';
import { calendarAction, type CalendarItem } from '@/lib/erp/vanguard/calendar-actions';
import { useStore } from '../store';
import { Chip } from '../ui/common';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The Missions room's "Calendrier" tab: BUMEX One's Calendar page. Ticket due dates, mission deadlines, milestones and
// contract renewals by month (or as a list), for this floor's missions or the whole group.

const TYPES: Record<string, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  ticket_due: ['Tâche', 'Task', 'dim'],
  project_deadline: ['Échéance de mission', 'Mission deadline', 'warn'],
  milestone: ['Jalon', 'Milestone', 'good'],
  contract_renewal: ['Contrat', 'Contract', 'crit'],
  payment_due: ['Paiement', 'Payment', 'warn'],
  internal_event: ['Interne', 'Internal', 'dim'],
};

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const shiftMonth = (first: string, by: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
};

export function CalendarView({ entityId }: { entityId: Id }) {
  const { state, ui, openRoom } = useStore();
  const say = useSay();
  const router = useRouter();
  const loadedAt = useStore((s) => s.loadedAt);
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [month, setMonth] = useState(() => monthStart(state.today));
  const [type, setType] = useState('');
  const [scope, setScope] = useState<'floor' | 'all'>('floor');
  const [list, setList] = useState(false);

  useEffect(() => {
    let live = true;
    calendarAction().then((d) => live && setItems(d)).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [loadedAt]);

  const floorProjects = useMemo(() => new Set(state.engagements.filter((e) => e.entityId === entityId).map((e) => (e as { projectId?: string }).projectId).filter(Boolean) as string[]), [state.engagements, entityId]);
  if (!items) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;

  const shown = items.filter((i) => (!type || i.type === type) && (scope === 'all' || (i.projectId && floorProjects.has(i.projectId))));
  const end = shiftMonth(month, 1);
  const inMonth = shown.filter((i) => i.date >= month && i.date < end);
  const first = new Date(`${month}T00:00:00Z`);
  const gridStart = addDays(month, -((first.getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))).filter((week) => week[0] < end);
  const locale = ui.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${addDays(gridStart, i)}T00:00:00Z`)));
  const open = (i: CalendarItem) => {
    if (!i.open) return;
    if (i.open.kind === 'ticket') openRoom('tasks', `ticket:${i.open.id}`);
    else if (i.open.kind === 'mission') openRoom('missions', `mission:${i.open.id}`);
    else router.push(`/contracts/${i.open.id}`);
  };
  const chip = (i: CalendarItem) => {
    const t = TYPES[i.type] ?? TYPES.internal_event;
    return (
      <div key={i.id} className="small" title={`${say(t[0], t[1])} · ${i.title}${i.projectName ? ` · ${i.projectName}` : ''}`} onClick={() => open(i)} style={{ cursor: i.open ? 'pointer' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `3px solid var(--${t[2] === 'dim' ? 'blue' : t[2]})`, paddingLeft: 4, margin: '2px 0' }}>
        {i.title}
      </div>
    );
  };

  return (
    <>
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={say('Mois précédent', 'Previous month')}>‹</button>
        <b style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{title}</b>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={say('Mois suivant', 'Next month')}>›</button>
        {month !== monthStart(state.today) && <button className="btn sm" onClick={() => setMonth(monthStart(state.today))}>{say('Ce mois', 'This month')}</button>}
        <Select className="in" style={{ width: 190, marginLeft: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">{say('Tous les événements', 'Every event')}</option>
          {Object.entries(TYPES).filter(([k]) => items.some((i) => i.type === k)).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}
        </Select>
        <Select className="in" style={{ width: 170 }} value={scope} onChange={(e) => setScope(e.target.value as 'floor' | 'all')} aria-label={say('Périmètre', 'Scope')}>
          <option value="floor">{say('Cet étage', 'This floor')}</option>
          <option value="all">{say('Tout le groupe', 'The whole group')}</option>
        </Select>
        <button className="btn sm" onClick={() => setList(!list)}>{list ? say('Mois', 'Month') : say('Liste', 'List')}</button>
      </div>

      {list ? (
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Date', 'Date')}</th><th>{say('Événement', 'Event')}</th><th>Type</th><th>{say('Mission · client', 'Mission · client')}</th></tr></thead>
            <tbody>
              {inMonth.map((i) => {
                const t = TYPES[i.type] ?? TYPES.internal_event;
                return (
                  <tr key={i.id} className={i.open ? 'click' : ''} onClick={() => open(i)}>
                    <td className="mono">{i.date}</td><td><b>{i.title}</b>{i.who ? <div className="small muted">{i.who}</div> : null}</td>
                    <td><Chip kind={t[2]}>{say(t[0], t[1])}</Chip></td><td className="small">{i.projectName ?? '—'}{i.clientName ? ` · ${i.clientName}` : ''}</td>
                  </tr>
                );
              })}
              {!inMonth.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>{say('Rien ce mois-ci.', 'Nothing this month.')}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flush">
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>{weekdays.map((w) => <th key={w} style={{ textTransform: 'capitalize' }}>{w}</th>)}</tr></thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]}>
                  {week.map((d) => {
                    const day = shown.filter((i) => i.date === d);
                    const other = d < month || d >= end;
                    return (
                      <td key={d} style={{ verticalAlign: 'top', height: 92, background: d === state.today ? 'var(--blue-pale)' : other ? 'var(--ground)' : undefined, opacity: other ? 0.55 : 1 }}>
                        <div className="small mono" style={{ fontWeight: d === state.today ? 700 : 400 }}>{Number(d.slice(8))}</div>
                        {day.slice(0, 3).map(chip)}
                        {day.length > 3 && <div className="small muted">+{day.length - 3}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} className="small muted">
        {Object.entries(TYPES).filter(([k]) => items.some((i) => i.type === k)).map(([k, [fr, en, kind]]) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, background: `var(--${kind === 'dim' ? 'blue' : kind})`, borderRadius: 2, marginRight: 4 }} />{say(fr, en)}</span>)}
        <span>· {inMonth.length} {say('ce mois-ci', 'this month')}</span>
      </div>
    </>
  );
}
