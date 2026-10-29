import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { boardWorkflowsAction } from '@/lib/erp/vanguard/board-actions';
import { moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { evaluateTransition, getActiveStages, getCompletionRule, getLegacyWorkflow, getStageCategoryLabel, resolveTicketStageId, stageStatus } from '@/lib/tickets/workflow';
import type { TicketStatus } from '@/types/ticket';
import type { BoardWorkflow, TransitionErrorCode } from '@/types/workflow';
import { useStore } from '../store';
import { Select } from '../ui/Select';
import { useSay } from './say';
import type { Say } from './ticket-history';
import { Lozenge, statusTone } from './work-ui';
import type { WorkTicket } from './work-filters';

// [bumex-one] Each ticket's status is a stage of its board (asked on 2026-10-28), its floor's since 0014, as BUMEX One
// had it: its name in its category's colour wherever a status shows, and a picker of that board's stages wherever it
// changes. The boards are read by mission once per screen session, the asks of one render together (boardWorkflowsAction),
// again a little later when a read failed, and all forgotten when a floor's board is saved (Workflow.tsx). Moves go
// through BUMEX One's ticket action, which checks the board's rules again.

const cache = new Map<string, BoardWorkflow>();
const asked = new Set<string>();
// answered, whatever the answer (a board the person may not read stays the built-in one): not asked again until forgotten
const settled = new Set<string>();
// a read that failed (the server out of reach a moment): the built-in board meanwhile, and asked again a little later
const failed = new Set<string>();
const RETRY_MS = 30_000;
// the asks of one render, sent as one read: every card's and every row's picker asks for its own board
const queued = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function read(ids: string[]) {
  void boardWorkflowsAction(ids)
    .then((boards) => {
      for (const [id, workflow] of Object.entries(boards)) cache.set(id, workflow);
      ids.forEach((id) => settled.add(id));
    })
    .catch(() => {
      ids.forEach((id) => failed.add(id));
      window.setTimeout(() => { ids.forEach((id) => failed.delete(id)); changed(); }, RETRY_MS);
    })
    .finally(() => { ids.forEach((id) => asked.delete(id)); changed(); });
}

function fetchMissing(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => id && !cache.has(id) && !asked.has(id) && !settled.has(id) && !failed.has(id));
  if (!missing.length) return;
  const first = queued.size === 0;
  missing.forEach((id) => { asked.add(id); queued.add(id); });
  if (!first) return;
  queueMicrotask(() => {
    const all = [...queued];
    queued.clear();
    for (let i = 0; i < all.length; i += 200) read(all.slice(i, i + 200)); // the action reads 200 boards at most
  });
}

