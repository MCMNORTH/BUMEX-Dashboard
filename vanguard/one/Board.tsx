import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { Engagement, Id, Task } from '@bumex/domain';
import { missionBoardAction, type MissionBoard as Board } from '@/lib/erp/vanguard/board-actions';
import type { TaskTicket } from '@/lib/erp/vanguard/tickets';
import { getActiveStages, resolveTicketStageId } from '@/lib/tickets/workflow';
import { moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { reload } from './Tasks';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The Tasks room's "Tableau" tab: one mission's board as BUMEX One's workflow sets it (its own columns, or the built-in
// ones), the mission's tickets in their column. A card dropped in another column moves with BUMEX One's ticket action,
// which checks the workflow's rules (order, reopening, sign-off by the reporter) and may ask for a reason.

type TicketTask = Task & { ticket: TaskTicket };
type Mission = Engagement & { projectId?: string };

const NO_DUE_DATE = '9999-12-31';

export function MissionBoard({ entityId, engagementId }: { entityId: Id; engagementId?: Id | null }) {
  const { state, ui, setUi, toast, openRoom } = useStore();
  const say = useSay();
  // a deleted project's mission is cancelled (missions.ts): no board
  const missions = useMemo(
    () => (state.engagements as Mission[]).filter((e) => e.entityId === entityId && e.projectId && (e.status as string) !== 'cancelled').sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || a.code.localeCompare(b.code)),
    [state.engagements, entityId],
  );
  const [missionId, setMissionId] = useState<Id>(() => (engagementId && missions.some((m) => m.id === engagementId) ? engagementId : missions[0]?.id ?? ''));
  const mission = missions.find((m) => m.id === missionId);
  const projectId = mission?.projectId ?? null;
  const [board, setBoard] = useState<{ projectId: string; data: Board } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ task: TicketTask; stageId: string; stageName: string; message: string } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    missionBoardAction(projectId)
      .then((data) => live && setBoard({ projectId, data }))
      .catch(() => {
        const { toast: show, ui: now } = useStore.getState();
        if (live) show('error', now.lang === 'fr' ? 'Le tableau de la mission est indisponible.' : "The mission's board is unavailable.");
      });
    return () => { live = false; };
  }, [projectId]);

  const workflow = board && board.projectId === projectId ? board.data.workflow : null;
  const stages = workflow ? getActiveStages(workflow) : [];
  const tasks = state.tasks.filter((x) => x.engagementId === missionId) as TicketTask[];
  const stageOf = (x: TicketTask) => (workflow ? resolveTicketStageId(workflow, { stage_id: x.ticket.stage_id, status: x.ticket.status }) : '');

  const move = async (task: TicketTask, stageId: string, why?: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stageOf(task) === stageId) return;
    setBusy(task.id);
    try {
      const result = await moveTicketStageAction(task.id, { stageId }, why);
      if (result.code === 'reason_required') {
        setAsking({ task, stageId, stageName: stage.name, message: result.error ?? '' });
        return;
      }
      if (result.error) toast('error', result.error);
      else toast('ok', `${task.title} → ${stage.name}`);
      setAsking(null);
      setReason('');
      await reload();
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(null);
    }
  };
  const drop = (stageId: string) => ({
    onDragOver: (e: DragEvent) => { if (dragged) e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const task = tasks.find((x) => x.id === dragged);
      setDragged(null);
      if (task) void move(task, stageId);
    },
  });

  if (!missions.length) {
    return <div className="banner info">{say("Aucune mission sur cet étage : un tableau appartient à une mission.", 'No mission on this floor: a board belongs to a mission.')}</div>;
  }
  return (
    <>
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select recent="missions" className="in" style={{ width: 320 }} value={missionId} onChange={(e) => setMissionId(e.target.value)} aria-label={say('Mission', 'Mission')}>
          {missions.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}{m.status === 'completed' ? ` (${say('terminée', 'completed')})` : ''}</option>)}
        </Select>
        <span className="small muted">{tasks.length} {say('ticket(s)', 'ticket(s)')}</span>
        <span style={{ marginLeft: 'auto' }} />
        {projectId && <button className="btn sm" onClick={() => openRoom('missions', `mission:${projectId}`)}>{say('Ouvrir la mission', 'Open the mission')}</button>}
        {projectId && board?.data.canManage && <button className="btn sm" onClick={() => openRoom('missions', `mission:${projectId}:rules`)}>{say('Colonnes et règles du tableau', "Board's columns and rules")}</button>}
      </div>

      {asking && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small">{asking.message || say('Ce déplacement demande un motif.', 'This move needs a reason.')}</span>
          <input className="in" style={{ flex: '1 1 260px' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={say('Motif', 'Reason')} autoFocus />
          <button className="btn sm" onClick={() => { setAsking(null); setReason(''); }}>{say('Annuler', 'Cancel')}</button>
          <button className="btn sm primary" disabled={!reason.trim() || busy === asking.task.id} onClick={() => move(asking.task, asking.stageId, reason.trim())}>{say('Déplacer vers', 'Move to')} {asking.stageName}</button>
        </div>
      )}

      {!workflow ? (
        <div className="card"><span className="muted">{say('Chargement du tableau…', 'Loading the board…')}</span></div>
      ) : (
        <div className="kanban">
          {stages.map((stage) => {
            const list = tasks.filter((x) => stageOf(x) === stage.id);
            return (
              <div className="col" key={stage.id} {...drop(stage.id)} style={{ minWidth: 150 }}>
                <h3>{stage.name} <span>{list.length}</span></h3>
                {list.map((x) => {
                  const late = x.status !== 'done' && x.dueDate < state.today;
                  return (
                    <div
                      key={x.id}
                      className={`desk ${late ? 'late' : ''} ${ui.focusTaskId === x.id ? 'focus' : ''}`}
                      draggable={busy !== x.id}
                      onDragStart={() => setDragged(x.id)}
                      onDragEnd={() => setDragged(null)}
                      onClick={() => setUi({ focusTaskId: x.id })}
                      style={{ cursor: 'pointer', opacity: busy === x.id ? 0.55 : 1 }}
                    >
                      <b>{x.title}</b>
                      <span className="muted">{x.assignee}{x.dueDate !== NO_DUE_DATE && <> · <D iso={x.dueDate} /></>}</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(x.ticket.priority === 'high' || x.ticket.priority === 'urgent') && <Chip kind="crit">{x.ticket.priority === 'urgent' ? say('Urgente', 'Urgent') : say('Haute', 'High')}</Chip>}
                        {late && <Chip kind="warn">{say('en retard', 'late')}</Chip>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>{say('Glissez un ticket dans une autre colonne pour le déplacer ; les règles du tableau s’appliquent.', "Drag a ticket into another column to move it; the board's rules apply.")}</p>
    </>
  );
}
