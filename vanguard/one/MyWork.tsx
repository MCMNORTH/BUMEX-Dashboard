import { useEffect, useState, type DragEvent } from 'react';
import { moveTicketStageAction, toggleSubtaskAction } from '@/app/(app)/tickets/actions';
import { myWorkAction, type MyWorkData, type MyWorkTicket } from '@/lib/erp/vanguard/myday-actions';
import type { TicketStatus } from '@/types/ticket';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { PRIORITY, label, reload } from './Tasks';
import { useSay } from './say';

// My day's "Mon travail" tab: BUMEX One's My Work page (merged into My day, 2026-10-25). My week's time, the next thing
// to do, every ticket of mine by state, and my sub-tasks. My tickets come from several boards: dropped in another
// column, a ticket moves by its state, and each board's rules apply (BUMEX One's ticket action).

const COLUMNS: [TicketStatus, string, string][] = [['todo', 'À faire', 'To do'], ['in_progress', 'En cours', 'In progress'], ['review', 'En revue', 'Review'], ['blocked', 'Bloqué', 'Blocked'], ['done', 'Terminé', 'Done']];
const columnOf = (status: string) => (status === 'backlog' ? 'todo' : status);
const minutes = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

export function MyWork() {
  const { toast, openRoom } = useStore();
  const say = useSay();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<MyWorkData | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    myWorkAction().then((d) => live && setData(d)).catch(() => {
      const { toast: show, ui } = useStore.getState();
      if (live) show('error', ui.lang === 'fr' ? 'Mon travail est indisponible.' : 'My work is unavailable.');
    });
    return () => { live = false; };
  }, [loadedAt]);

  if (!data) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  const open = data.tickets.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const overdue = open.filter((t) => t.dueState === 'overdue');
  const soon = open.filter((t) => t.dueState === 'soon');
  const done = data.tickets.filter((t) => t.status === 'done').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const next = open.find((t) => t.status === 'blocked') ?? overdue[0] ?? open.find((t) => t.priority === 'urgent') ?? soon[0] ?? open.find((t) => t.status === 'in_progress') ?? open[0];
  const [nextKind, nextTitle]: ['crit' | 'warn' | 'info', string] = !next ? ['info', '']
    : next.status === 'blocked' ? ['crit', say('Lever le blocage', 'Remove the blocker')]
      : next.dueState === 'overdue' ? ['crit', say('Traiter le retard', 'Address the delay')]
        : next.priority === 'urgent' ? ['warn', say('Priorité urgente', 'Urgent priority')]
          : next.dueState === 'soon' ? ['info', say("Préparer l'échéance", 'Prepare the deadline')]
            : ['info', say('Poursuivre le travail', 'Continue the work')];
  const ticket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const refresh = async () => {
    const [fresh] = await Promise.all([myWorkAction(), reload()]);
    setData(fresh);
  };
  const move = async (t: MyWorkTicket, status: TicketStatus) => {
    if (columnOf(t.status) === status) return;
    setBusy(t.id);
    try {
      const result = await moveTicketStageAction(t.id, { status });
      if (result.error) toast('error', result.error);
      else toast('ok', `${t.title} → ${say(...(COLUMNS.find(([k]) => k === status)!.slice(1) as [string, string]))}`);
      await refresh();
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(null);
    }
  };
  const tick = async (id: string, value: boolean) => {
    const result = await toggleSubtaskAction(id, value).catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
    if (result.error) toast('error', result.error);
    await refresh();
  };
  const drop = (status: TicketStatus) => ({
    onDragOver: (e: DragEvent) => { if (dragged) e.preventDefault(); },
    onDrop: (e: DragEvent) => { e.preventDefault(); const t = data.tickets.find((x) => x.id === dragged); setDragged(null); if (t) void move(t, status); },
  });

  return (
    <>
      {data.week && (
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <div className="small muted">{say('Ma semaine', 'My week')}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{minutes(data.week.loggedMinutes)} <span className="small muted">/ {data.week.capacityHours} h</span></div>
            <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (data.week.loggedMinutes / Math.max(1, data.week.capacityHours * 60)) * 100)}%` }} /></div>
          </div>
          <Chip kind={data.week.status === 'approved' ? 'good' : data.week.status === 'returned' ? 'crit' : data.week.status === 'submitted' ? 'warn' : 'dim'}>
            {data.week.status === 'approved' ? say('Feuille validée', 'Timesheet approved') : data.week.status === 'submitted' ? say('Envoyée pour validation', 'Submitted for review') : data.week.status === 'returned' ? say('Corrections demandées', 'Changes requested') : data.week.loggedMinutes ? say('Saisie en cours', 'Entry in progress') : say('Aucun temps déclaré', 'No time logged')}
          </Chip>
          <button className="btn sm primary" onClick={() => openRoom('time')}>{say('Ma feuille de temps', 'My timesheet')}</button>
        </div>
      )}

      {next && <div className={`banner ${nextKind}`} style={{ cursor: 'pointer' }} onClick={() => ticket(next.id)}><b>{nextTitle}</b> · {next.title}{next.projectName ? ` · ${next.projectName}` : ''}</div>}

      <div className="grid4">
        <div className="kpi"><div className="l">{say('Tickets ouverts', 'Open tickets')}</div><div className="v">{open.length}</div></div>
        <div className="kpi"><div className="l">{say('En retard', 'Overdue')}</div><div className="v" style={{ color: overdue.length ? 'var(--crit)' : undefined }}>{overdue.length}</div></div>
        <div className="kpi"><div className="l">{say('Dans les 7 jours', 'Within 7 days')}</div><div className="v">{soon.length}</div></div>
        <div className="kpi"><div className="l">{say('Terminés', 'Done')}</div><div className="v">{done.length}</div></div>
      </div>

      <div className="kanban">
        {COLUMNS.map(([status, fr, en]) => {
          const list = status === 'done' ? done.slice(0, 8) : open.filter((t) => columnOf(t.status) === status);
          return (
            <div className="col" key={status} {...drop(status)} style={{ minWidth: 150 }}>
              <h3>{say(fr, en)} <span>{status === 'done' ? done.length : list.length}</span></h3>
              {list.map((t) => (
                <div
                  key={t.id}
                  className={`desk ${t.dueState === 'overdue' && status !== 'done' ? 'late' : ''}`}
                  draggable={busy !== t.id}
                  onDragStart={() => setDragged(t.id)}
                  onDragEnd={() => setDragged(null)}
                  onClick={() => ticket(t.id)}
                  style={{ cursor: 'pointer', opacity: busy === t.id ? 0.55 : 1 }}
                >
                  <b>{t.title}</b>
                  <span className="muted">{t.projectName ?? '—'}{t.stageName ? ` · ${t.stageName}` : ''}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(t.priority === 'urgent' || t.priority === 'high') && <Chip kind="warn">{label(PRIORITY[t.priority], t.priority, say)}</Chip>}
                    {t.dueDate && <span className="small muted"><D iso={t.dueDate} /></span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{say('Glissez un ticket dans une autre colonne : les règles de son tableau s’appliquent.', "Drag a ticket into another column: its board's rules apply.")}</p>

      {data.subtasks.length > 0 && (
        <div className="card flush">
          <table>
            <thead><tr><th style={{ width: 30 }} /><th>{say('Mes sous-tâches', 'My sub-tasks')}</th><th>Ticket</th><th>{say('Échéance', 'Due')}</th></tr></thead>
            <tbody>
              {data.subtasks.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={s.done} onChange={(e) => tick(s.id, e.target.checked)} aria-label={s.title} /></td>
                  <td style={{ textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--muted)' : undefined }}>{s.title}</td>
                  <td className="click small" onClick={() => s.ticketId && ticket(s.ticketId)}>{s.ticketTitle ?? '—'}</td>
                  <td><D iso={s.dueDate ?? undefined} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
