import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmt } from '@bumex/domain';
import { floorCode } from '@/lib/erp/vanguard/floors';
import { roadmapAction, type RoadmapLane } from '@/lib/erp/vanguard/calendar-actions';
import { projectViewAction, type ProjectView } from '@/lib/erp/vanguard/project-actions';
import { removeProjectAction } from '@/app/(app)/projects/actions';
import { addProjectMemberAction, removeProjectMemberAction } from '@/app/(app)/projects/member-actions';
import { useStore } from '../store';
import { D, Icon, Tabs } from '../ui/common';
import { Comments, Notes, type Result, type Say, when } from './Conversation';
import { MILESTONE_STATUS } from './Milestones';
import { MissionForm, PRIORITIES, dueIn, kindLabel, missionPriority, missionStatus, type Mission } from './Missions';
import { StageLozenge } from './stages';
import { reload, type TicketTask } from './Tasks';
import { WorkflowEditor } from './Workflow';
import { useSay } from './say';
import { Avatar, Lozenge, PriorityIcon, TypeIcon, hoursText, statusTone } from './work-ui';
import { Select } from '../ui/Select';

// A mission's page in the Missions room (redrawn on 2026-10-28, laid out as a ticket's page): its name and state on top,
// then its figures, description, tickets and milestones, with its details and alerts on the side; its team, notes,
// conversation, board's statuses and rules (vanguard/one/Workflow.tsx) and history in tabs. Its form is the Missions
// room's (vanguard/one/Missions.tsx).

type Tab = 'overview' | 'team' | 'notes' | 'comments' | 'rules' | 'history';
type TicketScope = 'open' | 'late' | 'done' | 'all';

const HEALTH: Record<string, [string, string, 'good' | 'warn' | 'crit']> = {
  healthy: ['Saine', 'Healthy', 'good'],
  warning: ['À surveiller', 'Warning', 'warn'],
  at_risk: ['À risque', 'At risk', 'crit'],
  delayed: ['En retard', 'Delayed', 'crit'],
};
const BREAKDOWN: [keyof ProjectView['project']['statusBreakdown'], string, string][] = [['backlog', 'En attente', 'Backlog'], ['todo', 'À faire', 'To do'], ['in_progress', 'En cours', 'In progress'], ['review', 'En revue', 'Review'], ['blocked', 'Bloqué', 'Blocked'], ['done', 'Terminé', 'Done']];
const NO_DUE_DATE = '9999-12-31';
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const pair = <T extends string>(list: [T, string, string][], key: string, say: Say) => {
  const found = list.find(([k]) => k === key);
  return found ? say(found[1], found[2]) : key;
};

