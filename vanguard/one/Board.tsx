import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Engagement } from '@bumex/domain';
import { floorBoardAction, type FloorBoard } from '@/lib/erp/vanguard/board-actions';
import { resolveTicketStageId, sortStages } from '@/lib/tickets/workflow';
import { createTicketAction, moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { remainingHours } from '@/lib/work/load';
import type { TicketStatus } from '@/types/ticket';
import type { BoardWorkflow } from '@/types/workflow';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { PRIORITY, TEAM_ROLES, label, reload, type TicketTask } from './Tasks';
import { useSay } from './say';
import { NO_DUE_DATE, groupTickets, type GroupBy, type GroupLabels, type WorkTicket } from './work-filters';
import { Avatar, PriorityIcon, TypeIcon, hoursText, stageTone, useMedia, type Tone } from './work-ui';
import { QuickLogButton } from './QuickLog';
import { StageSelect, moveCheck, stageTicketOf, type DropCheck } from './stages';
import type { ListChange } from './TicketList';
import type { Say } from './ticket-history';

// The board, as Jira draws it (asked on 2026-10-27), shared by the Tasks room (MissionBoard: the floor's board, 0014,
// for one mission or all of them) and My work (vanguard/one/MyWork.tsx: one board per floor of the person's tickets,
// 2026-10-29), so the two cannot drift apart. Columns carry their count and hours and fold; cards their key, mission,
// labels, estimate, due date, priority and assignee. A card dropped in another column moves with BUMEX One's ticket
// action (useTicketMove), which checks the board's rules (order, reopening, sign-off by the reporter) and may ask for a
// reason (MoveReason); while a card is dragged, the columns it may not go to are dimmed with why. On a screen without
// hover a card moves through its stage picker. Lanes group the cards by assignee, priority or mission.

type Mission = Engagement & { projectId?: string };
export type BoardColumn = { id: string; name: string; tone: Tone; completed: boolean; archived: boolean };
export type MoveTarget = { stageId: string } | { status: TicketStatus };
export type MissionTag = { code: string; name: string };

/** A ticket's column: its stage on its board (a ticket from before the boards: by its status). */
export const stageIdOf = (workflow: BoardWorkflow, x: WorkTicket) => resolveTicketStageId(workflow, { stage_id: x.ticket.stage_id, status: x.ticket.status as TicketStatus });

/** A board's columns: its active stages in order, and an archived one while a card still sits in it (so no card is hidden). */
export function boardColumns(workflow: BoardWorkflow, tickets: WorkTicket[]): BoardColumn[] {
  const used = new Set(tickets.map((x) => stageIdOf(workflow, x)));
  return sortStages(workflow.stages).filter((s) => !s.archived_at || used.has(s.id)).map((s) => ({
    id: s.id, name: s.name, tone: s.archived_at ? 'archived' : stageTone(s), completed: s.is_completed, archived: Boolean(s.archived_at),
  }));
}

// ---- moving a ticket: the server's answer, a reason when the board asks one ----

type Asking = { t: { id: string; label: string }; target: MoveTarget; name: string; message: string };
export type MoveFlow = ReturnType<typeof useTicketMove>;

/** Moves a ticket with BUMEX One's action; asks a reason when the board wants one; `onMoved` once the server accepted. */
export function useTicketMove(onMoved: (id: string, target: MoveTarget, name: string) => void | Promise<void>) {
  const toast = useStore((s) => s.toast);
  const say = useSay();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [reason, setReason] = useState('');
  const latest = useRef(onMoved);
  useEffect(() => { latest.current = onMoved; });
  const move = useCallback(async (t: { id: string; label: string }, target: MoveTarget, name: string, why?: string) => {
    setBusyId(t.id);
    try {
      const result = await moveTicketStageAction(t.id, target, why);
      if (result.code === 'reason_required') { setAsking({ t, target, name, message: result.error ?? '' }); return; }
      setAsking(null);
      setReason('');
      if (result.error) { toast('error', result.error); return; }
      toast('ok', `${t.label} → ${name}`);
      await latest.current(t.id, target, name);
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusyId(null);
    }
  }, [toast, say]);
  const confirm = () => { if (asking && reason.trim()) void move(asking.t, asking.target, asking.name, reason.trim()); };
  const cancel = () => { setAsking(null); setReason(''); };
  return { busyId, asking, reason, setReason, move, confirm, cancel };
}

/** The reason a move needs, asked above the board. */
export function MoveReason({ flow, say }: { flow: MoveFlow; say: Say }) {
  if (!flow.asking) return null;
  const { asking } = flow;
  return (
    <div className="wk-reason" role="group" aria-label={say('Motif du déplacement', 'Reason for the move')}>
      <span className="small">{asking.message || say('Ce déplacement demande un motif.', 'This move needs a reason.')} · <b>{asking.t.label}</b></span>
      <input className="in" autoFocus value={flow.reason} onChange={(e) => flow.setReason(e.target.value)} placeholder={say('Motif', 'Reason')}
        onKeyDown={(e) => { if (e.key === 'Enter') flow.confirm(); if (e.key === 'Escape') { e.stopPropagation(); flow.cancel(); } }} />
      <div className="actions">
        <button className="btn sm" onClick={flow.cancel}>{say('Annuler', 'Cancel')}</button>
        <button className="btn sm primary" disabled={!flow.reason.trim() || flow.busyId === asking.t.id} onClick={flow.confirm}>{say('Déplacer vers', 'Move to')} {asking.name}</button>
      </div>
    </div>
  );
}

/** Under the board(s): how a card moves (dragged; touched through its stage on a screen without hover). */
export function BoardHint({ say }: { say: Say }) {
  return (
    <p className="small muted wk-hint">
      <span className="hint-drag">{say('Glissez une carte dans une autre colonne pour la déplacer ; les règles du tableau s’appliquent.', "Drag a card into another column to move it; the board's rules apply.")}</span>
      <span className="hint-touch">{say("Touchez l'étape d'une carte pour la déplacer.", "Tap a card's stage to move it.")}</span>
    </p>
  );
}

// ---- the board ----

const readFolds = (key?: string): string[] => {
  if (!key) return [];
  try { const raw = JSON.parse(window.localStorage.getItem(`bumex-vanguard-folds:${key}`) ?? '[]'); return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []; } catch { return []; }
};
const writeFolds = (key: string | undefined, folds: string[]) => {
  if (!key) return;
  try { window.localStorage.setItem(`bumex-vanguard-folds:${key}`, JSON.stringify(folds)); } catch { /* storage off: for the visit */ }
};

export function TicketBoard<T extends WorkTicket>({ columns, tickets, columnOf, groupBy, groupLabels, busyId, onOpen, onMove, dropCheck, showMission, missionOf, onChanged, footer, foldKey, say }: {
  columns: BoardColumn[];
  tickets: T[];
  columnOf: (x: T) => string;
  groupBy: GroupBy;
  groupLabels: GroupLabels;
  busyId: string | null;
  onOpen: (id: string) => void;
  onMove: (x: T, column: BoardColumn) => void;
  dropCheck?: (x: T, column: BoardColumn) => DropCheck | null;
  showMission: boolean;
  missionOf?: (x: T) => MissionTag | null;
  onChanged: (change?: ListChange) => void | Promise<void>; // a card's stage picked (touch), or time logged
  footer?: (column: BoardColumn) => ReactNode;
  foldKey?: string; // folds remembered in this browser under that key (My work, per floor); else for the visit
  say: Say;
}) {
  const toast = useStore((s) => s.toast);
  const touch = useMedia('(hover: none)');
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [folded, setFolded] = useState<string[]>(() => readFolds(foldKey));
  const moving = dragged ? tickets.find((x) => x.id === dragged) ?? null : null;
  // while a card is dragged: where it may go, and what a move there asks (nothing of it shows at rest)
  const checks = useMemo(() => {
    if (!moving || !dropCheck) return null;
    return new Map(columns.map((c) => [c.id, columnOf(moving) === c.id ? null : dropCheck(moving, c)]));
  }, [moving, dropCheck, columns, columnOf]);
  const lanes = groupTickets(tickets, groupBy, groupLabels);
  const toggle = (id: string) => {
    const next = folded.includes(id) ? folded.filter((f) => f !== id) : [...folded, id];
    setFolded(next);
    writeFolds(foldKey, next);
  };
  const drop = (column: BoardColumn) => {
    const check = checks?.get(column.id);
    const refused = Boolean(check && !check.ok);
    return {
      onDragOver: (e: DragEvent) => { if (dragged && !refused) { e.preventDefault(); if (over !== column.id) setOver(column.id); } },
      onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const x = moving;
        setDragged(null);
        setOver(null);
        if (!x || columnOf(x) === column.id || refused) return;
        if (column.archived) { toast('error', say(`« ${column.name} » est archivée : aucune carte n'y entre.`, `"${column.name}" is archived: no card goes in.`)); return; }
        onMove(x, column);
      },
    };
  };
  const drag = useCallback((id: string | null) => { setDragged(id); if (!id) setOver(null); }, []);
  return (
    <div className="wk-board">
      <div className="wk-cols" role="list">
        {columns.map((column) => {
          const all = tickets.filter((x) => columnOf(x) === column.id);
          const isFolded = folded.includes(column.id);
          const check = checks?.get(column.id);
          const why = check ? (check.ok ? (check.reason ? say('motif demandé', 'reason asked') : null) : say(...check.why)) : null;
          return (
            <div key={column.id} role="listitem"
              className={`wk-col ${isFolded ? 'folded' : ''} ${over === column.id ? 'over' : ''} ${check && !check.ok ? 'nodrop' : ''} ${column.archived ? 'archived' : ''} tone-${column.tone}`}
              {...drop(column)} title={column.archived ? say('Étape archivée : déplacez ces cartes vers une étape active.', 'Archived stage: move these cards to an active stage.') : undefined}>
              <div className="wk-col-h">
                <button className="wk-fold" onClick={() => toggle(column.id)} aria-expanded={!isFolded} title={isFolded ? say('Déplier', 'Expand') : say('Replier', 'Collapse')}>
                  <span className="wk-col-name">{column.name}</span>
                  <span className="wk-col-n">{all.length}</span>
                </button>
                {!isFolded && all.length > 0 && <span className="wk-col-hours" title={say('Heures restantes', 'Hours left')}>{hoursText(all.reduce((s, x) => s + remainingHours(x.ticket), 0), say)}</span>}
              </div>
              {why && !isFolded && <div className="wk-col-why">{why}</div>}
              {!isFolded && (
                <div className="wk-col-b">
                  {lanes.map((lane) => {
                    const cards = lane.items.filter((x) => columnOf(x) === column.id);
                    return (
                      <div key={lane.key} className="wk-lane">
                        {groupBy !== 'none' && <div className="wk-lane-h">{lane.label} <span>{cards.length}</span></div>}
                        {(column.completed ? cards.slice(0, 30) : cards).map((x) => (
                          <TicketCard key={x.id} task={x} busy={busyId === x.id} dragging={dragged === x.id} mission={showMission ? missionOf?.(x) ?? null : null}
                            touch={touch} onOpen={onOpen} onDrag={drag} onChanged={onChanged} say={say} />
                        ))}
                        {column.completed && cards.length > 30 && <div className="small muted">+{cards.length - 30} {say('autres', 'more')}</div>}
                      </div>
                    );
                  })}
                  {footer?.(column)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// a card: its title, mission and labels, key, time left, due date, priority, a clock to log time, its assignee; on a
// screen without hover, its stage picker (a card cannot be dragged there)
export const TicketCard = memo(function TicketCard({ task: x, busy, dragging, mission, touch, onOpen, onDrag, onChanged, say }: {
  task: WorkTicket; busy: boolean; dragging: boolean; mission: MissionTag | null; touch: boolean;
  onOpen: (id: string) => void; onDrag: (id: string | null) => void; onChanged: (change?: ListChange) => void | Promise<void>; say: Say;
}) {
  const today = useStore((s) => s.state.today);
  const done = x.status === 'done';
  const late = !done && x.dueDate !== NO_DUE_DATE && x.dueDate < today;
  const est = Number(x.ticket.estimated_hours ?? 0);
  const left = remainingHours(x.ticket);
  // the card's own keys only: Enter on its clock or its stage picker is theirs
  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(x.id); }
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      className={`wk-card ${busy ? 'busy' : ''} ${dragging ? 'dragging' : ''} ${done ? 'done' : ''}`}
      draggable={!busy && !touch}
      onDragStart={(e) => { onDrag(x.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.ticket.key || x.id); }}
      onDragEnd={() => onDrag(null)}
      onClick={() => onOpen(x.id)}
      onKeyDown={key}
      tabIndex={0}
      role="button"
      aria-label={`${x.ticket.key} ${x.title}`}
    >
      <div className="wk-card-t">{x.title}</div>
      {(x.ticket.labels.length > 0 || mission) && (
        <div className="wk-tags">
          {mission && <span className="tag mission" title={mission.name}>{mission.code || mission.name}</span>}
          {x.ticket.labels.map((l) => <span key={l} className="tag">{l}</span>)}
        </div>
      )}
      {touch && !done && (
        <div className="wk-card-stage" onClick={stop} onKeyDown={stop}>
          <StageSelect ticket={stageTicketOf(x)} onMoved={(stage) => onChanged({ id: x.id, stage })} />
        </div>
      )}
      <div className="wk-card-f">
        <span className="wk-keycell"><TypeIcon type={x.ticket.type} say={say} /> <span className={done ? 'wk-done' : ''}>{x.ticket.key}</span></span>
        <span className="grow" />
        {est > 0 && <span className="wk-est" title={`${say('Estimation', 'Estimate')} ${hoursText(est, say)}${x.ticket.logged_minutes ? ` · ${say('reste', 'left')} ${hoursText(left, say)}` : ''}`}><Icon name="clock" size={12} /> {hoursText(x.ticket.logged_minutes ? left : est, say)}</span>}
        {x.dueDate !== NO_DUE_DATE && <span className={`wk-due ${late ? 'late' : ''}`} title={say('Échéance', 'Due')}>{x.dueDate.slice(8, 10)}/{x.dueDate.slice(5, 7)}</span>}
        <PriorityIcon priority={x.ticket.priority} say={say} />
        {!done && <QuickLogButton ticketId={x.id} className="wk-card-log" onSaved={onChanged} />}
        <Avatar name={x.ticket.assignee_id ? x.assignee : null} size={22} title={x.ticket.assignee_id ? x.assignee : say('Non assigné', 'Unassigned')} />
      </div>
    </div>
  );
});

// ---- the Tasks room's board: the floor's board, for one mission or all of them ----

const reloadAll = () => reload();

export function MissionBoard({ entityId, scope, tickets, groupBy, onOpen, onRules }: { entityId: string; scope: string; tickets: TicketTask[]; groupBy: GroupBy; onOpen: (id: string) => void; onRules: () => void }) {
  const { state } = useStore();
  const say = useSay();
  const me = state.session.userId;
  const mission = scope === 'all' ? null : ((state.engagements as Mission[]).find((e) => e.id === scope) ?? null);
  const projectId = mission?.projectId ?? null;
  const loadedAt = useStore((s) => s.loadedAt);
  const [board, setBoard] = useState<{ entityId: string; data: FloorBoard } | null>(null);
  const flow = useTicketMove(reloadAll);

  useEffect(() => {
    let live = true;
    floorBoardAction(entityId)
      .then((data) => {
        if (!live) return;
        if (data) setBoard({ entityId, data });
        else useStore.getState().toast('error', useStore.getState().ui.lang === 'fr' ? "Le tableau de l'étage est indisponible." : "The floor's board is unavailable.");
      })
      .catch(() => {
        const { toast: show, ui: now } = useStore.getState();
        if (live) show('error', now.lang === 'fr' ? "Le tableau de l'étage est indisponible." : "The floor's board is unavailable.");
      });
    return () => { live = false; };
  }, [entityId, loadedAt]);

  const workflow = board && board.entityId === entityId ? board.data.workflow : null;
  const columns = useMemo(() => (workflow ? boardColumns(workflow, tickets) : []), [workflow, tickets]);
  const columnOf = useCallback((x: TicketTask) => (workflow ? stageIdOf(workflow, x) : ''), [workflow]);
  const dropCheck = useCallback((x: TicketTask, c: BoardColumn) => (workflow ? moveCheck(workflow, stageTicketOf(x), c.id, me) : null), [workflow, me]);
  // one tag per mission, the same object from render to render (the cards are memoised)
  const tags = useMemo(() => new Map(state.engagements.map((e) => [e.id, { code: e.code, name: e.name }])), [state.engagements]);
  const missionOf = useCallback((x: TicketTask) => tags.get(x.engagementId ?? '') ?? null, [tags]);

  if (!workflow) return <div className="card"><span className="muted">{say('Chargement du tableau…', 'Loading the board…')}</span></div>;
  const groupLabels: GroupLabels = {
    unassigned: say('Non assigné', 'Unassigned'),
    priority: (p) => label(PRIORITY[p], p, say),
    mission: (id) => (state.engagements as Mission[]).find((e) => e.id === id)?.name ?? say('Sans mission', 'No mission'),
  };
  const canAdd = Boolean(projectId) && TEAM_ROLES.includes(state.session.role);
  return (
    <>
      <MoveReason flow={flow} say={say} />
      {board?.data.canManage && (
        <div className="wk-board-tools"><button className="btn sm" onClick={onRules}><Icon name="settings" size={13} /> {say('Statuts et règles', 'Statuses and rules')}</button></div>
      )}
      <TicketBoard columns={columns} tickets={tickets} columnOf={columnOf} groupBy={groupBy} groupLabels={groupLabels} busyId={flow.busyId} onOpen={onOpen}
        onMove={(x, c) => void flow.move({ id: x.id, label: x.ticket.key }, { stageId: c.id }, c.name)} dropCheck={dropCheck} showMission={!projectId} missionOf={missionOf}
        onChanged={reloadAll} footer={(c) => (canAdd && !c.completed && mission ? <QuickAdd mission={mission} column={c} say={say} /> : null)} say={say} />
      <BoardHint say={say} />
    </>
  );
}

// "+" at the bottom of a column: a title, Enter, and the ticket is in that column (reported by me, unassigned)
function QuickAdd({ mission, column, say }: { mission: Mission; column: BoardColumn; say: Say }) {
  const { state, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim() || !mission.projectId) return;
    const form = new FormData();
    for (const [k, v] of Object.entries({ title: title.trim(), description: '', project_id: mission.projectId, assignee_id: '', reporter_id: state.session.userId, priority: 'medium', type: 'task', due_date: '', create_another: '1' })) form.set(k, v);
    setBusy(true);
    try {
      const result = await createTicketAction({}, form);
      if (result.error) { toast('error', result.error); return; }
      if (result.created) {
        const moved = await moveTicketStageAction(result.created.id, { stageId: column.id });
        if (moved.error && moved.code !== 'same_stage') toast('error', moved.error);
      }
      setTitle('');
      await reload();
    } finally {
      setBusy(false);
    }
  };
  if (!open) return <button className="wk-add" onClick={() => setOpen(true)}><Icon name="plus" size={13} /> {say('Créer', 'Create')}</button>;
  return (
    <div className="wk-addform">
      <textarea className="in" autoFocus rows={2} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder={say('Que faut-il faire ?', 'What needs to be done?')}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add(); } if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setTitle(''); } }} />
      <div className="small muted">{say('Entrée pour créer · Échap pour fermer', 'Enter to create · Esc to close')}</div>
    </div>
  );
}
