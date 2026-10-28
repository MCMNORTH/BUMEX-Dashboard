import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { Engagement } from '@bumex/domain';
import { floorBoardAction, type FloorBoard } from '@/lib/erp/vanguard/board-actions';
import { resolveTicketStageId, sortStages } from '@/lib/tickets/workflow';
import { createTicketAction, moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { remainingHours } from '@/lib/work/load';
import type { TicketStatus } from '@/types/ticket';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { PRIORITY, TEAM_ROLES, label, reload, type TicketTask } from './Tasks';
import { useSay } from './say';
import { groupTickets, type GroupBy } from './work-filters';
import { Avatar, PriorityIcon, TypeIcon, hoursText, stageTone, type Tone } from './work-ui';
import { QuickLogButton } from './QuickLog';
import type { Say } from './ticket-history';

// The Tasks room's board, as Jira draws it (asked on 2026-10-27): the floor's board (0014: one per entity, which every
// mission of the floor follows, asked on 2026-10-28), for one mission or all of them: the same columns either way.
// Columns carry their count and hours and fold; cards their key, labels, estimate, due date, priority and assignee;
// "+" adds a ticket in a column. A card dropped in another column moves with BUMEX One's ticket action, which checks
// the board's rules (order, reopening, sign-off by the reporter) and may ask for a reason. Lanes group the cards by
// assignee, priority or mission. "Statuts et règles" opens the board's editor (Workflow.tsx).

type Mission = Engagement & { projectId?: string };
type Column = { id: string; name: string; tone: Tone; completed: boolean; archived?: boolean; matches: (x: TicketTask) => boolean; target: { stageId: string } | { status: TicketStatus } };

const NO_DUE_DATE = '9999-12-31';

export function MissionBoard({ entityId, scope, tickets, groupBy, onOpen, onRules }: { entityId: string; scope: string; tickets: TicketTask[]; groupBy: GroupBy; onOpen: (id: string) => void; onRules: () => void }) {
  const { state, toast } = useStore();
  const say = useSay();
  const mission = scope === 'all' ? null : ((state.engagements as Mission[]).find((e) => e.id === scope) ?? null);
  const projectId = mission?.projectId ?? null;
  const loadedAt = useStore((s) => s.loadedAt);
  const [board, setBoard] = useState<{ entityId: string; data: FloorBoard } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const [asking, setAsking] = useState<{ task: TicketTask; column: Column; message: string } | null>(null);
  const [reason, setReason] = useState('');

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
  // the board's active stages, and an archived one while a card still sits in it (so no card is hidden)
  const columns: Column[] = useMemo(() => {
    if (!workflow) return [];
    const stageOf = (x: TicketTask) => resolveTicketStageId(workflow, { stage_id: x.ticket.stage_id, status: x.ticket.status });
    const used = new Set(tickets.map(stageOf));
    return sortStages(workflow.stages).filter((s) => !s.archived_at || used.has(s.id)).map((s) => ({
      id: s.id, name: s.name, tone: s.archived_at ? 'archived' : stageTone(s), completed: s.is_completed, archived: Boolean(s.archived_at), target: { stageId: s.id },
      matches: (x: TicketTask) => stageOf(x) === s.id,
    }));
  }, [workflow, tickets]);

  const move = async (task: TicketTask, column: Column, why?: string) => {
    if (column.matches(task)) return;
    if (column.archived) { toast('error', say(`« ${column.name} » est archivée : aucune carte n'y entre.`, `"${column.name}" is archived: no card goes in.`)); return; }
    const target = column.target;
    setBusy(task.id);
    try {
      const result = await moveTicketStageAction(task.id, target, why);
      if (result.code === 'reason_required') {
        setAsking({ task, column, message: result.error ?? '' });
        return;
      }
      if (result.error) toast('error', result.error);
      else toast('ok', `${task.ticket.key} → ${column.name}`);
      setAsking(null);
      setReason('');
      await reload();
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(null);
    }
  };
  const drop = (column: Column) => ({
    onDragOver: (e: DragEvent) => { if (dragged) { e.preventDefault(); if (over !== column.id) setOver(column.id); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const task = tickets.find((x) => x.id === dragged);
      setDragged(null);
      setOver(null);
      if (task) void move(task, column);
    },
  });

  if (!workflow) return <div className="card"><span className="muted">{say('Chargement du tableau…', 'Loading the board…')}</span></div>;
  const lanes = groupTickets(tickets, groupBy, {
    unassigned: say('Non assigné', 'Unassigned'),
    priority: (p) => label(PRIORITY[p], p, say),
    mission: (id) => (state.engagements as Mission[]).find((e) => e.id === id)?.name ?? say('Sans mission', 'No mission'),
  });
  const canAdd = Boolean(projectId) && TEAM_ROLES.includes(state.session.role);
  const toggle = (id: string) => setFolded(folded.includes(id) ? folded.filter((f) => f !== id) : [...folded, id]);
  return (
    <>
      {asking && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small">{asking.message || say('Ce déplacement demande un motif.', 'This move needs a reason.')}</span>
          <input className="in" style={{ flex: '1 1 260px' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={say('Motif', 'Reason')} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) void move(asking.task, asking.column, reason.trim()); }} />
          <button className="btn sm" onClick={() => { setAsking(null); setReason(''); }}>{say('Annuler', 'Cancel')}</button>
          <button className="btn sm primary" disabled={!reason.trim() || busy === asking.task.id} onClick={() => move(asking.task, asking.column, reason.trim())}>{say('Déplacer vers', 'Move to')} {asking.column.name}</button>
        </div>
      )}
      {board?.data.canManage && (
        <div className="wk-board-tools"><button className="btn sm" onClick={onRules}><Icon name="settings" size={13} /> {say('Statuts et règles', 'Statuses and rules')}</button></div>
      )}
      <div className="wk-board">
        <div className="wk-cols" role="list">
          {columns.map((column) => {
            const all = tickets.filter(column.matches);
            const isFolded = folded.includes(column.id);
            return (
              <div key={column.id} role="listitem" className={`wk-col ${isFolded ? 'folded' : ''} ${over === column.id ? 'over' : ''} ${column.archived ? 'archived' : ''} tone-${column.tone}`} {...drop(column)} title={column.archived ? say('Étape archivée : déplacez ces cartes vers une étape active.', 'Archived stage: move these cards to an active stage.') : undefined}>
                <div className="wk-col-h">
                  <button className="wk-fold" onClick={() => toggle(column.id)} aria-expanded={!isFolded} title={isFolded ? say('Déplier', 'Expand') : say('Replier', 'Collapse')}>
                    <span className="wk-col-name">{column.name}</span>
                    <span className="wk-col-n">{all.length}</span>
                  </button>
                  {!isFolded && all.length > 0 && <span className="wk-col-hours" title={say('Heures restantes', 'Hours left')}>{hoursText(all.reduce((s, x) => s + remainingHours(x.ticket), 0), say)}</span>}
                </div>
                {!isFolded && (
                  <div className="wk-col-b">
                    {lanes.map((lane) => {
                      const cards = lane.items.filter(column.matches);
                      return (
                        <div key={lane.key} className="wk-lane">
                          {groupBy !== 'none' && <div className="wk-lane-h">{lane.label} <span>{cards.length}</span></div>}
                          {(column.completed ? cards.slice(0, 30) : cards).map((x) => (
                            <Card key={x.id} task={x} busy={busy === x.id} dragging={dragged === x.id} showMission={!projectId} onOpen={onOpen} onDrag={setDragged} say={say} />
                          ))}
                          {column.completed && cards.length > 30 && <div className="small muted">+{cards.length - 30} {say('autres', 'more')}</div>}
                        </div>
                      );
                    })}
                    {canAdd && !column.completed && mission && <QuickAdd mission={mission} column={column} say={say} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{say('Glissez une carte dans une autre colonne pour la déplacer ; les règles du tableau s’appliquent.', "Drag a card into another column to move it; the board's rules apply.")}</p>
    </>
  );
}

function Card({ task, busy, dragging, showMission, onOpen, onDrag, say }: { task: TicketTask; busy: boolean; dragging: boolean; showMission: boolean; onOpen: (id: string) => void; onDrag: (id: string | null) => void; say: Say }) {
  const { state } = useStore();
  const x = task;
  const late = x.status !== 'done' && x.dueDate !== NO_DUE_DATE && x.dueDate < state.today;
  const est = Number(x.ticket.estimated_hours ?? 0);
  const left = remainingHours(x.ticket);
  const mission = showMission ? state.engagements.find((e) => e.id === x.engagementId) : null;
  return (
    <div
      className={`wk-card ${busy ? 'busy' : ''} ${dragging ? 'dragging' : ''} ${x.status === 'done' ? 'done' : ''}`}
      draggable={!busy}
      onDragStart={(e) => { onDrag(x.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => onDrag(null)}
      onClick={() => onOpen(x.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(x.id); }}
      tabIndex={0}
      role="button"
      aria-label={`${x.ticket.key} ${x.title}`}
    >
      <div className="wk-card-t">{x.title}</div>
      {(x.ticket.labels.length > 0 || mission) && (
        <div className="wk-tags">
          {mission && <span className="tag mission" title={mission.name}>{mission.code}</span>}
          {x.ticket.labels.map((l) => <span key={l} className="tag">{l}</span>)}
        </div>
      )}
      <div className="wk-card-f">
        <span className="wk-keycell"><TypeIcon type={x.ticket.type} say={say} /> <span className={x.status === 'done' ? 'wk-done' : ''}>{x.ticket.key}</span></span>
        <span className="grow" />
        {est > 0 && <span className="wk-est" title={`${say('Estimation', 'Estimate')} ${hoursText(est, say)}${x.ticket.logged_minutes ? ` · ${say('reste', 'left')} ${hoursText(left, say)}` : ''}`}><Icon name="clock" size={12} /> {hoursText(x.ticket.logged_minutes ? left : est, say)}</span>}
        {x.dueDate !== NO_DUE_DATE && <span className={`wk-due ${late ? 'late' : ''}`} title={say('Échéance', 'Due')}>{x.dueDate.slice(8, 10)}/{x.dueDate.slice(5, 7)}</span>}
        <PriorityIcon priority={x.ticket.priority} say={say} />
        {x.status !== 'done' && <QuickLogButton ticketId={x.id} className="wk-card-log" onSaved={() => void reload()} />}
        <Avatar name={x.ticket.assignee_id ? x.assignee : null} size={22} title={x.ticket.assignee_id ? x.assignee : say('Non assigné', 'Unassigned')} />
      </div>
    </div>
  );
}

// "+" at the bottom of a column: a title, Enter, and the ticket is in that column (reported by me, unassigned)
function QuickAdd({ mission, column, say }: { mission: Mission; column: Column; say: Say }) {
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
      if (result.created && 'stageId' in column.target) {
        const moved = await moveTicketStageAction(result.created.id, column.target);
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
