import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, type Id, type Task } from '@bumex/domain';
import { reloadVanguardAction } from '@/lib/erp/vanguard/actions';
import { missionOptionsAction, type MissionOptions } from '@/lib/erp/vanguard/mission-actions';
import { peopleLoadsAction } from '@/lib/erp/vanguard/people-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import type { TaskTicket } from '@/lib/erp/vanguard/tickets';
import { createTicketAction } from '@/app/(app)/tickets/actions';
import { useStore } from '../store';
import { useBackLayer } from './back'; // [mobile]
import { isPhone } from './screen'; // [mobile]
import { Field, Icon, Tabs } from '../ui/common';
import { MissionBoard } from './Board';
import { WorkflowEditor } from './Workflow';
import { RichText } from './RichText';
import { TicketPanel } from './Ticket';
import { useSay } from './say';
import { Select } from '../ui/Select';
import { applyFilters, quickFilters, readFilters, readView, writeFilters, writeView, type GroupLabels, type WorkFilters } from './work-filters';
import { WorkToolbar } from './WorkToolbar';
import { TicketList } from './TicketList';
import { hoursText } from './work-ui';
import { useBoardOf } from './stages';
import { getActiveStages, getDefaultStage } from '@/lib/tickets/workflow';

// Vanguard's Tasks room on BUMEX One's tickets (lib/erp/vanguard/tickets.ts), laid out as Jira's (asked on
// 2026-10-27): the board (a mission's own columns, or every mission of the floor by state) and the list, with one
// toolbar (search, people, filters, grouping) remembered per floor. Tickets are created and moved with BUMEX One's
// ticket actions, so its rules hold (who may create, the boards' workflows, only the reporter completes) and its
// notifications go out. A ticket opens on its page (vanguard/one/Ticket.tsx).

export type TicketTask = Task & { ticket: TaskTicket };
// what the stage picker reads of it (stages.tsx)
export { stageTicketOf } from './stages';
type View = 'board' | 'list' | 'rules'; // rules: the floor's board, its statuses and rules (Workflow.tsx)

