import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Id } from '@bumex/domain';
import { toggleSubtaskAction } from '@/app/(app)/tickets/actions';
import { myWorkAction, type MyWorkData } from '@/lib/erp/vanguard/myday-actions';
import { markNotificationAsReadAction } from '@/lib/notifications/actions';
import { stageStatus } from '@/lib/tickets/workflow';
import type { TicketStatus } from '@/types/ticket';
import type { BoardWorkflow } from '@/types/workflow';
import { useStore } from '../store';
import { useBackLayer } from './back'; // [mobile]
import { Icon, Tabs } from '../ui/common';
import { BoardHint, MoveReason, TicketBoard, boardColumns, stageIdOf, useTicketMove, type MissionTag, type MoveFlow, type MoveTarget } from './Board';
import { dueIn, hasDeadline } from './Missions';
import { QuickLogDialog } from './QuickLog';
import { TicketPanel } from './Ticket';
import { TicketList, type ListChange } from './TicketList';
import { PRIORITY, label, reload } from './Tasks';
import { isPhone } from './screen';
import { WorkToolbar, type Scope } from './WorkToolbar';
import { StageLozenge, moveCheck, stageTicketOf, useBoardOf, useBoardsReady } from './stages';
import { useSay } from './say';
import { ago, type Say } from './ticket-history';
import { applyFilters, isFiltered, quickCounts, readFilters, readView, workTicketOf, writeFilters, writeView, type GroupBy, type GroupLabels, type MyCard, type WorkFilters, type WorkView } from './work-filters';
import { Avatar, Block, Figure, LoadBar, Lozenge, PriorityIcon, TypeIcon, hoursText, levelLabel, type Tone } from './work-ui';

// "Mon travail": everything the person has to do, on every floor (asked on 2026-10-27), redrawn on 2026-10-29 ("i like
// how the board looks in tasks page but i dont like how it looks in my work page") out of the Tasks room's own parts:
// the same toolbar (WorkToolbar.tsx), list (TicketList.tsx) and board (Board.tsx), one board per floor of their tickets
// (each floor has its board, 0014). Above them, the figures that matter (load, time, late, due this week, to estimate;
// the three counts filter), below them what waits on the person (their sign-off, mentions, the missions they lead),
// then their sub-tasks, what they reported and their missions; each block only when it holds something. A ticket opens
// here, and back returns where one was. Moves follow each board's rules (BUMEX One's ticket action).

const FILTER_KEY = 'bumex-vanguard-mywork';
const ticketOf = (tab?: string | null) => (tab?.startsWith('ticket:') ? tab.slice(7) : null);
const viewOf = (tab?: string | null): WorkView | null => (tab === 'board' || tab === 'list' ? tab : null);
const minutes = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const MORE = 8; // rows of a block before "see all"

type Data = MyWorkData;
type SetData = Dispatch<SetStateAction<Data | null | undefined>>;
type Mission = MissionTag & { other: string | null };