export function MissionPanel({ projectId, initialTab, onClose }: { projectId: string; initialTab?: Tab; onClose: () => void }) {
  const { state, toast, openRoom } = useStore();
  const say = useSay();
  const [view, setView] = useState<ProjectView | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setView(await projectViewAction(projectId).catch(() => null)), [projectId]);
  useEffect(() => {
    let live = true;
    projectViewAction(projectId).catch(() => null).then((next) => { if (live) setView(next); });
    return () => { live = false; };
  }, [projectId]);

  const run = async (work: () => Promise<Result | void>, done?: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (result && result.error) { toast('error', result.error); return false; }
      if (done) toast('ok', done);
      await Promise.all([load(), reload()]);
      return true;
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined) return <div className="mp-loading"><span className="muted">{say('Chargement de la mission…', 'Loading the mission…')}</span></div>;
  if (view === null) {
    return (
      <div className="card">
        <div className="banner warn">{say("Cette mission n'existe plus ou ne vous est pas accessible.", 'This mission no longer exists or is not open to you.')}</div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour aux missions', 'Back to the missions')}</button></div>
      </div>
    );
  }

  const { project } = view;
  const engagement = (state.engagements as Mission[]).find((e) => e.projectId === project.id);
  const health = HEALTH[project.health] ?? HEALTH.healthy;
  const [statusLabel, missionTone] = missionStatus(project.status === 'draft' ? 'planned' : project.status, say);
  const priority = missionPriority(project.priority);
  const remove = async () => {
    if (!window.confirm(say(`Supprimer la mission « ${project.name} » et ses tickets ?`, `Delete the mission "${project.name}" and its tickets?`))) return;
    if (await run(() => removeProjectAction(project.id), say('Mission supprimée', 'Mission deleted'))) onClose();
  };
  const tabs = [
    { id: 'overview' as Tab, label: say("Vue d'ensemble", 'Overview') },
    { id: 'team' as Tab, label: <>{say('Équipe', 'Team')} <span className="tk-count">{view.members.length}</span></> },
    { id: 'notes' as Tab, label: <>{say('Notes', 'Notes')} <span className="tk-count">{view.notes.filter((n) => !n.archived_at).length}</span></> },
    { id: 'comments' as Tab, label: <>{say('Commentaires', 'Comments')} <span className="tk-count">{view.comments.length}</span></> },
    { id: 'rules' as Tab, label: say('Statuts et règles', 'Statuses and rules') },
    { id: 'history' as Tab, label: say('Historique', 'History') },
  ];

  return (
    <div className="mp">
      <div className="tk-top">
        <nav className="tk-crumbs" aria-label={say('Fil d’Ariane', 'Breadcrumb')}>
          <button className="linkish" onClick={onClose}><Icon name="back" size={13} /> {say('Missions', 'Missions')}</button>
          {engagement && <><span>/</span><span className="mono">{engagement.code}</span></>}
        </nav>
        <div className="tk-top-actions">
          {engagement && <button className="btn sm" onClick={() => openRoom('tasks', `board:${engagement.id}`)}><Icon name="tasks" size={13} /> {say('Tableau', 'Board')}</button>}
          {view.canEdit && engagement && <button className="btn sm" onClick={() => setEditing(true)}>{say('Modifier', 'Edit')}</button>}
          {view.canDelete && <button className="btn sm ghost danger" disabled={busy} onClick={remove}>{say('Supprimer', 'Delete')}</button>}
        </div>
      </div>
      <header className="mp-head">
        <h1 className="mp-title">{project.name}</h1>
        <div className="mp-chips">
          <Lozenge tone={missionTone}>{statusLabel}</Lozenge>
          <span className={`mp-health ${health[2]}`}><i />{say(health[0], health[1])}</span>
          {priority && <span className="tag"><PriorityIcon priority={priority} say={say} /> {pair(PRIORITIES, project.priority ?? '', say)}</span>}
          <span className="tag dim">{kindLabel(project.project_kind, say)}</span>
          {project.client?.name && <span className="tag dim">{project.client.name}</span>}
        </div>
      </header>
      <div className="mp-tabs"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>

      {editing && engagement && <MissionForm entityId={engagement.entityId} projectId={project.id} onClose={(saved) => { setEditing(false); if (saved) void load(); }} />}

      {tab === 'overview' && <Overview view={view} engagement={engagement} say={say} onTab={setTab} />}
      {tab === 'team' && <Team view={view} busy={busy} run={run} say={say} />}
      {tab === 'notes' && <Notes entityType="project" entityId={project.id} notes={view.notes} role={view.role} me={view.me} busy={busy} run={run} say={say} />}
      {tab === 'comments' && <Comments entityType="project" entityId={project.id} comments={view.comments} people={view.people} role={view.role} me={view.me} canComment={view.canComment} busy={busy} run={run} say={say} />}
      {tab === 'rules' && <WorkflowEditor projectId={project.id} />}
      {tab === 'history' && (
        <div className="mp-history">
          {view.history.map((h) => (
            <div key={h.id} className="mp-event">
              <Avatar name={h.who || null} size={28} />
              <div className="grow">
                <div><b>{h.who || say('Système', 'System')}</b> <span className="muted">· {h.action}</span></div>
                {h.detail && <div className="small muted">{h.detail}</div>}
              </div>
              <span className="small muted mono">{when(h.at)}</span>
            </div>
          ))}
          {!view.history.length && <div className="ms-empty"><b>{say('Aucune activité enregistrée.', 'No activity recorded.')}</b></div>}
        </div>
      )}
    </div>
  );
}

