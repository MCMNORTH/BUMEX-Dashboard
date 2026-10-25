import { useMemo } from 'react';
import { taskStats, recentActivity, alerts, canUseModule, fmtDate, daysBetween, type Task } from '@bumex/domain';
import { useStore, MODULE_ROOM } from '../store';
import type { Room } from '../i18n';
import { Icon } from './common';

// The operational bar: every figure is computed by the engine for the current scope (the selected floor's entity,
// or the whole group from the exterior). Each segment opens the view where the figure is handled.

function Ring({ value }: { value: number }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 34 34" aria-hidden="true">
      <circle className="bg" cx="17" cy="17" r={r} />
      <circle className="fg" cx="17" cy="17" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} transform="rotate(-90 17 17)" />
    </svg>
  );
}

export function CommandBar() {
  const { state, ui, t, setUi, openRoom, goFloor } = useStore();
  const scopeEntity = ui.view === 'tower' ? null : ui.entityId;
  const entity = scopeEntity ? state.entities.find((e) => e.id === scopeEntity) : null;
  const ts = useMemo(() => taskStats(state, scopeEntity), [state, scopeEntity]);
  const al = useMemo(() => alerts(state, scopeEntity).filter((a) => canUseModule(state, a.module)), [state, scopeEntity]);
  const act = useMemo(() => recentActivity(state, scopeEntity, 8), [state, scopeEntity]);
  const open = ui.barOpen;
  const dueSoonTasks = ts.nextDeadlines.filter((x) => x.dueDate <= addDaysIso(state.today, 7));
  const openTasks = (tab: string, taskId?: string) => {
    if (taskId) setUi({ focusTaskId: taskId });
    if (ui.view === 'tower') setUi({ view: 'floor', transition: 'to-floor', focusRoom: 'missions', room: 'tasks', tab, entityId: ui.entityId });
    else openRoom('tasks', tab);
  };
  const openModule = (room: Room, entityId?: string | null) => {
    const eid = entityId ?? ui.entityId;
    const e = state.entities.find((x) => x.id === eid);
    const target = e?.isHolding && !['tasks', 'reports', 'settings'].includes(room) ? 'penthouse' : room;
    if (ui.view === 'tower' || (eid && eid !== ui.entityId)) {
      if (eid && eid !== ui.entityId) goFloor(eid);
      setUi({ view: ui.view === 'flat' ? 'flat' : 'floor', transition: 'to-floor', focusRoom: MODULE_ROOM[target] ?? target, room: target, tab: null, rackFocus: target === 'archives' });
    } else openRoom(target);
  };
  const dayLabel = (iso: string) => {
    if (iso >= '9999') return '—'; // [bumex-one] a ticket with no due date
    const d = daysBetween(state.today, iso);
    return d === 0 ? "auj." : d === 1 ? 'demain' : d < 0 ? `${-d} j de retard` : `J+${d}`;
  };
  const TaskRow = ({ task }: { task: Task }) => (
    <button className={`task-row ${task.status === 'done' ? 'done' : ''}`} onClick={() => openTasks('all', task.id)}>
      <span className={`dot ${task.status === 'done' ? 'done' : task.dueDate < state.today ? 'crit' : task.dueDate <= addDaysIso(state.today, 3) ? 'warn' : ''}`} />
      <span className="t">{task.title}</span>
      <span className="d">{dayLabel(task.dueDate)}</span>
    </button>
  );
  const last = act[0];
  return (
    <div className={`cmdbar ${open ? 'open' : ''}`} role="region" aria-label="Barre de pilotage">
      <div className="strip">
        <button className="cmd-seg scope" onClick={() => (entity ? setUi({ view: 'floor', room: null, focusRoom: null, rackFocus: false }) : setUi({ barOpen: !open }))} title={entity ? entity.activity : t('bar_scope_group')}>
          <Icon name={entity ? 'floors' : 'overview'} />
          <span><span className="k">{entity ? t('current_floor') : t('bar_scope_group')}</span><br /><span className="v">{entity ? entity.name : state.group.name}</span></span>
        </button>
        <button className={`cmd-seg ${ui.room === 'tasks' ? 'on' : ''}`} onClick={() => openTasks('open')}>
          <Icon name="tasks" />
          <span><span className="k">{t('bar_tasks')}</span><br /><span className="v">{String(ts.active).padStart(2, '0')}</span> <span className="s">{t('bar_active')} · {ts.inProgress} {t('tsk_in_progress').toLowerCase()}</span></span>
        </button>
        <button className="cmd-seg" onClick={() => openTasks('all')}>
          <Ring value={ts.progress} />
          <span><span className="k">{t('bar_progress')}</span><br /><span className="v">{Math.round(ts.progress * 100)} %</span> <span className="s">{ts.done} / {ts.total} {t('bar_done_of')}</span></span>
        </button>
        <button className="cmd-seg" onClick={() => openModule('missions')}>
          <Icon name="missions" />
          <span><span className="k">{t('bar_engagements')}</span><br /><span className="v">{String(ts.engagementsOngoing).padStart(2, '0')}</span> <span className="s">{t('bar_ongoing')}{ts.engagementsPlanned ? ` · ${ts.engagementsPlanned} ${t('tsk_todo').toLowerCase()}` : ''}{ts.engagementsLate ? ` · ${ts.engagementsLate} ${t('late_eng').toLowerCase()}` : ''}</span></span>
        </button>
        <button className="cmd-seg" onClick={() => setUi({ barOpen: true, barTab: 'deadlines' })}>
          <Icon name="clock" />
          <span><span className="k">{t('bar_deadlines')}</span><br /><span className={`v ${dueSoonTasks.length ? 'warn' : ''}`}>{String(dueSoonTasks.length).padStart(2, '0')}</span> <span className="s">{t('bar_upcoming')} · {ts.engagementDeadlines.length} missions à 30 j</span></span>
        </button>
        <button className="cmd-seg" onClick={() => openTasks('overdue')}>
          <Icon name="flag" />
          <span><span className="k">{t('bar_overdue')}</span><br /><span className={`v ${ts.overdue ? 'crit' : 'good'}`}>{String(ts.overdue).padStart(2, '0')}</span> <span className="s">{t('bar_overdue_s')}</span></span>
        </button>
        <button className="cmd-seg act" onClick={() => setUi({ barOpen: true, barTab: 'activity' })}>
          <Icon name="activity" />
          <span style={{ minWidth: 0 }}><span className="k">{t('bar_activity')}</span><br /><span className="v">{last ? humanize(last.summary) : t('bar_none')}</span> <span className="s">{last ? timeAgo(last.at, ui.lang) : ''}</span></span>
        </button>
        <button className="cmd-seg" onClick={() => setUi({ barOpen: true, barTab: 'alerts' })}>
          <Icon name="alert" />
          <span><span className="k">{t('bar_alerts')}</span><br /><span className={`v ${al.some((a) => a.kind === 'crit') ? 'crit' : al.length ? 'warn' : 'good'}`}>{String(al.length).padStart(2, '0')}</span> <span className="s">{al.filter((a) => a.kind === 'crit').length} crit.</span></span>
        </button>
        <button className="cmd-seg toggle" onClick={() => setUi({ barOpen: !open })} aria-expanded={open} aria-label={open ? t('collapse') : t('expand')}>
          <Icon name={open ? 'chevronDown' : 'chevronUp'} />
        </button>
      </div>
      {open && (
        <div className="drawer">
          <section>
            <h4>{t('tsk_open')} · {ts.active}<button onClick={() => openTasks('open')}>{t('bar_all')} →</button></h4>
            {ts.nextDeadlines.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} />)}
            {!ts.nextDeadlines.length && <div className="small muted">{t('bar_none')}</div>}
          </section>
          <section>
            <h4>{t('bar_next')} · {t('bar_engagements').toLowerCase()}<button onClick={() => openModule('missions')}>{t('bar_all')} →</button></h4>
            {ts.engagementDeadlines.slice(0, 8).map((d) => (
              <button key={d.id} className="task-row" onClick={() => { setUi({ focusEngagementId: d.id }); openModule('missions'); }}>
                <span className={`dot ${d.late ? 'crit' : daysBetween(state.today, d.deadline) <= 7 ? 'warn' : ''}`} />
                <span className="t">{d.name}</span>
                <span className="d">{dayLabel(d.deadline)}</span>
              </button>
            ))}
            {!ts.engagementDeadlines.length && <div className="small muted">{t('bar_none')}</div>}
          </section>
          <section>
            <h4>{ui.barTab === 'alerts' ? t('bar_alerts') : t('bar_recent')}<button onClick={() => setUi({ barTab: ui.barTab === 'alerts' ? 'activity' : 'alerts' })}>{ui.barTab === 'alerts' ? t('bar_activity') : t('bar_alerts')} →</button></h4>
            {ui.barTab === 'alerts'
              ? al.slice(0, 8).map((a, i) => (
                  <button key={i} className="task-row" onClick={() => openModule(a.module as Room, a.entityId)}>
                    <span className={`dot ${a.kind === 'crit' ? 'crit' : a.kind === 'warn' ? 'warn' : ''}`} />
                    <span className="t">{a.text}{!entity && a.entityId ? ` · ${state.entities.find((e) => e.id === a.entityId)?.name}` : ''}</span>
                    <span className="d">{t(`room_${a.module}`) === `room_${a.module}` ? t(`nav_${a.module}`) : t(`room_${a.module}`)}</span>
                  </button>
                ))
              : act.map((r, i) => (
                  <div key={i} className="task-row" style={{ cursor: 'default' }}>
                    <span className="dot" />
                    <span className="t">{humanize(r.summary)}</span>
                    <span className="d">{timeAgo(r.at, ui.lang)}</span>
                  </div>
                ))}
            {ui.barTab === 'alerts' && !al.length && <div className="small muted">{t('bar_none')}</div>}
          </section>
        </div>
      )}
    </div>
  );
}

const STATUS_WORDS: Record<string, string> = { soft_closed: 'clôture douce', locked: 'verrouillée', open: 'ouverte' };
function humanize(summary: string): string {
  return summary.replace(/→ (soft_closed|locked|open)/, (_, w: string) => `→ ${STATUS_WORDS[w] ?? w}`);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeAgo(at: string, lang: 'fr' | 'en'): string {
  const ms = Date.now() - Date.parse(at);
  const m = Math.round(ms / 60000);
  if (m < 1) return lang === 'fr' ? "à l'instant" : 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} j`;
}
