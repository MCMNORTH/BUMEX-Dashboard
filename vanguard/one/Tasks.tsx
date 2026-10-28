import { useEffect, useMemo, useState } from 'react';
import { addDays, type Id, type Task } from '@bumex/domain';
import { reloadVanguardAction } from '@/lib/erp/vanguard/actions';
import { missionOptionsAction, type MissionOptions } from '@/lib/erp/vanguard/mission-actions';
import { peopleLoadsAction } from '@/lib/erp/vanguard/people-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import type { TaskTicket } from '@/lib/erp/vanguard/tickets';
import { createTicketAction } from '@/app/(app)/tickets/actions';
import { remainingHours } from '@/lib/work/load';
import { useStore } from '../store';
import { Field, Icon, Tabs } from '../ui/common';
import { MissionBoard } from './Board';
import { TicketPanel } from './Ticket';
import { useSay } from './say';
import { Select } from '../ui/Select';
import { NO_FILTERS, activeFilterCount, applyFilters, groupTickets, isFiltered, quickFilters, readView, stageFilterKey, writeView, type DueFilter, type GroupBy, type WorkFilters } from './work-filters';
import { Avatar, PriorityIcon, TypeIcon, hoursText } from './work-ui';
import { StageSelect, stageLabel, useBoardOf, type StageTicket } from './stages';
import { getActiveStages, getDefaultStage } from '@/lib/tickets/workflow';
import type { Say } from './ticket-history';

// Vanguard's Tasks room on BUMEX One's tickets (lib/erp/vanguard/tickets.ts), laid out as Jira's (asked on
// 2026-10-27): the board (a mission's own columns, or every mission of the floor by state) and the list, with one
// toolbar (search, people, filters, grouping) remembered per floor. Tickets are created and moved with BUMEX One's
// ticket actions, so its rules hold (who may create, the boards' workflows, only the reporter completes) and its
// notifications go out. A ticket opens on its page (vanguard/one/Ticket.tsx).

export type TicketTask = Task & { ticket: TaskTicket };
// what the stage picker reads of it (stages.tsx)
export const stageTicketOf = (x: TicketTask): StageTicket => ({
  id: x.id, projectId: x.ticket.project_id, stageId: x.ticket.stage_id, stageName: x.ticket.stage_name, status: x.ticket.status,
  assigneeId: x.ticket.assignee_id, reporterId: x.ticket.reporter_id, key: x.ticket.key, title: x.title,
});
type View = 'board' | 'list';

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
export const TEAM_ROLES = ['admin', 'partner', 'raf', 'manager'];

// after a change made in BUMEX One's code: the state again, with the ticket as it now is
export async function reload() {
  const result = await reloadVanguardAction().catch(() => null);
  if (result?.state) useStore.getState().hydrate(result as VanguardData);
}

// the toolbar's choices, remembered per floor in this browser
const storeKey = (entityId: Id) => `bumex-vanguard-tasks:${entityId}`;
function readFilters(entityId: Id): WorkFilters {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storeKey(entityId)) : null;
    return raw ? { ...NO_FILTERS, ...JSON.parse(raw) } : NO_FILTERS;
  } catch {
    return NO_FILTERS;
  }
}
function writeFilters(entityId: Id, filters: WorkFilters) {
  try { window.localStorage.setItem(storeKey(entityId), JSON.stringify(filters)); } catch { /* storage off: they stay for the visit */ }
}

