import { useCallback, useEffect, useState } from 'react';
import { ticketViewAction, type TicketView } from '@/lib/erp/vanguard/ticket-actions';
import { ARCHIVED_STAGE_VALUE, findStage, getActiveStages, getCompletedStage, getSignOffStage, sortStages } from '@/lib/tickets/workflow';
import { editTicketAction, moveTicketStageAction, removeTicketAction, createSubtaskAction, toggleSubtaskAction, renameSubtaskAction, setSubtaskOwnerAction, setSubtaskDueDateAction, reorderSubtasksAction, deleteSubtaskAction } from '@/app/(app)/tickets/actions';
import { useStore } from '../store';
import { Chip, D, Field, Icon } from '../ui/common';
import { PRIORITY, STATUS, TYPES, label, reload, typeLabel } from './Tasks';
import { Comments, type Result, type Run, type Say, when } from './Conversation';
import { useSay } from './say';
import { Select } from '../ui/Select';

// A ticket in the Tasks room, as BUMEX One's ticket page had it: where it stands on its board, what to do next, its
// details and time budget, the edit form, the reporter's sign-off, its sub-tasks, the conversation and its history.
// Every change goes through BUMEX One's actions (lib/erp/vanguard/ticket-actions.ts says which), whose rules hold.


export function TicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useStore();
  const say = useSay();
  const [view, setView] = useState<TicketView | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await ticketViewAction(id).catch(() => null);
    setView(next);
  }, [id]);
  useEffect(() => {
    let live = true;
    ticketViewAction(id).catch(() => null).then((next) => { if (live) setView(next); });
    return () => { live = false; };
  }, [id]);

  // a change through BUMEX One's code, then the ticket and Vanguard's state as they now are
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

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement du ticket…', 'Loading the ticket…')}</span></div>;
  if (view === null) {
    return (
      <div className="card">
        <div className="banner warn">{say("Ce ticket n'existe plus ou ne vous est pas accessible.", 'This ticket no longer exists or is not open to you.')}</div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour aux tâches', 'Back to the tasks')}</button></div>
      </div>
    );
  }

  const { ticket, workflow } = view;
  const stage = findStage(workflow, ticket.stage_id);
  const remove = async () => {
    if (!window.confirm(say(`Supprimer le ticket « ${ticket.title} » ?`, `Delete the ticket "${ticket.title}"?`))) return;
    if (await run(() => removeTicketAction(ticket.id), say('Ticket supprimé', 'Ticket deleted'))) onClose();
  };

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={onClose} aria-label={say('Retour aux tâches', 'Back to the tasks')}><Icon name="back" size={14} /></button>
          <h2 style={{ margin: 0 }}>{ticket.title}</h2>
          <Chip kind={ticket.status === 'done' ? 'good' : ticket.status === 'blocked' ? 'crit' : 'dim'}>{stage?.name ?? label(STATUS[ticket.status], ticket.status, say)}</Chip>
          <Chip kind={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'warn' : 'dim'}>{label(PRIORITY[ticket.priority], ticket.priority, say)}</Chip>
          <Chip kind="dim">{typeLabel(ticket.type, say)}</Chip>
          <div className="actions" style={{ marginLeft: 'auto' }}>
            {view.signOff && <button className="btn sm primary" disabled={busy} onClick={() => run(() => moveTicketStageAction(ticket.id, { stageId: view.signOff!.stageId }), say('Travail validé', 'Work signed off'))}>{say('Valider', 'Sign off')} → {view.signOff.stageName}</button>}
            {view.canUpdate && <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? say('Fermer le formulaire', 'Close the form') : say('Modifier', 'Edit')}</button>}
            {view.canManage && <button className="btn sm danger" disabled={busy} onClick={remove}>{say('Supprimer', 'Delete')}</button>}
          </div>
        </div>
        <Journey view={view} say={say} />
      </div>

      <NextAction view={view} say={say} />
      {editing && <EditForm view={view} busy={busy} say={say} onSave={async (form) => { if (await run(() => editTicketAction(form), say('Ticket mis à jour', 'Ticket updated'))) setEditing(false); }} />}

      <div className="cols">
        <div className="grow">
          <Details view={view} say={say} />
          <Subtasks view={view} busy={busy} run={run} say={say} />
        </div>
        <div className="side">
          <Comments entityType="ticket" entityId={ticket.id} comments={view.comments} people={view.people} role={view.role} me={view.me} canComment={view.canComment} busy={busy} run={run} say={say} />
          <div className="card">
            <h2>{say('Historique', 'History')}</h2>
            {view.role === 'shareholder' ? <span className="small muted">{say("L'historique détaillé est masqué en mode synthèse.", 'The detailed history is hidden in summary mode.')}</span> : null}
            {view.history.map((h) => (
              <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '7px 0', fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{h.action}</b><span className="muted mono">{when(h.at)}</span></div>
                <div className="muted">{h.who}{h.detail ? ` · ${h.detail}` : ''}</div>
              </div>
            ))}
            {view.role !== 'shareholder' && !view.history.length && <span className="small muted">{say('Aucun changement enregistré.', 'No change recorded.')}</span>}
          </div>
        </div>
      </div>
    </>
  );
}

