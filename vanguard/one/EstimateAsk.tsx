import { useState } from 'react';
import { DEFAULT_ESTIMATE_HOURS, estimateHours } from '@/lib/tickets/workflow';
import type { Say } from './ticket-history';

// A stage can force a time estimate (its board's "Statuts et règles", asked on 2026-11-02): a ticket moved there without
// one is estimated on the spot, from 4 h, and the move carries the estimate (BUMEX One's ticket action saves both).

const CHIPS = [1, 2, 4, 8];

/** Hours as typed for an estimate: "4", "2,5", "6h", "1h30". */
export function parseEstimate(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d+(?:[.,]\d+)?)(?:h(\d{1,2})?)?$/);
  return m ? estimateHours(Number(m[1].replace(',', '.')) + (m[2] ? Number(m[2]) / 60 : 0)) : null;
}

/** The estimate asked before a move into a stage that forces one; `compact` sits inline, beside a stage picker. */
export function EstimateAsk({ name, label, busy, compact, onConfirm, onCancel, say }: {
  name: string; label?: string; busy?: boolean; compact?: boolean;
  onConfirm: (hours: number) => void; onCancel: () => void; say: Say;
}) {
  const [text, setText] = useState(String(DEFAULT_ESTIMATE_HOURS));
  const hours = parseEstimate(text);
  const input = (
    <input className="in est-in" autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.currentTarget.select()}
      aria-label={say('Estimation en heures', 'Estimate in hours')} title={say('Heures : 4, 2,5, 1h30', 'Hours: 4, 2.5, 1h30')}
      onKeyDown={(e) => { if (e.key === 'Enter' && hours) onConfirm(hours); if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} />
  );
  if (compact) {
    return (
      <span className="stage-reason" role="group" aria-label={say(`Estimation pour « ${name} »`, `Estimate for "${name}"`)}>
        <span className="small">{say('Estimation', 'Estimate')}</span>
        {input}<span className="small">h</span>
        <button className="btn sm primary" disabled={!hours || busy} onClick={() => hours && onConfirm(hours)}>OK</button>
        <button className="btn sm ghost" onClick={onCancel} aria-label={say('Annuler', 'Cancel')}>×</button>
      </span>
    );
  }
  return (
    <div className="est-ask" role="group" aria-label={say('Estimation du ticket', 'Ticket estimate')}>
      <span className="small">{say(`« ${name} » demande une estimation du temps`, `${name} needs a time estimate`)}{label ? <> · <b>{label}</b></> : null}</span>
      <div className="est-row">
        {CHIPS.map((h) => <button key={h} type="button" className={`wk-chip ${hours === h ? 'on' : ''}`} onClick={() => setText(String(h))}>{h} h</button>)}
        {input}<span className="small muted">h</span>
      </div>
      <div className="actions">
        <button className="btn sm" onClick={onCancel}>{say('Annuler', 'Cancel')}</button>
        <button className="btn sm primary" disabled={!hours || busy} onClick={() => hours && onConfirm(hours)}>{say('Estimer et déplacer vers', 'Estimate and move to')} {name}</button>
      </div>
    </div>
  );
}