const ticketOf = (tab?: string | null) => (tab?.startsWith('ticket:') ? tab.slice(7) : null);
export const STATUS: Record<string, [string, string]> = { backlog: ['Backlog', 'Backlog'], todo: ['À faire', 'To do'], in_progress: ['En cours', 'In progress'], review: ['En revue', 'In review'], blocked: ['Bloqué', 'Blocked'], done: ['Terminé', 'Done'] };
export const PRIORITY: Record<string, [string, string]> = { low: ['Basse', 'Low'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'] };
export const TYPES: [string, string, string][] = [['task', 'Tâche', 'Task'], ['bug', 'Anomalie', 'Bug'], ['feature', 'Évolution', 'Feature'], ['support', 'Support', 'Support'], ['client_request', 'Demande client', 'Client request'], ['internal', 'Interne', 'Internal']];
export const label = (pair: [string, string] | undefined, fallback: string, say: (fr: string, en: string) => string) => (pair ? say(pair[0], pair[1]) : fallback);
export const typeLabel = (type: string, say: (fr: string, en: string) => string) => {
  const found = TYPES.find(([key]) => key === type);
  return found ? say(found[1], found[2]) : type;
};
export const TEAM_ROLES = ['admin', 'partner', 'raf', 'manager'];

// after a change made in BUMEX One's code: the state again, with the ticket as it now is
export async function reload() {
  const result = await reloadVanguardAction().catch(() => null);
  if (result?.state) useStore.getState().hydrate(result as VanguardData);
}

// the toolbar's choices, remembered per floor in this browser (work-filters.ts)
const storeKey = (entityId: Id) => `bumex-vanguard-tasks:${entityId}`;

export function TasksRoom({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, ui, setUi } = useStore();
  const say = useSay();
  // "board:<mission>" opens that mission's board (the mission card's button, vanguard/one/Missions.tsx)
  const boardFor = initialTab?.startsWith('board:') ? initialTab.slice(6) : null;
  const legacy = ['open', 'mine', 'overdue', 'done', 'all', 'week', 'unassigned', 'unestimated', 'blocked'].includes(initialTab ?? '');
  const [view, setView] = useState<View>(() => (initialTab === 'rules' ? 'rules' : legacy || initialTab === 'list' ? 'list' : boardFor ? 'board' : readView('tasks', isPhone() ? 'list' : 'board'))); // [mobile] a phone opens on the list
  const [scope, setScope] = useState<string>(boardFor ?? 'all');
  const [filters, setFiltersState] = useState<WorkFilters>(() => {
    const saved = readFilters(storeKey(entityId));
    if (initialTab === 'mine') return { ...saved, mine: true };
    // a figure of the floor's overview: that list (Overview.tsx)
    return quickFilters(initialTab, saved, state.tasks.filter((x) => x.entityId === entityId) as TicketTask[]) ?? saved;
  });
  const setFilters = (next: WorkFilters) => { setFiltersState(next); writeFilters(storeKey(entityId), next); };
  // "ticket:<id>" opens that ticket (BUMEX One's /tickets/<id> links, lib/erp/vanguard/retired.ts)
  const [ticketId, setTicketId] = useState<string | null>(ticketOf(initialTab) ?? (ui.focusTaskId && state.tasks.some((x) => x.id === ui.focusTaskId) ? ui.focusTaskId : null));
  const [seenTab, setSeenTab] = useState(initialTab);
  if (initialTab !== seenTab) {
    setSeenTab(initialTab);
    const quick = quickFilters(initialTab, filters, state.tasks.filter((x) => x.entityId === entityId) as TicketTask[]);
    if (ticketOf(initialTab)) setTicketId(ticketOf(initialTab));
    else if (initialTab === 'rules') { setView('rules'); setTicketId(null); }
    else if (boardFor) { setView('board'); setScope(boardFor); setTicketId(null); }
    else if (quick) { setView('list'); setScope('all'); setFiltersState(quick); setTicketId(null); }
  }
  // a ticket picked elsewhere (the search, the week, My day) opens on its page
  const [seenFocus, setSeenFocus] = useState(ui.focusTaskId);
  if (ui.focusTaskId !== seenFocus) {
    setSeenFocus(ui.focusTaskId);
    if (ui.focusTaskId && state.tasks.some((x) => x.id === ui.focusTaskId)) setTicketId(ui.focusTaskId);
  }
  const close = () => { setTicketId(null); if (ui.focusTaskId) setUi({ focusTaskId: null }); };
  useBackLayer(Boolean(ticketId), close); // [mobile] Back closes the ticket (one/back.ts)
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => state.tasks.filter((x) => x.entityId === entityId) as TicketTask[], [state.tasks, entityId]);
  const me = state.session.userId;
  const inScope = useMemo(() => (scope === 'all' ? all : all.filter((x) => x.engagementId === scope)), [all, scope]);
  const shown = useMemo(() => applyFilters(inScope, filters, me, state.today), [inScope, filters, me, state.today]);
  const canCreate = TEAM_ROLES.includes(state.session.role);
  // the floor's missions as the toolbar's scopes, the running ones first
  const scopes = useMemo(
    () => state.engagements.filter((e) => e.entityId === entityId && (e as { projectId?: string }).projectId && (e.status as string) !== 'cancelled')
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || a.code.localeCompare(b.code))
      .map((m) => ({ id: m.id, label: `${m.code} · ${m.name}${m.status === 'completed' ? ` (${say('terminée', 'completed')})` : ''}` })),
    [state.engagements, entityId, say],
  );
  const groupLabels: GroupLabels = {
    unassigned: say('Non assigné', 'Unassigned'),
    priority: (p) => label(PRIORITY[p], p, say),
    mission: (id) => state.engagements.find((e) => e.id === id)?.name ?? say('Sans mission', 'No mission'),
  };

  return (
    <>
      <div className="sheet-head">
        <h1>{t('tsk_title')}</h1>
        <Tabs tabs={[{ id: 'board' as View, label: say('Tableau', 'Board') }, { id: 'list' as View, label: say('Liste', 'List') }, { id: 'rules' as View, label: say('Statuts et règles', 'Statuses and rules') }]} value={view} onChange={(v) => { setView(v); if (v !== 'rules') writeView('tasks', v); close(); }} />
        <div className="hright">{canCreate && <button className="btn sm primary" onClick={() => { setTicketId(null); setCreating(true); }}><Icon name="plus" size={13} /> {say('Créer', 'Create')}</button>}</div>
      </div>
      <div className="sheet-body">
        {ticketId ? <TicketPanel id={ticketId} onClose={close} /> : view === 'rules' ? <WorkflowEditor entityId={entityId} /> : (
          <>
            {creating && <NewTask entityId={entityId} missionId={scope === 'all' ? undefined : scope} onDone={(id) => { setCreating(false); if (id) setTicketId(id); }} />}
            <WorkToolbar tickets={inScope} filters={filters} setFilters={setFilters} scope={scope} setScope={setScope} scopeAll={say("Toutes les missions de l'étage", 'Every mission of the floor')}
              scopes={scopes} groups={['none', 'assignee', 'priority', 'mission']} count={shown.length} total={inScope.length} say={say} />
            {view === 'board'
              ? <MissionBoard entityId={entityId} scope={scope} tickets={shown} groupBy={filters.groupBy} onOpen={setTicketId} onRules={() => { setView('rules'); close(); }} />
              : <TicketList tickets={shown} columns={['key', 'title', 'status', 'priority', 'assignee', 'estimate', 'due', 'labels']} groupBy={filters.groupBy} groupLabels={groupLabels}
                  defaultSort={{ key: 'due', up: true }} onOpen={setTicketId} onChanged={() => reload()} say={say} />}
          </>
        )}
      </div>
    </>
  );
}