// the room: the rail's "Mon travail" (ui/Sidebar.tsx); tab: "board", "list", "ticket:<id>"
export function MyWorkRoom({ entityId, initialTab }: { entityId: Id; initialTab?: string | null }) {
  const say = useSay();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  // the view chosen last; else the board, but the list on a phone
  const [view, setView] = useState<WorkView>(() => viewOf(initialTab) ?? readView('mywork', isPhone() ? 'list' : 'board'));
  const [ticketId, setTicketId] = useState<string | null>(ticketOf(initialTab));
  const [seenTab, setSeenTab] = useState(initialTab);
  if (initialTab !== seenTab) {
    setSeenTab(initialTab);
    if (ticketOf(initialTab)) setTicketId(ticketOf(initialTab));
    else if (viewOf(initialTab)) { setView(viewOf(initialTab)!); setTicketId(null); }
  }
  const [logging, setLogging] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const scroll = useRef<number | null>(null);

  // read again whenever the state is (a ticket moved, time logged, the ↻ button)
  useEffect(() => {
    let live = true;
    myWorkAction().then((d) => { if (live) setData(d); }).catch(() => { if (live) setData((x) => x ?? null); });
    return () => { live = false; };
  }, [loadedAt, attempt]);

  const refresh = useCallback(async () => {
    const before = useStore.getState().loadedAt;
    await reload();
    // the state did not move (unreachable): My work is read on its own, and kept as it is if that fails too
    if (useStore.getState().loadedAt === before) {
      const fresh = await myWorkAction().catch(() => null);
      if (fresh) setData(fresh);
    }
  }, []);
  const open = useCallback((id: string) => {
    scroll.current = body.current?.scrollTop ?? null;
    setTicketId(id);
  }, []);
  // a ticket opens at its top (and stays where it is read when it is saved: My work is read again meanwhile); back
  // finds My work where it was
  useLayoutEffect(() => {
    if (ticketId && body.current) body.current.scrollTop = 0;
  }, [ticketId]);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || ticketId || scroll.current === null || !data) return;
    el.scrollTop = scroll.current;
    scroll.current = null;
  }, [ticketId, data]);

  useBackLayer(Boolean(ticketId), () => setTicketId(null)); // [mobile] Back closes the ticket (one/back.ts)
  const pick = (v: WorkView) => { setView(v); writeView('mywork', v); setTicketId(null); };
  return (
    <>
      <div className="sheet-head">
        <h1>{say('Mon travail', 'My work')}</h1>
        <Tabs tabs={[{ id: 'board' as WorkView, label: say('Tableau', 'Board') }, { id: 'list' as WorkView, label: say('Liste', 'List') }]} value={view} onChange={pick} />
        <div className="hright">
          {data?.week && (
            <button className="btn sm primary" onClick={() => setLogging(true)} aria-label={say('Saisir du temps', 'Log time')} title={say('Saisir du temps', 'Log time')}>
              <Icon name="clock" size={13} /> <span className="mw-log-l">{say('Saisir du temps', 'Log time')}</span>
            </button>
          )}
        </div>
      </div>
      <div className="sheet-body" ref={body}>
        {ticketId && <TicketPanel id={ticketId} onClose={() => setTicketId(null)} backLabel={say('Retour à mon travail', 'Back to my work')} />}
        {/* kept under an open ticket, as it was (search, mission, sort, what was unfolded): back finds it there */}
        <div hidden={Boolean(ticketId)}>
          {data === undefined ? <div className="card"><span className="muted">{say('Chargement de votre travail…', 'Loading your work…')}</span></div>
            : data === null ? (
              <div className="banner crit mw-failed">
                <span>{say('Mon travail est indisponible.', 'My work is unavailable.')}</span>
                <button className="btn sm" onClick={() => { setData(undefined); setAttempt((n) => n + 1); }}>{say('Réessayer', 'Retry')}</button>
              </div>
            )
            : <MyWorkBody data={data} setData={setData} view={view} entityId={entityId} onOpen={open} refresh={refresh} say={say} />}
        </div>
      </div>
      {logging && <QuickLogDialog onClose={() => setLogging(false)} onSaved={() => void refresh()} />}
    </>
  );
}

