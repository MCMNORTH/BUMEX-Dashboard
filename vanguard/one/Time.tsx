import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { approveTimesheetWeekAction, approveTimesheetWeeksAction, copyPreviousWeekAction, deleteTimeAction, remindTimesheetWeekAction, returnTimesheetWeekAction, saveTimeAction, setMissionFavoriteAction, submitTimesheetWeekAction } from '@/app/(app)/timesheet/actions';
import { usePermissions } from '@/hooks/use-permissions';
import { myTimeAction, teamTimeAction, type MyTime, type RecentTicket, type TeamTime } from '@/lib/erp/vanguard/time-actions';
import { floorCode } from '@/lib/erp/vanguard/floors';
import { addDays } from '@/lib/timesheet/validation';
import { groupWeeklyEntries, missionKey } from '@/lib/timesheet/weekly';
import { editDuration, parseDuration } from '@/lib/timesheet/duration';
import type { TimeEntry, TimeError } from '@/types/timesheet';
import { useStore } from '../store';
import { Field, Icon, Tabs } from '../ui/common';
import type { Say } from './Conversation';
import { useSay } from './say';
import { Select, Suggest } from '../ui/Select';
import { Lozenge, type Tone } from './work-ui';
import { QuickLog, TIME_ERRORS, pickOf, ticketMission, whatOptions, type Pick } from './QuickLog';
import { ago } from './ticket-history';

// The "Temps" room: BUMEX One's timesheet in Vanguard (asked on 2026-10-27), made simple on 2026-10-28 (MySheet): my
// week in one strip, a quick entry, a grid typed into; an entry may be on one of my tickets, and then counts on it (0012). For the administrator and
// managers, the team's weeks to approve, return, chase or export. Saved with BUMEX One's timesheet actions, in the
// person's current entity, under its rules (no future day, 24 h a day at most, a sent week is locked).

const STATUS: Record<string, [string, string, Tone]> = {
  draft: ['Brouillon', 'Draft', 'todo'],
  submitted: ['Envoyée', 'Submitted', 'review'],
  approved: ['Validée', 'Approved', 'done'],
  returned: ['À corriger', 'Needs changes', 'blocked'],
};
const STRIPES = ['#2b3f66', '#6b8dc1', '#2e7d4f', '#b07a1e', '#b4232c', '#7a5cc7'];
const duration = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

function useDayLabel() {
  const lang = useStore((s) => s.ui.lang);
  return (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="ts-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className={`ts-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ts-modal-h"><h2>{title}</h2><button className="btn sm ghost" onClick={onClose} aria-label="×"><Icon name="close" size={14} /></button></div>
        {children}
      </div>
    </div>
  );
}