export function TasksRoom({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const { state, t, ui, setUi } = useStore();
  const say = useSay();
  // "board:<mission>" opens that mission's board (the mission card's button, vanguard/one/Missions.tsx)
  const boardFor = initialTab?.startsWith('board:') ? initialTab.slice(6) : null;
  const legacy = ['open', 'mine', 'overdue', 'done', 'all', 'week', 'unassigned', 'unestimated', 'blocked'].includes(initialTab ?? '');
  const [view, setView] = useState<View>(() => (legacy || initialTab === 'list' ? 'list' : boardFor ? 'board' : readView('tasks', 'board')));
  const [scope, setScope] = useState<string>(boardFor ?? 'all');
  const [filters, setFiltersState] = useState<WorkFilters>(() => {
    const saved = readFilters(entityId);
    if (initialTab === 'mine') return { ...saved, mine: true };
    // a figure of the floor's overview: that list (Overview.tsx)
    return quickFilters(initialTab, saved, state.tasks.filter((x) => x.entityId === entityId) as TicketTask[]) ?? saved;
  });
  const setFilters = (next: WorkFilters) => { setFiltersState(next); writeFilters(entityId, next); };
  // "ticket:<id>" opens that ticket (BUMEX One's /tickets/<id> links, lib/erp/vanguard/retired.ts)
  const [ticketId, setTicketId] = useState<string | null>(ticketOf(initialTab) ?? (ui.focusTaskId && state.tasks.some((x) => x.id === ui.focusTaskId) ? ui.focusTaskId : null));
  const [seenTab, setSeenTab] = useState(initialTab);
  if (initialTab !== seenTab) {
    setSeenTab(initialTab);
    const quick = quickFilters(initialTab, filters, state.tasks.filter((x) => x.entityId === entityId) as TicketTask[]);
    if (ticketOf(initialTab)) setTicketId(ticketOf(initialTab));
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
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => state.tasks.filter((x) => x.entityId === entityId) as TicketTask[], [state.tasks, entityId]);
  const me = state.session.userId;
  const inScope = useMemo(() => (scope === 'all' ? all : all.filter((x) => x.engagementId === scope)), [all, scope]);
  const shown = useMemo(() => applyFilters(inScope, filters, me, state.today), [inScope, filters, me, state.today]);
  const canCreate = TEAM_ROLES.includes(state.session.role);

  return (
    <>
      <div className="sheet-head">
        <h1>{t('tsk_title')}</h1>
        <Tabs tabs={[{ id: 'board' as View, label: say('Tableau', 'Board') }, { id: 'list' as View, label: say('Liste', 'List') }]} value={view} onChange={(v) => { setView(v); writeView('tasks', v); close(); }} />
        <div className="hright">{canCreate && <button className="btn sm primary" onClick={() => { setTicketId(null); setCreating(true); }}><Icon name="plus" size={13} /> {say('Créer', 'Create')}</button>}</div>
      </div>
      <div className="sheet-body">
        {ticketId ? <TicketPanel id={ticketId} onClose={close} /> : (
          <>
            {creating && <NewTask entityId={entityId} missionId={scope === 'all' ? undefined : scope} onDone={(id) => { setCreating(false); if (id) setTicketId(id); }} />}
            <Toolbar entityId={entityId} tickets={inScope} filters={filters} setFilters={setFilters} scope={scope} setScope={setScope} count={shown.length} total={inScope.length} say={say} />
            {view === 'board'
              ? <MissionBoard scope={scope} tickets={shown} groupBy={filters.groupBy} onOpen={setTicketId} />
              : <TicketList tickets={shown} groupBy={filters.groupBy} onOpen={setTicketId} say={say} />}
          </>
        )}
      </div>
    </>
  );
}

// ---- the toolbar ----
function Toolbar({ entityId, tickets, filters, setFilters, scope, setScope, count, total, say }: {
  entityId: Id; tickets: TicketTask[]; filters: WorkFilters; setFilters: (f: WorkFilters) => void; scope: string; setScope: (s: string) => void; count: number; total: number; say: Say;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const missions = useMemo(
    () => state.engagements.filter((e) => e.entityId === entityId && (e as { projectId?: string }).projectId && (e.status as string) !== 'cancelled')
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || a.code.localeCompare(b.code)),
    [state.engagements, entityId],
  );
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const x of tickets) if (x.ticket.assignee_id) map.set(x.ticket.assignee_id, x.assignee);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [tickets]);
  const labels = useMemo(() => [...new Set(tickets.flatMap((x) => x.ticket.labels))].sort((a, b) => a.localeCompare(b, 'fr')), [tickets]);
  // the stages in view, by name across the boards (the built-in ones by status), in the boards' order of statuses
  const stages = useMemo(() => {
    const order = ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'];
    const map = new Map<string, { name: string; rank: number }>();
    for (const x of tickets) map.set(stageFilterKey(x), { name: stageLabel(x.ticket.stage_name, x.ticket.status, say), rank: order.indexOf(x.ticket.status) });
    return [...map].sort((a, b) => a[1].rank - b[1].rank || a[1].name.localeCompare(b[1].name, 'fr'));
  }, [tickets, say]);
  const toggle = <K extends 'people' | 'priorities' | 'types' | 'labels' | 'stages'>(key: K, value: string) =>
    setFilters({ ...filters, [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] });
  const shownPeople = people.slice(0, 6);
  const filterCount = activeFilterCount(filters);
  return (
    <div className="wk-toolbar">
      <div className="wk-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
        <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={say('Rechercher : titre, clé, étiquette…', 'Search: title, key, label…')} aria-label={say('Rechercher dans les tickets', 'Search the tickets')} />
      </div>
      <div className="wk-people" role="group" aria-label={say('Filtrer par personne', 'Filter by person')}>
        {shownPeople.map(([id, name]) => (
          <button key={id} className={filters.people.includes(id) ? 'on' : ''} onClick={() => toggle('people', id)} title={name} aria-pressed={filters.people.includes(id)}><Avatar name={name} size={28} /></button>
        ))}
        <button className={filters.people.includes('') ? 'on' : ''} onClick={() => toggle('people', '')} title={say('Non assigné', 'Unassigned')} aria-pressed={filters.people.includes('')}><Avatar name={null} size={28} title={say('Non assigné', 'Unassigned')} /></button>
        {people.length > shownPeople.length && (
          <Select className="wk-more" value="" onChange={(e) => e.target.value && toggle('people', e.target.value)} aria-label={say('Autres personnes', 'More people')}>
            <option value="">+{people.length - shownPeople.length}</option>
            {people.slice(6).map(([id, name]) => <option key={id} value={id}>{filters.people.includes(id) ? '✓ ' : ''}{name}</option>)}
          </Select>
        )}
      </div>
      <div className="menu-wrap">
        <button className={`btn sm ${filterCount ? 'on-filter' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="search" size={13} /> {say('Filtrer', 'Filter')}{filterCount > 0 && <span className="wk-badge">{filterCount}</span>}</button>
        {open && (
          <>
            <div className="wk-pop-back" onClick={() => setOpen(false)} />
            <div className="wk-pop">
              <label className="wk-check"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> {say('Mes tickets', 'My tickets')}</label>
              <label className="wk-check"><input type="checkbox" checked={filters.noEstimate} onChange={(e) => setFilters({ ...filters, noEstimate: e.target.checked })} /> {say('Sans estimation', 'No estimate')}</label>
              <div className="wk-pop-h">{say('Échéance', 'Due')}</div>
              <div className="seg-mini">{([['all', say('Toutes', 'All')], ['late', say('En retard', 'Late')], ['week', say('Cette semaine', 'This week')], ['none', say('Sans date', 'No date')]] as [DueFilter, string][]).map(([k, l]) => <button key={k} className={filters.due === k ? 'on' : ''} onClick={() => setFilters({ ...filters, due: k })}>{l}</button>)}</div>
              {stages.length > 0 && <>
                <div className="wk-pop-h">{say('État', 'Status')}</div>
                <div className="wk-tags">{stages.map(([k, st]) => <button key={k} className={`tag ${filters.stages.includes(k) ? 'on' : ''}`} onClick={() => toggle('stages', k)}>{st.name}</button>)}</div>
              </>}
              <div className="wk-pop-h">{say('Priorité', 'Priority')}</div>
              {Object.keys(PRIORITY).reverse().map((p) => <label key={p} className="wk-check"><input type="checkbox" checked={filters.priorities.includes(p)} onChange={() => toggle('priorities', p)} /> <PriorityIcon priority={p} say={say} /> {label(PRIORITY[p], p, say)}</label>)}
              <div className="wk-pop-h">Type</div>
              {TYPES.map(([k, fr, en]) => <label key={k} className="wk-check"><input type="checkbox" checked={filters.types.includes(k)} onChange={() => toggle('types', k)} /> <TypeIcon type={k} say={say} /> {say(fr, en)}</label>)}
              {labels.length > 0 && <>
                <div className="wk-pop-h">{say('Étiquettes', 'Labels')}</div>
                <div className="wk-tags">{labels.map((l) => <button key={l} className={`tag ${filters.labels.includes(l) ? 'on' : ''}`} onClick={() => toggle('labels', l)}>{l}</button>)}</div>
              </>}
            </div>
          </>
        )}
      </div>
      {isFiltered(filters) && <button className="btn sm ghost" onClick={() => setFilters({ ...NO_FILTERS, groupBy: filters.groupBy })}>{say('Effacer les filtres', 'Clear filters')}</button>}
      <span className="wk-spacer" />
      <Select className="in wk-scope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label={say('Mission', 'Mission')} recent="missions">
        <option value="all">{say("Toutes les missions de l'étage", 'Every mission of the floor')}</option>
        {missions.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}{m.status === 'completed' ? ` (${say('terminée', 'completed')})` : ''}</option>)}
      </Select>
      <Select className="in wk-group" value={filters.groupBy} onChange={(e) => setFilters({ ...filters, groupBy: e.target.value as GroupBy })} aria-label={say('Grouper', 'Group')}>
        <option value="none">{say('Grouper : aucun', 'Group: none')}</option>
        <option value="assignee">{say('Grouper : assigné', 'Group: assignee')}</option>
        <option value="priority">{say('Grouper : priorité', 'Group: priority')}</option>
        <option value="mission">{say('Grouper : mission', 'Group: mission')}</option>
      </Select>
      <span className="small muted wk-count">{count === total ? `${total} ${say('ticket(s)', 'ticket(s)')}` : `${count} / ${total}`}</span>
    </div>
  );
}

const sumHours = (list: TicketTask[]) => list.reduce((s, x) => s + remainingHours(x.ticket), 0);

// ---- the list ----
type SortKey = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'estimate' | 'due';
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };

function TicketList({ tickets, groupBy, onOpen, say }: { tickets: TicketTask[]; groupBy: GroupBy; onOpen: (id: string) => void; say: Say }) {
  const { state } = useStore();
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'due', up: true });
  const mission = (id?: string) => state.engagements.find((e) => e.id === id);
  const num = (k: string) => Number(/-(\d+)$/.exec(k)?.[1] ?? 0);
  const value = (x: TicketTask): string | number => {
    switch (sort.key) {
      case 'key': return num(x.ticket.key);
      case 'title': return x.title.toLocaleLowerCase('fr');
      case 'status': return ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'].indexOf(x.ticket.status);
      case 'priority': return PRIORITY_RANK[x.ticket.priority] ?? 2;
      case 'assignee': return x.ticket.assignee_id ? x.assignee.toLocaleLowerCase('fr') : '￿';
      case 'estimate': return Number(x.ticket.estimated_hours ?? 0);
      case 'due': return x.dueDate;
    }
  };
  const sorted = [...tickets].sort((a, b) => {
    const [va, vb] = [value(a), value(b)];
    return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.up ? 1 : -1);
  });
  const groups = groupTickets(sorted, groupBy, { unassigned: say('Non assigné', 'Unassigned'), priority: (p) => label(PRIORITY[p], p, say), mission: (id) => mission(id)?.name ?? say('Sans mission', 'No mission') });
  const head = (key: SortKey, text: string, cls?: string) => (
    <th className={cls}><button className="wk-sort" onClick={() => setSort({ key, up: sort.key === key ? !sort.up : true })}>{text}{sort.key === key && <span aria-hidden="true">{sort.up ? ' ↑' : ' ↓'}</span>}</button></th>
  );
  return (
    <div className="card flush wk-list">
      <table>
        <thead><tr>{head('key', say('Clé', 'Key'))}{head('title', say('Résumé', 'Summary'))}{head('status', say('État', 'Status'))}{head('priority', say('Priorité', 'Priority'))}{head('assignee', say('Assigné', 'Assignee'))}{head('estimate', say('Estimation', 'Estimate'), 'num')}{head('due', say('Échéance', 'Due'))}<th>{say('Étiquettes', 'Labels')}</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key} group={g} grouped={groupBy !== 'none'} onOpen={onOpen} say={say} />
          ))}
          {!tickets.length && <tr><td colSpan={8} className="muted" style={{ padding: 18 }}>{say('Aucun ticket ne correspond.', 'No ticket matches.')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, grouped, onOpen, say }: { group: { key: string; label: string; items: TicketTask[] }; grouped: boolean; onOpen: (id: string) => void; say: Say }) {
  const { state } = useStore();
  return (
    <>
      {grouped && <tr className="wk-grouprow"><td colSpan={8}><b>{group.label}</b> <span className="muted">· {group.items.length} · {hoursText(sumHours(group.items), say)}</span></td></tr>}
      {group.items.map((x) => {
        const late = x.status !== 'done' && x.dueDate !== NO_DUE_DATE && x.dueDate < state.today;
        const est = Number(x.ticket.estimated_hours ?? 0);
        return (
          <tr key={x.id} className="click" onClick={() => onOpen(x.id)}>
            <td className="nowrap"><span className="wk-keycell"><TypeIcon type={x.ticket.type} say={say} /> <span className="mono">{x.ticket.key}</span></span></td>
            <td className={x.status === 'done' ? 'wk-done' : ''}>{x.title}</td>
            <td onClick={(e) => e.stopPropagation()}><StageSelect ticket={stageTicketOf(x)} onMoved={reload} /></td>
            <td><span className="wk-inline"><PriorityIcon priority={x.ticket.priority} say={say} /> {label(PRIORITY[x.ticket.priority], x.ticket.priority, say)}</span></td>
            <td><span className="wk-inline"><Avatar name={x.ticket.assignee_id ? x.assignee : null} size={22} /> {x.ticket.assignee_id ? x.assignee : <span className="muted">{say('Non assigné', 'Unassigned')}</span>}</span></td>
            <td className="num">{est ? hoursText(est, say) : <span className="muted">—</span>}{x.ticket.logged_minutes > 0 && <div className="small muted">{hoursText(x.ticket.logged_minutes / 60, say)} {say('passées', 'spent')}</div>}</td>
            <td className={late ? 'late nowrap' : 'nowrap'}>{x.dueDate === NO_DUE_DATE ? '—' : x.dueDate.split('-').reverse().join('/')}</td>
            <td><div className="wk-tags">{x.ticket.labels.map((l) => <span key={l} className="tag">{l}</span>)}</div></td>
          </tr>
        );
      })}
    </>
  );
}

// ---- a new ticket ----
function NewTask({ entityId, missionId, onDone }: { entityId: Id; missionId?: string; onDone: (createdId?: string) => void }) {
  const { state, t, toast } = useStore();
  const say = useSay();
  const [options, setOptions] = useState<MissionOptions | null>(null);
  const missions = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed' && (e as { projectId?: string }).projectId);
  const [title, setTitle] = useState('');
  const [mission, setMission] = useState(missionId && missions.some((m) => m.id === missionId) ? missionId : missions[0]?.id ?? '');
  const [assignee, setAssignee] = useState(state.session.userId);
  const [dueDate, setDueDate] = useState(addDays(state.today, 7));
  const [priority, setPriority] = useState('medium');
  const [type, setType] = useState('task');
  const [estimate, setEstimate] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState(''); // '' = the board's default stage
  const pickedProject = (missions.find((m) => m.id === mission) as { projectId?: string } | undefined)?.projectId ?? '';
  const board = useBoardOf(pickedProject ? [pickedProject] : [])(pickedProject);
  const startStages = getActiveStages(board).filter((s) => !s.is_completed);
  const [busy, setBusy] = useState(false);
  const [loads, setLoads] = useState<Awaited<ReturnType<typeof peopleLoadsAction>>>({});
  useEffect(() => { void missionOptionsAction().then(setOptions); void peopleLoadsAction().then(setLoads).catch(() => {}); }, []);

  const submit = async (open: boolean) => {
    const picked = missions.find((m) => m.id === mission) as { projectId?: string } | undefined;
    if (!title.trim() || !picked?.projectId) return;
    if (estimate && (Number.isNaN(Number(estimate.replace(',', '.'))) || Number(estimate.replace(',', '.')) < 0)) { toast('error', say('Une estimation est un nombre d’heures.', 'An estimate is a number of hours.')); return; }
    const form = new FormData();
    for (const [k, v] of Object.entries({ title: title.trim(), description, project_id: picked.projectId, assignee_id: assignee, reporter_id: state.session.userId, priority, type, due_date: dueDate, estimated_hours: estimate.replace(',', '.'), stage_id: startStages.some((s) => s.id === stage) ? stage : '', create_another: '1' })) form.set(k, v);
    setBusy(true);
    try {
      const result = await createTicketAction({}, form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', t('tsk_create'));
      await reload();
      if (open) onDone(result.created?.id);
      else { setTitle(''); setDescription(''); setEstimate(''); }
    } catch {
      toast('error', say("Serveur injoignable : la tâche n'est pas créée.", 'Server unreachable: the task was not created.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card wk-new">
      <h2>{say('Créer un ticket', 'Create a ticket')}</h2>
      {!missions.length ? (
        <div className="banner info">{say("Un ticket se rattache à une mission : créez d'abord une mission dans la salle Missions.", 'A ticket belongs to a mission: create a mission in the Missions room first.')}</div>
      ) : (
        <div className="grid4">
          <Field label={say('Résumé', 'Summary')} style={{ gridColumn: 'span 2' }}><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tsk_title_ph')} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit(true)} /></Field>
          <Field label={say('Mission', 'Mission')} style={{ gridColumn: 'span 2' }}><Select recent="missions" className="in" value={mission} onChange={(e) => { setMission(e.target.value); setStage(''); }}>{missions.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</Select></Field>
          <Field label={say('Assigné', 'Assignee')}><Select recent="people" className="in" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">—</option>{(options?.people ?? []).map((p) => <option key={p.id} value={p.id} data-hint={loads[p.id] ? `${hoursText(loads[p.id].weekHours, say)} / ${hoursText(loads[p.id].capacityHours, say)}` : undefined} data-tone={loads[p.id]?.level}>{p.name}</option>)}</Select></Field>
          <Field label={say('Échéance', 'Due')}><input className="in" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label={say('Priorité', 'Priority')}><Select className="in" value={priority} onChange={(e) => setPriority(e.target.value)}>{Object.entries(PRIORITY).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label="Type"><Select className="in" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label={say('Estimation (h)', 'Estimate (h)')}><input className="in num" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder={say('ex. 4', 'e.g. 4')} /></Field>
          <Field label={say('Étape', 'Stage')}><Select className="in" value={startStages.some((s) => s.id === stage) ? stage : getDefaultStage(board).id} onChange={(e) => setStage(e.target.value)}>{startStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Description" style={{ gridColumn: 'span 2' }}><input className="in" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      )}
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => onDone()}>{t('close')}</button>
        {missions.length > 0 && <button className="btn sm" disabled={busy || !title.trim()} onClick={() => submit(false)}>{say('Créer et continuer', 'Create another')}</button>}
        {missions.length > 0 && <button className="btn sm primary" disabled={busy || !title.trim()} onClick={() => submit(true)}>{busy ? say('Création…', 'Creating…') : say('Créer', 'Create')}</button>}
      </div>
    </div>
  );
}
