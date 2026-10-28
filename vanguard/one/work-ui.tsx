import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LOAD_PRIORITIES, type Load } from '@/lib/work/load';
import { Icon } from '../ui/common';
import type { Say } from './ticket-history';

// [bumex-one] The small pieces the tickets are drawn with, as Jira draws them (the ticket page, the board, the list,
// My work): a person's avatar, the priority and type icons, the status lozenge and a person's load. Styles:
// vanguard/work.css.

export type Tone = 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'archived' | 'plain';

const HUES = [212, 152, 28, 268, 340, 190, 48, 0];
const hue = (seed: string) => HUES[[...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';

export function Avatar({ name, size = 24, title }: { name: string | null | undefined; size?: number; title?: string }) {
  if (!name) return <span className="av none" style={{ width: size, height: size }} title={title ?? '—'} aria-hidden="true" />;
  const h = hue(name);
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${h} 45% 88%)`, color: `hsl(${h} 45% 28%)` };
  return <span className="av" style={style} title={title ?? name} aria-hidden="true">{initials(name)}</span>;
}

const PRIORITY_LABEL: Record<string, [string, string]> = { low: ['Basse', 'Low'], medium: ['Moyenne', 'Medium'], high: ['Haute', 'High'], urgent: ['Urgente', 'Urgent'] };

export function PriorityIcon({ priority, say }: { priority: string; say: Say }) {
  const p = priority === 'normal' ? 'medium' : priority;
  const label = say(...(PRIORITY_LABEL[p] ?? [p, p]));
  return (
    <svg className={`prio ${p}`} viewBox="0 0 16 16" width="16" height="16" role="img" aria-label={label}>
      <title>{label}</title>
      {p === 'urgent' && <><path d="M3 9.5 8 5l5 4.5" /><path d="M3 13 8 8.5l5 4.5" /></>}
      {p === 'high' && <path d="M3 11 8 6l5 5" />}
      {p === 'medium' && <><path d="M3 6.5h10" /><path d="M3 10h10" /></>}
      {p === 'low' && <path d="M3 6l5 5 5-5" />}
    </svg>
  );
}

const TYPE_LABEL: Record<string, [string, string]> = { task: ['Tâche', 'Task'], bug: ['Anomalie', 'Bug'], feature: ['Évolution', 'Feature'], support: ['Support', 'Support'], client_request: ['Demande client', 'Client request'], internal: ['Interne', 'Internal'] };

export function TypeIcon({ type, say }: { type: string; say: Say }) {
  const label = say(...(TYPE_LABEL[type] ?? [type, type]));
  return (
    <span className={`ttype ${type}`} title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        {type === 'bug' ? <circle cx="8" cy="8" r="4" /> : type === 'feature' ? <path d="M8 3.5v9M3.5 8h9" /> : type === 'support' ? <path d="M6 6a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M8 12v.1" /> : type === 'client_request' ? <path d="M3 4h10v7H7l-3 2.5V11H3z" /> : type === 'internal' ? <path d="M4 8h8" /> : <path d="m4 8.5 2.5 2.5L12 5.5" />}
      </svg>
    </span>
  );
}

export function Lozenge({ tone, children }: { tone: Tone | undefined; children: React.ReactNode }) {
  return <span className={`loz ${tone ?? 'plain'}`}>{children}</span>;
}

/** A board's stage as a lozenge colour: its category, green once completed. */
export const stageTone = (stage: { is_completed?: boolean; category?: string } | null | undefined): Tone =>
  !stage ? 'plain' : stage.is_completed ? 'done' : stage.category === 'backlog' ? 'todo' : ((stage.category as Tone) ?? 'plain');

export const statusTone = (status: string): Tone => (status === 'backlog' ? 'todo' : (['todo', 'in_progress', 'review', 'blocked', 'done', 'archived'].includes(status) ? (status as Tone) : 'plain'));

export const hoursText = (h: number, say: Say) => (h > 0 && h < 1 ? `${Math.round(h * 60)} min` : `${say(String(Math.round(h * 10) / 10).replace('.', ','), String(Math.round(h * 10) / 10))} h`);

const LEVEL: Record<Load['level'], [string, string]> = { light: ['Légère', 'Light'], balanced: ['Équilibrée', 'Balanced'], high: ['Chargée', 'High'], overloaded: ['Surchargée', 'Overloaded'] };
export const levelLabel = (level: Load['level'], say: Say) => say(...LEVEL[level]);

/** A person's week: the weighted hours by priority against their capacity. */
export function LoadBar({ load, say, compact }: { load: Load; say: Say; compact?: boolean }) {
  const scale = Math.max(load.capacityHours, load.weekHours, 1);
  return (
    <div className={`loadbar ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="loadbar-head">
          <b>{hoursText(load.weekHours, say)}</b><span className="muted"> / {hoursText(load.capacityHours, say)}</span>
          <span className={`loadlvl ${load.level}`}>{levelLabel(load.level, say)} · {load.percent} %</span>
        </div>
      )}
      <div className="loadbar-track" title={`${hoursText(load.weekHours, say)} / ${hoursText(load.capacityHours, say)} · ${load.percent} %`}>
        {LOAD_PRIORITIES.map((p) => load.byPriority[p] > 0 && <i key={p} className={p} style={{ width: `${(load.byPriority[p] / scale) * 100}%` }} />)}
        {load.capacityHours > 0 && load.weekHours > load.capacityHours && <span className="cap" style={{ left: `${(load.capacityHours / scale) * 100}%` }} />}
      </div>
      {!compact && (load.overdue > 0 || load.unestimated > 0) && (
        <div className="small" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {load.overdue > 0 && <span style={{ color: 'var(--crit)' }}>{load.overdue} {say('en retard', 'late')}</span>}
          {load.unestimated > 0 && <span className="muted">{load.unestimated} {say('à estimer', 'to estimate')}</span>}
        </div>
      )}
    </div>
  );
}

/** A form over the page (the mission's, a milestone's): drawn in Vanguard's container so no card cuts it, its clicks its own. */
export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return createPortal(
    <div className="ts-modal-back" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className={`ts-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ts-modal-h"><h2>{title}</h2><button className="btn sm ghost" onClick={onClose} aria-label="×"><Icon name="close" size={14} /></button></div>
        {children}
      </div>
    </div>,
    document.querySelector('.vanguard') ?? document.body,
  );
}
