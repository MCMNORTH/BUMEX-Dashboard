import { useEffect, useMemo, useState } from 'react';
import { taskStats, createTask, startTask, completeTask, reopenTask, addDays, fmtDate, daysBetween, type Id, type Task, type TaskPriority } from '@bumex/domain';
import { useStore, MODULE_ROOM } from '../../store';
import type { Room } from '../../i18n';
import { Tabs, Chip, Field, D, Icon, DeleteButton } from '../common';
import { Select } from '../Select';

type Tab = 'open' | 'overdue' | 'done' | 'all';
const MODULES = ['missions', 'clients', 'accounting', 'bank', 'suppliers', 'assets', 'closing', 'archives', 'tax', 'hr', 'penthouse'];

export function TasksPanel({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, apply, ui, setUi, openRoom } = useStore();
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'open');
  useEffect(() => { if (initialTab) setTab(initialTab as Tab); }, [initialTab]);
  const [creating, setCreating] = useState(false);
  const stats = useMemo(() => taskStats(state, entityId), [state, entityId]);
  const all = useMemo(() => state.tasks.filter((x) => x.entityId === entityId), [state, entityId]);
  const rows = useMemo(() => {
    const open = all.filter((x) => x.status !== 'done');
    const list = tab === 'open' ? open : tab === 'overdue' ? open.filter((x) => x.dueDate < state.today) : tab === 'done' ? all.filter((x) => x.status === 'done') : all;
    return [...list].sort((a, b) => (a.status === 'done') === (b.status === 'done') ? (a.dueDate < b.dueDate ? -1 : 1) : a.status === 'done' ? 1 : -1);
  }, [all, tab, state.today]);
  const selected = all.find((x) => x.id === ui.focusTaskId) ?? null;
  const tabs = [
    { id: 'open' as Tab, label: <>{t('tsk_open')} <Chip kind="dim">{stats.active}</Chip></> },
    { id: 'overdue' as Tab, label: <>{t('tsk_overdue')} <Chip kind={stats.overdue ? 'crit' : 'good'}>{stats.overdue}</Chip></> },
    { id: 'done' as Tab, label: <>{t('tsk_done')} <Chip kind="good">{stats.done}</Chip></> },
    { id: 'all' as Tab, label: t('tsk_all') },
  ];
  const moduleLabel = (m: string) => (t(`room_${m}`) === `room_${m}` ? (m === 'closing' ? t('tab_closing') : m === 'archives' ? t('nav_archives') : m) : t(`room_${m}`));
  const openLinked = (task: Task) => {
    const room = (task.module === 'closing' ? 'accounting' : task.module) as Room;
    if (task.engagementId) setUi({ focusEngagementId: task.engagementId });
    if (ui.view === 'floor') { const target = MODULE_ROOM[room] ?? room; if (!['tasks', 'reports', 'settings', 'penthouse'].includes(target as string)) useStore.getState().focusRoom(target as string); }
    openRoom(room, task.module === 'closing' ? 'closing' : null);
  };
  return (
    <>
      <div className="sheet-head">
        <h1>{t('tsk_title')}</h1>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="hright"><button className="btn sm primary" onClick={() => setCreating(true)}>{t('tsk_new')}</button></div>
      </div>
      <div className="sheet-body">
        <div className="grid4">
          <div className="kpi"><div className="l">{t('bar_tasks')} {t('bar_active')}</div><div className="v">{stats.active}</div></div>
          <div className="kpi"><div className="l">{t('bar_progress')}</div><div className="v">{Math.round(stats.progress * 100)} %</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${stats.progress * 100}%` }} /></div></div>
          <div className="kpi"><div className="l">{t('bar_deadlines')} · {t('bar_upcoming')}</div><div className="v">{stats.dueSoon}</div></div>
          <div className="kpi"><div className="l">{t('bar_overdue')}</div><div className="v" style={{ color: stats.overdue ? 'var(--crit)' : undefined }}>{stats.overdue}</div></div>
        </div>
        {creating && <NewTask entityId={entityId} onDone={() => setCreating(false)} />}
        <div className="cols">
          <div className="grow">
            <div className="card flush">
              <table>
                <thead><tr><th></th><th>{t('label')}</th><th>{t('tsk_module')}</th><th>{t('tsk_engagement')}</th><th>{t('tsk_assignee')}</th><th>{t('tsk_mine')}</th><th>{t('tsk_priority')}</th><th>{t('status')}</th><th></th></tr></thead>
                <tbody>
                  {rows.map((task) => {
                    const late = task.status !== 'done' && task.dueDate < state.today;
                    const eng = task.engagementId ? state.engagements.find((e) => e.id === task.engagementId) : null;
                    return (
                      <tr key={task.id} className={`click ${selected?.id === task.id ? 'sel' : ''}`} onClick={() => setUi({ focusTaskId: task.id })}>
                        <td><span className="status-dot" style={{ background: task.status === 'done' ? 'var(--good)' : late ? 'var(--crit)' : task.status === 'in_progress' ? 'var(--blue)' : 'var(--border)' }} /></td>
                        <td style={{ textDecoration: task.status === 'done' ? 'line-through' : undefined, color: task.status === 'done' ? 'var(--muted)' : undefined }}>{task.title}</td>
                        <td><Chip kind="dim">{moduleLabel(task.module)}</Chip></td>
                        <td className="small">{eng ? <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); openLinked(task); }}>{eng.code}</button> : '—'}</td>
                        <td>{task.assignee}</td>
                        <td style={{ color: late ? 'var(--crit)' : undefined, fontWeight: late ? 600 : 400 }}><D iso={task.dueDate} />{late ? ` · ${-daysBetween(task.dueDate, state.today)} j` : ''}</td>
                        <td><Chip kind={task.priority === 'high' ? 'warn' : 'dim'}>{t(`tsk_${task.priority}`)}</Chip></td>
                        <td><Chip kind={task.status === 'done' ? 'good' : task.status === 'in_progress' ? 'warn' : 'dim'}>{task.status === 'done' ? t('tsk_done_s') : task.status === 'in_progress' ? t('tsk_in_progress') : t('tsk_todo')}</Chip></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                            {task.status === 'todo' && <button className="btn sm" onClick={() => apply((s) => startTask(s, task.id))}>{t('tsk_start')}</button>}
                            {task.status !== 'done' && <button className="btn sm primary" onClick={() => apply((s) => completeTask(s, task.id), `${t('tsk_done_s')} · ${task.title}`)}>{t('tsk_complete')}</button>}
                            {task.status === 'done' && <button className="btn sm" onClick={() => apply((s) => reopenTask(s, task.id))}>{t('tsk_reopen')}</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>{t('bar_none')}</td></tr>}
                </tbody>
              </table>
            </div>
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
                  <span className="k">{t('status')}</span><span>{selected.status === 'done' ? t('tsk_done_s') : selected.status === 'in_progress' ? t('tsk_in_progress') : t('tsk_todo')}</span>
                  <span className="k">{t('tsk_module')}</span><span>{moduleLabel(selected.module)}</span>
                  <span className="k">{t('tsk_assignee')}</span><span>{selected.assignee}</span>
                  <span className="k">{t('tsk_mine')}</span><span className="mono">{fmtDate(selected.dueDate)}</span>
                  <span className="k">{t('tsk_priority')}</span><span>{t(`tsk_${selected.priority}`)}</span>
                  <span className="k">{t('tsk_created')}</span><span className="mono">{fmtDate(selected.createdAt)}</span>
                  {selected.completedAt && <><span className="k">{t('tsk_completed')}</span><span className="mono">{fmtDate(selected.completedAt)}</span></>}
                  {selected.engagementId && <><span className="k">{t('tsk_engagement')}</span><span>{state.engagements.find((e) => e.id === selected.engagementId)?.name}</span></>}
                  {selected.customerId && <><span className="k">{t('customer')}</span><span>{state.customers.find((c) => c.id === selected.customerId)?.name}</span></>}
                </div>
                {selected.notes && <div className="banner info" style={{ marginTop: 10 }}>{selected.notes}</div>}
                <div className="actions" style={{ marginTop: 12 }}>
                  <DeleteButton table="task" rowId={selected.id} label={`Tâche · ${selected.title}`} entityId={selected.entityId} />
                  {(selected.engagementId || selected.module !== 'tasks') && <button className="btn sm" onClick={() => openLinked(selected)}>{t('open_module')}</button>}
                  {selected.status !== 'done' ? <button className="btn sm primary" onClick={() => apply((s) => completeTask(s, selected.id), `${t('tsk_done_s')} · ${selected.title}`)}>{t('tsk_complete')}</button> : <button className="btn sm" onClick={() => apply((s) => reopenTask(s, selected.id))}>{t('tsk_reopen')}</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function NewTask({ entityId, onDone }: { entityId: Id; onDone: () => void }) {
  const { state, t, apply } = useStore();
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('missions');
  const [assignee, setAssignee] = useState(state.session.actorName);
  const [due, setDue] = useState(addDays(state.today, 7));
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [engagementId, setEngagementId] = useState('');
  const [notes, setNotes] = useState('');
  const engs = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed');
  const submit = () => {
    if (apply((s) => createTask(s, { entityId, title, module, assignee, dueDate: due, priority, engagementId: engagementId || undefined, notes: notes || undefined }), t('tsk_create'))) onDone();
  };
  return (
    <div className="card">
      <h2>{t('tsk_new')}</h2>
      <div className="grid4">
        <Field label={t('label')} style={{ gridColumn: 'span 2' }}><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tsk_title_ph')} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
        <Field label={t('tsk_module')}><Select className="in" value={module} onChange={(e) => setModule(e.target.value)}>{MODULES.map((m) => <option key={m} value={m}>{t(`room_${m}`) === `room_${m}` ? (m === 'closing' ? t('tab_closing') : t('nav_archives')) : t(`room_${m}`)}</option>)}</Select></Field>
        <Field label={t('tsk_assignee')}><input className="in" value={assignee} onChange={(e) => setAssignee(e.target.value)} /></Field>
        <Field label={t('tsk_mine')}><input className="in" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label={t('tsk_priority')}><Select className="in" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}><option value="low">{t('tsk_low')}</option><option value="normal">{t('tsk_normal')}</option><option value="high">{t('tsk_high')}</option></Select></Field>
        <Field label={t('tsk_engagement')} style={{ gridColumn: 'span 2' }}><Select className="in" value={engagementId} onChange={(e) => setEngagementId(e.target.value)}><option value="">—</option>{engs.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</Select></Field>
        <Field label={t('tsk_notes')} style={{ gridColumn: 'span 4' }}><input className="in" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={onDone}>{t('close')}</button>
        <button className="btn sm primary" disabled={!title.trim()} onClick={submit}>{t('tsk_create')}</button>
      </div>
    </div>
  );
}