function MyWorkBody({ data, setData, view, entityId, onOpen, refresh, say }: {
  data: Data; setData: SetData; view: WorkView; entityId: Id; onOpen: (id: string) => void; refresh: () => Promise<void>; say: Say;
}) {
  const today = useStore((s) => s.state.today);
  const me = useStore((s) => s.state.session.userId);
  const engagements = useStore((s) => s.state.engagements);
  const testMode = useStore((s) => s.state.session.testMode === true);
  const [filters, setFiltersState] = useState<WorkFilters>(() => readFilters(FILTER_KEY));
  // remembered in this browser, the search apart (a forgotten search would hide work)
  const setFilters = (f: WorkFilters) => { setFiltersState(f); writeFilters(FILTER_KEY, { ...f, search: '' }); };
  const [scopeId, setScope] = useState('all');
  const toolbar = useRef<HTMLDivElement>(null);

  // a ticket's mission: the person's missions (code, other floor), else the floor's state, else its project's name; one
  // object per mission from render to render (the cards are memoised)
  const missions = useMemo(() => {
    const map = new Map<string, Mission>();
    const named = [...data.tickets, ...data.signOff, ...data.reported, ...data.lead.map((l) => l.ticket)];
    for (const t of named) if (t.projectName && !map.has(t.projectId)) map.set(t.projectId, { code: '', name: t.projectName, other: null });
    for (const e of engagements) map.set(e.id, { code: e.code, name: e.name, other: null });
    for (const m of data.missions) map.set(m.id, { code: m.code ?? '', name: m.name, other: m.home ? null : m.entity });
    return map;
  }, [data.tickets, data.signOff, data.reported, data.lead, data.missions, engagements]);
  const missionOf = useCallback((projectId: string): Mission | null => missions.get(projectId) ?? null, [missions]);
  const cards = useMemo(() => data.tickets.map((t) => workTicketOf(t, missionOf(t.projectId))), [data.tickets, missionOf]);
  const open = useMemo(() => cards.filter((c) => c.status !== 'done'), [cards]);
  // a mission none of my tickets is on any more (they moved on) shows them all: nothing hides behind a scope gone
  const scope = cards.some((c) => c.ticket.project_id === scopeId) ? scopeId : 'all';
  const inScope = scope === 'all' ? cards : cards.filter((c) => c.ticket.project_id === scope);
  const shown = applyFilters(inScope, filters, me, today);
  const counts = quickCounts(open, me, today);
  const boardOf = useBoardOf(cards.map((c) => c.ticket.project_id));
  const cardMission = useCallback((x: MyCard) => missionOf(x.ticket.project_id), [missionOf]);

  // a moved ticket settles in its new column at once (the server has accepted), then everything is read again
  const flow = useTicketMove(async (id: string, target: MoveTarget) => {
    setData((d) => d && {
      ...d,
      tickets: d.tickets.map((t) => {
        if (t.id !== id) return t;
        if (!('stageId' in target)) return { ...t, status: target.status, stageId: null, stageName: null }; // built-in: its column is its status
        const stage = boardOf(t.projectId).stages.find((s) => s.id === target.stageId);
        return stage ? { ...t, stageId: stage.id, stageName: stage.name, status: stageStatus(stage) } : t;
      }),
    });
    await refresh();
  });
  // a stage picked in the list or on a card (touch), or time logged: shown at once, then read again (the picker waits)
  const changed = useCallback((change?: ListChange) => {
    if (change) setData((d) => d && { ...d, tickets: d.tickets.map((t) => (t.id === change.id ? { ...t, stageId: change.stage.id, stageName: change.stage.name, status: change.stage.status } : t)) });
    return refresh();
  }, [refresh, setData]);

  const groupLabels: GroupLabels = {
    unassigned: say('Non assigné', 'Unassigned'),
    priority: (p) => label(PRIORITY[p], p, say),
    mission: (id) => missionOf(id ?? '')?.name ?? say('Sans mission', 'No mission'),
  };
  // the missions of my tickets, by floor when there are several (this floor's first, as its board)
  const entities = useStore((s) => s.state.entities);
  const scopes: Scope[] = useMemo(() => {
    const ids = [...new Set(cards.map((c) => c.ticket.project_id))];
    const floorOf = (pid: string) => boardOf(pid).entity_id ?? '';
    const several = new Set(ids.map(floorOf)).size > 1;
    const away = (pid: string) => Number(floorOf(pid) !== entityId);
    return ids
      .map((pid) => {
        const m = missionOf(pid);
        return { id: pid, label: m ? `${m.code ? `${m.code} · ` : ''}${m.name}` : pid, group: several ? entities.find((e) => e.id === floorOf(pid))?.name ?? say('Autres', 'Others') : undefined };
      })
      .sort((a, b) => away(a.id) - away(b.id) || (a.group ?? '').localeCompare(b.group ?? '') || a.label.localeCompare(b.label, 'fr'));
  }, [cards, boardOf, missionOf, entities, entityId, say]);
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector<HTMLElement>(`#${id} h2`)?.focus({ preventScroll: true });
  };
  const toMission = (id: string) => {
    setScope(id);
    toolbar.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const shownOpen = shown.filter((c) => c.status !== 'done');
  const shownDone = shown.filter((c) => c.status === 'done');

  return (
    <div className="mw">
      <MyFigures data={data} counts={counts} filters={filters} setFilters={setFilters} testMode={testMode} onJump={jump} say={say} />

      {cards.length ? (
        <>
          <div ref={toolbar} className="mw-toolbar">
            <WorkToolbar tickets={inScope} filters={filters} setFilters={setFilters} scope={scope} setScope={setScope} scopeAll={say('Toutes mes missions', 'All my missions')} scopes={scopes}
              groups={['none', 'priority', 'mission']} people={false} count={shownOpen.length} total={inScope.filter((c) => c.status !== 'done').length} noun={['ouverts', 'open']} say={say} />
          </div>
          <MoveReason flow={flow} say={say} />
          {view === 'board'
            ? <FloorBoards all={cards} cards={shown} entityId={entityId} boardOf={boardOf} flow={flow} groupBy={filters.groupBy} groupLabels={groupLabels}
                filtered={isFiltered(filters) || scope !== 'all'} missionOf={cardMission} onOpen={onOpen} onChanged={changed} say={say} />
            : <TicketList tickets={shownOpen} done={shownDone} columns={['key', 'title', 'status', 'priority', 'mission', 'estimate', 'due', 'labels', 'log']} groupBy={filters.groupBy}
                groupLabels={groupLabels} defaultSort={null} onOpen={onOpen} onChanged={changed} missionOf={cardMission} say={say} />}
        </>
      ) : (
        <div className="card mw-none">
          <b>{say('Rien ne vous est assigné. Profitez-en !', 'Nothing is assigned to you.')}</b>
          <button className="linkish" onClick={() => useStore.getState().openRoom('tasks')}>{say("Voir les tâches de l'étage", "See the floor's tasks")} →</button>
        </div>
      )}

      <div className="ov-grid mw-lower">
        {data.signOff.length > 0 && <SignOffBlock data={data} setData={setData} missionOf={missionOf} onOpen={onOpen} refresh={refresh} say={say} />}
        {data.mentions.length > 0 && <MentionsBlock data={data} setData={setData} onOpen={onOpen} say={say} />}
        {data.lead.length > 0 && <LeadBlock data={data} missionOf={missionOf} onOpen={onOpen} say={say} />}
        {data.subtasks.length > 0 && <SubtasksBlock data={data} setData={setData} onOpen={onOpen} refresh={refresh} say={say} />}
        {data.reported.length > 0 && <ReportedBlock data={data} onOpen={onOpen} say={say} />}
        <MissionsBlock data={data} onScope={toMission} say={say} />
      </div>

      <details className="mw-note">
        <summary className="small muted">{say('Comment la charge est-elle calculée ?', 'How is the load computed?')}</summary>
        <p className="small muted">{say('La charge compte les heures estimées de tous vos tickets ouverts (quelle que soit leur échéance, en revue comprise), face à votre capacité de la semaine. Un ticket terminé ne compte plus ; un ticket sans estimation compte 0.', 'The load counts the estimated hours of all your open tickets (whatever their due date, in review included) against your weekly capacity. A done ticket no longer counts; a ticket without an estimate counts 0.')}</p>
      </details>
    </div>
  );
}