// The board's stages as a track (blocked stages interrupt it rather than being a step of it).
function Journey({ view, say }: { view: TicketView; say: Say }) {
  const { workflow, ticket } = view;
  const stage = findStage(workflow, ticket.stage_id);
  const steps = getActiveStages(workflow).filter((s) => s.is_completed || s.category !== 'blocked');
  const blocked = Boolean(stage && !stage.is_completed && stage.category === 'blocked');
  const anchor = blocked ? [...sortStages(steps)].reverse().find((s) => s.position < stage!.position) ?? steps[0] : stage;
  const current = Math.max(0, steps.findIndex((s) => s.id === anchor?.id));
  const finished = Boolean(stage?.is_completed);
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((s, i) => {
          const done = i < current || (finished && i === current);
          const active = i === current && !finished;
          return (
            <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ height: 6, borderRadius: 3, background: done ? 'var(--good)' : active ? (blocked ? 'var(--crit)' : 'var(--blue)') : 'var(--line)' }} />
              <div className="small" style={{ marginTop: 4, color: active ? 'var(--ink)' : 'var(--muted)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
            </div>
          );
        })}
      </div>
      {blocked && <div className="banner crit" style={{ marginTop: 8 }}>{say(`Progression interrompue : ${stage!.name}`, `Progress interrupted: ${stage!.name}`)}</div>}
      {ticket.status === 'archived' && <div className="banner info" style={{ marginTop: 8 }}>{say('Ticket archivé, hors du tableau.', 'Archived ticket, off the board.')}</div>}
    </div>
  );
}

