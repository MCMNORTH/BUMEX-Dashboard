import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveTimeAction } from '@/app/(app)/timesheet/actions';
import { myTimeAction, type MyTime } from '@/lib/erp/vanguard/time-actions';
import { formatDuration, parseDuration } from '@/lib/timesheet/duration';
import { addDays } from '@/lib/timesheet/validation';
import type { TimeError } from '@/types/timesheet';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { Select } from '../ui/Select';
import { useSay } from './say';
import type { Say } from './ticket-history';
import { isTouch } from './screen'; // [mobile]

// [bumex-one] "Saisie rapide" (asked on 2026-10-28: logging time must be effortless). One sentence, Enter saves:
// "J'ai travaillé [durée] sur [quoi] [quand]". Quoi is one search: my open tickets first (the line then counts on the
// ticket, 0012), my favourites, the missions I used, then other work on a project. Durée takes "1h30", "1,5", "90"…
// (lib/timesheet/duration.ts). At the top of my week (Time.tsx), and as a small window from a ticket, a row of My work
// or a card (QuickLogButton). Saved by BUMEX One's timesheet action, under its rules.

export const TIME_ERRORS: Record<TimeError, [string, string]> = {
  invalid: ['Vérifiez les informations saisies.', 'Please check the entry details.'],
  duration: ['Saisissez une durée de 1 minute à 24 heures.', 'Enter a duration from 1 minute to 24 hours.'],
  date: ['Choisissez un jour passé ou aujourd’hui.', 'Choose today or a past day.'],
  note: ['La note ne doit pas dépasser 1 000 caractères.', 'Keep the note under 1,000 characters.'],
  mission: ['Indiquez ce que vous avez fait (200 caractères au plus).', 'Say what you worked on (up to 200 characters).'],
  project: ['Ce projet n’est pas ouvert à votre feuille de temps.', 'This project is not open to your timesheet.'],
  unavailable: ['Enregistrement impossible ; votre saisie est gardée, réessayez.', 'Could not save; your input is kept, try again.'],
  conflict: ['Cette saisie a changé ailleurs : rechargez avant de réessayer.', 'This entry changed elsewhere: reload before trying again.'],
  daily_limit: ['Le total d’une journée ne peut pas dépasser 24 heures.', 'A day cannot total more than 24 hours.'],
  locked: ['Cette semaine est envoyée : elle ne change plus, sauf si elle vous est retournée.', 'This week is sent: it no longer changes unless it is returned to you.'],
};

const CHIPS = [15, 30, 60, 120, 240];
const LAST = 'bumex-vanguard-quicklog';

export const ticketMission = (t: { key: string | null; title: string }) => `${t.key ? `${t.key} · ` : ''}${t.title}`.slice(0, 200);

// what can be picked: t:<ticket>, f:<project>\u0001<mission> (favourite), m:<project>\u0001<mission> (used), p:<project> (other work)
export type Pick = { projectId: string; mission: string; taskId: string | null };
export function pickOf(value: string, data: MyTime): Pick | null {
  if (value.startsWith('t:')) {
    const t = data.tickets.find((x) => x.id === value.slice(2));
    return t ? { projectId: t.project_id, mission: ticketMission(t), taskId: t.id } : null;
  }
  if (value.startsWith('f:') || value.startsWith('m:')) {
    const [projectId, mission] = value.slice(2).split('\u0001');
    return projectId && mission ? { projectId, mission, taskId: null } : null;
  }
  if (value.startsWith('p:')) return { projectId: value.slice(2), mission: '', taskId: null };
  return null;
}
const readLast = () => { try { return localStorage.getItem(LAST) ?? ''; } catch { return ''; } };
const writeLast = (v: string) => { try { localStorage.setItem(LAST, v); } catch { /* private window */ } };

/** The choices of "sur quoi": my open tickets, my favourites, the missions I used, other work on a project. (Called, not
 *  rendered: <Select> reads its <option>s through fragments only.) */
