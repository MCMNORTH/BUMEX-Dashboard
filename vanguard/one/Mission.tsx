import { useCallback, useEffect, useState } from 'react';
import { fmt } from '@bumex/domain';
import { floorCode } from '@/lib/erp/vanguard/floors';
import { projectViewAction, type ProjectView } from '@/lib/erp/vanguard/project-actions';
import { removeProjectAction } from '@/app/(app)/projects/actions';
import { addProjectMemberAction, removeProjectMemberAction } from '@/app/(app)/projects/member-actions';
import { useStore } from '../store';
import { Chip, D, Icon, Tabs } from '../ui/common';
import { Comments, Notes, type Result, type Say, when } from './Conversation';
import { KINDS, MissionForm, PRIORITIES, STATUSES } from './Missions';
import { reload } from './Tasks';
import { WorkflowEditor } from './Workflow';
import { useSay } from './say';
import { Select } from '../ui/Select';

// A mission's page in the Missions room, as BUMEX One's project page had it: delivery figures and health, alerts,
// tickets, team, notes, conversation, history, and its board's columns and rules (vanguard/one/Workflow.tsx). Its
// form is the Missions room's (vanguard/one/Missions.tsx).

type Tab = 'overview' | 'team' | 'notes' | 'comments' | 'rules' | 'history';

const HEALTH: Record<string, [string, string, 'good' | 'warn' | 'crit']> = {
  healthy: ['Saine', 'Healthy', 'good'],
  warning: ['À surveiller', 'Warning', 'warn'],
  at_risk: ['À risque', 'At risk', 'crit'],
  delayed: ['En retard', 'Delayed', 'crit'],
};
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

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement de la mission…', 'Loading the mission…')}</span></div>;
  if (view === null) {
    return (
      <div className="card">
        <div className="banner warn">{say("Cette mission n'existe plus ou ne vous est pas accessible.", 'This mission no longer exists or is not open to you.')}</div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour aux missions', 'Back to the missions')}</button></div>
      </div>
    );
  }

  const { project } = view;
  const engagement = state.engagements.find((e) => (e as { projectId?: string }).projectId === project.id);
  const health = HEALTH[project.health] ?? HEALTH.healthy;
  const remove = async () => {
    if (!window.confirm(say(`Supprimer la mission « ${project.name} » et ses tickets ?`, `Delete the mission "${project.name}" and its tickets?`))) return;
    if (await run(() => removeProjectAction(project.id), say('Mission supprimée', 'Mission deleted'))) onClose();
  };
  const tabs = [
    { id: 'overview' as Tab, label: say("Vue d'ensemble", 'Overview') },
    { id: 'team' as Tab, label: `${say('Équipe', 'Team')} · ${view.members.length}` },
    { id: 'notes' as Tab, label: `${say('Notes', 'Notes')} · ${view.notes.filter((n) => !n.archived_at).length}` },
    { id: 'comments' as Tab, label: `${say('Commentaires', 'Comments')} · ${view.comments.length}` },
    { id: 'rules' as Tab, label: say('Colonnes et règles', 'Columns and rules') },
    { id: 'history' as Tab, label: say('Historique', 'History') },
  ];

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={onClose} aria-label={say('Retour aux missions', 'Back to the missions')}><Icon name="back" size={14} /></button>
          <h2 style={{ margin: 0 }}>{project.name}</h2>
          {engagement && <Chip kind="dim">{engagement.code}</Chip>}
          <Chip kind={project.status === 'active' ? 'good' : 'dim'}>{pair(STATUSES, project.status, say)}</Chip>
          <Chip kind={health[2]}>{say(health[0], health[1])}</Chip>
          <Chip kind="dim">{pair(KINDS, project.project_kind, say)}</Chip>
          <div className="actions" style={{ marginLeft: 'auto' }}>
            {engagement && <button className="btn sm" onClick={() => openRoom('tasks', `board:${engagement.id}`)}><Icon name="tasks" size={13} /> {say('Tableau', 'Board')}</button>}
            {view.canEdit && engagement && <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? say('Fermer le formulaire', 'Close the form') : say('Modifier', 'Edit')}</button>}
            {view.canDelete && <button className="btn sm danger" disabled={busy} onClick={remove}>{say('Supprimer', 'Delete')}</button>}
          </div>
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {editing && engagement && <MissionForm entityId={engagement.entityId} projectId={project.id} onClose={(saved) => { setEditing(false); if (saved) void load(); }} />}

      {tab === 'overview' && <Overview view={view} say={say} />}
      {tab === 'team' && <Team view={view} busy={busy} run={run} say={say} />}
      {tab === 'notes' && <Notes entityType="project" entityId={project.id} notes={view.notes} role={view.role} me={view.me} busy={busy} run={run} say={say} />}
      {tab === 'comments' && <Comments entityType="project" entityId={project.id} comments={view.comments} people={view.people} role={view.role} me={view.me} canComment={view.canComment} busy={busy} run={run} say={say} />}
      {tab === 'rules' && <WorkflowEditor projectId={project.id} />}
      {tab === 'history' && (
        <div className="card">
          {view.history.map((h) => (
            <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '7px 0', fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{h.action}</b><span className="muted mono">{when(h.at)}</span></div>
              <div className="muted">{h.who}{h.detail ? ` · ${h.detail}` : ''}</div>
            </div>
          ))}
          {!view.history.length && <span className="small muted">{say('Aucune activité enregistrée.', 'No activity recorded.')}</span>}
        </div>
      )}
    </>
  );
}