/** The workflows of these missions' boards (BUMEX One's project ids), as they arrive. */
export function useBoardWorkflows(projectIds: string[]): Record<string, BoardWorkflow> {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const key = [...new Set(projectIds.filter(Boolean))].sort().join(',');
  // read again once forgotten (a board saved): the version moves, and what is neither cached nor settled is asked
  useEffect(() => { if (key) fetchMissing(key.split(',')); }, [key, v]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- v: the cache moved
  return useMemo(() => Object.fromEntries(key.split(',').flatMap((id) => (cache.has(id) ? [[id, cache.get(id)!]] : []))), [key, v]);
}

/** Each mission's board, the built-in one until it is read (a board nothing was saved for is the built-in one). */
export function useBoardOf(projectIds: string[]): (projectId: string) => BoardWorkflow {
  const boards = useBoardWorkflows(projectIds);
  const lang = useStore((s) => s.ui.lang);
  return useCallback((id: string) => boards[id] ?? getLegacyWorkflow(id, lang === 'fr' ? 'fr' : 'en'), [boards, lang]);
}

/** Whether every one of these missions' boards has been read (or could not be: then it is the built-in one, until read). */
export function useBoardsReady(projectIds: string[]): boolean {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const ids = [...new Set(projectIds.filter(Boolean))];
  useBoardWorkflows(ids);
  void v;
  return ids.every((id) => cache.has(id) || settled.has(id) || failed.has(id));
}

/** A board changed (its editor saved): read it again next time. */
export function forgetWorkflows(projectId?: string) {
  if (projectId) { cache.delete(projectId); settled.delete(projectId); failed.delete(projectId); }
  else { cache.clear(); settled.clear(); failed.clear(); }
  changed();
}

/** A stage's name, or the status's when its board runs on the built-in stages. */
export function stageLabel(name: string | null | undefined, status: string, say: Say) {
  return name || getStageCategoryLabel((status === 'backlog' ? 'backlog' : status) as TicketStatus, say('fr', 'en') as 'fr' | 'en');
}

export function StageLozenge({ name, status }: { name?: string | null; status: string }) {
  const say = useSay();
  return <Lozenge tone={statusTone(status)}>{stageLabel(name, status, say)}</Lozenge>;
}

// why a stage cannot be picked, in a few words (the full sentence comes from the server if tried anyway)
export const SHORT_REASONS: Partial<Record<TransitionErrorCode, [string, string]>> = {
  skip: ["étape par étape", 'one step at a time'],
  backward: ['pas de retour', 'no going back'],
  reopen: ['pas de réouverture', 'no reopening'],
  reporter_only: ['le rapporteur valide', 'the reporter signs off'],
  not_listed: ['non prévu', 'not allowed'],
  archived_stage: ['archivée', 'archived'],
};

export type StageTicket = { id: string; projectId: string; stageId: string | null; stageName?: string | null; status: string; assigneeId: string | null; reporterId: string | null; key?: string | null; title?: string };

/** What the stage picker and the boards read of a ticket of the board, the list or My work (work-filters.ts). */
export const stageTicketOf = (x: WorkTicket): StageTicket => ({
  id: x.id, projectId: x.ticket.project_id, stageId: x.ticket.stage_id, stageName: x.ticket.stage_name, status: x.ticket.status,
  assigneeId: x.ticket.assignee_id, reporterId: x.ticket.reporter_id, key: x.ticket.key, title: x.title,
});

/** A ticket's stage on its board (a ticket from before the boards: by its status). */
export const stageOfTicket = (workflow: BoardWorkflow, ticket: StageTicket) =>
  resolveTicketStageId(workflow, { stage_id: ticket.stageId, status: (ticket.status === 'archived' ? 'done' : ticket.status) as TicketStatus });

export type DropCheck = { ok: true; reason: boolean } | { ok: false; why: [string, string] };

/**
 * Whether this person may move the ticket to that stage, by its board's rules (order, reopening, the reporter's
 * sign-off), and whether a reason will be asked; null for its own stage. The server checks every move again.
 */
export function moveCheck(workflow: BoardWorkflow, ticket: StageTicket, toStageId: string, me: string): DropCheck | null {
  const from = stageOfTicket(workflow, ticket);
  if (from === toStageId) return null;
  const rules = getCompletionRule({ reporter_id: ticket.reporterId, assignee_id: ticket.assigneeId }, me);
  const check = evaluateTransition(workflow, from, toStageId, 'motif', rules);
  if (!check.ok) return { ok: false, why: SHORT_REASONS[check.error.code] ?? ['non permis', 'not allowed'] };
  const plain = evaluateTransition(workflow, from, toStageId, null, rules);
  return { ok: true, reason: !plain.ok && plain.error.code === 'reason_required' };
}

/**
 * The ticket's stage, changed in place: its board's active stages, the ones its rules refuse greyed with why, a reason
 * asked for when the move needs one. Until the board is read, its lozenge.
 */
export function StageSelect({ ticket, onMoved, disabled, className }: { ticket: StageTicket; onMoved?: (to: { id: string; name: string; status: TicketStatus }) => void | Promise<void>; disabled?: boolean; className?: string }) {
  const say = useSay();
  const me = useStore((s) => s.state.session.userId);
  const toast = useStore((s) => s.toast);
  const workflow = useBoardWorkflows([ticket.projectId])[ticket.projectId];
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<{ stageId: string; name: string; message: string } | null>(null);
  const [reason, setReason] = useState('');

  if (!workflow) return <StageLozenge name={ticket.stageName} status={ticket.status} />;
  const from = stageOfTicket(workflow, ticket);
  const stages = getActiveStages(workflow).map((s) => {
    // refused: greyed with why; allowed only with a reason: said beside it, asked when picked
    const check = moveCheck(workflow, ticket, s.id, me);
    return { stage: s, why: check && !check.ok ? check.why : null, reason: Boolean(check?.ok && check.reason) };
  });
  const current = workflow.stages.find((s) => s.id === from);
  const tone = statusTone(current ? (current.is_completed ? 'done' : current.category) : ticket.status);

  const move = async (stageId: string, why?: string) => {
    const to = workflow.stages.find((s) => s.id === stageId);
    if (!to || stageId === from) return;
    setBusy(true);
    try {
      const result = await moveTicketStageAction(ticket.id, { stageId }, why);
      if (result.code === 'reason_required') { setAsking({ stageId, name: to.name, message: result.error ?? '' }); return; }
      if (result.error) { toast('error', result.error); return; }
      toast('ok', `${ticket.key ?? ticket.title ?? ''} → ${to.name}`);
      setAsking(null);
      setReason('');
      await onMoved?.({ id: to.id, name: to.name, status: stageStatus(to) });
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="stage-pick">
      <Select className={`stsel mini ${tone} ${className ?? ''}`} value={from} disabled={disabled || busy} onChange={(e) => void move(e.target.value)} aria-label={say('Étape', 'Stage')}>
        {stages.map(({ stage, why, reason: needsReason }) => (
          <option key={stage.id} value={stage.id} disabled={Boolean(why)} data-hint={why ? say(...why) : needsReason ? say('motif demandé', 'reason asked') : undefined}>{stage.name}</option>
        ))}
        {!stages.some((s) => s.stage.id === from) && current && <option value={from} disabled>{current.name}</option>}
      </Select>
      {asking && (
        <span className="stage-reason" role="group" aria-label={say('Motif du déplacement', 'Reason for the move')}>
          <input className="in" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={asking.message || say(`Motif pour « ${asking.name} »`, `Reason for "${asking.name}"`)}
            onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) void move(asking.stageId, reason.trim()); if (e.key === 'Escape') { setAsking(null); setReason(''); } }} />
          <button className="btn sm primary" disabled={!reason.trim() || busy} onClick={() => move(asking.stageId, reason.trim())}>OK</button>
          <button className="btn sm ghost" onClick={() => { setAsking(null); setReason(''); }} aria-label={say('Annuler', 'Cancel')}>×</button>
        </span>
      )}
    </span>
  );
}