function Overview({ view, engagement, say, onTab }: { view: ProjectView; engagement: Mission | undefined; say: Say; onTab: (t: Tab) => void }) {
  const { state, openRoom } = useStore();
  const { project } = view;
  const today = state.today;
  const [scope, setScope] = useState<TicketScope>('open');
  const [lane, setLane] = useState<RoadmapLane | null | undefined>(undefined);
  const loadedAt = useStore((s) => s.loadedAt);
  useEffect(() => {
    let live = true;
    roadmapAction().then((d) => live && setLane(d.lanes.find((l) => l.id === project.id) ?? null)).catch(() => live && setLane(null));
    return () => { live = false; };
  }, [project.id, loadedAt]);

  // the state's tickets of the mission (key, stage, assignee); a mission of another floor shows its preview
  const tickets = useMemo(() => (engagement ? (state.tasks.filter((x) => x.engagementId === engagement.id && 'ticket' in x) as TicketTask[]) : []), [state.tasks, engagement]);
  const rows = engagement
    ? tickets.map((x) => ({ id: x.id, title: x.title, key: x.ticket.key, type: x.ticket.type, status: x.ticket.status ?? x.status, stage: x.ticket.stage_name, priority: x.ticket.priority, assignee: x.ticket.assignee_id ? x.assignee : null, due: x.dueDate === NO_DUE_DATE ? null : x.dueDate, done: x.status === 'done' }))
    : project.tasks.map((t) => ({ id: t.id, title: t.title, key: null, type: 'task', status: t.status, stage: null, priority: t.priority, assignee: null, due: t.due_date?.slice(0, 10) ?? null, done: t.status === 'done' }));
  const late = rows.filter((r) => !r.done && r.due && r.due < today);
  const shown = rows
    .filter((r) => (scope === 'all' ? true : scope === 'done' ? r.done : scope === 'late' ? !r.done && r.due && r.due < today : !r.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? NO_DUE_DATE).localeCompare(b.due ?? NO_DUE_DATE));
  const total = Object.entries(project.statusBreakdown).filter(([k]) => k !== 'archived').reduce((s, [, n]) => s + n, 0);
  const due = project.status === 'completed' ? null : dueIn(project.end_date, today, say);
  const estimated = Math.round(tickets.reduce((s, x) => s + Number(x.ticket.estimated_hours ?? 0), 0) * 10) / 10;
  const ticket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const milestones = (lane?.milestones ?? []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const priority = missionPriority(project.priority);

  return (
    <div className="tk-grid">
      <div className="tk-main">
        <div className="ov-figs">
          <div className="ov-fig">
            <span className="ov-fig-v">{project.progress} %</span><span className="ov-fig-l">{say('Avancement', 'Progress')}</span>
            <span className="ms-progress-bar mp-fig-bar"><i style={{ width: `${Math.min(100, project.progress)}%` }} /></span>
          </div>
          <div className="ov-fig"><span className="ov-fig-v">{project.completedTasks} / {project.totalTasks}</span><span className="ov-fig-l">{say('Tickets terminés', 'Tickets done')}</span></div>
          <div className={`ov-fig ${due?.late ? 'crit' : due?.soon ? 'warn' : ''}`}>
            <span className="ov-fig-v mp-fig-date">{dmy(project.end_date)}</span><span className="ov-fig-l">{say('Échéance', 'Deadline')}{due ? ` · ${due.text}` : ''}</span>
          </div>
          <div className={`ov-fig ${engagement && engagement.budgetHours > 0 && engagement.actualHours > engagement.budgetHours ? 'crit' : ''}`}>
            <span className="ov-fig-v">{engagement ? hoursText(engagement.actualHours, say) : '—'}</span>
            <span className="ov-fig-l">{say('saisies', 'logged')}{engagement?.budgetHours ? ` · ${say('budget', 'budget')} ${Math.round(engagement.budgetHours)} h` : ''}{estimated ? ` · ${say('estimé', 'estimated')} ${estimated} h` : ''}</span>
          </div>
        </div>

        {project.description && (
          <section className="tk-sec">
            <div className="tk-sec-h"><h2>Description</h2></div>
            <div className="mp-desc">{project.description}</div>
          </section>
        )}

        <section className="tk-sec">
          <div className="tk-sec-h">
            <h2>{say('Tickets', 'Tickets')}</h2><span className="tk-count">{rows.length}</span>
            <div className="tk-sec-x">
              <div className="seg-mini">
                {([['open', say('Ouverts', 'Open')], ['late', `${say('En retard', 'Late')}${late.length ? ` · ${late.length}` : ''}`], ['done', say('Terminés', 'Done')], ['all', say('Tous', 'All')]] as [TicketScope, string][]).map(([k, label]) => (
                  <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{label}</button>
                ))}
              </div>
              {engagement && <button className="btn sm" onClick={() => openRoom('tasks', `board:${engagement.id}`)}><Icon name="tasks" size={13} /> {say('Tableau', 'Board')}</button>}
            </div>
          </div>
          {total > 0 && (
            <div className="mp-split">
              <div className="mp-split-bar" role="img" aria-label={BREAKDOWN.map(([k, fr, en]) => `${say(fr, en)} ${project.statusBreakdown[k]}`).join(', ')}>
                {BREAKDOWN.map(([k]) => project.statusBreakdown[k] > 0 && <i key={k} className={statusTone(k)} style={{ flexGrow: project.statusBreakdown[k] }} />)}
              </div>
              <div className="mp-split-legend">
                {BREAKDOWN.filter(([k]) => project.statusBreakdown[k] > 0).map(([k, fr, en]) => <span key={k}><i className={statusTone(k)} />{say(fr, en)} <b>{project.statusBreakdown[k]}</b></span>)}
              </div>
            </div>
          )}
          <div className="mp-tickets">
            {shown.slice(0, 40).map((r) => (
              <button key={r.id} className={`mp-ticket ${r.done ? 'done' : ''}`} onClick={() => ticket(r.id)}>
                <TypeIcon type={r.type ?? 'task'} say={say} />
                {r.key && <span className="tk-key mono">{r.key}</span>}
                <span className="mp-ticket-t">{r.title}</span>
                <StageLozenge name={r.stage} status={r.status} />
                {r.priority && <PriorityIcon priority={r.priority} say={say} />}
                <span className={`mp-ticket-due mono ${!r.done && r.due && r.due < today ? 'ms-late' : ''}`}>{r.due ? dmy(r.due) : ''}</span>
                <Avatar name={r.assignee} size={22} />
              </button>
            ))}
            {shown.length > 40 && engagement && <button className="linkish small" onClick={() => openRoom('tasks', `board:${engagement.id}`)}>{say(`Voir les ${shown.length} sur le tableau`, `See all ${shown.length} on the board`)} →</button>}
            {!shown.length && <div className="small muted mw-empty">{scope === 'late' ? say('Rien en retard.', 'Nothing late.') : scope === 'done' ? say('Aucun ticket terminé.', 'No ticket done.') : say('Aucun ticket ouvert.', 'No open ticket.')}</div>}
          </div>
        </section>

        <section className="tk-sec">
          <div className="tk-sec-h">
            <h2>{say('Jalons', 'Milestones')}</h2><span className="tk-count">{milestones.length}</span>
            <div className="tk-sec-x"><button className="btn sm" onClick={() => openRoom('missions', 'milestones')}>{say('Gérer les jalons', 'Manage milestones')}</button></div>
          </div>
          {lane === undefined ? <span className="small muted">{say('Chargement…', 'Loading…')}</span> : milestones.length ? (
            <ol className="mp-steps">
              {milestones.map((m) => {
                const s = MILESTONE_STATUS[m.status];
                const overdue = m.status !== 'completed' && m.status !== 'cancelled' && m.dueDate < today;
                return (
                  <li key={m.id} className={`mp-step ${m.status} ${overdue ? 'overdue' : ''}`}>
                    <span className="mp-step-dot" aria-hidden="true" />
                    <div className="grow">
                      <b>{m.title}</b>
                      {m.description && <div className="small muted">{m.description}</div>}
                    </div>
                    <span className="small muted">{m.ownerName ?? ''}</span>
                    <span className={`small mono ${overdue ? 'ms-late' : ''}`}>{dmy(m.dueDate)}</span>
                    <Lozenge tone={s[2]}>{say(s[0], s[1])}</Lozenge>
                  </li>
                );
              })}
            </ol>
          ) : <span className="small muted mw-empty">{say('Aucun jalon pour cette mission.', 'No milestone for this mission.')}</span>}
        </section>
      </div>

      <aside className="tk-side">
        <div className="tk-details">
          <div className="tk-details-h">{say('Détails', 'Details')}</div>
          <dl>
            <dt>Client</dt><dd>{project.client?.name ?? <span className="muted">{say('Sans client (interne)', 'No client (internal)')}</span>}{project.client?.contact_email && <span className="small muted">{project.client.contact_email}</span>}</dd>
            <dt>{say('Responsable', 'Lead')}</dt><dd>{project.ownerName ? <span className="tk-person"><Avatar name={project.ownerName} size={22} /> {project.ownerName}</span> : '—'}</dd>
            <dt>Type</dt><dd>{kindLabel(project.project_kind, say)}</dd>
            <dt>{say('Priorité', 'Priority')}</dt><dd>{project.priority ? <span className="tk-person">{priority && <PriorityIcon priority={priority} say={say} />} {pair(PRIORITIES, project.priority, say)}</span> : '—'}</dd>
            <dt>{say('Début', 'Start')}</dt><dd><D iso={project.start_date ?? undefined} /></dd>
            <dt>{say('Échéance', 'Deadline')}</dt><dd><D iso={project.end_date ?? undefined} />{due && <span className={`small ${due.late ? 'ms-late' : due.soon ? 'ms-soon' : 'muted'}`}>{due.text}</span>}</dd>
            {engagement && <><dt>{say('Facturation', 'Billing')}</dt><dd>{engagement.feeType === 'fixed' ? say('Forfait', 'Fixed fee') : say('Temps passé', 'Time spent')}</dd></>}
            <dt>{say('Honoraires', 'Fee')}</dt><dd>{project.budget_amount ? `${fmt(project.budget_amount, 0)}${engagement ? ` ${engagement.currency}` : ''}` : '—'}{engagement && engagement.invoicedToDate > 0 && <span className="small muted">{say('facturé', 'invoiced')} {fmt(engagement.invoicedToDate, 0)}</span>}</dd>
            <dt>{say('Équipe', 'Team')}</dt>
            <dd>
              <button className="ms-avatars linkish" onClick={() => onTab('team')} title={view.members.map((m) => m.name).join(', ')}>
                {view.members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} size={24} />)}
                {view.members.length > 6 && <span className="ms-more">+{view.members.length - 6}</span>}
                {!view.members.length && <span className="small muted">{say('Personne', 'No one')}</span>}
              </button>
            </dd>
          </dl>
        </div>
        <div className="mw-block">
          <div className="mw-block-h"><h2>{say('Alertes', 'Alerts')}</h2>{view.alerts.length > 0 && <span className="tk-count">{view.alerts.length}</span>}</div>
          {view.alerts.length ? view.alerts.map((a) => <div key={a.id} className={`banner ${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}`}><b>{a.title}</b>{a.description ? ` · ${a.description}` : ''}</div>) : <span className="small muted">{say('Aucune alerte : la mission est dans les temps.', 'No alert: the mission is on track.')}</span>}
        </div>
      </aside>
    </div>
  );
}