function Overview({ view, say }: { view: ProjectView; say: Say }) {
  const { openRoom } = useStore();
  const { project } = view;
  const ticket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const breakdown: [keyof typeof project.statusBreakdown, string, string][] = [['backlog', 'En attente', 'Backlog'], ['todo', 'À faire', 'To do'], ['in_progress', 'En cours', 'In progress'], ['review', 'En revue', 'Review'], ['blocked', 'Bloqué', 'Blocked'], ['done', 'Terminé', 'Done']];
  const deadline: Record<string, [string, string]> = { 'on-track': ['dans les temps', 'on track'], 'due-soon': ['échéance proche', 'due soon'], overdue: ['dépassée', 'overdue'], none: ['sans échéance', 'no deadline'] };
  const list = (rows: typeof project.tasks, empty: string) => rows.length
    ? rows.map((t) => (
      <div key={t.id} className="click" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--line)', padding: '6px 0', cursor: 'pointer' }} onClick={() => ticket(t.id)}>
        <span>{t.title}</span><span className="small muted"><D iso={t.due_date?.slice(0, 10)} /></span>
      </div>
    ))
    : <span className="small muted">{empty}</span>;
  return (
    <>
      <div className="grid4">
        <div className="kpi"><div className="l">{say('Avancement', 'Progress')}</div><div className="v">{project.progress} %</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${project.progress}%` }} /></div></div>
        <div className="kpi"><div className="l">{say('Tickets terminés', 'Tickets done')}</div><div className="v">{project.completedTasks} / {project.totalTasks}</div></div>
        <div className="kpi"><div className="l">{say('Échéance', 'Deadline')}</div><div className="v" style={{ fontSize: 16 }}><D iso={project.end_date ?? undefined} /></div><div className="small muted">{say(...(deadline[project.deadlineState] ?? deadline.none))}</div></div>
        <div className="kpi"><div className="l">{say('Honoraires', 'Fee')}</div><div className="v">{project.budget_amount ? fmt(project.budget_amount, 0) : '—'}</div></div>
      </div>
      <div className="cols">
        <div className="grow">
          <div className="card">
            <div className="kv">
              <span className="k">Client</span><span>{project.client?.name ?? say('Sans client (interne)', 'No client (internal)')}{project.client?.contact_email ? ` · ${project.client.contact_email}` : ''}</span>
              <span className="k">{say('Responsable', 'Lead')}</span><span>{project.ownerName ?? '—'}</span>
              <span className="k">{say('Début', 'Start')}</span><span><D iso={project.start_date ?? undefined} /></span>
              <span className="k">{say('Priorité', 'Priority')}</span><span>{project.priority ? pair(PRIORITIES, project.priority, say) : '—'}</span>
            </div>
            {project.description && <div className="banner info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{project.description}</div>}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
              {breakdown.map(([k, fr, en]) => <Chip key={k} kind={k === 'blocked' && project.statusBreakdown[k] ? 'crit' : 'dim'}>{say(fr, en)} · {project.statusBreakdown[k]}</Chip>)}
            </div>
          </div>
          <div className="card"><h2>{say('Tickets de la mission', "The mission's tickets")}</h2>{list(project.tasks.slice(0, 12), say('Aucun ticket.', 'No ticket.'))}</div>
        </div>
        <div className="side">
          <div className="card">
            <h2>{say('Alertes', 'Alerts')}</h2>
            {view.alerts.length ? view.alerts.map((a) => <div key={a.id} className={`banner ${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}`} style={{ marginBottom: 6 }}><b>{a.title}</b>{a.description ? ` · ${a.description}` : ''}</div>) : <span className="small muted">{say('Aucune alerte.', 'No alert.')}</span>}
          </div>
          <div className="card"><h2>{say('En retard', 'Overdue')}</h2>{list(project.overdueTasks.slice(0, 6), say('Rien en retard.', 'Nothing overdue.'))}</div>
          <div className="card"><h2>{say('Prochaines échéances', 'Next deadlines')}</h2>{list(project.upcomingDeadlines, say('Aucune échéance proche.', 'No deadline soon.'))}</div>
        </div>
      </div>
    </>
  );
}

function Team({ view, busy, run, say }: { view: ProjectView; busy: boolean; run: (work: () => Promise<Result | void>, done?: string) => Promise<boolean>; say: Say }) {
  const { state } = useStore();
  const [adding, setAdding] = useState('');
  const floorOf = (code: string | null) => (code ? state.entities.find((e) => e.code === floorCode(code))?.name ?? code : '—');
  const change = (work: Promise<{ ok: true } | { ok: false; error: string }>) => work.then((r) => (r.ok ? {} : { error: r.error }));
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>{say('Personne', 'Person')}</th><th>{say('Fonction', 'Role')}</th><th>{say('Entité', 'Entity')}</th><th /></tr></thead>
        <tbody>
          {view.members.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b>{m.id === view.project.owner_id && <> <Chip kind="dim">{say('responsable', 'lead')}</Chip></>}</td>
              <td className="small">{m.title ?? '—'}</td>
              <td className="small">{floorOf(m.entity)}</td>
              <td>{view.canManageTeam && <button className="btn sm ghost" disabled={busy} onClick={() => run(() => change(removeProjectMemberAction(view.project.id, m.id)), say('Retiré de l’équipe', 'Removed from the team'))}>{say('Retirer', 'Remove')}</button>}</td>
            </tr>
          ))}
          {!view.members.length && <tr><td colSpan={4} className="small muted">{say("Personne dans l'équipe.", 'No one on the team.')}</td></tr>}
        </tbody>
      </table>
      {view.canManageTeam && (
        <div style={{ display: 'flex', gap: 8, padding: 10 }}>
          <Select recent="people" className="in" style={{ maxWidth: 320 }} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={say('Ajouter quelqu’un', 'Add someone')}>
            <option value="">{say('Ajouter quelqu’un…', 'Add someone…')}</option>
            {view.candidates.map((p) => <option key={p.id} value={p.id}>{p.name}{p.entity ? ` · ${floorOf(p.entity)}` : ''}</option>)}
          </Select>
          <button className="btn sm primary" disabled={busy || !adding} onClick={async () => { if (await run(() => change(addProjectMemberAction(view.project.id, adding)), say('Ajouté à l’équipe', 'Added to the team'))) setAdding(''); }}>{say('Ajouter', 'Add')}</button>
        </div>
      )}
    </div>
  );
}