function WeekBar({ week, days, today, onWeek, say, children, simple }: { week: string; days: string[]; today: string; onWeek: (w: string) => void; say: Say; children?: ReactNode; simple?: boolean }) {
  const day = useDayLabel();
  const [go, setGo] = useState('');
  return (
    <div className="ts-weekbar">
      <div className="ts-weeknav">
        <button className="btn sm" onClick={() => onWeek(addDays(week, -7))} aria-label={say('Semaine précédente', 'Previous week')}><Icon name="chevronLeft" size={14} /></button>
        <h2 aria-live="polite">{day(week, { day: 'numeric', month: 'short' })} – {day(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
        <button className="btn sm" onClick={() => onWeek(addDays(week, 7))} aria-label={say('Semaine suivante', 'Next week')}><Icon name="chevronRight" size={14} /></button>
        {!(today >= week && today <= days[6]) && <button className="btn sm ghost" onClick={() => onWeek(today)}>{say('Cette semaine', 'This week')}</button>}
      </div>
      {!simple && <div className="ts-weekacts">
        {children}
        <label className="ts-goto small">{say('Aller à la semaine du', 'Go to the week of')}<input className="in mono" type="date" value={go} onChange={(e) => setGo(e.target.value)} /></label>
        <button className="btn sm" disabled={!go} onClick={() => { onWeek(go); setGo(''); }}>{say('Afficher', 'Show')}</button>
      </div>}
    </div>
  );
}

// "log:<{projectId, mission, taskId?}>" starts an entry for that mission, on that ticket, today (a ticket's "Log time")
function logOf(tab?: string | null): { projectId: string; mission: string; taskId: string | null } | null {
  if (!tab?.startsWith('log:')) return null;
  try {
    const value = JSON.parse(decodeURIComponent(tab.slice(4))) as { projectId?: unknown; mission?: unknown; taskId?: unknown };
    return typeof value.projectId === 'string' && typeof value.mission === 'string'
      ? { projectId: value.projectId, mission: value.mission.slice(0, 200), taskId: typeof value.taskId === 'string' ? value.taskId : null }
      : null;
  } catch {
    return null;
  }
}

export function TimeRoom({ initialTab }: { initialTab?: string | null }) {
  const say = useSay();
  const [tab, setTab] = useState<'mine' | 'team'>(initialTab === 'team' ? 'team' : 'mine');
  // the administrator and managers review their people's weeks (BUMEX One's rule; the server checks it again)
  const { role } = usePermissions();
  // on the test floor (test mode, 0013), the person's test lines alone: no week to send, no review
  const test = useStore((s) => s.state.session.testMode === true || Boolean(s.state.entities.find((e) => e.id === s.ui.entityId)?.isTest));
  const canReview = (role === 'admin' || role === 'manager') && !test;
  return (
    <>
      <div className="sheet-head">
        <h1>{say('Temps', 'Time')}</h1>
        <Tabs tabs={[{ id: 'mine' as const, label: say('Ma feuille', 'My timesheet') }, ...(canReview ? [{ id: 'team' as const, label: role === 'admin' ? say("Toute l'entreprise", 'The whole company') : say('Mon équipe', 'My team') }] : [])]} value={tab} onChange={setTab} />
      </div>
      <div className="sheet-body">
        {tab === 'team' && canReview ? <TeamSheet /> : <MySheet key={`${initialTab ?? ''}:${test}`} log={logOf(initialTab)} test={test} />}
      </div>
    </>
  );
}

type Selection = { date: string; projectId: string; mission: string; taskId: string | null; entry?: TimeEntry; entries: TimeEntry[] };
type Row = { key: string; projectId: string; projectName: string | null; mission: string; taskId: string | null; taskKey: string | null; days: Map<string, TimeEntry[]>; minutes: number };

const focusCell = (row: number, col: number) => (document.querySelector(`[data-cell="${row}-${col}"]`) as HTMLElement | null)?.focus();

// [bumex-one] Ma feuille, made simple (asked on 2026-10-28): the week in one strip (its hours against my capacity, its
// days, its state and the plain "send" line), the quick entry right under it (QuickLog.tsx), then the week's grid,
// typed into like a spreadsheet: a cell takes "2", "1h30" or "45min", Enter or Tab saves it, an empty cell removes the
// line, the arrows move; a cell with several lines opens them. "+ Ajouter une ligne" adds a ticket or a mission to
// the grid. On a phone, the days as a list.
function MySheet({ log, test }: { log: { projectId: string; mission: string; taskId: string | null } | null; test: boolean }) {
  const say = useSay();
  const { toast } = useStore();
  const day = useDayLabel();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<MyTime | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [opened, setOpened] = useState(!log);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'copy' | 'submit' | null>(null);
  const [override, setOverride] = useState<Record<string, number>>({}); // cells being saved, shown at once
  const [extra, setExtra] = useState<Pick[]>([]); // lines added to the grid, not saved yet
  const [adding, setAdding] = useState<{ what: string; label: string } | null>(null);
  const [quick, setQuick] = useState<{ date?: string; ticketId?: string | null; n: number }>({ ticketId: log?.taskId ?? null, n: 0 });

  useEffect(() => {
    let live = true;
    myTimeAction(week, test).then((d) => live && setData(d)).catch(() => {
      const { toast: show, ui } = useStore.getState();
      if (live) show('error', ui.lang === 'fr' ? 'La feuille de temps est indisponible.' : 'The timesheet is unavailable.');
    });
    return () => { live = false; };
  }, [week, test]);

  if (!data) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  // a line asked for from a mission without a ticket opens the full editor once the week is read
  if (!opened) {
    setOpened(true);
    if (log && !log.taskId && data.projects.some((p) => p.id === log.projectId) && !(data.weekStatus && data.weekStatus.status !== 'returned')) setSelection({ date: data.today, projectId: log.projectId, mission: log.mission, taskId: null, entries: [] });
  }
  const refresh = async () => setData(await myTimeAction(data.week, data.test));
  const { days, today } = data;
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));
  const rows: Row[] = groupWeeklyEntries(data.entries).map((g) => {
    const all = [...g.days.values()].flat();
    return { ...g, taskId: all.find((e) => e.task_id)?.task_id ?? null, taskKey: all.find((e) => e.task_key)?.task_key ?? null };
  });
  for (const x of extra) {
    if (!rows.some((r) => r.key === missionKey(x.projectId, x.mission))) rows.push({ key: missionKey(x.projectId, x.mission), projectId: x.projectId, projectName: projectName.get(x.projectId) ?? null, mission: x.mission, taskId: x.taskId, taskKey: data.tickets.find((t) => t.id === x.taskId)?.key ?? null, days: new Map(), minutes: 0 });
  }
  // the tickets moved this week are lines of it, even before any time; the lines of recently moved tickets first, the
  // last moved on top (the others keep their order)
  for (const t of data.recent) {
    const moved = t.movedAt?.slice(0, 10);
    if (!moved || moved < data.week || moved > days[6] || rows.some((r) => r.taskId === t.id)) continue;
    rows.push({ key: missionKey(t.project_id, ticketMission(t)), projectId: t.project_id, projectName: t.projectName, mission: ticketMission(t), taskId: t.id, taskKey: t.key, days: new Map(), minutes: 0 });
  }
  const recentRank = new Map(data.recent.map((t, i) => [t.id, i]));
  rows.sort((a, b) => (recentRank.get(a.taskId ?? '') ?? 999) - (recentRank.get(b.taskId ?? '') ?? 999));
  const cellMinutes = (r: Row, d: string) => override[`${r.key}|${d}`] ?? (r.days.get(d) ?? []).reduce((s, e) => s + e.duration_minutes, 0);
  const daily = days.map((d) => rows.reduce((s, r) => s + cellMinutes(r, d), 0));
  const total = daily.reduce((s, m) => s + m, 0);
  const capacity = Math.max(data.capacityHours, 1) * 60;
  const completion = Math.min(100, Math.round((total / capacity) * 100));
  const locked = Boolean(data.weekStatus && data.weekStatus.status !== 'returned');
  const allowed = new Set(data.projects.map((p) => p.id));
  const status = data.weekStatus?.status ?? 'draft';
  const canAdd = data.projects.length > 0 && data.week <= today && !locked;
  const canSend = total > 0 && !data.test && (!data.weekStatus || data.weekStatus.status === 'returned');

  const submit = async () => {
    setBusy(true);
    const result = await submitTimesheetWeekAction(data.week).catch(() => ({ error: 'unavailable' as const }));
    setBusy(false);
    setConfirm(null);
    if ('error' in result) toast('error', result.error === 'empty' ? say('Ajoutez au moins une saisie avant l’envoi.', 'Add at least one entry before sending.') : result.error === 'approved' ? say('Cette semaine est déjà validée.', 'This week is already approved.') : say('La semaine n’a pas pu être envoyée.', 'The week could not be sent.'));
    else toast('ok', say('Semaine envoyée pour validation.', 'Week sent for review.'));
    await refresh();
  };
  const copy = async () => {
    setBusy(true);
    const result = await copyPreviousWeekAction(data.week, data.test).catch(() => ({ error: 'unavailable' as const }));
    setBusy(false);
    setConfirm(null);
    if ('error' in result) toast('error', result.error === 'no_source' ? say('La semaine précédente ne contient aucune saisie réutilisable.', 'The previous week has no entry to reuse.') : result.error === 'not_empty' ? say('Cette semaine contient déjà des saisies.', 'This week already has entries.') : say('La copie n’a pas pu être effectuée.', 'The copy failed.'));
    else toast('ok', say(`${result.count} saisie(s) reprise(s)`, `${result.count} entr(ies) copied`));
    await refresh();
  };
  // a typed cell: a new line, the line changed, or removed (0); shown at once, put back if refused
  const commitCell = async (row: Row, date: string, value: number) => {
    const cell = row.days.get(date) ?? [];
    const key = `${row.key}|${date}`;
    setOverride((o) => ({ ...o, [key]: value }));
    const split = { hours: String(Math.floor(value / 60)), minutes: String(value % 60) };
    try {
      const one = cell[0];
      const result = one
        ? value === 0
          ? await deleteTimeAction(one.id, one.updated_at, data.test)
          : await saveTimeAction({ id: one.id, project_id: one.project_id, mission: one.mission, work_date: date, ...split, note: one.note ?? '', task_id: one.task_id ?? null, updated_at: one.updated_at }, data.test)
        : value > 0
          ? await saveTimeAction({ id: crypto.randomUUID(), project_id: row.projectId, mission: row.mission, work_date: date, ...split, note: '', task_id: row.taskId }, data.test)
          : ({ success: true } as const);
      if ('error' in result) toast('error', say(...TIME_ERRORS[result.error]));
      await refresh();
    } catch {
      toast('error', say(...TIME_ERRORS.unavailable));
    } finally {
      setOverride((o) => { const next = { ...o }; delete next[key]; return next; });
    }
  };
  const addLine = () => {
    if (!adding) return;
    const pick = pickOf(adding.what, data);
    const mission = pick ? pick.mission || adding.label.trim().slice(0, 200) : '';
    if (!pick || !mission) return;
    setExtra([...extra, { ...pick, mission }]);
    setAdding(null);
    window.setTimeout(() => focusCell(rows.length, Math.max(0, days.indexOf(today >= data.week && today <= days[6] ? today : data.week))), 50);
  };
  const addingPick = adding ? pickOf(adding.what, data) : null;

  return (
    <div className="ts ts-simple">
      <section className="ts-strip">
        <WeekBar week={data.week} days={days} today={today} onWeek={(w) => { setSelection(null); setExtra([]); setWeek(w); }} say={say} simple />
        <div className="ts-strip-sum">
          <div className="ts-strip-total"><b>{duration(total)}</b> <span className="muted">/ {data.capacityHours} h</span></div>
          <div className="ts-strip-bar" title={`${completion} %`}><i style={{ width: `${completion}%` }} /></div>
          <div className="ts-strip-days" aria-hidden="true">
            {daily.map((m, i) => <span key={days[i]} className={`${days[i] === today ? 'today' : ''} ${m ? 'on' : ''}`} title={`${day(days[i], { weekday: 'long' })} · ${m ? duration(m) : '0 h'}`}><i style={{ height: `${m ? Math.max(20, Math.min(100, Math.round((m / 480) * 100))) : 8}%` }} /><b>{day(days[i], { weekday: 'narrow' })}</b></span>)}
          </div>
        </div>
        <div className="ts-strip-act">
          {data.weekStatus && <span className={`ts-pill ${status}`}>{say(STATUS[status][0], STATUS[status][1])}</span>}
          {canSend && <span className="small">{say(`Vous avez saisi ${duration(total)} sur ${data.capacityHours} h`, `You logged ${duration(total)} of ${data.capacityHours} h`)}</span>}
          {canSend && <button className="btn sm primary" disabled={busy} onClick={() => setConfirm('submit')}>{data.weekStatus?.status === 'returned' ? say('Renvoyer la semaine', 'Resubmit the week') : say('Envoyer la semaine', 'Send the week')}</button>}
          {!data.entries.length && data.week <= today && !locked && <button className="btn sm" disabled={busy} onClick={() => setConfirm('copy')}>{say('Reprendre la semaine précédente', 'Copy the previous week')}</button>}
        </div>
      </section>

      {data.test && <div className="banner info">{say("Temps de l'étage de test : à part de votre feuille réelle. Il ne s'envoie pas et n'est compté nulle part ailleurs.", 'Test floor time: apart from your real timesheet. It is not sent and counts nowhere else.')}</div>}
      {data.weekStatus?.status === 'returned' && <div className="banner warn"><b>{say('Cette feuille vous a été retournée pour correction.', 'This timesheet was returned for changes.')}</b>{data.weekStatus.review_note ? <div>{data.weekStatus.review_note}</div> : null}</div>}
      {locked && <div className="banner info small">{say('Semaine envoyée : elle est verrouillée jusqu’à sa validation ou son retour.', 'Week sent: it is locked until it is approved or returned.')}</div>}

      {data.week <= today && data.recent.length > 0 && <RecentPanel data={data} locked={locked} onLogged={refresh} say={say} />}

      {data.week <= today && (
        <section className="ts-panel ql-panel">
          <h2>{data.recent.length ? say('Autre saisie', 'Something else') : say('Saisie rapide', 'Quick entry')}</h2>
          <QuickLog key={quick.n} data={data} ticketId={quick.ticketId} date={quick.date} say={say} onSaved={async (d) => { if (d < data.week || d > days[6]) setWeek(d); else await refresh(); }} />
        </section>
      )}

      <section className="ts-panel flush ts-gridpanel">
        <div className="ts-gridwrap" role="region" aria-label={say('Ma semaine, défilement horizontal', 'My week, scroll horizontally')}>
          <table className="ts-grid">
            <thead>
              <tr>
                <th className="ts-first">{say('Mission · tâche', 'Mission · task')}</th>
                {days.map((d, i) => <th key={d} className={`${i >= 5 ? 'we' : ''} ${d === today ? 'today' : ''}`}><span className="dn">{day(d, { weekday: 'short' })}</span><span className="dd">{day(d, { day: 'numeric' })}</span></th>)}
                <th className="ts-tot">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.key}>
                  <th scope="row" className="ts-first"><div className="ts-mission"><span className="stripe" style={{ background: STRIPES[ri % STRIPES.length] }} /><div><p>{r.taskKey && <span className="ts-tkey">{r.taskKey}</span>}{(r.taskKey && r.mission.startsWith(`${r.taskKey} · `) ? r.mission.slice(r.taskKey.length + 3) : r.mission) || say('Mission à préciser', 'Unspecified mission')}</p><span className="small muted">{r.projectName ?? say('Projet non accessible', 'Unavailable project')}</span></div></div></th>
                  {days.map((d, i) => {
                    const cell = r.days.get(d) ?? [];
                    return (
                      <td key={d} className={`${i >= 5 ? 'we' : ''} ${d === today ? 'today' : ''}`}>
                        <TimeCell row={ri} col={i} minutes={cellMinutes(r, d)} lines={cell.length} saving={`${r.key}|${d}` in override} can={d <= today && allowed.has(r.projectId) && !locked} future={d > today} say={say}
                          label={`${r.mission || '—'} — ${day(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                          onCommit={(value) => commitCell(r, d, value)}
                          onMany={() => setSelection({ date: d, projectId: r.projectId, mission: r.mission, taskId: r.taskId, entries: cell, entry: cell[0] })} />
                      </td>
                    );
                  })}
                  <td className="ts-tot"><b>{duration(days.reduce((s, d) => s + cellMinutes(r, d), 0))}</b></td>
                </tr>
              ))}
              {canAdd && (
                <tr className="ts-addrow">
                  <th className="ts-first" colSpan={adding ? 9 : 1}>
                    {!adding ? <button className="linkish" onClick={() => setAdding({ what: '', label: '' })}><Icon name="plus" size={13} /> {say('Ajouter une ligne', 'Add a line')}</button> : (
                      <div className="ts-addline">
                        <Select className="in" value={adding.what} onChange={(e) => setAdding({ ...adding, what: e.target.value })} aria-label={say('Ticket ou mission', 'Ticket or mission')}>
                          <option value="">{say('Un ticket ou une mission…', 'A ticket or a mission…')}</option>
                          {whatOptions(data, say)}
                        </Select>
                        {addingPick && !addingPick.mission && <input className="in" autoFocus value={adding.label} maxLength={200} onChange={(e) => setAdding({ ...adding, label: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLine()} placeholder={say('Ce que vous avez fait', 'What you did')} />}
                        <button className="btn sm primary" disabled={!addingPick || !(addingPick.mission || adding.label.trim())} onClick={addLine}>{say('Ajouter', 'Add')}</button>
                        <button className="btn sm ghost" onClick={() => setAdding(null)}>{say('Annuler', 'Cancel')}</button>
                      </div>
                    )}
                  </th>
                  {!adding && <td colSpan={8} className="small muted ts-addhint">{say('Cliquez une case et tapez 2, 1h30 ou 45min, puis Entrée. Une case vidée retire la saisie.', 'Click a cell and type 2, 1h30 or 45min, then Enter. Clearing a cell removes the entry.')}</td>}
                </tr>
              )}
              {!rows.length && !canAdd && <tr><td colSpan={9} className="small muted" style={{ padding: 16 }}>{locked ? say('Semaine verrouillée.', 'Week locked.') : say('Aucune saisie cette semaine.', 'No entry this week.')}</td></tr>}
            </tbody>
            {rows.length > 0 && <tfoot><tr><th className="ts-first">{say('Total par jour', 'Total per day')}</th>{daily.map((m, i) => <td key={days[i]} className={i >= 5 ? 'we' : ''}>{m ? duration(m) : '—'}</td>)}<td className="ts-tot"><b>{duration(total)}</b></td></tr></tfoot>}
          </table>
        </div>
      </section>

      <section className="ts-daylist" aria-label={say('Ma semaine, jour par jour', 'My week, day by day')}>
        {days.filter((d) => d <= today).map((d) => {
          const lines = data.entries.filter((e) => e.work_date === d);
          return (
            <div key={d} className={`ts-dl-day ${d === today ? 'today' : ''}`}>
              <div className="ts-dl-h">
                <b>{day(d, { weekday: 'long', day: 'numeric', month: 'short' })}</b>
                <span className="muted">{duration(lines.reduce((s, e) => s + e.duration_minutes, 0))}</span>
                {canAdd && <button className="btn sm" onClick={() => { setQuick({ date: d, ticketId: null, n: quick.n + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector<HTMLElement>('.ql-panel')?.scrollIntoView({ behavior: 'smooth' }); }} aria-label={say('Ajouter du temps ce jour', 'Add time that day')}><Icon name="plus" size={13} /></button>}
              </div>
              {lines.map((e) => (
                <button key={e.id} className="ts-dl-e" disabled={locked} onClick={() => setSelection({ date: d, projectId: e.project_id, mission: e.mission, taskId: e.task_id ?? null, entries: [e], entry: e })}>
                  <span>{e.mission}<span className="small muted"> · {e.project?.name ?? '—'}</span></span><b>{duration(e.duration_minutes)}</b>
                </button>
              ))}
            </div>
          );
        })}
      </section>

      {data.events.length > 0 && (
        <details className="ts-panel ts-events-fold">
          <summary><b>{say('Suivi de ma feuille', 'My timesheet progress')}</b> <span className="small muted">· {data.events.length} {say('étape(s)', 'step(s)')}</span></summary>
          <div className="ts-events">
            {data.events.map((e) => (
              <article key={e.id} className={`ts-event ${e.status}`}>
                <h3><i />{e.status === 'approved' ? say('Feuille validée', 'Timesheet approved') : e.status === 'returned' ? say('Correction demandée', 'Changes requested') : say('Feuille envoyée', 'Timesheet submitted')}</h3>
                <p className="small muted">{new Date(e.created_at).toLocaleString(say('fr-FR', 'en-GB'), { dateStyle: 'medium', timeStyle: 'short' })}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
                {e.note && <p className="small ts-note">{e.note}</p>}
              </article>
            ))}
          </div>
        </details>
      )}

      {selection && <EntryEditor data={data} selection={selection} onPick={(entry) => setSelection({ ...selection, entry, projectId: entry.project_id, mission: entry.mission, taskId: entry.task_id ?? null })} onClose={() => setSelection(null)} onSaved={async () => { setSelection(null); toast('ok', say('Temps enregistré.', 'Time saved.')); await refresh(); }} say={say} />}
      {confirm === 'copy' && (
        <Modal title={say('Reprendre la semaine précédente ?', 'Copy the previous week?')} onClose={() => setConfirm(null)}>
          <p className="small">{say('Les missions, durées et notes de la semaine précédente seront copiées sur les mêmes jours cette semaine. Vous pourrez ensuite tout modifier.', "The previous week's missions, durations and notes are copied to the same days this week. You can change everything afterwards.")}</p>
          <div className="actions"><button className="btn sm" onClick={() => setConfirm(null)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy} onClick={copy}>{busy ? say('Copie…', 'Copying…') : say('Copier la semaine', 'Copy the week')}</button></div>
        </Modal>
      )}
      {confirm === 'submit' && (
        <Modal title={say('Envoyer cette semaine ?', 'Send this week?')} onClose={() => setConfirm(null)}>
          <p className="small">{say(`Vous avez saisi ${duration(total)} sur ${data.capacityHours} h. Une fois envoyée, la semaine est verrouillée jusqu’à sa validation.`, `You logged ${duration(total)} of ${data.capacityHours} h. Once sent, the week is locked until it is approved.`)}</p>
          <div className="actions"><button className="btn sm" onClick={() => setConfirm(null)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy} onClick={submit}>{busy ? say('Envoi…', 'Sending…') : say('Envoyer', 'Send')}</button></div>
        </Modal>
      )}
    </div>
  );
}

// The tickets one just worked on, the last moved first (asked on 2026-10-28): one click logs time on one for the day
// picked, added to what that day already holds; the last click can be undone. Another duration is typed ("1h30").
const RECENT_CHIPS = [15, 30, 60, 120, 240];

function RecentPanel({ data, locked, onLogged, say }: { data: MyTime; locked: boolean; onLogged: () => Promise<void>; say: Say }) {
  const { toast } = useStore();
  const day = useDayLabel();
  const open = data.days.filter((d) => d <= data.today);
  const [date, setDate] = useState(() => (open.includes(data.today) ? data.today : open[open.length - 1] ?? data.today));
  const [busy, setBusy] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<{ id: string; date: string; before: number; label: string } | null>(null);
  const [now] = useState(Date.now);
  const lineOf = (t: RecentTicket, d: string) => data.entries.find((e) => e.task_id === t.id && e.work_date === d);
  const write = async (t: RecentTicket, d: string, total: number) => {
    const one = lineOf(t, d);
    const split = { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
    if (one && total === 0) return deleteTimeAction(one.id, one.updated_at, data.test);
    if (one) return saveTimeAction({ id: one.id, project_id: one.project_id, mission: one.mission, work_date: d, ...split, note: one.note ?? '', task_id: t.id, updated_at: one.updated_at }, data.test);
    return saveTimeAction({ id: crypto.randomUUID(), project_id: t.project_id, mission: ticketMission(t), work_date: d, ...split, note: '', task_id: t.id }, data.test);
  };
  const log = async (t: RecentTicket, minutes: number) => {
    const before = lineOf(t, date)?.duration_minutes ?? 0;
    setBusy(t.id);
    try {
      const result = await write(t, date, before + minutes);
      if ('error' in result) { toast('error', say(...TIME_ERRORS[result.error])); return; }
      setUndo({ id: t.id, date, before, label: `+${duration(minutes)}` });
      setTyped((x) => ({ ...x, [t.id]: '' }));
      await onLogged();
    } catch {
      toast('error', say(...TIME_ERRORS.unavailable));
    } finally {
      setBusy(null);
    }
  };
  const revert = async () => {
    if (!undo) return;
    const t = data.recent.find((x) => x.id === undo.id);
    if (!t) return;
    setBusy(t.id);
    try {
      const result = await write(t, undo.date, undo.before);
      if ('error' in result) toast('error', say(...TIME_ERRORS[result.error]));
      setUndo(null);
      await onLogged();
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="ts-panel ts-recent">
      <div className="ts-recent-h">
        <h2>{say('Mes tickets récents', 'My recent tickets')}</h2>
        <span className="small muted">{say('Un clic enregistre le temps pour', 'One click logs time for')}</span>
        <div className="seg-mini" role="group" aria-label={say('Jour', 'Day')}>
          {open.map((d) => <button key={d} className={d === date ? 'on' : ''} onClick={() => setDate(d)}>{d === data.today ? say("aujourd'hui", 'today') : day(d, { weekday: 'short', day: 'numeric' })}</button>)}
        </div>
      </div>
      {locked ? <span className="small muted">{say('Semaine envoyée : elle est verrouillée.', 'Week sent: it is locked.')}</span> : data.recent.map((t) => {
        const logged = lineOf(t, date)?.duration_minutes ?? 0;
        return (
          <div key={t.id} className={`ts-recent-row ${busy === t.id ? 'busy' : ''}`}>
            <div className="ts-recent-what">
              <span className="ts-tkey">{t.key}</span>
              <b>{t.title}</b>
              <span className="small muted">{t.projectName ?? ''}{t.stage ? ` · ${t.stage}` : ''} · {t.movedAt ? say(`déplacé ${ago(t.movedAt, now, say)}`, `moved ${ago(t.movedAt, now, say)}`) : say('en cours', 'in progress')}</span>
            </div>
            <span className={`ts-recent-logged ${logged ? 'on' : ''}`}>{logged ? duration(logged) : '—'}</span>
            <div className="ts-recent-chips">
              {RECENT_CHIPS.map((m) => <button key={m} className="wk-chip" disabled={busy !== null} onClick={() => log(t, m)}>+{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}
              <input className="in ts-recent-in" value={typed[t.id] ?? ''} placeholder={say('autre', 'other')} aria-label={say(`Durée sur ${t.key}`, `Time on ${t.key}`)} disabled={busy !== null}
                onChange={(e) => setTyped((x) => ({ ...x, [t.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key !== 'Enter') return; const m = parseDuration(typed[t.id] ?? ''); if (m) void log(t, m); else toast('error', say('Une durée : 2, 1h30, 45min…', 'A duration: 2, 1h30, 45min…')); }} />
            </div>
            {undo?.id === t.id && <button className="linkish small ts-recent-undo" disabled={busy !== null} onClick={revert}>{undo.label} · {say('annuler', 'undo')}</button>}
          </div>
        );
      })}
    </section>
  );
}

// A cell of the week you type into: "2", "1h30", "45min"; Enter or Tab saves, Échap cancels, an empty cell removes the
// line; the arrows move between cells, and typing on a cell starts editing it. A cell with several lines opens them.
function TimeCell({ row, col, minutes, lines, saving, can, future, label, onCommit, onMany, say }: {
  row: number; col: number; minutes: number; lines: number; saving: boolean; can: boolean; future: boolean; label: string;
  onCommit: (minutes: number) => void | Promise<void>; onMany: () => void; say: Say;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const start = (initial?: string) => {
    if (!can || saving) return;
    if (lines > 1) { onMany(); return; }
    setText(initial ?? editDuration(minutes));
    setBad(false);
  };
  const commit = (then?: [number, number]) => {
    if (text === null) return true;
    const typed = text.trim();
    const value = typed === '' || typed === '0' ? 0 : parseDuration(typed);
    if (value === null) { setBad(true); return false; }
    setText(null);
    if (value !== minutes) void onCommit(value);
    if (then) window.setTimeout(() => focusCell(row + then[0], col + then[1]), 0);
    return true;
  };
  const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (text !== null) {
    return (
      <input className={`ts-cellin ${bad ? 'bad' : ''}`} autoFocus value={text} aria-label={label} title={bad ? say('Ex. 2, 1h30, 45min', 'E.g. 2, 1h30, 45min') : undefined}
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setText(e.target.value); setBad(false); }} onBlur={() => { if (!commit()) setText(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit([1, 0]); }
          else if (e.key === 'Tab') { if (!commit()) e.preventDefault(); }
          else if (e.key === 'Escape') { e.stopPropagation(); setText(null); window.setTimeout(() => focusCell(row, col), 0); }
          else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); commit(arrows[e.key]); }
        }} />
    );
  }
  return (
    <button className={`ts-cell ${minutes ? 'on' : ''} ${saving ? 'saving' : ''}`} disabled={!can && !minutes} data-cell={`${row}-${col}`}
      aria-label={`${label} — ${minutes ? duration(minutes) : say('Ajouter du temps', 'Add time')}`}
      onClick={() => start()}
      onKeyDown={(e) => {
        if (arrows[e.key]) { e.preventDefault(); focusCell(row + arrows[e.key][0], col + arrows[e.key][1]); }
        else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); start(e.key); }
        else if ((e.key === 'Backspace' || e.key === 'Delete') && minutes && lines === 1 && can) { e.preventDefault(); void onCommit(0); }
      }}>
      {minutes ? <><b>{duration(minutes)}</b>{lines > 1 && <span className="small">{lines} {say('saisies', 'entries')}</span>}</> : future ? '—' : <span className="ts-cell-plus">+</span>}
    </button>
  );
}

function EntryEditor({ data, selection, onPick, onClose, onSaved, say }: { data: MyTime; selection: Selection; onPick: (e: TimeEntry) => void; onClose: () => void; onSaved: () => void; say: Say }) {
  const entry = selection.entry;
  const day = useDayLabel();
  const [projectId, setProjectId] = useState(entry?.project_id ?? selection.projectId);
  const [mission, setMission] = useState(entry?.mission ?? selection.mission);
  const [taskId, setTaskId] = useState<string | null>(entry ? entry.task_id ?? null : selection.taskId);
  const [date, setDate] = useState(entry?.work_date ?? selection.date);
  const [hours, setHours] = useState(entry ? Math.floor(entry.duration_minutes / 60) : 1);
  const [minutes, setMinutes] = useState(entry ? entry.duration_minutes % 60 : 0);
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<TimeError | null>(null);
  const [saving, setSaving] = useState(false);
  const submission = useRef<string | null>(null);
  // my open tickets on this project first (time on one counts on the ticket), then the labels already used
  const tickets = data.tickets.filter((t) => t.project_id === projectId);
  const ticketLabel = (t: { key: string | null; title: string }) => `${t.key ? `${t.key} · ` : ''}${t.title}`.slice(0, 200);
  const suggestions = useMemo(() => [
    ...tickets.map((t) => ({ value: ticketLabel(t), keywords: t.key ?? undefined })),
    ...[...new Set(data.missions.filter((m) => m.project_id === projectId).map((m) => m.mission))].filter((m) => !tickets.some((t) => ticketLabel(t) === m)),
  ], [data.missions, projectId, tickets]);
  const linked = data.tickets.find((t) => t.id === taskId) ?? null;
  const favorite = data.favorites.some((f) => f.project_id === projectId && f.mission === mission);
  const pickMission = (value: string) => {
    setMission(value);
    const match = tickets.find((t) => ticketLabel(t) === value);
    setTaskId(match ? match.id : value === mission ? taskId : null);
  };
  const save = async () => {
    submission.current ??= crypto.randomUUID();
    setSaving(true);
    setError(null);
    try {
      const result = await saveTimeAction({ id: entry?.id ?? submission.current, project_id: projectId, mission, work_date: date, hours: String(hours), minutes: String(minutes), note, task_id: taskId, ...(entry ? { updated_at: entry.updated_at } : {}) }, data.test);
      if ('error' in result) setError(result.error);
      else onSaved();
    } catch {
      setError('unavailable');
    } finally {
      setSaving(false);
    }
  };
  const toggleFavorite = async () => {
    await setMissionFavoriteAction({ projectId, mission, favorite: !favorite }).catch(() => null);
    onSaved();
  };
  return (
    <Modal title={entry ? say('Modifier le temps passé', 'Edit time spent') : say('Ajouter du temps', 'Add time')} onClose={onClose} wide>
      <p className="small muted" style={{ marginTop: -4 }}>{day(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      {selection.entries.length > 1 && <div className="ts-picks"><span className="small muted">{say('Saisies déjà enregistrées ce jour :', 'Entries already saved that day:')}</span>{selection.entries.map((e) => <button key={e.id} className={`btn sm ${entry?.id === e.id ? 'primary' : ''}`} onClick={() => onPick(e)}>{duration(e.duration_minutes)}{e.note ? ` · ${e.note.slice(0, 24)}` : ''}</button>)}</div>}
      {!data.projects.length ? <div className="banner info">{say('Aucun projet accessible pour saisir du temps.', 'No project open to log time on.')}</div> : (
        <div className="grid3">
          <Field label={say('Projet', 'Project')}><Select recent="missions" className="in" value={projectId} disabled={Boolean(entry)} onChange={(e) => { setProjectId(e.target.value); setMission(''); setTaskId(null); }}><option value="">{say('Choisir un projet', 'Choose a project')}</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label={say('Mission · tâche', 'Mission · task')} style={{ gridColumn: 'span 2' }}><Suggest options={suggestions} value={mission} maxLength={200} onChange={(e) => pickMission(e.target.value)} placeholder={say('Un de vos tickets, ou ex. Mission A — audit du dossier', 'One of your tickets, or e.g. Mission A — file audit')} /></Field>
          <Field label={say('Jour', 'Day')}><input className="in mono" type="date" value={date} min={data.week} max={data.days[6] < data.today ? data.days[6] : data.today} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={say('Heures', 'Hours')}><input className="in num" type="number" min={0} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
          <Field label="Minutes"><input className="in num" type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
          <Field label={say('Raccourcis', 'Shortcuts')} style={{ gridColumn: 'span 3' }}><div className="ts-presets">{[30, 60, 120, 240, 480].map((m) => <button key={m} className={`btn sm ${hours * 60 + minutes === m ? 'primary' : ''}`} onClick={() => { setHours(Math.floor(m / 60)); setMinutes(m % 60); }}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}</div></Field>
        </div>
      )}
      {linked && <div className="banner info small">{say('Ce temps comptera sur le ticket', 'This time counts on the ticket')} <b>{ticketLabel(linked)}</b>.</div>}
      <Field label={say('Détail du travail (facultatif)', 'Work details (optional)')}><textarea className="in" style={{ height: 70, padding: 8 }} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <div className="banner crit">{say(...TIME_ERRORS[error])}</div>}
      <div className="actions">
        {projectId && mission.trim() && !data.test && <button className="btn sm ghost" style={{ marginRight: 'auto' }} onClick={toggleFavorite}>{favorite ? say('★ Retirer des favoris', '★ Remove from favourites') : say('☆ Ajouter aux favoris', '☆ Add to favourites')}</button>}
        <button className="btn sm" onClick={onClose} disabled={saving}>{say('Annuler', 'Cancel')}</button>
        <button className="btn sm primary" disabled={saving || !projectId || !mission.trim() || hours * 60 + minutes <= 0} onClick={save}>{saving ? say('Enregistrement…', 'Saving…') : say('Enregistrer', 'Save')}</button>
      </div>
    </Modal>
  );
}

type SortKey = 'control' | 'name' | 'time_desc' | 'time_asc';

function TeamSheet() {
  const say = useSay();
  const { state, toast } = useStore();
  const day = useDayLabel();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<TeamTime | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('control');
  const [selected, setSelected] = useState<string[]>([]);
  const [returning, setReturning] = useState<{ id: string; reason: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    teamTimeAction(week).then((d) => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [week]);

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner warn">{say("La revue des feuilles de temps est réservée à l'administrateur et aux managers.", 'Reviewing timesheets is for the administrator and managers.')}</div>;
  const refresh = async () => { setSelected([]); setData(await teamTimeAction(data.week)); };
  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await work(); toast('ok', done); await refresh(); } catch { toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.')); } finally { setBusy(false); }
  };
  const totals = new Map<string, number>();
  const daily = new Map<string, Map<string, number>>();
  for (const e of data.entries) {
    if (!e.user_id) continue;
    totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.duration_minutes);
    const d = daily.get(e.user_id) ?? new Map<string, number>();
    d.set(e.work_date, (d.get(e.work_date) ?? 0) + e.duration_minutes);
    daily.set(e.user_id, d);
  }
  const statusOf = new Map(data.statuses.map((s) => [s.user_id, s]));
  const floorName = (code: string | null) => (code ? state.entities.find((e) => e.code === floorCode(code))?.name ?? code : say('Sans entité', 'No entity'));
  const entities = [...new Set(data.profiles.map((p) => p.entity_code ?? ''))];
  const s = q.trim().toLowerCase();
  const all = data.profiles.map((p) => {
    const total = totals.get(p.id) ?? 0;
    const st = statusOf.get(p.id)?.status ?? 'draft';
    return { p, total, st, incomplete: total < Math.max(p.weekly_capacity_hours, 1) * 60 };
  });
  const rows = all
    .filter((r) => (!s || `${r.p.full_name} ${r.p.role} ${floorName(r.p.entity_code)}`.toLowerCase().includes(s))
      && (statusFilter === 'all' || statusFilter === r.st || (statusFilter === 'incomplete' && r.incomplete))
      && (entityFilter === 'all' || (r.p.entity_code ?? '') === entityFilter))
    .sort((a, b) => {
      if (sort === 'name') return a.p.full_name.localeCompare(b.p.full_name);
      if (sort === 'time_desc') return b.total - a.total || a.p.full_name.localeCompare(b.p.full_name);
      if (sort === 'time_asc') return a.total - b.total || a.p.full_name.localeCompare(b.p.full_name);
      const rank = (r: typeof a) => (r.st === 'submitted' ? 0 : r.incomplete ? 1 : r.st === 'draft' ? 2 : 3);
      return rank(a) - rank(b) || a.p.full_name.localeCompare(b.p.full_name);
    });
  const submitted = rows.filter((r) => r.st === 'submitted').map((r) => r.p.id);
  const filtered = Boolean(s) || statusFilter !== 'all' || entityFilter !== 'all' || sort !== 'control';
  const exportCsv = () => {
    const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = [say('Collaborateur', 'Person'), say('Rôle', 'Role'), say('Entité', 'Entity'), say('Statut', 'Status'), ...data.days, say('Total (heures)', 'Total (hours)')];
    const lines = rows.map((r) => [r.p.full_name, r.p.role, floorName(r.p.entity_code), say(STATUS[r.st][0], STATUS[r.st][1]), ...data.days.map((d) => ((daily.get(r.p.id)?.get(d) ?? 0) / 60).toFixed(2)), (r.total / 60).toFixed(2)]);
    const csv = [head, ...lines].map((line) => line.map(quote).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `temps-${data.week}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ts">
      <section className="ts-hero">
        <div className="ts-hero-t">
          <div className="ts-kicker">{say('Revue des feuilles', 'Timesheet review')}</div>
          <h1>{data.companyWide ? say("Temps de toute l'entreprise", 'Time across the company') : say('Temps de mon équipe', "My team's time")}</h1>
          <p>{data.companyWide ? say('Tous les profils, toutes entités et temps déclarés pour la semaine.', 'Every profile, every entity and the time logged this week.') : say('Tous les profils de votre entité et leurs temps déclarés pour la semaine.', "Your entity's profiles and the time they logged this week.")}</p>
        </div>
      </section>
      <WeekBar week={data.week} days={data.days} today={data.today} onWeek={setWeek} say={say} />
      <div className="ts-kpis four">
        <div className="ts-kpi"><div><div className="l">{say('Profils', 'Profiles')}</div><div className="v">{data.profiles.length}</div></div><span className="ic"><Icon name="clients" size={18} /></span></div>
        <div className="ts-kpi good"><div><div className="l">{say('Actifs', 'Active')}</div><div className="v">{all.filter((r) => r.total > 0).length}</div></div><span className="ic"><Icon name="activity" size={18} /></span></div>
        <div className="ts-kpi warn"><div><div className="l">{say('À valider', 'To approve')}</div><div className="v">{data.statuses.filter((x) => x.status === 'submitted').length}</div></div><span className="ic"><Icon name="flag" size={18} /></span></div>
        <div className="ts-kpi"><div><div className="l">{say('Déclaré', 'Logged')}</div><div className="v">{duration(data.entries.reduce((a, e) => a + e.duration_minutes, 0))}</div></div><span className="ic"><Icon name="clock" size={18} /></span></div>
      </div>
      <div className="ts-filters">
        <div className="wk-search" style={{ flex: '1 1 260px' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
          <input placeholder={say('Rechercher une personne, un rôle ou une entité…', 'Search a person, a role or an entity…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data.companyWide && (
          <Select className="in" style={{ width: 190 }} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} aria-label={say('Filtrer par entité', 'Filter by entity')}>
            <option value="all">{say('Toutes les entités', 'Every entity')}</option>
            {entities.map((code) => <option key={code} value={code}>{floorName(code || null)}</option>)}
          </Select>
        )}
        <Select className="in" style={{ width: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={say('Filtrer par statut', 'Filter by status')}>
          <option value="all">{say('Tous les statuts', 'Every status')}</option>
          <option value="submitted">{say('À valider', 'To approve')}</option>
          <option value="approved">{say('Validées', 'Approved')}</option>
          <option value="returned">{say('À corriger', 'Needs changes')}</option>
          <option value="draft">{say('Brouillons', 'Drafts')}</option>
          <option value="incomplete">{say('Incomplètes', 'Incomplete')}</option>
        </Select>
        <Select className="in" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={say('Trier les profils', 'Sort the profiles')}>
          <option value="control">{say('Priorité de contrôle', 'Review priority')}</option>
          <option value="name">{say('Nom A–Z', 'Name A–Z')}</option>
          <option value="time_desc">{say('Temps décroissant', 'Most time first')}</option>
          <option value="time_asc">{say('Temps croissant', 'Least time first')}</option>
        </Select>
        <button className="btn sm" onClick={exportCsv}><Icon name="download" size={13} /> {say('Exporter', 'Export')}</button>
        {filtered && <button className="btn sm ghost" onClick={() => { setQ(''); setStatusFilter('all'); setEntityFilter('all'); setSort('control'); }}>{say('Effacer', 'Clear')}</button>}
        {selected.length > 0 && <button className="btn sm primary" disabled={busy} onClick={() => act(() => approveTimesheetWeeksAction(selected, data.week), say(`${selected.length} feuille(s) validée(s)`, `${selected.length} timesheet(s) approved`))}>{say('Valider la sélection', 'Approve the selection')} · {selected.length}</button>}
      </div>
      {returning && (
        <Modal title={say('Retourner la feuille', 'Return the timesheet')} onClose={() => setReturning(null)}>
          <Field label={say('Motif du retour (3 à 500 caractères)', 'Reason for returning it (3 to 500 characters)')}><textarea className="in" style={{ height: 80, padding: 8 }} value={returning.reason} maxLength={500} onChange={(e) => setReturning({ ...returning, reason: e.target.value })} autoFocus /></Field>
          <div className="actions">
            <button className="btn sm" onClick={() => setReturning(null)}>{say('Annuler', 'Cancel')}</button>
            <button className="btn sm danger" disabled={busy || returning.reason.trim().length < 3} onClick={() => { const form = new FormData(); form.set('reason', returning.reason); const id = returning.id; setReturning(null); void act(() => returnTimesheetWeekAction(id, data.week, form), say('Feuille retournée', 'Timesheet returned')); }}>{say('Retourner', 'Return it')}</button>
          </div>
        </Modal>
      )}
      <section className="ts-panel flush">
        <div className="ts-gridwrap">
          <table className="ts-team">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={submitted.length > 0 && submitted.every((id) => selected.includes(id))} disabled={!submitted.length} onChange={(e) => setSelected(e.target.checked ? submitted : [])} aria-label={say('Toutes les envoyées', 'Every submitted one')} /></th>
                <th>{say('Collaborateur', 'Person')}</th>
                {data.days.map((d) => <th key={d} className="num">{day(d, { weekday: 'short' })}</th>)}
                <th className="num">Total</th><th>{say('Statut', 'Status')}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, total, st, incomplete }) => (
                <Fragment key={p.id}>
                  <tr className={open === p.id ? 'sel' : ''}>
                    <td>{st === 'submitted' && <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} aria-label={p.full_name} />}</td>
                    <td className="click" onClick={() => setOpen(open === p.id ? null : p.id)}><b>{p.full_name}</b><div className="small muted">{p.role} · {floorName(p.entity_code)}</div></td>
                    {data.days.map((d) => { const m = daily.get(p.id)?.get(d) ?? 0; return <td key={d} className="num small">{m ? duration(m) : '—'}</td>; })}
                    <td className="num" style={{ color: incomplete ? 'var(--warn)' : undefined }}><b>{duration(total)}</b><div className="small muted">/ {p.weekly_capacity_hours} h</div></td>
                    <td><Lozenge tone={STATUS[st][2]}>{say(STATUS[st][0], STATUS[st][1])}</Lozenge></td>
                    <td>
                      <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                        {st === 'submitted' && <button className="btn sm primary" disabled={busy} onClick={() => act(() => approveTimesheetWeekAction(p.id, data.week), say('Feuille validée', 'Timesheet approved'))}>{say('Valider', 'Approve')}</button>}
                        {(st === 'submitted' || st === 'approved') && <button className="btn sm" disabled={busy} onClick={() => setReturning({ id: p.id, reason: '' })}>{say('Retourner', 'Return')}</button>}
                        {(st === 'draft' || st === 'returned') && p.id !== data.me && <button className="btn sm ghost" disabled={busy} onClick={() => act(() => remindTimesheetWeekAction(p.id, data.week), say('Rappel envoyé', 'Reminder sent'))}>{say('Relancer', 'Remind')}</button>}
                      </div>
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr className="ts-detail">
                      <td />
                      <td colSpan={11}>
                        {groupWeeklyEntries(data.entries.filter((e) => e.user_id === p.id)).map((g) => <div key={g.key} className="small" style={{ padding: '3px 0' }}><b>{g.mission || '—'}</b> · {g.projectName ?? '—'} · {duration(g.minutes)}</div>)}
                        {!totals.get(p.id) && <span className="small muted">{say('Aucun temps cette semaine.', 'No time this week.')}</span>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!rows.length && <tr><td colSpan={12} className="muted" style={{ padding: 16 }}>{say('Personne pour ces filtres.', 'No one for these filters.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