// ---- the figures: load, time, and three counts that filter the tickets below ----

function MyFigures({ data, counts, filters, setFilters, testMode, onJump, say }: {
  data: Data; counts: ReturnType<typeof quickCounts>; filters: WorkFilters; setFilters: (f: WorkFilters) => void; testMode: boolean; onJump: (id: string) => void; say: Say;
}) {
  const { load } = data;
  const week = testMode ? null : data.week; // [bumex-one] on the test floor its time is apart (0013)
  const capacity = Math.max(1, (data.week?.capacityHours ?? load.capacityHours) * 60);
  const status = week?.status;
  const weekTone: Tone = status === 'approved' ? 'done' : status === 'returned' ? 'blocked' : status === 'submitted' ? 'review' : 'todo';
  const weekText = status === 'approved' ? say('Validée', 'Approved') : status === 'submitted' ? say('Envoyée', 'Submitted') : status === 'returned' ? say('À corriger', 'Needs changes') : week?.loggedMinutes ? say('En cours', 'In progress') : say('Rien de saisi', 'Nothing logged');
  const due = (d: 'late' | 'week') => setFilters({ ...filters, due: filters.due === d ? 'all' : d });
  return (
    <div className={`ov-figs mw-figs ${week ? '' : 'solo'}`} role="group" aria-label={say('Mes chiffres', 'My figures')}>
      <Figure className="mw-fig-wide" tone={load.level === 'overloaded' ? 'crit' : load.level === 'high' ? 'warn' : undefined}
        value={<>{hoursText(load.weekHours, say)} <span className="mw-fig-of">/ {hoursText(load.capacityHours, say)}</span></>}
        label={<span className="mw-fig-l">{say('Ma charge', 'My load')} <span className={`loadlvl ${load.level}`}>{levelLabel(load.level, say)} · {load.percent} %</span></span>}
        hint={`${load.count} ${say('ticket(s) ouvert(s)', 'open ticket(s)')} · ${hoursText(load.openHours, say)} ${say('restantes une fois le temps saisi déduit', 'left once logged time is taken off')}`}>
        <LoadBar load={load} say={say} compact />
      </Figure>
      {week && (
        <Figure className="mw-fig-wide" tone={status === 'returned' ? 'warn' : undefined} onClick={() => useStore.getState().openRoom('time')} hint={say('Ouvrir ma feuille de temps', 'Open my timesheet')}
          value={<>{minutes(week.loggedMinutes)} <span className="mw-fig-of">/ {week.capacityHours} h</span></>}
          label={<span className="mw-fig-l">{say('Mon temps · semaine', 'My time · week')} <Lozenge tone={weekTone}>{weekText}</Lozenge></span>}>
          <span className="ov-hours-bar"><i style={{ width: `${Math.min(100, (week.loggedMinutes / capacity) * 100)}%` }} /></span>
        </Figure>
      )}
      <Figure value={counts.late} label={say('En retard', 'Late')} tone={counts.late ? 'crit' : 'good'} onClick={() => due('late')} on={filters.due === 'late'} hint={say('Filtrer : en retard', 'Filter: late')} />
      <Figure value={counts.week} label={say('À rendre cette semaine', 'Due this week')} onClick={() => due('week')} on={filters.due === 'week'} hint={say('Filtrer : cette semaine', 'Filter: this week')} />
      <Figure value={counts.unestimated} label={say('À estimer', 'To estimate')} tone={counts.unestimated ? 'warn' : undefined} onClick={() => setFilters({ ...filters, noEstimate: !filters.noEstimate })} on={filters.noEstimate} hint={say('Filtrer : sans estimation', 'Filter: no estimate')} />
      {data.signOff.length > 0 && <Figure value={data.signOff.length} label={say('À valider', 'To sign off')} tone="warn" onClick={() => onJump('mw-signoff')} />}
      {data.mentions.length > 0 && <Figure value={data.mentions.length} label={say('Mentions non lues', 'Unread mentions')} onClick={() => onJump('mw-mentions')} />}
    </div>
  );
}

