import { useMemo, useState, type DragEvent } from 'react';
import { addDays, daysBetween, type Id, type Task } from '@bumex/domain';
import type { TaskTicket } from '@/lib/erp/vanguard/tickets';
import { updateTaskDueDateAction } from '@/app/(app)/planning/actions';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { reload } from './Tasks';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The Missions room's "Semaine" tab: BUMEX One's weekly planning on the floor's tickets (lib/erp/vanguard/tickets.ts),
// day by day, with what is late, what has no date and each person's load. A task dropped on another day is
// rescheduled with BUMEX One's planning action, so its rules hold (employees move their own tickets only).

type TicketTask = Task & { ticket: TaskTicket };

const NO_DUE_DATE = '9999-12-31';
const TEAM_ROLES = ['admin', 'partner', 'raf', 'manager'];

function mondayOf(iso: string) {
  return addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
}

export function WeekView({ entityId }: { entityId: Id }) {
  const { state, ui, setUi, openRoom, toast } = useStore();
  const say = useSay();
  const me = state.session.userId;
  const [monday, setMonday] = useState(() => mondayOf(state.today));
  const [who, setWho] = useState<string>(TEAM_ROLES.includes(state.session.role) ? 'all' : me);
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const tasks = useMemo(() => state.tasks.filter((x) => x.entityId === entityId) as TicketTask[], [state.tasks, entityId]);
  const people = useMemo(() => {
    const names = new Map<string, string>();
    for (const x of tasks) if (x.ticket.assignee_id) names.set(x.ticket.assignee_id, x.assignee);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);
  const scoped = who === 'all' ? tasks : tasks.filter((x) => x.ticket.assignee_id === who);
  const open = scoped.filter((x) => x.status !== 'done');
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = scoped.filter((x) => x.dueDate >= days[0] && x.dueDate <= days[6]);
  const overdue = open.filter((x) => x.dueDate < state.today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const undated = open.filter((x) => x.dueDate === NO_DUE_DATE);
  const mission = (x: Task) => state.engagements.find((e) => e.id === x.engagementId);
  const locale = ui.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  // each person's load: their open tasks, those of this week and those late (on the whole floor, whatever the filter)
  const load = people.map(([id, name]) => {
    const theirs = tasks.filter((x) => x.ticket.assignee_id === id && x.status !== 'done');
    return { id, name, open: theirs.length, week: theirs.filter((x) => x.dueDate >= days[0] && x.dueDate <= days[6]).length, late: theirs.filter((x) => x.dueDate < state.today).length };
  }).sort((a, b) => b.open - a.open);
  const most = Math.max(1, ...load.map((p) => p.open));

  const show = (x: Task) => {
    setUi({ focusTaskId: x.id });
    openRoom('tasks');
  };
  const reschedule = async (id: string, day: string | null) => {
    const task = tasks.find((x) => x.id === id);
    if (!task || (day ?? NO_DUE_DATE) === task.dueDate) return;
    setBusy(id);
    try {
      const result = await updateTaskDueDateAction(id, day);
      if (result.error) toast('error', result.error);
      else toast('ok', `${task.title} · ${day ? dayLabel(day) : say('sans échéance', 'no due date')}`);
      await reload();
    } catch {
      toast('error', say("Serveur injoignable : la tâche n'a pas changé.", 'Server unreachable: the task did not change.'));
    } finally {
      setBusy(null);
    }
  };
  const drop = (day: string | null) => ({
    onDragOver: (e: DragEvent) => { if (dragged) e.preventDefault(); },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (dragged) void reschedule(dragged, day); setDragged(null); },
  });

  const card = (x: TicketTask) => {
    const late = x.status !== 'done' && x.dueDate < state.today;
    return (
      <div
        key={x.id}
        className={`desk ${late ? 'late' : ''} ${ui.focusTaskId === x.id ? 'focus' : ''}`}
        draggable={x.status !== 'done' && busy !== x.id}
        onDragStart={() => setDragged(x.id)}
        onDragEnd={() => setDragged(null)}
        onClick={() => show(x)}
        style={{ cursor: 'pointer', opacity: x.status === 'done' || busy === x.id ? 0.55 : 1 }}
      >
        <b style={{ textDecoration: x.status === 'done' ? 'line-through' : undefined }}>{x.title}</b>
        <span className="muted">{mission(x)?.code ?? ''} · {x.assignee}</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {x.priority === 'high' && <Chip kind="crit">{say('Priorité haute', 'High priority')}</Chip>}
          {x.status === 'in_progress' && <Chip kind="dim">{say('En cours', 'In progress')}</Chip>}
          {late && <Chip kind="warn">{say('en retard', 'late')}</Chip>}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setMonday(addDays(monday, -7))} aria-label={say('Semaine précédente', 'Previous week')}>‹</button>
        <b style={{ minWidth: 190, textAlign: 'center' }}>{dayLabel(days[0])} – {dayLabel(days[6])}</b>
        <button className="btn sm" onClick={() => setMonday(addDays(monday, 7))} aria-label={say('Semaine suivante', 'Next week')}>›</button>
        {monday !== mondayOf(state.today) && <button className="btn sm" onClick={() => setMonday(mondayOf(state.today))}>{say('Cette semaine', 'This week')}</button>}
        <Select recent="people" className="in" style={{ marginLeft: 'auto', width: 220 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label={say('Personne', 'Person')}>
          <option value="all">{say("Toute l'équipe", 'The whole team')}</option>
          <option value={me}>{say('Mes tâches', 'My tasks')}</option>
          {people.filter(([id]) => id !== me).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>

      <div className="grid4">
        <div className="kpi"><div className="l">{say('Prévues cette semaine', 'Due this week')}</div><div className="v">{inWeek.length}</div></div>
        <div className="kpi"><div className="l">{say("Pour aujourd'hui", 'Due today')}</div><div className="v">{open.filter((x) => x.dueDate === state.today).length}</div></div>
        <div className="kpi"><div className="l">{say('En retard', 'Overdue')}</div><div className="v" style={{ color: overdue.length ? 'var(--crit)' : undefined }}>{overdue.length}</div></div>
        <div className="kpi"><div className="l">{say('Sans échéance', 'No due date')}</div><div className="v">{undated.length}</div></div>
      </div>

      <div className="kanban">
        {days.map((day) => {
          const list = scoped.filter((x) => x.dueDate === day);
          return (
            <div className="col" key={day} {...drop(day)} style={{ minWidth: 120, ...(day === state.today ? { boxShadow: 'inset 0 0 0 2px var(--blue)' } : {}) }}>
              <h3>{dayLabel(day)} <span>{list.length}</span></h3>
              {list.map(card)}
            </div>
          );
        })}
        <div className="col" {...drop(null)} style={{ minWidth: 120 }}>
          <h3>{say('Sans échéance', 'No due date')} <span>{undated.length}</span></h3>
          {undated.map(card)}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{say('Glissez une tâche sur un autre jour pour la replanifier.', 'Drag a task onto another day to reschedule it.')}</p>

      <div className="grid2">
        <div className="card flush">
          <table>
            <thead><tr><th>{say('En retard', 'Overdue')} · {overdue.length}</th><th>{say('Mission', 'Mission')}</th><th>{say('Assignée à', 'Assignee')}</th><th>{say('Échéance', 'Due')}</th><th className="num">{say('Jours', 'Days')}</th></tr></thead>
            <tbody>
              {overdue.length ? overdue.map((x) => (
                <tr key={x.id} onClick={() => show(x)} style={{ cursor: 'pointer' }}>
                  <td><b>{x.title}</b></td>
                  <td className="small">{mission(x)?.name ?? '—'}</td>
                  <td className="small">{x.assignee}</td>
                  <td><D iso={x.dueDate} /></td>
                  <td className="num" style={{ color: 'var(--crit)' }}>{daysBetween(x.dueDate, state.today)}</td>
                </tr>
              )) : <tr><td colSpan={5} className="muted">{say('Rien en retard.', 'Nothing overdue.')}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card flush">
          <table>
            <thead><tr><th>{say('Charge', 'Load')}</th><th className="num">{say('Cette semaine', 'This week')}</th><th className="num">{say('En retard', 'Late')}</th><th className="num">{say('Ouvertes', 'Open')}</th><th style={{ width: '30%' }} /></tr></thead>
            <tbody>
              {load.length ? load.map((p) => (
                <tr key={p.id} className={who === p.id ? 'sel' : ''} onClick={() => setWho(who === p.id ? 'all' : p.id)} style={{ cursor: 'pointer' }}>
                  <td>{p.name}</td>
                  <td className="num">{p.week}</td>
                  <td className="num" style={{ color: p.late ? 'var(--crit)' : undefined }}>{p.late}</td>
                  <td className="num">{p.open}</td>
                  <td><div className="bar"><i style={{ width: `${(p.open / most) * 100}%`, background: p.late ? 'var(--warn)' : 'var(--accent)' }} /></div></td>
                </tr>
              )) : <tr><td colSpan={5} className="muted">{say('Aucune tâche assignée sur cet étage.', 'No assigned task on this floor.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
