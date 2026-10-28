import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { approveTimesheetWeekAction, approveTimesheetWeeksAction, copyPreviousWeekAction, remindTimesheetWeekAction, returnTimesheetWeekAction, saveTimeAction, setMissionFavoriteAction, submitTimesheetWeekAction } from '@/app/(app)/timesheet/actions';
import { usePermissions } from '@/hooks/use-permissions';
import { myTimeAction, teamTimeAction, type MyTime, type TeamTime } from '@/lib/erp/vanguard/time-actions';
import { floorCode } from '@/lib/erp/vanguard/floors';
import { addDays } from '@/lib/timesheet/validation';
import { groupWeeklyEntries, missionKey } from '@/lib/timesheet/weekly';
import type { TimeEntry, TimeError } from '@/types/timesheet';
import { useStore } from '../store';
import { Field, Icon, Tabs } from '../ui/common';
import type { Say } from './Conversation';
import { useSay } from './say';
import { Select, Suggest } from '../ui/Select';
import { Lozenge, type Tone } from './work-ui';

// The "Temps" room: BUMEX One's timesheet in Vanguard, laid out as BUMEX One had it (asked on 2026-10-27). My week: its
// rhythm and progress against my capacity, my missions day by day in a large grid, favourites, copying last week,
// sending it for review; an entry may be on one of my tickets, and then counts on it (0012). For the administrator and
// managers, the team's weeks to approve, return, chase or export. Saved with BUMEX One's timesheet actions, in the
// person's current entity, under its rules (no future day, 24 h a day at most, a sent week is locked).

const ERRORS: Record<TimeError, [string, string]> = {
  invalid: ['Vérifiez les informations saisies.', 'Please check the entry details.'],
  duration: ['Saisissez une durée de 1 minute à 24 heures (minutes : 0–59).', 'Enter a duration from 1 minute to 24 hours (minutes: 0–59).'],
  date: ['Choisissez un jour passé ou aujourd’hui.', 'Choose today or a past day.'],
  note: ['La note ne doit pas dépasser 1 000 caractères.', 'Keep the note under 1,000 characters.'],
  mission: ['Indiquez la mission ou tâche (200 caractères au plus).', 'Enter a mission or task (up to 200 characters).'],
  project: ['Ce projet n’est pas ouvert à votre feuille de temps.', 'This project is not open to your timesheet.'],
  unavailable: ['Enregistrement impossible ; votre saisie est gardée, réessayez.', 'Could not save; your input is kept, try again.'],
  conflict: ['Cette saisie a changé ailleurs : rechargez avant de réessayer.', 'This entry changed elsewhere: reload before trying again.'],
  daily_limit: ['Le total d’une journée ne peut pas dépasser 24 heures.', 'A day cannot total more than 24 hours.'],
};
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

function Ring({ value, size = 84 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ts-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="value" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value / 100))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{Math.round(value)} %</text>
    </svg>
  );
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