// ---- the boards: one per floor of my tickets, each the Tasks board with its floor's stages ----

function FloorBoards({ all, cards, entityId, boardOf, flow, groupBy, groupLabels, filtered, missionOf, onOpen, onChanged, say }: {
  all: MyCard[]; cards: MyCard[]; entityId: Id; boardOf: (projectId: string) => BoardWorkflow; flow: MoveFlow; groupBy: GroupBy; groupLabels: GroupLabels;
  filtered: boolean; missionOf: (x: MyCard) => Mission | null; onOpen: (id: string) => void; onChanged: (change?: ListChange) => void | Promise<void>; say: Say;
}) {
  const entities = useStore((s) => s.state.entities);
  const me = useStore((s) => s.state.session.userId);
  // the floors are their boards' (0014): known once every board is read, so the built-in columns never flash
  const ready = useBoardsReady(all.map((c) => c.ticket.project_id));
  const columnOf = useCallback((x: MyCard) => stageIdOf(boardOf(x.ticket.project_id), x), [boardOf]);
  const dropCheck = useCallback((x: MyCard, c: { id: string }) => moveCheck(boardOf(x.ticket.project_id), stageTicketOf(x), c.id, me), [boardOf, me]);
  if (!ready) return <div className="card"><span className="muted">{say('Chargement du tableau…', 'Loading the board…')}</span></div>;
  const floorOf = (pid: string) => { const w = boardOf(pid); return w.is_configured && w.entity_id ? w.entity_id : 'builtin'; };
  const nameOf = (floor: string) => (floor === 'builtin' ? say('Autres tickets', 'Other tickets') : entities.find((e) => e.id === floor)?.name ?? say('Autre étage', 'Other floor'));
  const floors = [...new Set(all.map((c) => floorOf(c.ticket.project_id)))]
    .sort((a, b) => Number(b === entityId) - Number(a === entityId) || Number(a === 'builtin') - Number(b === 'builtin') || nameOf(a).localeCompare(nameOf(b), 'fr'));
  // filtered, a floor where nothing matches goes (when there are several); none left says so
  const shown = floors.map((floor) => ({ floor, mine: cards.filter((c) => floorOf(c.ticket.project_id) === floor) }))
    .filter(({ mine }) => floors.length === 1 || !filtered || mine.length > 0);
  return (
    <div className="mw-boards">
      {!shown.length && <div className="card"><span className="muted">{say('Aucun ticket ne correspond.', 'No ticket matches.')}</span></div>}
      {shown.map(({ floor, mine }) => {
        const workflow = boardOf(all.find((c) => floorOf(c.ticket.project_id) === floor)!.ticket.project_id);
        return (
          <section key={floor} className="mw-floor" aria-label={floors.length > 1 ? nameOf(floor) : undefined}>
            {floors.length > 1 && (
              <h3 className="mw-floor-h">
                {floor === 'builtin' ? nameOf(floor) : `${say('Tableau de', 'Board of')} ${nameOf(floor)}`} <span className="tk-count">{mine.length}</span>
                {floor !== entityId && floor !== 'builtin' && <span className="tag mw-other">{say('autre étage', 'other floor')}</span>}
              </h3>
            )}
            <TicketBoard columns={boardColumns(workflow, mine)} tickets={mine} columnOf={columnOf} groupBy={groupBy} groupLabels={groupLabels} busyId={flow.busyId} onOpen={onOpen}
              onMove={(x, c) => void flow.move({ id: x.id, label: x.ticket.key || x.title }, workflow.is_configured ? { stageId: c.id } : { status: (c.completed ? 'done' : c.id) as TicketStatus }, c.name)}
              dropCheck={dropCheck} showMission missionOf={missionOf} onChanged={onChanged} foldKey={`mywork:${floor}`} say={say} />
          </section>
        );
      })}
      <BoardHint say={say} />
    </div>
  );
}

