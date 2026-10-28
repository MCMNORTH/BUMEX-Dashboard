import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { boardWorkflowsAction } from '@/lib/erp/vanguard/board-actions';
import { moveTicketStageAction } from '@/app/(app)/tickets/actions';
import { evaluateTransition, getActiveStages, getCompletionRule, getLegacyWorkflow, getStageCategoryLabel, resolveTicketStageId } from '@/lib/tickets/workflow';
import type { TicketStatus } from '@/types/ticket';
import type { BoardWorkflow, TransitionErrorCode } from '@/types/workflow';
import { useStore } from '../store';
import { Select } from '../ui/Select';
import { useSay } from './say';
import type { Say } from './ticket-history';
import { Lozenge, statusTone } from './work-ui';

// [bumex-one] Each ticket's status is a stage of its board (asked on 2026-10-28), its floor's since 0014, as BUMEX One
// had it: its name in its category's colour wherever a status shows, and a picker of that board's stages wherever it
// changes. The boards are read by mission once per screen session (boardWorkflowsAction) and all forgotten when a
// floor's board is saved (Workflow.tsx). Moves go through BUMEX One's ticket action, which checks the board's rules again.

const cache = new Map<string, BoardWorkflow>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function fetchMissing(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => id && !cache.has(id) && !asked.has(id));
  if (!missing.length) return;
  missing.forEach((id) => asked.add(id));
  void boardWorkflowsAction(missing)
    .then((boards) => { for (const [id, workflow] of Object.entries(boards)) cache.set(id, workflow); })
    .catch(() => undefined)
    .finally(() => { missing.forEach((id) => asked.delete(id)); changed(); });
}

/** The workflows of these missions' boards (BUMEX One's project ids), as they arrive. */
export function useBoardWorkflows(projectIds: string[]): Record<string, BoardWorkflow> {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const key = [...new Set(projectIds.filter(Boolean))].sort().join(',');
  useEffect(() => { if (key) fetchMissing(key.split(',')); }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- v: the cache moved
  return useMemo(() => Object.fromEntries(key.split(',').flatMap((id) => (cache.has(id) ? [[id, cache.get(id)!]] : []))), [key, v]);
}

/** Each mission's board, the built-in one until it is read (a board nothing was saved for is the built-in one). */
export function useBoardOf(projectIds: string[]): (projectId: string) => BoardWorkflow {
  const boards = useBoardWorkflows(projectIds);
  const lang = useStore((s) => s.ui.lang);
  return useCallback((id: string) => boards[id] ?? getLegacyWorkflow(id, lang === 'fr' ? 'fr' : 'en'), [boards, lang]);
}

/** A board changed (its editor saved): read it again next time. */
export function forgetWorkflows(projectId?: string) {
  if (projectId) cache.delete(projectId);
  else cache.clear();
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
const SHORT: Partial<Record<TransitionErrorCode, [string, string]>> = {
  skip: ["étape par étape", 'one step at a time'],
  backward: ['pas de retour', 'no going back'],
  reopen: ['pas de réouverture', 'no reopening'],
  reporter_only: ['le rapporteur valide', 'the reporter signs off'],
  not_listed: ['non prévu', 'not allowed'],
  archived_stage: ['archivée', 'archived'],
};

export type StageTicket = { id: string; projectId: string; stageId: string | null; stageName?: string | null; status: string; assigneeId: string | null; reporterId: string | null; key?: string | null; title?: string };

/**
 * The ticket's stage, changed in place: its board's active stages, the ones its rules refuse greyed with why, a reason
 * asked for when the move needs one. Until the board is read, its lozenge.
 */
export function StageSelect({ ticket, onMoved, disabled, className }: { ticket: StageTicket; onMoved?: () => void | Promise<void>; disabled?: boolean; className?: string }) {
  const say = useSay();
  const me = useStore((s) => s.state.session.userId);
  const toast = useStore((s) => s.toast);
  const workflow = useBoardWorkflows([ticket.projectId])[ticket.projectId];
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<{ stageId: string; name: string; message: string } | null>(null);
  const [reason, setReason] = useState('');

  if (!workflow) return <StageLozenge name={ticket.stageName} status={ticket.status} />;
  const from = resolveTicketStageId(workflow, { stage_id: ticket.stageId, status: (ticket.status === 'archived' ? 'done' : ticket.status) as TicketStatus });
  const rules = getCompletionRule({ reporter_id: ticket.reporterId, assignee_id: ticket.assigneeId }, me);
  const stages = getActiveStages(workflow).map((s) => {
    const check = s.id === from ? null : evaluateTransition(workflow, from, s.id, 'motif', rules);
    return { stage: s, why: check && !check.ok ? SHORT[check.error.code] ?? ['non permis', 'not allowed'] : null };
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
      await onMoved?.();
    } catch {
      toast('error', say("Serveur injoignable : le ticket n'a pas bougé.", 'Server unreachable: the ticket did not move.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="stage-pick">
      <Select className={`stsel mini ${tone} ${className ?? ''}`} value={from} disabled={disabled || busy} onChange={(e) => void move(e.target.value)} aria-label={say('Étape', 'Stage')}>
        {stages.map(({ stage, why }) => (
          <option key={stage.id} value={stage.id} disabled={Boolean(why)} data-hint={why ? say(...why) : undefined}>{stage.name}</option>
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