function WeekBar({ week, days, today, onWeek, say, children }: { week: string; days: string[]; today: string; onWeek: (w: string) => void; say: Say; children?: ReactNode }) {
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
      <div className="ts-weekacts">
        {children}
        <label className="ts-goto small">{say('Aller à la semaine du', 'Go to the week of')}<input className="in mono" type="date" value={go} onChange={(e) => setGo(e.target.value)} /></label>
        <button className="btn sm" disabled={!go} onClick={() => { onWeek(go); setGo(''); }}>{say('Afficher', 'Show')}</button>
      </div>
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
  // on the test floor, the person's test lines alone (0011): no week to send, no review
  const test = useStore((s) => Boolean(s.state.entities.find((e) => e.id === s.ui.entityId)?.isTest));
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

function MySheet({ log, test }: { log: { projectId: string; mission: string; taskId: string | null } | null; test: boolean }) {
  const say = useSay();
  const { toast } = useStore();
  const day = useDayLabel();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<MyTime | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [opened, setOpened] = useState(!log);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'copy' | 'submit' | null>(null);

  useEffect(() => {
    let live = true;
    myTimeAction(week, test).then((d) => live && setData(d)).catch(() => {
      const { toast: show, ui } = useStore.getState();
      if (live) show('error', ui.lang === 'fr' ? 'La feuille de temps est indisponible.' : 'The timesheet is unavailable.');
    });
    return () => { live = false; };
  }, [week, test]);

  if (!data) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  // the entry asked for from a ticket, once the week is read (if the project is open to the person's timesheet)
  if (!opened) {
    setOpened(true);
    if (log && data.projects.some((p) => p.id === log.projectId) && !(data.weekStatus && data.weekStatus.status !== 'returned')) setSelection({ date: data.today, projectId: log.projectId, mission: log.mission, taskId: log.taskId, entries: [] });
  }
  const refresh = async () => setData(await myTimeAction(data.week, data.test));
  const { days, today } = data;
  const visible = filter ? data.entries.filter((e) => e.project_id === filter) : data.entries;
  const groups = groupWeeklyEntries(visible);
  const daily = days.map((d) => visible.filter((e) => e.work_date === d).reduce((s, e) => s + e.duration_minutes, 0));
  const total = daily.reduce((s, m) => s + m, 0);
  const capacity = Math.max(data.capacityHours, 1) * 60;
  const completion = Math.min(100, Math.round((total / capacity) * 100));
  const workedDays = daily.filter((m) => m > 0).length;
  const locked = Boolean(data.weekStatus && data.weekStatus.status !== 'returned');
  const allowed = new Set(data.projects.map((p) => p.id));
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));
  for (const e of data.entries) if (!projectName.has(e.project_id)) projectName.set(e.project_id, e.project?.name ?? say('Projet non accessible', 'Unavailable project'));
  const defaultDate = today >= data.week && today <= days[6] ? today : data.week;
  const status = data.weekStatus?.status ?? 'draft';
  const keyOf = (g: { days: Map<string, TimeEntry[]> }) => [...g.days.values()].flat().find((e) => e.task_key)?.task_key ?? null;
  const taskOf = (g: { days: Map<string, TimeEntry[]> }) => [...g.days.values()].flat().find((e) => e.task_id)?.task_id ?? null;
  const canAdd = data.projects.length > 0 && data.week <= today && !locked;

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

  return (
    <div className="ts">
      <section className="ts-hero">
        <div className="ts-hero-t">
          <div className="ts-kicker">{say('Mon rythme · cette semaine', 'My rhythm · this week')}</div>
          <h1>{say('Feuille de temps', 'Timesheet')}</h1>
          <p>{say('Répartissez simplement votre temps entre vos missions et vos tickets, et gardez le fil de la semaine.', 'Split your time across your missions and tickets, and keep the week on track.')}</p>
        </div>
        <div className="ts-hero-r">
          <Ring value={completion} />
          <div><div className="ts-total">{duration(total)}</div><div className="ts-cap">{say(`sur ${data.capacityHours} h de capacité`, `of ${data.capacityHours} h capacity`)}</div></div>
          {data.weekStatus && <span className={`ts-pill ${status}`}>{say(STATUS[status][0], STATUS[status][1])}</span>}
          <button className="btn primary" disabled={!canAdd} onClick={() => setSelection({ date: defaultDate, projectId: '', mission: '', taskId: null, entries: [] })}><Icon name="plus" size={14} /> {say('Ajouter une mission', 'Add a mission')}</button>
        </div>
      </section>

      <WeekBar week={data.week} days={days} today={today} onWeek={(w) => { setSelection(null); setWeek(w); }} say={say}>
        {total > 0 && !data.test && (!data.weekStatus || data.weekStatus.status === 'returned') && <button className="btn sm primary" disabled={busy} onClick={() => setConfirm('submit')}>{data.weekStatus?.status === 'returned' ? say('Renvoyer la semaine', 'Resubmit the week') : say('Envoyer la semaine', 'Submit the week')}</button>}
        {!data.entries.length && data.week <= today && !locked && <button className="btn sm" disabled={busy} onClick={() => setConfirm('copy')}>{say('Reprendre la semaine précédente', 'Copy the previous week')}</button>}
      </WeekBar>

      {data.test && <div className="banner info">{say("Temps de l'étage de test : à part de votre feuille réelle. Il ne s'envoie pas et n'est compté nulle part ailleurs.", 'Test floor time: apart from your real timesheet. It is not sent and counts nowhere else.')}</div>}
      {data.weekStatus?.status === 'returned' && <div className="banner warn"><b>{say('Cette feuille vous a été retournée pour correction.', 'This timesheet was returned for changes.')}</b>{data.weekStatus.review_note ? <div>{data.weekStatus.review_note}</div> : null}</div>}

      <div className="ts-kpis">
        <div className="ts-kpi"><div><div className="l">{say('Temps déclaré', 'Time logged')}</div><div className="v">{duration(total)}</div></div><span className="ic"><Icon name="clock" size={18} /></span></div>
        <div className="ts-kpi"><div><div className="l">{say('Missions actives', 'Active missions')}</div><div className="v">{groups.length}</div></div><span className="ic"><Icon name="missions" size={18} /></span></div>
        <div className="ts-kpi good"><div><div className="l">{say('Jours renseignés', 'Days logged')}</div><div className="v">{workedDays} / 7</div></div><span className="ic"><Icon name="calendar" size={18} /></span></div>
      </div>

      {data.events.length > 0 && (
        <section className="ts-panel">
          <div className="ts-panel-h"><div><h2>{say('Suivi de ma feuille', 'My timesheet progress')}</h2><p className="small muted">{say('Toutes les étapes de validation cette semaine.', 'Every approval step this week.')}</p></div><span className="ts-count">{data.events.length} {say('étape(s)', 'step(s)')}</span></div>
          <div className="ts-events">
            {data.events.map((e) => (
              <article key={e.id} className={`ts-event ${e.status}`}>
                <h3><i />{e.status === 'approved' ? say('Feuille validée', 'Timesheet approved') : e.status === 'returned' ? say('Correction demandée', 'Changes requested') : say('Feuille envoyée', 'Timesheet submitted')}</h3>
                <p className="small muted">{new Date(e.created_at).toLocaleString(say('fr-FR', 'en-GB'), { dateStyle: 'medium', timeStyle: 'short' })}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
                {e.note && <p className="small ts-note">{e.note}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="ts-panel">
        <div className="ts-panel-h"><div><h2>{say('Rythme de la semaine', 'Weekly rhythm')}</h2><p className="small muted">{say('La hauteur indique le temps déclaré chaque jour.', 'Bar height shows the time logged each day.')}</p></div><span className={`ts-count ${completion >= 100 ? 'good' : ''}`}>{completion >= 100 ? say('Semaine complétée', 'Week complete') : say(`${100 - completion} % restant`, `${100 - completion}% remaining`)}</span></div>
        <div className="ts-rhythm">
          {daily.map((m, i) => (
            <div key={days[i]} className={`ts-day ${days[i] === today ? 'today' : ''}`}>
              <div className="ts-barwrap"><div className={`ts-bar ${m ? 'on' : ''}`} style={{ height: `${m ? Math.max(18, Math.min(100, Math.round((m / 480) * 100))) : 6}%` }} title={m ? duration(m) : '0 h'} /></div>
              <span>{day(days[i], { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </section>

      {data.favorites.length > 0 && (
        <section className="ts-favs">
          <div><h2><span aria-hidden="true">★</span> {say('Missions favorites', 'Favourite missions')}</h2><p className="small muted">{say('Ajoutez du temps sans rechercher la mission.', 'Log time without searching for the mission.')}</p></div>
          {data.favorites.map((f) => (
            <button key={missionKey(f.project_id, f.mission)} disabled={!canAdd} onClick={() => setSelection({ date: defaultDate, projectId: f.project_id, mission: f.mission, taskId: null, entries: [] })}>
              <b>{f.mission}</b><span>{projectName.get(f.project_id)}</span>
            </button>
          ))}
        </section>
      )}

      <section className="ts-panel flush">
        <div className="ts-panel-h pad"><div><h2>{say('Mes missions de la semaine', 'My missions this week')}</h2><p className="small muted">{say('Cliquez sur une case pour saisir ou modifier une durée.', 'Click a cell to add or edit a duration.')}</p></div>
          <Select className="in" style={{ width: 240 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={say('Filtrer par projet', 'Filter by project')}>
            <option value="">{say('Tous les projets', 'All projects')}</option>{[...projectName].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </div>
        <div className="ts-gridwrap" tabIndex={0} role="region" aria-label={say('Calendrier de la semaine, défilement horizontal', 'Weekly calendar, scroll horizontally')}>
          <table className="ts-grid">
            <thead>
              <tr>
                <th className="ts-first">{say('Mission · tâche', 'Mission · task')}</th>
                {days.map((d, i) => <th key={d} className={`${i >= 5 ? 'we' : ''} ${d === today ? 'today' : ''}`}><span className="dn">{day(d, { weekday: 'short' })}</span><span className="dd">{day(d, { day: 'numeric' })}</span></th>)}
                <th className="ts-tot">Total</th><th className="ts-days">{say('Jours', 'Days')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const key = keyOf(g);
                return (
                  <tr key={g.key}>
                    <th scope="row" className="ts-first"><div className="ts-mission"><span className="stripe" style={{ background: STRIPES[gi % STRIPES.length] }} /><div><p>{key && <span className="ts-tkey">{key}</span>}{(key && g.mission.startsWith(`${key} · `) ? g.mission.slice(key.length + 3) : g.mission) || say('Mission à préciser', 'Unspecified mission')}</p><span className="small muted">{g.projectName ?? say('Projet non accessible', 'Unavailable project')}</span></div></div></th>
                    {days.map((d, i) => {
                      const cell = g.days.get(d) ?? [];
                      const minutes = cell.reduce((s, e) => s + e.duration_minutes, 0);
                      const can = d <= today && allowed.has(g.projectId) && !locked;
                      return (
                        <td key={d} className={`${i >= 5 ? 'we' : ''} ${d === today ? 'today' : ''}`}>
                          <button className={`ts-cell ${minutes ? 'on' : ''}`} disabled={!can}
                            aria-label={`${g.mission || '—'} — ${day(d, { weekday: 'long', day: 'numeric', month: 'long' })} — ${minutes ? duration(minutes) : say('Ajouter du temps', 'Add time')}`}
                            onClick={() => setSelection({ date: d, projectId: g.projectId, mission: g.mission, taskId: taskOf(g), entries: cell, entry: cell.length === 1 ? cell[0] : undefined })}>
                            {minutes ? <><b>{duration(minutes)}</b>{cell.length > 1 && <span className="small">{cell.length} {say('saisies', 'entries')}</span>}</> : d > today ? '—' : <Icon name="plus" size={15} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="ts-tot"><b>{duration(g.minutes)}</b></td>
                    <td className="ts-days"><b>{g.days.size}</b></td>
                  </tr>
                );
              })}
              {!groups.length && (
                <tr><td colSpan={10}>
                  <div className="ts-empty">
                    <h3>{say('Votre semaine est prête', 'Your week is ready')}</h3>
                    <p className="small muted">{say('Ajoutez votre première mission et indiquez le temps consacré chaque jour.', 'Add your first mission and the time spent each day.')}</p>
                    {canAdd && <button className="btn sm primary" onClick={() => setSelection({ date: defaultDate, projectId: '', mission: '', taskId: null, entries: [] })}><Icon name="plus" size={13} /> {say('Ajouter une mission', 'Add a mission')}</button>}
                    {locked && <p className="small muted">{say('Semaine verrouillée', 'Week locked')}</p>}
                  </div>
                </td></tr>
              )}
            </tbody>
            {groups.length > 0 && <tfoot><tr><th className="ts-first">{say('Total par jour', 'Total per day')}</th>{daily.map((m, i) => <td key={days[i]} className={i >= 5 ? 'we' : ''}>{m ? duration(m) : '—'}</td>)}<td className="ts-tot"><b>{duration(total)}</b></td><td className="ts-days">{workedDays}</td></tr></tfoot>}
          </table>
        </div>
        <p className="small muted pad">{say('Les totaux portent sur la semaine affichée. Un jour est compté une seule fois par mission, même avec plusieurs saisies.', 'Totals cover the week shown. A day counts once per mission, even with several entries.')}</p>
      </section>

      {selection && <EntryEditor data={data} selection={selection} onPick={(entry) => setSelection({ ...selection, entry, projectId: entry.project_id, mission: entry.mission, taskId: entry.task_id ?? null })} onClose={() => setSelection(null)} onSaved={async () => { setSelection(null); toast('ok', say('Temps enregistré. Le calendrier et les totaux sont à jour.', 'Time saved. The calendar and totals are up to date.')); await refresh(); }} say={say} />}
      {confirm === 'copy' && (
        <Modal title={say('Reprendre la semaine précédente ?', 'Copy the previous week?')} onClose={() => setConfirm(null)}>
          <p className="small">{say('Les missions, durées et notes de la semaine précédente seront copiées sur les mêmes jours cette semaine. Vous pourrez ensuite tout modifier.', "The previous week's missions, durations and notes are copied to the same days this week. You can change everything afterwards.")}</p>
          <p className="small muted">{say('Cette action est disponible uniquement parce que cette semaine est encore vide.', 'This is offered only because this week is still empty.')}</p>
          <div className="actions"><button className="btn sm" onClick={() => setConfirm(null)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy} onClick={copy}>{busy ? say('Copie…', 'Copying…') : say('Copier la semaine', 'Copy the week')}</button></div>
        </Modal>
      )}
      {confirm === 'submit' && (
        <Modal title={say('Envoyer cette semaine ?', 'Send this week?')} onClose={() => setConfirm(null)}>
          <p className="small">{say('Après l’envoi, la feuille sera verrouillée et prête à être contrôlée par un responsable.', 'Once sent, the timesheet is locked and ready for a manager to review.')}</p>
          <div className="ts-sum"><div><b>{duration(total)}</b><span>{say('déclaré', 'logged')}</span></div><div><b>{groups.length}</b><span>{say('missions', 'missions')}</span></div><div><b>{workedDays}</b><span>{say('jours', 'days')}</span></div></div>
          <div className="actions"><button className="btn sm" onClick={() => setConfirm(null)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy} onClick={submit}>{busy ? say('Envoi…', 'Sending…') : say('Confirmer l’envoi', 'Confirm')}</button></div>
        </Modal>
      )}
    </div>
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
      {error && <div className="banner crit">{say(...ERRORS[error])}</div>}
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