// ---- below the board: what waits on me, then what I follow ----

function TicketLine({ t, sub, busy, onOpen, say, children }: {
  t: { id: string; key: string | null; type: string; title: string }; sub?: ReactNode; busy?: boolean; onOpen: (id: string) => void; say: Say; children?: ReactNode;
}) {
  return (
    <div className={`mw-ticket ${busy ? 'busy' : ''}`}>
      <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <span className="mono">{t.key ?? '—'}</span></span>
      <button className="linkish mw-title" onClick={() => onOpen(t.id)}>{t.title}{sub ? <span className="small muted"> · {sub}</span> : null}</button>
      {children}
    </div>
  );
}

function More({ count, open, setOpen, say }: { count: number; open: boolean; setOpen: (v: boolean) => void; say: Say }) {
  if (count <= MORE) return null;
  return <button className="linkish small mw-more" onClick={() => setOpen(!open)}>{open ? say('Voir moins', 'See less') : say(`Voir les ${count}`, `See all ${count}`)}</button>;
}

// the tickets waiting for my sign-off (I reported them): one click passes them to their completed stage
function SignOffBlock({ data, setData, missionOf, onOpen, refresh, say }: { data: Data; setData: SetData; missionOf: (pid: string) => Mission | null; onOpen: (id: string) => void; refresh: () => Promise<void>; say: Say }) {
  const [now] = useState(Date.now);
  const flow = useTicketMove(async (id: string) => {
    setData((d) => d && { ...d, signOff: d.signOff.filter((s) => s.id !== id) });
    await refresh();
  });
  return (
    <Block id="mw-signoff" title={say('À valider', 'To sign off')} count={data.signOff.length} tone="warn" extra={<span className="small muted">{say('vous êtes le rapporteur', 'you are the reporter')}</span>}>
      <MoveReason flow={flow} say={say} />
      <div className="mw-rows">
        {data.signOff.map((t) => (
          <TicketLine key={t.id} t={t} sub={missionOf(t.projectId)?.code || t.projectName} busy={flow.busyId === t.id} onOpen={onOpen} say={say}>
            <Avatar name={t.assigneeName} size={22} />
            <span className="small muted mw-since" title={say('Dernier changement', 'Last change')}>{ago(t.updatedAt, now, say)}</span>
            <button className="btn sm primary" disabled={flow.busyId === t.id} title={say(`Passer à « ${t.completedStageName} »`, `Move to "${t.completedStageName}"`)}
              onClick={() => void flow.move({ id: t.id, label: t.key ?? t.title }, { stageId: t.completedStageId }, t.completedStageName)}>{say('Valider', 'Sign off')}</button>
          </TicketLine>
        ))}
      </div>
    </Block>
  );
}