function Team({ view, busy, run, say }: { view: ProjectView; busy: boolean; run: (work: () => Promise<Result | void>, done?: string) => Promise<boolean>; say: Say }) {
  const { state, openRoom } = useStore();
  const [adding, setAdding] = useState('');
  const floorOf = (code: string | null) => (code ? state.entities.find((e) => e.code === floorCode(code))?.name ?? code : '—');
  const change = (work: Promise<{ ok: true } | { ok: false; error: string }>) => work.then((r) => (r.ok ? {} : { error: r.error }));
  return (
    <div className="mp-team-wrap">
      {view.canManageTeam && (
        <div className="mp-team-add">
          <Select recent="people" className="in" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={say('Ajouter quelqu’un', 'Add someone')}>
            <option value="">{say('Ajouter quelqu’un à l’équipe…', 'Add someone to the team…')}</option>
            {view.candidates.map((p) => <option key={p.id} value={p.id}>{p.name}{p.entity ? ` · ${floorOf(p.entity)}` : ''}</option>)}
          </Select>
          <button className="btn sm primary" disabled={busy || !adding} onClick={async () => { if (await run(() => change(addProjectMemberAction(view.project.id, adding)), say('Ajouté à l’équipe', 'Added to the team'))) setAdding(''); }}><Icon name="plus" size={13} /> {say('Ajouter', 'Add')}</button>
        </div>
      )}
      <div className="mp-team">
        {view.members.map((m) => (
          <div key={m.id} className="mp-person">
            <Avatar name={m.name} size={40} />
            <div className="grow">
              <button className="linkish" onClick={() => openRoom('overview', `person:${m.id}`)}><b>{m.name}</b></button>
              {m.id === view.project.owner_id && <span className="tag dim mp-lead-tag">{say('responsable', 'lead')}</span>}
              <div className="small muted">{m.title ?? '—'} · {floorOf(m.entity)}</div>
            </div>
            {view.canManageTeam && m.id !== view.project.owner_id && (
              <button className="btn sm ghost" disabled={busy} onClick={() => run(() => change(removeProjectMemberAction(view.project.id, m.id)), say('Retiré de l’équipe', 'Removed from the team'))}>{say('Retirer', 'Remove')}</button>
            )}
          </div>
        ))}
        {!view.members.length && <div className="ms-empty"><b>{say("Personne dans l'équipe.", 'No one on the team.')}</b></div>}
      </div>
    </div>
  );
}
