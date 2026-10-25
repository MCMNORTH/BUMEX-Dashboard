import { useEffect, useMemo, useState } from 'react';
import { addDays, daysBetween, fmtDate, taskStats, type Id, type Task } from '@bumex/domain';
import { reloadVanguardAction } from '@/lib/erp/vanguard/actions';
import { missionOptionsAction, type MissionOptions } from '@/lib/erp/vanguard/mission-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import type { TaskTicket } from '@/lib/erp/vanguard/tickets';
import { createTicketAction, moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { useStore } from '../store';
import { Chip, D, Field, Icon, Tabs } from '../ui/common';
import { MissionBoard } from './Board';
import { TicketPanel } from './Ticket';
import { useSay } from './say';

// Vanguard's Tasks room on BUMEX One's tickets (lib/erp/vanguard/tickets.ts): the tickets of the floor's missions,
// created and moved with BUMEX One's ticket actions, so its rules hold (who may create, the boards' workflows, only
// the reporter completes) and its notifications go out. Comments, sub-tasks and history are on the ticket's page.

type TicketTask = Task & { ticket: TaskTicket };
type Tab = 'open' | 'mine' | 'overdue' | 'done' | 'all' | 'board';

const NO_DUE_DATE = '9999-12-31';
const ticketOf = (tab?: string | null) => (tab?.startsWith('ticket:') ? tab.slice(7) : null);
export const STATUS: Record<string, [string, string]> = { backlog: ['Backlog', 'Backlog'], todo: ['À faire', 'To do'], in_progress: ['En cours', 'In progress'], review: ['En revue', 'In review'], blocked: ['Bloqué', 'Blocked'], done: ['Terminé', 'Done'] };
export const PRIORITY: Record<string, [string, string]> = { low: ['Basse', 'Low'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'] };
export const TYPES: [string, string, string][] = [['task', 'Tâche', 'Task'], ['bug', 'Anomalie', 'Bug'], ['feature', 'Évolution', 'Feature'], ['support', 'Support', 'Support'], ['client_request', 'Demande client', 'Client request'], ['internal', 'Interne', 'Internal']];
export const label = (pair: [string, string] | undefined, fallback: string, say: (fr: string, en: string) => string) => (pair ? say(pair[0], pair[1]) : fallback);
export const typeLabel = (type: string, say: (fr: string, en: string) => string) => {
  const found = TYPES.find(([key]) => key === type);
  return found ? say(found[1], found[2]) : type;
};

// after a change made in BUMEX One's code: the state again, with the ticket as it now is
export async function reload() {
  const result = await reloadVanguardAction().catch(() => null);
  if (result?.state) useStore.getState().hydrate(result as VanguardData);
}

export function TasksRoom({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, ui, setUi, toast } = useStore();
  const say = useSay();
  // "board:<mission>" opens that mission's board (the mission card's button, vanguard/one/Missions.tsx)
  const boardFor = initialTab?.startsWith('board:') ? initialTab.slice(6) : null;
  const [tab, setTab] = useState<Tab>((boardFor ? 'board' : ['open', 'mine', 'overdue', 'done', 'all', 'board'].includes(initialTab ?? '') ? initialTab : 'open') as Tab);
  // "ticket:<id>" opens that ticket (BUMEX One's /tickets/<id> links, lib/erp/vanguard/retired.ts)
  const [ticketId, setTicketId] = useState<string | null>(ticketOf(initialTab));
  const [seenTab, setSeenTab] = useState(initialTab);
  if (initialTab !== seenTab) {
    setSeenTab(initialTab);
    if (ticketOf(initialTab)) setTicketId(ticketOf(initialTab));
    else if (boardFor) { setTab('board'); setTicketId(null); }
  }
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const stats = useMemo(() => taskStats(state, entityId), [state, entityId]);
  const all = useMemo(() => state.tasks.filter((x) => x.entityId === entityId) as TicketTask[], [state, entityId]);
  const me = state.session.userId;
  const rows = useMemo(() => {
    const open = all.filter((x) => x.status !== 'done');
    const list = tab === 'open' ? open : tab === 'mine' ? open.filter((x) => x.ticket.assignee_id === me) : tab === 'overdue' ? open.filter((x) => x.dueDate < state.today) : tab === 'done' ? all.filter((x) => x.status === 'done') : all;
    return [...list].sort((a, b) => ((a.status === 'done') === (b.status === 'done') ? (a.dueDate < b.dueDate ? -1 : 1) : a.status === 'done' ? 1 : -1));
  }, [all, tab, me, state.today]);
  const selected = all.find((x) => x.id === ui.focusTaskId) ?? null;
  const mission = (task: Task) => state.engagements.find((e) => e.id === task.engagementId);

  const move = async (task: TicketTask, status: 'todo' | 'in_progress' | 'done') => {
    setBusy(task.id);
    try {
      const result = await moveTicketStageAction(task.id, { status });
      if (result.error) toast('error', result.error);
      else toast('ok', `${status === 'done' ? say('Terminée', 'Done') : status === 'in_progress' ? say('En cours', 'In progress') : say('Rouverte', 'Reopened')} · ${task.title}`);
      await reload();
    } catch {
      toast('error', say('Serveur injoignable : la tâche n\'a pas changé.', 'Server unreachable: the task did not change.'));
    } finally {
      setBusy(null);
    }
  };

  const tabs = [
    { id: 'open' as Tab, label: <>{t('tsk_open')} <Chip kind="dim">{stats.active}</Chip></> },
    { id: 'mine' as Tab, label: <>{say('Mes tâches', 'My tasks')} <Chip kind="dim">{all.filter((x) => x.status !== 'done' && x.ticket.assignee_id === me).length}</Chip></> },
    { id: 'overdue' as Tab, label: <>{t('tsk_overdue')} <Chip kind={stats.overdue ? 'crit' : 'good'}>{stats.overdue}</Chip></> },
    { id: 'done' as Tab, label: <>{t('tsk_done')} <Chip kind="good">{stats.done}</Chip></> },
    { id: 'all' as Tab, label: t('tsk_all') },
    { id: 'board' as Tab, label: say('Tableau', 'Board') },
  ];
  const due = (task: Task) => (task.dueDate === NO_DUE_DATE ? '—' : <D iso={task.dueDate} />);
  const actions = (task: TicketTask) => (
    <>
      {task.status === 'todo' && <button className="btn sm" disabled={busy === task.id} onClick={() => move(task, 'in_progress')}>{t('tsk_start')}</button>}
      {task.status !== 'done' && <button className="btn sm primary" disabled={busy === task.id} onClick={() => move(task, 'done')}>{t('tsk_complete')}</button>}
      {task.status === 'done' && <button className="btn sm" disabled={busy === task.id} onClick={() => move(task, 'todo')}>{t('tsk_reopen')}</button>}
    </>
  );

  return (
    <>
      <div className="sheet-head">
        <h1>{t('tsk_title')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="hright"><button className="btn sm primary" onClick={() => setCreating(true)}>{t('tsk_new')}</button></div>
      </div>
      <div className="sheet-body">
        {!ticketId && <div className="grid4">
          <div className="kpi"><div className="l">{t('bar_tasks')} {t('bar_active')}</div><div className="v">{stats.active}</div></div>
          <div className="kpi"><div className="l">{t('bar_progress')}</div><div className="v">{Math.round(stats.progress * 100)} %</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${stats.progress * 100}%` }} /></div></div>
          <div className="kpi"><div className="l">{t('bar_deadlines')} · {t('bar_upcoming')}</div><div className="v">{stats.dueSoon}</div></div>
          <div className="kpi"><div className="l">{t('bar_overdue')}</div><div className="v" style={{ color: stats.overdue ? 'var(--crit)' : undefined }}>{stats.overdue}</div></div>
        </div>}
        {ticketId && <TicketPanel id={ticketId} onClose={() => setTicketId(null)} />}
        {creating && !ticketId && <NewTask entityId={entityId} onDone={() => setCreating(false)} />}
        {!ticketId && <div className="cols">
          <div className="grow">
            {tab === 'board' ? <MissionBoard key={boardFor ?? ''} entityId={entityId} engagementId={boardFor} /> : (
            <div className="card flush">
              <table>
                <thead><tr><th></th><th>{t('label')}</th><th>{t('tsk_engagement')}</th><th>{t('tsk_assignee')}</th><th>{t('tsk_mine')}</th><th>{t('tsk_priority')}</th><th>{t('status')}</th><th></th></tr></thead>
                <tbody>
                  {rows.map((task) => {
                    const late = task.status !== 'done' && task.dueDate < state.today;
                    const eng = mission(task);
                    return (
                      <tr key={task.id} className={`click ${selected?.id === task.id ? 'sel' : ''}`} onClick={() => setUi({ focusTaskId: task.id })}>
                        <td><span className="status-dot" style={{ background: task.status === 'done' ? 'var(--good)' : late ? 'var(--crit)' : task.status === 'in_progress' ? 'var(--blue)' : 'var(--border)' }} /></td>
                        <td style={{ textDecoration: task.status === 'done' ? 'line-through' : undefined, color: task.status === 'done' ? 'var(--muted)' : undefined }}>{task.title}</td>
                        <td className="small">{eng ? <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setUi({ focusEngagementId: eng.id }); useStore.getState().openRoom('missions'); }}>{eng.code}</button> : '—'}</td>
                        <td>{task.assignee}</td>
                        <td style={{ color: late ? 'var(--crit)' : undefined, fontWeight: late ? 600 : 400 }}>{due(task)}{late ? ` · ${-daysBetween(task.dueDate, state.today)} j` : ''}</td>
                        <td><Chip kind={task.priority === 'high' ? 'warn' : 'dim'}>{label(PRIORITY[task.ticket.priority], task.ticket.priority, say)}</Chip></td>
                        <td><Chip kind={task.status === 'done' ? 'good' : task.status === 'in_progress' ? 'warn' : 'dim'}>{label(STATUS[task.ticket.status], task.ticket.status, say)}</Chip></td>
                        <td onClick={(e) => e.stopPropagation()}><div className="toolbar" style={{ justifyContent: 'flex-end' }}>{actions(task)}</div></td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={8} className="muted" style={{ padding: 18 }}>{t('bar_none')}</td></tr>}
                </tbody>
              </table>
            </div>
            )}
          </div>
          {selected && (
            <div className="side">
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0 }}>{t('tsk_detail')}</h2>
                  <button className="btn sm ghost" onClick={() => setUi({ focusTaskId: null })} aria-label={t('close')}><Icon name="close" size={16} /></button>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, margin: '10px 0' }}>{selected.title}</p>
                <div className="kv">
                  <span className="k">{t('status')}</span><span>{label(STATUS[selected.ticket.status], selected.ticket.status, say)}</span>
                  <span className="k">{t('tsk_engagement')}</span><span>{mission(selected)?.name ?? '—'}</span>
                  <span className="k">{t('tsk_assignee')}</span><span>{selected.assignee}</span>
                  <span className="k">{say('Demandeur', 'Reporter')}</span><span>{state.users.find((u) => u.id === selected.ticket.reporter_id)?.name ?? (selected.ticket.reporter_id === me ? state.session.actorName : '—')}</span>
                  <span className="k">{t('tsk_mine')}</span><span className="mono">{selected.dueDate === NO_DUE_DATE ? '—' : fmtDate(selected.dueDate)}</span>
                  <span className="k">{t('tsk_priority')}</span><span>{label(PRIORITY[selected.ticket.priority], selected.ticket.priority, say)}</span>
                  <span className="k">Type</span><span>{typeLabel(selected.ticket.type, say)}</span>
                  <span className="k">{t('tsk_created')}</span><span className="mono">{fmtDate(selected.createdAt)}</span>
                  {selected.customerId && <><span className="k">{t('customer')}</span><span>{state.customers.find((c) => c.id === selected.customerId)?.name}</span></>}
                </div>
                {selected.notes && <div className="banner info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>}
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn sm" onClick={() => setTicketId(selected.id)}>{say('Ouvrir le ticket', 'Open the ticket')}</button>
                  {actions(selected)}
                </div>
              </div>
            </div>
          )}
        </div>}
      </div>
    </>
  );
}

function NewTask({ entityId, onDone }: { entityId: Id; onDone: () => void }) {
  const { state, t, toast, setUi } = useStore();
  const say = useSay();
  const [options, setOptions] = useState<MissionOptions | null>(null);
  const missions = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed' && (e as { projectId?: string }).projectId);
  const [title, setTitle] = useState('');
  const [missionId, setMissionId] = useState(missions[0]?.id ?? '');
  const [assignee, setAssignee] = useState(state.session.userId);
  const [dueDate, setDueDate] = useState(addDays(state.today, 7));
  const [priority, setPriority] = useState('medium');
  const [type, setType] = useState('task');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void missionOptionsAction().then(setOptions); }, []);

  const submit = async () => {
    const mission = missions.find((m) => m.id === missionId) as { projectId?: string } | undefined;
    if (!title.trim() || !mission?.projectId) return;
    const form = new FormData();
    for (const [k, v] of Object.entries({ title: title.trim(), description, project_id: mission.projectId, assignee_id: assignee, reporter_id: state.session.userId, priority, type, due_date: dueDate, create_another: '1' })) form.set(k, v);
    setBusy(true);
    try {
      const result = await createTicketAction({}, form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', t('tsk_create'));
      await reload();
      if (result.created) setUi({ focusTaskId: result.created.id });
      onDone();
    } catch {
      toast('error', say('Serveur injoignable : la tâche n\'est pas créée.', 'Server unreachable: the task was not created.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('tsk_new')}</h2>
      {!missions.length ? (
        <div className="banner info">{say("Une tâche se rattache à une mission : créez d'abord une mission dans la salle Missions.", 'A task belongs to a mission: create a mission in the Missions room first.')}</div>
      ) : (
        <div className="grid4">
          <Field label={t('label')} style={{ gridColumn: 'span 2' }}><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tsk_title_ph')} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
          <Field label={t('tsk_engagement')} style={{ gridColumn: 'span 2' }}><select className="in" value={missionId} onChange={(e) => setMissionId(e.target.value)}>{missions.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
          <Field label={t('tsk_assignee')}><select className="in" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">—</option>{(options?.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label={t('tsk_mine')}><input className="in" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label={t('tsk_priority')}><select className="in" value={priority} onChange={(e) => setPriority(e.target.value)}>{Object.entries(PRIORITY).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</select></Field>
          <Field label="Type"><select className="in" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</select></Field>
          <Field label={t('tsk_notes')} style={{ gridColumn: 'span 4' }}><input className="in" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      )}
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={onDone}>{t('close')}</button>
        {missions.length > 0 && <button className="btn sm primary" disabled={busy || !title.trim()} onClick={submit}>{busy ? say('Création…', 'Creating…') : t('tsk_create')}</button>}
      </div>
    </div>
  );
}
