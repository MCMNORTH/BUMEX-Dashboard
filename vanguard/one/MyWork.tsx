import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { moveTicketStageAction, toggleSubtaskAction } from '@/app/(app)/tickets/actions';
import { myWorkAction, type MyWorkData, type MyWorkTicket } from '@/lib/erp/vanguard/myday-actions';
import { markNotificationAsReadAction } from '@/lib/notifications/actions';
import { remainingHours } from '@/lib/work/load';
import type { TicketStatus } from '@/types/ticket';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { Select } from '../ui/Select';
import { STATUS, label, reload } from './Tasks';
import { useSay } from './say';
import { ago } from './ticket-history';
import { Avatar, LoadBar, Lozenge, PriorityIcon, TypeIcon, hoursText, statusTone } from './work-ui';

// "Mon travail": everything the person has to do, on every floor (asked on 2026-10-27). Their load this week and their
// time; their open tickets, most pressing first (as a list or by state); what waits for their sign-off; their
// sub-tasks; the mentions and comments they have not read; what they reported; and, on the missions they lead, the
// tickets left unassigned, unestimated or late. A ticket moves by its state, and each board's rules apply (BUMEX One's
// ticket action).

const COLUMNS: [TicketStatus, string, string][] = [['todo', 'À faire', 'To do'], ['in_progress', 'En cours', 'In progress'], ['review', 'En revue', 'In review'], ['blocked', 'Bloqué', 'Blocked'], ['done', 'Terminé', 'Done']];
const columnOf = (status: string) => (status === 'backlog' ? 'todo' : status);
const minutes = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

// the room: the rail's "Mon travail" (ui/Sidebar.tsx)
export function MyWorkRoom() {
  const say = useSay();
  const name = useStore((s) => s.state.session.actorName);
  return (
    <>
      <div className="sheet-head"><h1>{say('Mon travail', 'My work')}</h1><span className="small muted">{name}</span></div>
      <div className="sheet-body"><MyWork /></div>
    </>
  );
}

function Block({ title, count, tone, children, extra }: { title: string; count?: number; tone?: 'crit' | 'warn'; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="mw-block">
      <div className="mw-block-h"><h2>{title}</h2>{count !== undefined && <span className={`tk-count ${tone ?? ''}`}>{count}</span>}<span className="grow" />{extra}</div>
      {children}
    </section>
  );
}