// ---- a new ticket ----
// Creating tickets, fast (asked on 2026-10-28): Enter or "Créer" creates the ticket and starts the next one on the same
// mission, every other field back to its default and the cursor in the summary; the tickets just created are listed to
// open. The estimate has quick choices (1 to 40 h) besides the free field.
const ESTIMATES = [1, 2, 4, 8, 16, 24, 40];

function NewTask({ entityId, missionId, onDone }: { entityId: Id; missionId?: string; onDone: (createdId?: string) => void }) {
  const { state, t, toast } = useStore();
  const say = useSay();
  const [options, setOptions] = useState<MissionOptions | null>(null);
  const missions = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed' && (e as { projectId?: string }).projectId);
  const [mission, setMission] = useState(missionId && missions.some((m) => m.id === missionId) ? missionId : missions[0]?.id ?? '');
  // stage '': the board's default; the reporter is who signs the ticket off (moves it to the completed stage): me unless chosen
  const blank = () => ({ title: '', assignee: state.session.userId, reporter: state.session.userId, dueDate: addDays(state.today, 7), priority: 'medium', type: 'task', estimate: '', description: '', stage: '' });
  const [v, setV] = useState(blank);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setV((x) => ({ ...x, ...patch }));
  const [made, setMade] = useState<{ id: string; title: string }[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const pickedProject = (missions.find((m) => m.id === mission) as { projectId?: string } | undefined)?.projectId ?? '';
  const board = useBoardOf(pickedProject ? [pickedProject] : [])(pickedProject);
  const startStages = getActiveStages(board).filter((st) => !st.is_completed);
  const [busy, setBusy] = useState(false);
  const [loads, setLoads] = useState<Awaited<ReturnType<typeof peopleLoadsAction>>>({});
  useEffect(() => { void missionOptionsAction().then(setOptions); void peopleLoadsAction().then(setLoads).catch(() => {}); }, []);

  const submit = async (open: boolean) => {
    const picked = missions.find((m) => m.id === mission) as { projectId?: string } | undefined;
    if (!v.title.trim() || !picked?.projectId || busy) return;
    const estimate = v.estimate.replace(',', '.').trim();
    if (estimate && (Number.isNaN(Number(estimate)) || Number(estimate) < 0)) { toast('error', say('Une estimation est un nombre d’heures.', 'An estimate is a number of hours.')); return; }
    const form = new FormData();
    for (const [k, val] of Object.entries({ title: v.title.trim(), description: v.description, project_id: picked.projectId, assignee_id: v.assignee, reporter_id: v.reporter || state.session.userId, priority: v.priority, type: v.type, due_date: v.dueDate, estimated_hours: estimate, stage_id: startStages.some((st) => st.id === v.stage) ? v.stage : '', create_another: '1' })) form.set(k, val);
    setBusy(true);
    try {
      const result = await createTicketAction({}, form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', t('tsk_create'));
      await reload();
      if (open) { onDone(result.created?.id); return; }
      // the next one: same mission, everything else as new
      if (result.created) setMade((m) => [result.created!, ...m].slice(0, 8));
      setV(blank());
      titleRef.current?.focus();
    } catch {
      toast('error', say("Serveur injoignable : la tâche n'est pas créée.", 'Server unreachable: the task was not created.'));
    } finally {
      setBusy(false);
    }
  };
  const keyOf = (id: string) => (state.tasks.find((x) => x.id === id) as TicketTask | undefined)?.ticket.key;

  return (
    <div className="card wk-new">
      <div className="wk-new-h">
        <h2>{say('Créer des tickets', 'Create tickets')}</h2>
        <span className="small muted">{say('Entrée crée le ticket et prépare le suivant sur la même mission.', 'Enter creates the ticket and readies the next one on the same mission.')}</span>
      </div>
      {!missions.length ? (
        <div className="banner info">{say("Un ticket se rattache à une mission : créez d'abord une mission dans la salle Missions.", 'A ticket belongs to a mission: create a mission in the Missions room first.')}</div>
      ) : (
        <div className="grid4">
          <Field label={say('Mission', 'Mission')} style={{ gridColumn: 'span 2' }}><Select recent="missions" className="in" value={mission} onChange={(e) => { setMission(e.target.value); set({ stage: '' }); }}>{missions.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</Select></Field>
          <Field label={say('Résumé', 'Summary')} style={{ gridColumn: 'span 2' }}><input ref={titleRef} className="in" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('tsk_title_ph')} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(false); } }} /></Field>
          <Field label={say('Assigné', 'Assignee')}><Select recent="people" className="in" value={v.assignee} onChange={(e) => set({ assignee: e.target.value })}><option value="">—</option>{(options?.people ?? []).map((p) => <option key={p.id} value={p.id} data-hint={loads[p.id] ? `${hoursText(loads[p.id].weekHours, say)} / ${hoursText(loads[p.id].capacityHours, say)}` : undefined} data-tone={loads[p.id]?.level}>{p.name}</option>)}</Select></Field>
          <Field label={say('Rapporteur · valide le ticket', 'Reporter · signs it off')}><Select recent="people" className="in" value={v.reporter} onChange={(e) => set({ reporter: e.target.value })} title={say('Seul le rapporteur passe le ticket à l’étape terminée.', 'Only the reporter moves the ticket to the completed stage.')}>{(options?.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.id === state.session.userId ? `${p.name} (${say('moi', 'me')})` : p.name}</option>)}</Select></Field>
          <Field label={say('Échéance', 'Due')}><input className="in" type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
          <Field label={say('Priorité', 'Priority')}><Select className="in" value={v.priority} onChange={(e) => set({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label="Type"><Select className="in" value={v.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label={say('Estimation', 'Estimate')} style={{ gridColumn: 'span 2' }}>
            <div className="wk-est-pick">
              {ESTIMATES.map((h) => (
                <button key={h} type="button" className={`wk-chip ${v.estimate === String(h) ? 'on' : ''}`} aria-pressed={v.estimate === String(h)} onClick={() => set({ estimate: v.estimate === String(h) ? '' : String(h) })}>{h} h</button>
              ))}
              <input className="in num wk-est-in" value={v.estimate} onChange={(e) => set({ estimate: e.target.value })} placeholder={say('autre', 'other')} aria-label={say('Estimation en heures', 'Estimate in hours')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(false); } }} />
            </div>
          </Field>
          <Field label={say('Étape', 'Stage')}><Select className="in" value={startStages.some((st) => st.id === v.stage) ? v.stage : getDefaultStage(board).id} onChange={(e) => set({ stage: e.target.value })}>{startStages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</Select></Field>
          <Field label={say('Description · Ctrl/⌘ Entrée pour créer', 'Description · Ctrl/⌘ Enter to create')} style={{ gridColumn: '1 / -1' }}><RichText value={v.description} onChange={(description) => set({ description })} onSubmit={() => void submit(false)} /></Field>
        </div>
      )}
      {made.length > 0 && (
        <div className="wk-made small">
          <span className="muted">{say('Créés', 'Created')} :</span>
          {made.map((c) => <button key={c.id} className="linkish" onClick={() => onDone(c.id)}><span className="mono">{keyOf(c.id) ?? ''}</span> {c.title}</button>)}
        </div>
      )}
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => onDone()}>{t('close')}</button>
        {missions.length > 0 && <button className="btn sm" disabled={busy || !v.title.trim()} onClick={() => submit(true)}>{say('Créer et ouvrir', 'Create and open')}</button>}
        {missions.length > 0 && <button className="btn sm primary" disabled={busy || !v.title.trim()} onClick={() => submit(false)}>{busy ? say('Création…', 'Creating…') : say('Créer', 'Create')}</button>}
      </div>
    </div>
  );
}