// What BUMEX One's page recommended doing next, from the same signals.
function NextAction({ view, say }: { view: TicketView; say: Say }) {
  const { state } = useStore();
  const { ticket, workflow } = view;
  const open = ticket.status !== 'done' && ticket.status !== 'archived';
  const completedName = getCompletedStage(workflow)?.name ?? say('Terminé', 'Done');
  // finished work waits in the stage before the completed one, for the reporter's sign-off
  const awaiting = open && getSignOffStage(workflow)?.id === ticket.stage_id;
  const estimated = Number(ticket.estimated_hours ?? 0);
  const usage = estimated > 0 ? Math.round((Number(ticket.actual_hours ?? 0) / estimated) * 100) : 0;
  const allDone = view.subtasks.length > 0 && view.subtasks.every((s) => s.is_done);
  const late = open && ticket.due_date && ticket.due_date.slice(0, 10) < state.today;
  const [kind, title, text]: ['info' | 'warn' | 'crit', string, string] = !ticket.assignee_id
    ? ['info', say('Assigner le ticket', 'Assign the ticket'), say('Personne ne le porte encore.', 'No one carries it yet.')]
    : awaiting && view.isReporter
      ? ['info', say('Valider le travail', 'Sign off the work'), say(`Il attend votre validation : vérifiez-le, puis passez-le à « ${completedName} ».`, `It waits for your sign-off: check it, then move it to ${completedName}.`)]
      : awaiting
        ? ['info', say('En attente de validation', 'Waiting for sign-off'), ticket.reporterName ? say(`Seul le rapporteur, ${ticket.reporterName}, peut le passer à « ${completedName} ».`, `Only the reporter, ${ticket.reporterName}, can move it to ${completedName}.`) : say(`Sans rapporteur : un responsable du projet autre que l'assigné peut le passer à « ${completedName} ».`, `No reporter: a project lead other than the assignee can move it to ${completedName}.`)]
        : ticket.status === 'blocked'
          ? ['crit', say('Documenter et lever le blocage', 'Document and remove the blocker'), say('Ajoutez le contexte dans les commentaires, puis changez son étape.', 'Add the context in the comments, then change its stage.')]
          : late
            ? ['warn', say("Replanifier l'échéance", 'Replan the deadline'), say("L'échéance est dépassée : convenez d'une nouvelle date avec l'assigné.", 'The deadline has passed: agree on a new date with the assignee.')]
            : usage > 100
              ? ['warn', say("Revoir l'estimation", 'Review the estimate'), say(`Le temps réel atteint ${usage} % de l'estimation.`, `Actual time has reached ${usage}% of the estimate.`)]
              : allDone && !['review', 'done', 'archived'].includes(ticket.status)
                ? ['info', say('Passer en revue', 'Move to review'), say('Toutes les sous-tâches sont terminées.', 'Every sub-task is done.')]
                : ['info', say("Poursuivre l'exécution", 'Continue the work'), say('Assigné, sans signal critique.', 'Assigned, no critical signal.')];
  if (!open) return null;
  return <div className={`banner ${kind}`}><b>{title}</b> · {text}</div>;
}