// the mentions and comments I have not read: read here (a ticket opens in My work), or all marked read
function MentionsBlock({ data, setData, onOpen, say }: { data: Data; setData: SetData; onOpen: (id: string) => void; say: Say }) {
  const [now] = useState(Date.now);
  const read = async (m: Data['mentions'][number], go: boolean) => {
    setData((d) => d && { ...d, mentions: d.mentions.filter((x) => x.id !== m.id) });
    await markNotificationAsReadAction(m.id).catch(() => null);
    if (!go || !m.subjectId) return;
    if (m.subjectType === 'ticket' || m.subjectType === 'task') onOpen(m.subjectId);
    else if (m.subjectType === 'project') useStore.getState().openRoom('missions', `mission:${m.subjectId}`);
    else useStore.getState().openRoom('inbox');
  };
  const readAll = async () => {
    const ids = data.mentions.map((m) => m.id);
    setData((d) => d && { ...d, mentions: d.mentions.filter((m) => !ids.includes(m.id)) });
    await Promise.all(ids.map((id) => markNotificationAsReadAction(id).catch(() => null)));
  };
  return (
    <Block id="mw-mentions" title={say('Mentions et commentaires', 'Mentions and comments')} count={data.mentions.length}
      extra={<span className="mw-extra"><button className="linkish small" onClick={() => void readAll()}>{say('Tout marquer comme lu', 'Mark all read')}</button><button className="linkish small" onClick={() => useStore.getState().openRoom('inbox')}>{say('Notifications', 'Notifications')} →</button></span>}>
      <div className="mw-rows">
        {data.mentions.map((m) => (
          <div key={m.id} className="mw-mention">
            <button className="linkish grow" onClick={() => void read(m, true)}><b>{m.title}</b><div className="small muted mw-clip">{m.body}</div></button>
            <span className="small muted">{ago(m.at, now, say)}</span>
            <button className="btn sm ghost" onClick={() => void read(m, false)} title={say('Marquer comme lu', 'Mark as read')} aria-label={say('Marquer comme lu', 'Mark as read')}><Icon name="close" size={12} /></button>
          </div>
        ))}
      </div>
    </Block>
  );
}

// on the missions I lead: the tickets left unassigned, unestimated or late
function LeadBlock({ data, missionOf, onOpen, say }: { data: Data; missionOf: (pid: string) => Mission | null; onOpen: (id: string) => void; say: Say }) {
  const [all, setAll] = useState(false);
  return (
    <Block title={say('Sur mes missions', 'On my missions')} count={data.lead.length} tone="warn" extra={<span className="small muted">{say('à assigner · à estimer · en retard', 'to assign · to estimate · late')}</span>}>
      <div className="mw-rows">
        {(all ? data.lead : data.lead.slice(0, MORE)).map(({ ticket: t, reasons }) => (
          <TicketLine key={t.id} t={t} sub={missionOf(t.projectId)?.code || t.projectName} onOpen={onOpen} say={say}>
            {reasons.map((r) => <span key={r} className={`tag ${r === 'late' ? 'late' : ''}`}>{r === 'unassigned' ? say('Non assigné', 'Unassigned') : r === 'unestimated' ? say('À estimer', 'To estimate') : say('En retard', 'Late')}</span>)}
            <PriorityIcon priority={t.priority} say={say} />
            <Avatar name={t.assigneeName} size={22} />
          </TicketLine>
        ))}
      </div>
      <More count={data.lead.length} open={all} setOpen={setAll} say={say} />
    </Block>
  );
}