export function whatOptions(data: MyTime, say: Say) {
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));
  const open = new Set(data.projects.map((p) => p.id));
  const tickets = data.tickets.filter((t) => open.has(t.project_id));
  const favorites = data.favorites.filter((f) => open.has(f.project_id));
  const used = [...new Map(data.missions.filter((m) => open.has(m.project_id) && !tickets.some((t) => ticketMission(t) === m.mission) && !favorites.some((f) => f.project_id === m.project_id && f.mission === m.mission))
    .map((m) => [`${m.project_id}\u0001${m.mission}`, m])).values()].slice(0, 30);
  return (
    <>
      {tickets.map((t) => <option key={t.id} value={`t:${t.id}`} data-search={`${t.key ?? ''} ${projectName.get(t.project_id) ?? ''}`} data-hint={say('ticket', 'ticket')}>{ticketMission(t)}</option>)}
      {favorites.map((f) => <option key={`f${f.project_id}${f.mission}`} value={`f:${f.project_id}\u0001${f.mission}`} data-search={projectName.get(f.project_id)} data-hint="★">{f.mission}</option>)}
      {used.map((m) => <option key={`m${m.project_id}${m.mission}`} value={`m:${m.project_id}\u0001${m.mission}`} data-search={projectName.get(m.project_id)} data-hint={projectName.get(m.project_id)}>{m.mission}</option>)}
      {data.projects.map((p) => <option key={`p${p.id}`} value={`p:${p.id}`} data-hint={say('autre travail', 'other work')}>{say('Autre travail · ', 'Other work · ')}{p.name}</option>)}
    </>
  );
}

export function QuickLog({ data, ticketId, date: initialDate, onSaved, compact, say }: {
  data: MyTime; ticketId?: string | null; date?: string; onSaved: (date: string) => void | Promise<void>; compact?: boolean; say: Say;
}) {
  const toast = useStore((s) => s.toast);
  const open = new Set(data.projects.map((p) => p.id));
  const tickets = data.tickets.filter((t) => open.has(t.project_id));
  const favorites = data.favorites.filter((f) => open.has(f.project_id));
  const firstChoice = () => {
    if (ticketId) return `t:${ticketId}`;
    const last = readLast();
    return last && pickOf(last, data) && (!last.startsWith('t:') || tickets.some((t) => `t:${t.id}` === last)) ? last : tickets[0] ? `t:${tickets[0].id}` : favorites[0] ? `f:${favorites[0].project_id}\u0001${favorites[0].mission}` : '';
  };
  const [what, setWhat] = useState(firstChoice);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [date, setDate] = useState(initialDate && initialDate <= data.today ? initialDate : data.today);
  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const minutes = parseDuration(text);
  const pick = pickOf(what, data);
  const mission = pick ? (pick.mission || label.trim()) : '';
  const yesterday = addDays(data.today, -1);
  const lockedWeek = Boolean(data.weekStatus && data.weekStatus.status !== 'returned') && date >= data.week && date <= data.days[6];
  const ticketBlocked = ticketId && !tickets.some((t) => t.id === ticketId);

  const save = async () => {
    if (busy) return;
    if (!minutes) { setError(say('Indiquez une durée, par ex. 1h30, 45min ou 2.', 'Enter a duration, e.g. 1h30, 45min or 2.')); durationRef.current?.focus(); return; }
    if (!pick || !mission) { setError(say('Indiquez sur quoi vous avez travaillé.', 'Say what you worked on.')); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await saveTimeAction({ id: crypto.randomUUID(), project_id: pick.projectId, mission, work_date: date, hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60), note: note.trim(), task_id: pick.taskId }, data.test);
      if ('error' in result) { setError(say(...TIME_ERRORS[result.error])); return; }
      writeLast(what);
      toast('ok', say(`${formatDuration(minutes)} enregistrées · ${mission}`, `${formatDuration(minutes)} saved · ${mission}`));
      setText('');
      setNote('');
      setNoting(false);
      await onSaved(date);
      durationRef.current?.focus();
    } catch {
      setError(say(...TIME_ERRORS.unavailable));
    } finally {
      setBusy(false);
    }
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); } };

  if (!data.projects.length) return <div className="banner info">{say('Aucun projet n’est ouvert à votre feuille de temps.', 'No project is open to your timesheet.')}</div>;
  if (ticketBlocked) return <div className="banner info">{say('Ce ticket n’est pas sur un projet ouvert à votre feuille de temps (vous saisissez votre temps dans votre entité).', 'This ticket is not on a project open to your timesheet (you log time in your own entity).')}</div>;
  return (
    <div className={`ql ${compact ? 'compact' : ''}`} onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}>
      <div className="ql-sentence">
        <span className="ql-w">{say("J'ai travaillé", 'I worked')}</span>
        <span className="ql-dur">
          <input ref={durationRef} className={`in ${text && !minutes ? 'bad' : ''}`} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} onKeyDown={enter}
            placeholder="1h30" aria-label={say('Durée', 'Duration')} autoFocus={compact && !isTouch()} inputMode="text" />{/* [mobile] "1h30" needs a letter; no keyboard over the dialog on a touch screen */}
          {minutes ? <span className="ql-read small muted">{formatDuration(minutes)}</span> : null}
        </span>
        <span className="ql-w">{say('sur', 'on')}</span>
        <Select className="in ql-what" value={what} onChange={(e) => { setWhat(e.target.value); setError(null); }} aria-label={say('Sur quoi', 'On what')}>
          <option value="">{say('Choisir un ticket ou une mission…', 'Pick a ticket or a mission…')}</option>
          {whatOptions(data, say)}
        </Select>
        {pick && !pick.mission && <input className="in ql-label" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} onKeyDown={enter} placeholder={say('Ce que vous avez fait', 'What you did')} aria-label={say('Ce que vous avez fait', 'What you did')} autoFocus />}
        <span className="ql-when" role="group" aria-label={say('Quand', 'When')}>
          <button className={`chip ${date === data.today ? 'on' : ''}`} onClick={() => setDate(data.today)}>{say("aujourd'hui", 'today')}</button>
          <button className={`chip ${date === yesterday ? 'on' : ''}`} onClick={() => setDate(yesterday)}>{say('hier', 'yesterday')}</button>
          <input className="in mono ql-date" type="date" value={date} max={data.today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={say('Jour', 'Day')} />
        </span>
        <button className="btn primary ql-save" disabled={busy || lockedWeek} onClick={save}>{busy ? say('…', '…') : say('Enregistrer', 'Save')}</button>
      </div>
      <div className="ql-more">
        <span className="ql-chips">{CHIPS.map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => { setText(m < 60 ? `${m}min` : String(m / 60)); setError(null); }}>{formatDuration(m)}</button>)}</span>
        {!noting ? <button className="linkish small" onClick={() => setNoting(true)}>+ {say('ajouter une note', 'add a note')}</button>
          : <input className="in ql-note" autoFocus={!isTouch()} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} onKeyDown={enter} placeholder={say('Note (facultatif)', 'Note (optional)')} />}
        {pick?.taskId && <span className="small muted"><Icon name="link" size={12} /> {say('compte sur le ticket', 'counts on the ticket')}</span>}
      </div>
      {lockedWeek && <div className="small muted">{say('Cette semaine est envoyée : choisissez un autre jour.', 'This week is sent: pick another day.')}</div>}
      {error && <div className="banner crit small" role="alert">{error}</div>}
    </div>
  );
}