function Details({ view, say }: { view: TicketView; say: Say }) {
  const { openRoom } = useStore();
  const { ticket } = view;
  const estimated = Number(ticket.estimated_hours ?? 0);
  const actual = Number(ticket.actual_hours ?? 0);
  const usage = estimated > 0 ? Math.round((actual / estimated) * 100) : 0;
  // the Temps room, with an entry for this ticket's mission started (vanguard/one/Time.tsx)
  const logTime = `log:${encodeURIComponent(JSON.stringify({ projectId: ticket.project_id, mission: ticket.title }))}`;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="kv">
        <span className="k">{say('Mission', 'Mission')}</span><span>{ticket.projectName ?? '—'}{ticket.clientName ? ` · ${ticket.clientName}` : ''}</span>
        <span className="k">{say('Assigné à', 'Assignee')}</span><span>{ticket.assigneeName ?? say('Non assigné', 'Unassigned')}</span>
        <span className="k">{say('Rapporteur', 'Reporter')}</span><span>{ticket.reporterName ?? '—'}</span>
        <span className="k">{say('Échéance', 'Due')}</span><span><D iso={ticket.due_date?.slice(0, 10)} /></span>
        <span className="k">{say('Créé le', 'Created')}</span><span className="mono">{when(ticket.created_at)}</span>
        <span className="k">{say('Mis à jour', 'Updated')}</span><span className="mono">{when(ticket.updated_at)}</span>
        {ticket.github_issue_url && <><span className="k">GitHub</span><a href={ticket.github_issue_url} target="_blank" rel="noreferrer">{say("Ouvrir l'incident", 'Open the issue')}</a></>}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }} className="small"><span className="muted">{say('Budget temps', 'Time budget')}</span><span>{actual.toFixed(1)} h / {estimated ? `${estimated.toFixed(1)} h` : say('non estimé', 'no estimate')}{estimated ? ` · ${usage} %` : ''}</span></div>
        <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, usage)}%`, background: usage > 100 ? 'var(--crit)' : usage >= 80 ? 'var(--warn)' : 'var(--accent)' }} /></div>
      </div>
      {ticket.description && <div className="banner info" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {view.role !== 'shareholder' && <button className="btn sm" onClick={() => openRoom('time', logTime)}><Icon name="clock" size={13} /> {say('Déclarer du temps', 'Log time')}</button>}
        <button className="btn sm" onClick={() => openRoom('missions', `mission:${ticket.project_id}`)}>{say('Ouvrir la mission', 'Open the mission')}</button>
      </div>
    </div>
  );
}

function EditForm({ view, busy, say, onSave }: { view: TicketView; busy: boolean; say: Say; onSave: (form: FormData) => void }) {
  const { ticket, workflow, canManage } = view;
  const [v, setV] = useState({
    title: ticket.title, description: ticket.description ?? '', project_id: ticket.project_id, assignee_id: ticket.assignee_id ?? '', reporter_id: ticket.reporter_id ?? '',
    stage_id: ticket.status === 'archived' ? ARCHIVED_STAGE_VALUE : ticket.stage_id, stage_reason: '', priority: ticket.priority, type: ticket.type,
    due_date: ticket.due_date?.slice(0, 10) ?? '', estimated_hours: ticket.estimated_hours?.toString() ?? '', actual_hours: ticket.actual_hours?.toString() ?? '', github_issue_url: ticket.github_issue_url ?? '',
  });
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const sameBoard = v.project_id === ticket.project_id;
  const moving = sameBoard && v.stage_id !== ticket.stage_id;
  const submit = () => {
    const form = new FormData();
    // another mission's board: its default stage (the server picks it)
    for (const [k, value] of Object.entries({ ...v, stage_id: sameBoard ? v.stage_id : '', ticket_id: ticket.id })) form.set(k, value);
    onSave(form);
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>{say('Modifier le ticket', 'Edit the ticket')}</h2>
      <div className="grid3">
        <Field label={say('Titre', 'Title')} style={{ gridColumn: 'span 2' }}><input className="in" value={v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label={say('Mission', 'Mission')}><Select recent="missions" className="in" value={v.project_id} disabled={!canManage} onChange={(e) => set({ project_id: e.target.value })}>{view.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={say('Étape', 'Stage')}>
          {sameBoard
            ? <Select className="in" value={v.stage_id} onChange={(e) => set({ stage_id: e.target.value })}>{getActiveStages(workflow).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}{canManage && <option value={ARCHIVED_STAGE_VALUE}>{say('Archivé', 'Archived')}</option>}</Select>
            : <input className="in" disabled value={say('première étape de son tableau', "its board's first stage")} />}
        </Field>
        {moving && <Field label={say("Motif du changement d'étape", 'Reason for the stage change')} style={{ gridColumn: 'span 2' }}><input className="in" value={v.stage_reason} onChange={(e) => set({ stage_reason: e.target.value })} placeholder={say('si le tableau le demande', 'if the board asks for one')} /></Field>}
        <Field label={say('Assigné à', 'Assignee')}><Select recent="people" className="in" value={v.assignee_id} disabled={!canManage} onChange={(e) => set({ assignee_id: e.target.value })}><option value="">—</option>{view.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={say('Rapporteur', 'Reporter')}><Select recent="people" className="in" value={v.reporter_id} disabled={!canManage} onChange={(e) => set({ reporter_id: e.target.value })}><option value="">—</option>{view.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={say('Priorité', 'Priority')}><Select className="in" value={v.priority} onChange={(e) => set({ priority: e.target.value as typeof v.priority })}>{Object.entries(PRIORITY).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label="Type"><Select className="in" value={v.type} onChange={(e) => set({ type: e.target.value as typeof v.type })}>{TYPES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label={say('Échéance', 'Due')}><input className="in mono" type="date" value={v.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
        <Field label={say('Estimation (h)', 'Estimate (h)')}><input className="in num" value={v.estimated_hours} onChange={(e) => set({ estimated_hours: e.target.value })} /></Field>
        <Field label={say('Temps réel (h)', 'Actual (h)')}><input className="in num" value={v.actual_hours} onChange={(e) => set({ actual_hours: e.target.value })} /></Field>
        <Field label={say('Incident GitHub', 'GitHub issue')} style={{ gridColumn: 'span 3' }}><input className="in" value={v.github_issue_url} onChange={(e) => set({ github_issue_url: e.target.value })} placeholder="https://github.com/…" /></Field>
      </div>
      <Field label="Description"><textarea className="in" style={{ height: 90, padding: 8 }} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="actions"><button className="btn primary" disabled={busy || !v.title.trim()} onClick={submit}>{busy ? say('Enregistrement…', 'Saving…') : say('Enregistrer', 'Save')}</button></div>
    </div>
  );
}

function Subtasks({ view, busy, run, say }: { view: TicketView; busy: boolean; run: Run; say: Say }) {
  const { ticket, subtasks, canUpdate, canManage, me } = view;
  const [title, setTitle] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  if (view.role === 'shareholder') {
    return <div className="card"><h2>{say('Sous-tâches', 'Sub-tasks')}</h2><span className="small muted">{ticket.subtasks_done ?? 0} / {ticket.subtasks_total ?? 0}</span></div>;
  }
  const done = subtasks.filter((s) => s.is_done).length;
  const move = (index: number, by: number) => {
    const ids = subtasks.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved);
    void run(() => reorderSubtasksAction(ticket.id, ids));
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{say('Sous-tâches', 'Sub-tasks')}</h2>
        <span className="small muted">{done} / {subtasks.length}</span>
      </div>
      {subtasks.length > 0 && <div className="bar"><i style={{ width: `${(done / subtasks.length) * 100}%`, background: 'var(--good)' }} /></div>}
      {subtasks.map((s, i) => {
        const canTick = canUpdate || s.assignee_id === me;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
            <input type="checkbox" checked={s.is_done} disabled={!canTick || busy} onChange={(e) => run(() => toggleSubtaskAction(s.id, e.target.checked))} aria-label={s.title} />
            {renaming?.id === s.id
              ? <input className="in" style={{ flex: 1 }} value={renaming.title} autoFocus onChange={(e) => setRenaming({ id: s.id, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && renaming.title.trim()) { void run(() => renameSubtaskAction(s.id, renaming.title)); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }} />
              : <span style={{ flex: 1, textDecoration: s.is_done ? 'line-through' : undefined, color: s.is_done ? 'var(--muted)' : undefined, cursor: canUpdate ? 'text' : undefined }} onClick={() => canUpdate && setRenaming({ id: s.id, title: s.title })}>{s.title}</span>}
            <Select recent="people" className="in" style={{ width: 150 }} value={s.assignee_id ?? ''} disabled={!canManage || busy} onChange={(e) => run(() => setSubtaskOwnerAction(s.id, e.target.value || null))} aria-label={say('Responsable', 'Owner')}>
              <option value="">—</option>{view.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <input className="in mono" type="date" style={{ width: 140 }} value={s.due_date?.slice(0, 10) ?? ''} disabled={!canUpdate || busy} onChange={(e) => run(() => setSubtaskDueDateAction(s.id, e.target.value || null))} aria-label={say('Échéance', 'Due')} />
            {canUpdate && <>
              <button className="btn sm ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={say('Monter', 'Up')}><Icon name="chevronUp" size={13} /></button>
              <button className="btn sm ghost" disabled={busy || i === subtasks.length - 1} onClick={() => move(i, 1)} aria-label={say('Descendre', 'Down')}><Icon name="chevronDown" size={13} /></button>
              <button className="btn sm ghost" disabled={busy} onClick={() => run(() => deleteSubtaskAction(s.id))} aria-label={say('Supprimer', 'Delete')}><Icon name="close" size={13} /></button>
            </>}
          </div>
        );
      })}
      {!subtasks.length && <span className="small muted">{say('Aucune sous-tâche.', 'No sub-task.')}</span>}
      {canUpdate && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={say('Nouvelle sous-tâche', 'New sub-task')} onKeyDown={async (e) => { if (e.key === 'Enter' && title.trim() && (await run(() => createSubtaskAction(ticket.id, title)))) setTitle(''); }} />
          <button className="btn sm" disabled={busy || !title.trim()} onClick={async () => { if (await run(() => createSubtaskAction(ticket.id, title))) setTitle(''); }}>{say('Ajouter', 'Add')}</button>
        </div>
      )}
    </div>
  );
}