// my sub-tasks in others' tickets: ticked here at once (put back if refused)
function SubtasksBlock({ data, setData, onOpen, refresh, say }: { data: Data; setData: SetData; onOpen: (id: string) => void; refresh: () => Promise<void>; say: Say }) {
  const toast = useStore((s) => s.toast);
  const today = useStore((s) => s.state.today);
  const sorted = [...data.subtasks].sort((a, b) => Number(a.done) - Number(b.done));
  const tick = async (id: string, value: boolean) => {
    const set = (v: boolean) => setData((d) => d && { ...d, subtasks: d.subtasks.map((s) => (s.id === id ? { ...s, done: v } : s)) });
    set(value);
    const result = await toggleSubtaskAction(id, value).catch(() => ({ error: say('Serveur injoignable.', 'Server unreachable.') }));
    if (result.error) { set(!value); toast('error', result.error); return; }
    void refresh();
  };
  return (
    <Block title={say('Mes sous-tâches', 'My sub-tasks')} count={data.subtasks.filter((s) => !s.done).length}>
      <div className="mw-rows">
        {sorted.map((s) => (
          <div key={s.id} className="mw-ticket">
            <input type="checkbox" checked={s.done} onChange={(e) => void tick(s.id, e.target.checked)} aria-label={s.title} />
            <span className={`grow ${s.done ? 'wk-done' : ''}`}>{s.title}</span>
            {s.ticketId && <button className="linkish small mw-parent" onClick={() => onOpen(s.ticketId!)}>{s.ticketTitle ?? '—'}</button>}
            <span className={`mw-due small ${!s.done && s.dueDate && s.dueDate < today ? 'late' : ''}`}>{s.dueDate ? dmy(s.dueDate).slice(0, 5) : ''}</span>
          </div>
        ))}
      </div>
    </Block>
  );
}

// what I reported that others carry
function ReportedBlock({ data, onOpen, say }: { data: Data; onOpen: (id: string) => void; say: Say }) {
  const [all, setAll] = useState(false);
  return (
    <Block title={say('Signalés par moi', 'Reported by me')} count={data.reported.length}>
      <div className="mw-rows">
        {(all ? data.reported : data.reported.slice(0, MORE)).map((t) => (
          <TicketLine key={t.id} t={t} onOpen={onOpen} say={say}>
            <StageLozenge name={t.stageName} status={t.status} />
            <Avatar name={t.assigneeName} size={22} />
            <span className={`mw-due ${t.dueState === 'overdue' ? 'late' : ''}`}>{t.dueDate ? dmy(t.dueDate) : '—'}</span>
          </TicketLine>
        ))}
      </div>
      <More count={data.reported.length} open={all} setOpen={setAll} say={say} />
    </Block>
  );
}

// the missions I lead or am on, every floor: their page, and "mine" narrows the tickets above to it
function MissionsBlock({ data, onScope, say }: { data: Data; onScope: (id: string) => void; say: Say }) {
  const today = useStore((s) => s.state.today);
  return (
    <Block title={say('Mes missions', 'My missions')} count={data.missions.length} className="mw-missions">
      <div className="mw-rows">
        {data.missions.map((m) => {
          const due = dueIn(m.deadline, today, say);
          return (
            <div key={m.id} className="mw-ticket">
              <span className="wk-keycell"><span className="mono">{m.code ?? '—'}</span></span>
              <button className="linkish mw-title" onClick={() => useStore.getState().openRoom('missions', `mission:${m.id}`)}>{m.name}
                {!m.home && <span className="tag mw-other">{m.entity}</span>}
                {m.lead && <span className="tag dim">{say('responsable', 'lead')}</span>}
              </button>
              <span className="small muted mw-counts">
                {m.open} {say('ouverts', 'open')}{m.mine > 0 && <> · <button className="linkish" onClick={() => onScope(m.id)} title={say('Voir mes tickets de cette mission', 'See my tickets of this mission')}>{m.mine} {say('à moi', 'mine')}</button></>}
              </span>
              <span className={`mw-due ${due?.late ? 'late' : ''}`} title={m.deadline && hasDeadline(m.deadline) ? dmy(m.deadline) : undefined}>{due ? due.text : say('sans échéance', 'no deadline')}</span>
            </div>
          );
        })}
        {!data.missions.length && <div className="small muted mw-empty">{say("Vous n'êtes dans l'équipe d'aucune mission en cours.", 'You are on no running mission’s team.')}</div>}
      </div>
    </Block>
  );
}