export function MyWork() {
  const { toast, openRoom } = useStore();
  const say = useSay();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<MyWorkData | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(Date.now);

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
  const done = data.tickets.filter((t) => t.status === 'done');
  const ticket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const logTime = (t: MyWorkTicket) => openRoom('time', `log:${encodeURIComponent(JSON.stringify({ projectId: t.projectId, mission: `${t.key ? `${t.key} · ` : ''}${t.title}`.slice(0, 200), taskId: t.id }))}`);
  const refresh = async () => {
    const [fresh] = await Promise.all([myWorkAction(), reload()]);
    setData(fresh);
  };
  const move = async (t: MyWorkTicket, target: { status: TicketStatus } | { stageId: string }, name: string) => {
    if ('status' in target && columnOf(t.status) === target.status) return;
    setBusy(t.id);
    try {
      const result = await moveTicketStageAction(t.id, target);
      if (result.error) toast('error', result.error);
      else toast('ok', `${t.key ?? t.title} → ${name}`);
      await refresh();
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(null);
    }
  };
  const statusName = (s: TicketStatus) => say(...(COLUMNS.find(([k]) => k === s)!.slice(1) as [string, string]));
  const tick = async (id: string, value: boolean) => {
    const result = await toggleSubtaskAction(id, value).catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
    if (result.error) toast('error', result.error);
    await refresh();
  };
  const readMention = async (m: MyWorkData['mentions'][number], go: boolean) => {
    await markNotificationAsReadAction(m.id).catch(() => null);
    if (go && m.subjectId) {
      if (m.subjectType === 'ticket' || m.subjectType === 'task') ticket(m.subjectId);
      else if (m.subjectType === 'project') openRoom('missions', `mission:${m.subjectId}`);
      else openRoom('inbox');
    }
    setData({ ...data, mentions: data.mentions.filter((x) => x.id !== m.id) });
  };
  const drop = (status: TicketStatus) => ({
    onDragOver: (e: DragEvent) => { if (dragged) e.preventDefault(); },
    onDrop: (e: DragEvent) => { e.preventDefault(); const t = data.tickets.find((x) => x.id === dragged); setDragged(null); if (t) void move(t, { status }, statusName(status)); },
  });
  const capacity = Math.max(1, (data.week?.capacityHours ?? data.load.capacityHours) * 60);

  return (
    <div className="mw">
      <div className="mw-top">
        <div className="card mw-card">
          <div className="small muted">{say('Ma charge cette semaine', 'My load this week')}</div>
          <LoadBar load={data.load} say={say} />
          <div className="small muted">{data.load.weekCount} {say('ticket(s) cette semaine', 'ticket(s) this week')} · {hoursText(data.load.openHours, say)} {say('restantes au total', 'left in all')} · {say('pondérées par priorité', 'weighted by priority')}</div>
        </div>
        {data.week && (
          <div className="card mw-card">
            <div className="small muted">{say('Mon temps cette semaine', 'My time this week')}</div>
            <div className="mw-big">{minutes(data.week.loggedMinutes)} <span className="small muted">/ {data.week.capacityHours} h</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (data.week.loggedMinutes / capacity) * 100)}%` }} /></div>
            <div className="mw-row">
              <Lozenge tone={data.week.status === 'approved' ? 'done' : data.week.status === 'returned' ? 'blocked' : data.week.status === 'submitted' ? 'review' : 'todo'}>
                {data.week.status === 'approved' ? say('Validée', 'Approved') : data.week.status === 'submitted' ? say('Envoyée', 'Submitted') : data.week.status === 'returned' ? say('À corriger', 'Needs changes') : data.week.loggedMinutes ? say('En cours', 'In progress') : say('Rien de saisi', 'Nothing logged')}
              </Lozenge>
              <button className="btn sm primary" onClick={() => openRoom('time')}><Icon name="clock" size={13} /> {say('Saisir mon temps', 'Log my time')}</button>
            </div>
          </div>
        )}
      </div>

      <Block title={say('À faire', 'To do')} count={open.length} tone={open.some((t) => t.dueState === 'overdue' || t.status === 'blocked') ? 'crit' : undefined}
        extra={<div className="seg-mini"><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{say('Liste', 'List')}</button><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>{say('Tableau', 'Board')}</button></div>}>
        {view === 'list' ? (
          <div className="mw-rows">
            {open.map((t) => (
              <div key={t.id} className={`mw-ticket ${busy === t.id ? 'busy' : ''}`}>
                <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <button className="linkish mono" onClick={() => ticket(t.id)}>{t.key ?? '—'}</button></span>
                <button className="linkish mw-title" onClick={() => ticket(t.id)}>{t.title}<span className="small muted"> · {t.projectName ?? '—'}</span></button>
                <Select className={`stsel mini ${statusTone(t.status)}`} value={columnOf(t.status)} disabled={busy === t.id} onChange={(e) => move(t, { status: e.target.value as TicketStatus }, statusName(e.target.value as TicketStatus))} aria-label={say('État', 'Status')}>
                  {COLUMNS.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}
                </Select>
                <PriorityIcon priority={t.priority} say={say} />
                <span className="mw-hours" title={say('Restant / estimation', 'Left / estimate')}>{t.estimatedHours ? `${hoursText(remainingHours({ estimated_hours: t.estimatedHours, logged_minutes: t.loggedMinutes }), say)} / ${hoursText(t.estimatedHours, say)}` : <span className="muted">{say('à estimer', 'to estimate')}</span>}</span>
                <span className={`mw-due ${t.dueState === 'overdue' ? 'late' : ''}`}>{t.dueDate ? t.dueDate.split('-').reverse().join('/') : '—'}</span>
                <button className="btn sm ghost" onClick={() => logTime(t)} title={say('Enregistrer du temps', 'Log time')} aria-label={say('Enregistrer du temps', 'Log time')}><Icon name="clock" size={13} /></button>
              </div>
            ))}
            {!open.length && <div className="small muted mw-empty">{say('Rien ne vous est assigné. Profitez-en !', 'Nothing is assigned to you.')}</div>}
            {done.length > 0 && (
              <details className="mw-done">
                <summary className="small muted">{say('Terminés récemment', 'Recently done')} · {done.length}</summary>
                {done.map((t) => <div key={t.id} className="mw-ticket"><span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <span className="mono wk-done">{t.key}</span></span><button className="linkish mw-title wk-done" onClick={() => ticket(t.id)}>{t.title}</button><span className="small muted">{ago(t.updatedAt, now, say)}</span></div>)}
              </details>
            )}
          </div>
        ) : (
          <div className="kanban">
            {COLUMNS.map(([status, fr, en]) => {
              const list = status === 'done' ? done : open.filter((t) => columnOf(t.status) === status);
              return (
                <div className="col" key={status} {...drop(status)} style={{ minWidth: 150 }}>
                  <h3>{say(fr, en)} <span>{list.length}</span></h3>
                  {list.map((t) => (
                    <div key={t.id} className={`wk-card ${busy === t.id ? 'busy' : ''}`} draggable={busy !== t.id} onDragStart={() => setDragged(t.id)} onDragEnd={() => setDragged(null)} onClick={() => ticket(t.id)}>
                      <div className="wk-card-t">{t.title}</div>
                      <div className="wk-card-f"><span className="wk-keycell"><TypeIcon type={t.type} say={say} /> {t.key}</span><span className="grow" />{t.dueDate && <span className={`wk-due ${t.dueState === 'overdue' && status !== 'done' ? 'late' : ''}`}>{t.dueDate.slice(8, 10)}/{t.dueDate.slice(5, 7)}</span>}<PriorityIcon priority={t.priority} say={say} /></div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <div className="mw-grid">
        <Block title={say('À valider', 'To sign off')} count={data.signOff.length} tone={data.signOff.length ? 'warn' : undefined}>
          <div className="mw-rows">
            {data.signOff.map((t) => (
              <div key={t.id} className="mw-ticket">
                <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <span className="mono">{t.key}</span></span>
                <button className="linkish mw-title" onClick={() => ticket(t.id)}>{t.title}<span className="small muted"> · {t.assigneeName ?? '—'}</span></button>
                <button className="btn sm primary" disabled={busy === t.id} onClick={() => move(t, { stageId: t.completedStageId }, t.completedStageName)}>{say('Valider', 'Sign off')}</button>
              </div>
            ))}
            {!data.signOff.length && <div className="small muted mw-empty">{say("Rien n'attend votre validation.", 'Nothing waits for your sign-off.')}</div>}
          </div>
        </Block>

        <Block title={say('Mentions et commentaires', 'Mentions and comments')} count={data.mentions.length}>
          <div className="mw-rows">
            {data.mentions.map((m) => (
              <div key={m.id} className="mw-mention">
                <button className="linkish grow" onClick={() => readMention(m, true)}><b>{m.title}</b><div className="small muted">{m.body}</div></button>
                <span className="small muted">{ago(m.at, now, say)}</span>
                <button className="btn sm ghost" onClick={() => readMention(m, false)} title={say('Marquer comme lu', 'Mark as read')} aria-label={say('Marquer comme lu', 'Mark as read')}><Icon name="close" size={12} /></button>
              </div>
            ))}
            {!data.mentions.length && <div className="small muted mw-empty">{say('Aucune mention non lue.', 'No unread mention.')}</div>}
          </div>
        </Block>

        {data.subtasks.length > 0 && (
          <Block title={say('Mes sous-tâches', 'My sub-tasks')} count={data.subtasks.filter((s) => !s.done).length}>
            <div className="mw-rows">
              {data.subtasks.map((s) => (
                <div key={s.id} className="mw-ticket">
                  <input type="checkbox" checked={s.done} onChange={(e) => tick(s.id, e.target.checked)} aria-label={s.title} />
                  <span className={`grow ${s.done ? 'wk-done' : ''}`}>{s.title}</span>
                  <button className="linkish small" onClick={() => s.ticketId && ticket(s.ticketId)}>{s.ticketTitle ?? '—'}</button>
                  <span className="mw-due small">{s.dueDate ? s.dueDate.split('-').reverse().join('/') : ''}</span>
                </div>
              ))}
            </div>
          </Block>
        )}

        <Block title={say('Signalés par moi', 'Reported by me')} count={data.reported.length}>
          <div className="mw-rows">
            {data.reported.map((t) => (
              <div key={t.id} className="mw-ticket">
                <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <span className="mono">{t.key}</span></span>
                <button className="linkish mw-title" onClick={() => ticket(t.id)}>{t.title}</button>
                <Lozenge tone={statusTone(t.status)}>{t.stageName ?? label(STATUS[t.status], t.status, say)}</Lozenge>
                <Avatar name={t.assigneeName} size={22} />
                <span className={`mw-due ${t.dueState === 'overdue' ? 'late' : ''}`}>{t.dueDate ? t.dueDate.split('-').reverse().join('/') : '—'}</span>
              </div>
            ))}
            {!data.reported.length && <div className="small muted mw-empty">{say('Aucun ticket signalé en cours.', 'No open ticket reported by you.')}</div>}
          </div>
        </Block>

        {data.lead.length > 0 && (
          <Block title={say('Sur mes missions', 'On my missions')} count={data.lead.length} tone="warn">
            <div className="mw-rows">
              {data.lead.map(({ ticket: t, reasons }) => (
                <div key={t.id} className="mw-ticket">
                  <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <span className="mono">{t.key}</span></span>
                  <button className="linkish mw-title" onClick={() => ticket(t.id)}>{t.title}<span className="small muted"> · {t.projectName ?? '—'}</span></button>
                  {reasons.map((r) => <span key={r} className={`tag ${r === 'late' ? 'late' : ''}`}>{r === 'unassigned' ? say('Non assigné', 'Unassigned') : r === 'unestimated' ? say('À estimer', 'To estimate') : say('En retard', 'Late')}</span>)}
                  <PriorityIcon priority={t.priority} say={say} />
                </div>
              ))}
            </div>
          </Block>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{say('La charge compte les heures restantes des tickets à rendre cette semaine (ou en retard, ou en cours), pondérées par priorité : urgente ×1,5, haute ×1,25, moyenne ×1, basse ×0,75. Un ticket sans estimation compte 0.', "The load counts the hours left on tickets due this week (or late, or in progress), weighted by priority: urgent ×1.5, high ×1.25, medium ×1, low ×0.75. A ticket without an estimate counts 0.")}</p>
    </div>
  );
}