// "Enregistrer du temps" from anywhere (the ticket page, a row of My work, a card): the same quick entry, already on
// the ticket, in a small window. My week is read for it (the projects, my tickets, the week's state).
export function QuickLogDialog({ ticketId, onClose, onSaved }: { ticketId?: string | null; onClose: () => void; onSaved?: () => void }) {
  const say = useSay();
  const test = useStore((s) => s.state.session.testMode === true);
  const [data, setData] = useState<MyTime | null>(null);
  useEffect(() => {
    let live = true;
    myTimeAction(null, test).then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [test]);
  // drawn over the page (a card or a row never cuts it), and its clicks stay its own (React bubbles them through)
  return createPortal(
    <div className="ts-modal-back" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className="ts-modal ql-modal" role="dialog" aria-modal="true" aria-label={say('Enregistrer du temps', 'Log time')}>
        <div className="ts-modal-h"><h2>{say('Enregistrer du temps', 'Log time')}</h2><button className="btn sm ghost" onClick={onClose} aria-label="×"><Icon name="close" size={14} /></button></div>
        {data ? <QuickLog data={data} ticketId={ticketId} compact say={say} onSaved={() => { onSaved?.(); onClose(); }} /> : <span className="muted">{say('Chargement…', 'Loading…')}</span>}
        <div className="small muted" style={{ marginTop: 8 }}>
          <button className="linkish" onClick={() => { onClose(); useStore.getState().openRoom('time'); }}>{say('Voir ma semaine', 'See my week')} →</button>
        </div>
      </div>
    </div>,
    document.querySelector('.vanguard') ?? document.body,
  );
}

/** A clock button that opens the quick entry on that ticket. */
export function QuickLogButton({ ticketId, label, className, onSaved }: { ticketId: string; label?: string; className?: string; onSaved?: () => void }) {
  const say = useSay();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className ?? 'btn sm ghost'} onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={say('Enregistrer du temps', 'Log time')} aria-label={say('Enregistrer du temps', 'Log time')}>
        <Icon name="clock" size={13} />{label ? ` ${label}` : ''}
      </button>
      {open && <QuickLogDialog ticketId={ticketId} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}
