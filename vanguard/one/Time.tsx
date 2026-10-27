import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { approveTimesheetWeekAction, approveTimesheetWeeksAction, copyPreviousWeekAction, remindTimesheetWeekAction, returnTimesheetWeekAction, saveTimeAction, setMissionFavoriteAction, submitTimesheetWeekAction } from '@/app/(app)/timesheet/actions';
import { usePermissions } from '@/hooks/use-permissions';
import { myTimeAction, teamTimeAction, type MyTime, type TeamTime } from '@/lib/erp/vanguard/time-actions';
import { floorCode } from '@/lib/erp/vanguard/floors';
import { addDays } from '@/lib/timesheet/validation';
import { groupWeeklyEntries, missionKey } from '@/lib/timesheet/weekly';
import type { TimeEntry, TimeError } from '@/types/timesheet';
import { useStore } from '../store';
import { Chip, Field, Icon, Tabs } from '../ui/common';
import type { Say } from './Conversation';
import { useSay } from './say';
import { Select, Suggest } from '../ui/Select';

// The "Temps" room: BUMEX One's timesheet in Vanguard. My week (missions by day, favourites, copying last week, sending
// it for review) and, for the administrator and managers, the team's weeks to approve, return or chase. Saved with
// BUMEX One's timesheet actions, in the person's current entity, under its rules (no future day, 24 h a day at most,
// a sent week is locked).

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
const STATUS: Record<string, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  draft: ['Brouillon', 'Draft', 'dim'],
  submitted: ['Envoyée', 'Submitted', 'warn'],
  approved: ['Validée', 'Approved', 'good'],
  returned: ['À corriger', 'Needs changes', 'crit'],
};
const duration = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

function useDayLabel() {
  const lang = useStore((s) => s.ui.lang);
  return (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function WeekBar({ week, days, today, onWeek, say }: { week: string; days: string[]; today: string; onWeek: (w: string) => void; say: Say }) {
  const day = useDayLabel();
  return (
    <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn sm" onClick={() => onWeek(addDays(week, -7))} aria-label={say('Semaine précédente', 'Previous week')}>‹</button>
      <b style={{ minWidth: 200, textAlign: 'center' }}>{day(week, { day: 'numeric', month: 'short' })} – {day(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}</b>
      <button className="btn sm" onClick={() => onWeek(addDays(week, 7))} aria-label={say('Semaine suivante', 'Next week')}>›</button>
      {!(today >= week && today <= days[6]) && <button className="btn sm" onClick={() => onWeek(today)}>{say('Cette semaine', 'This week')}</button>}
      <input className="in mono" type="date" style={{ width: 150 }} value="" onChange={(e) => e.target.value && onWeek(e.target.value)} aria-label={say('Aller à la semaine du', 'Go to the week of')} />
    </div>
  );
}

// "log:<{projectId, mission}>" starts an entry for that mission today (a ticket's "Log time", vanguard/one/Ticket.tsx)
function logOf(tab?: string | null): { projectId: string; mission: string } | null {
  if (!tab?.startsWith('log:')) return null;
  try {
    const value = JSON.parse(decodeURIComponent(tab.slice(4))) as { projectId?: unknown; mission?: unknown };
    return typeof value.projectId === 'string' && typeof value.mission === 'string' ? { projectId: value.projectId, mission: value.mission.slice(0, 200) } : null;
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
        <Tabs tabs={[{ id: 'mine' as const, label: say('Ma feuille', 'My timesheet') }, ...(canReview ? [{ id: 'team' as const, label: say("L'équipe", 'The team') }] : [])]} value={tab} onChange={setTab} />
      </div>
      <div className="sheet-body">
        {tab === 'team' && canReview ? <TeamSheet /> : <MySheet key={`${initialTab ?? ''}:${test}`} log={logOf(initialTab)} test={test} />}
      </div>
    </>
  );
}

type Selection = { date: string; projectId: string; mission: string; entry?: TimeEntry; entries: TimeEntry[] };

function MySheet({ log, test }: { log: { projectId: string; mission: string } | null; test: boolean }) {
  const say = useSay();
  const { toast } = useStore();
  const day = useDayLabel();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<MyTime | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [opened, setOpened] = useState(!log);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (log && data.projects.some((p) => p.id === log.projectId) && !(data.weekStatus && data.weekStatus.status !== 'returned')) setSelection({ date: data.today, projectId: log.projectId, mission: log.mission, entries: [] });
  }
  const refresh = async () => setData(await myTimeAction(data.week, data.test));
  const { days, today } = data;
  const visible = filter ? data.entries.filter((e) => e.project_id === filter) : data.entries;
  const groups = groupWeeklyEntries(visible);
  const daily = days.map((d) => visible.filter((e) => e.work_date === d).reduce((s, e) => s + e.duration_minutes, 0));
  const total = daily.reduce((s, m) => s + m, 0);
  const capacity = Math.max(data.capacityHours, 1) * 60;
  const locked = Boolean(data.weekStatus && data.weekStatus.status !== 'returned');
  const allowed = new Set(data.projects.map((p) => p.id));
  const projectName = new Map(data.projects.map((p) => [p.id, p.name]));
  for (const e of data.entries) if (!projectName.has(e.project_id)) projectName.set(e.project_id, e.project?.name ?? say('Projet non accessible', 'Unavailable project'));
  const defaultDate = today >= data.week && today <= days[6] ? today : data.week;
  const status = data.weekStatus?.status ?? 'draft';

  const submit = async () => {
    if (!window.confirm(say('Envoyer cette semaine ? Elle sera verrouillée pour la validation.', 'Send this week? It will be locked for review.'))) return;
    setBusy(true);
    const result = await submitTimesheetWeekAction(data.week).catch(() => ({ error: 'unavailable' as const }));
    setBusy(false);
    if ('error' in result) toast('error', result.error === 'empty' ? say('La semaine est vide.', 'The week is empty.') : result.error === 'approved' ? say('Cette semaine est déjà validée.', 'This week is already approved.') : say('Envoi impossible.', 'Could not send.'));
    else toast('ok', say('Semaine envoyée pour validation', 'Week sent for review'));
    await refresh();
  };
  const copy = async () => {
    setBusy(true);
    const result = await copyPreviousWeekAction(data.week, data.test).catch(() => ({ error: 'unavailable' as const }));
    setBusy(false);
    if ('error' in result) toast('error', result.error === 'no_source' ? say('La semaine précédente est vide.', 'The previous week is empty.') : result.error === 'not_empty' ? say('Cette semaine a déjà du temps.', 'This week already has time.') : say('Copie impossible.', 'Could not copy.'));
    else toast('ok', say(`${result.count} saisie(s) reprise(s)`, `${result.count} entr(ies) copied`));
    await refresh();
  };

  return (
    <>
      <WeekBar week={data.week} days={days} today={today} onWeek={(w) => { setSelection(null); setWeek(w); }} say={say} />
      <div className="grid4">
        <div className="kpi"><div className="l">{say('Temps déclaré', 'Time logged')}</div><div className="v">{duration(total)}</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (total / capacity) * 100)}%` }} /></div><div className="small muted">{say(`sur ${data.capacityHours} h`, `of ${data.capacityHours} h`)}</div></div>
        <div className="kpi"><div className="l">{say('Missions', 'Missions')}</div><div className="v">{groups.length}</div></div>
        <div className="kpi"><div className="l">{say('Jours renseignés', 'Days logged')}</div><div className="v">{daily.filter((m) => m > 0).length} / 7</div></div>
        <div className="kpi"><div className="l">{say('Statut', 'Status')}</div><div className="v" style={{ fontSize: 15 }}><Chip kind={STATUS[status][2]}>{say(STATUS[status][0], STATUS[status][1])}</Chip></div></div>
      </div>
      {data.test && <div className="banner info">{say("Temps de l'étage de test : à part de votre feuille réelle. Il ne s'envoie pas et n'est compté nulle part ailleurs.", 'Test floor time: apart from your real timesheet. It is not sent and counts nowhere else.')}</div>}
      {data.weekStatus?.status === 'returned' && <div className="banner crit"><b>{say('Feuille retournée pour correction', 'Timesheet returned for changes')}</b>{data.weekStatus.review_note ? ` · ${data.weekStatus.review_note}` : ''}</div>}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sm primary" disabled={!data.projects.length || data.week > today || locked} onClick={() => setSelection({ date: defaultDate, projectId: '', mission: '', entries: [] })}><Icon name="plus" size={13} /> {say('Ajouter du temps', 'Log time')}</button>
        {total > 0 && !data.test && (!data.weekStatus || data.weekStatus.status === 'returned') && <button className="btn sm" disabled={busy} onClick={submit}>{data.weekStatus?.status === 'returned' ? say('Renvoyer la semaine', 'Send the week again') : say('Envoyer la semaine', 'Send the week')}</button>}
        {!data.entries.length && data.week <= today && !locked && <button className="btn sm" disabled={busy} onClick={copy}>{say('Reprendre la semaine précédente', 'Copy the previous week')}</button>}
        <Select className="in" style={{ width: 220, marginLeft: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={say('Projet', 'Project')}>
          <option value="">{say('Tous les projets', 'All projects')}</option>{[...projectName].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>
      {data.favorites.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small muted">{say('Favorites :', 'Favourites:')}</span>
          {data.favorites.map((f) => <button key={missionKey(f.project_id, f.mission)} className="btn sm" disabled={data.week > today || locked} onClick={() => setSelection({ date: defaultDate, projectId: f.project_id, mission: f.mission, entries: [] })}>★ {f.mission} <span className="muted">· {projectName.get(f.project_id)}</span></button>)}
        </div>
      )}
      {selection && <EntryEditor data={data} selection={selection} onPick={(entry) => setSelection({ ...selection, entry, projectId: entry.project_id, mission: entry.mission })} onClose={() => setSelection(null)} onSaved={async () => { setSelection(null); toast('ok', say('Temps enregistré', 'Time saved')); await refresh(); }} say={say} />}
      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>{say('Mission · tâche', 'Mission · task')}</th>
              {days.map((d) => <th key={d} className="num" style={{ color: d === today ? 'var(--accent)' : undefined }}>{day(d, { weekday: 'short' })} {day(d, { day: 'numeric' })}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <td><b>{g.mission || say('Mission à préciser', 'Unspecified mission')}</b><div className="small muted">{g.projectName ?? say('Projet non accessible', 'Unavailable project')}</div></td>
                {days.map((d) => {
                  const cell = g.days.get(d) ?? [];
                  const minutes = cell.reduce((s, e) => s + e.duration_minutes, 0);
                  const can = d <= today && allowed.has(g.projectId) && !locked;
                  return (
                    <td key={d} className="num">
                      <button className="btn sm ghost" style={{ width: '100%', justifyContent: 'center', fontWeight: minutes ? 600 : 400 }} disabled={!can} onClick={() => setSelection({ date: d, projectId: g.projectId, mission: g.mission, entries: cell, entry: cell.length === 1 ? cell[0] : undefined })}>
                        {minutes ? duration(minutes) : d > today ? '—' : '+'}
                      </button>
                    </td>
                  );
                })}
                <td className="num"><b>{duration(g.minutes)}</b></td>
              </tr>
            ))}
            {!groups.length && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>{say('Votre semaine est vide : ajoutez du temps, ou reprenez la semaine précédente.', 'Your week is empty: log time, or copy the previous week.')}</td></tr>}
          </tbody>
          <tfoot><tr><td>{say('Total du jour', 'Daily total')}</td>{daily.map((m, i) => <td key={days[i]} className="num">{m ? duration(m) : '—'}</td>)}<td className="num">{duration(total)}</td></tr></tfoot>
        </table>
      </div>
      {data.events.length > 0 && (
        <div className="card">
          <h2>{say('Suivi de ma feuille', 'My timesheet’s progress')}</h2>
          {data.events.map((e) => <div key={e.id} className="small" style={{ borderTop: '1px solid var(--line)', padding: '5px 0' }}><Chip kind={STATUS[e.status][2]}>{say(STATUS[e.status][0], STATUS[e.status][1])}</Chip> <span className="muted mono">{e.created_at.slice(0, 16).replace('T', ' ')}</span>{e.actor_name ? ` · ${e.actor_name}` : ''}{e.note ? ` · ${e.note}` : ''}</div>)}
        </div>
      )}
    </>
  );
}

function EntryEditor({ data, selection, onPick, onClose, onSaved, say }: { data: MyTime; selection: Selection; onPick: (e: TimeEntry) => void; onClose: () => void; onSaved: () => void; say: Say }) {
  const entry = selection.entry;
  const day = useDayLabel();
  const [projectId, setProjectId] = useState(entry?.project_id ?? selection.projectId);
  const [mission, setMission] = useState(entry?.mission ?? selection.mission);
  const [date, setDate] = useState(entry?.work_date ?? selection.date);
  const [hours, setHours] = useState(entry ? Math.floor(entry.duration_minutes / 60) : 1);
  const [minutes, setMinutes] = useState(entry ? entry.duration_minutes % 60 : 0);
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<TimeError | null>(null);
  const [saving, setSaving] = useState(false);
  const submission = useRef<string | null>(null);
  const suggestions = useMemo(() => [...new Map(data.missions.filter((m) => m.project_id === projectId).map((m) => [missionKey(m.project_id, m.mission), m.mission])).values()], [data.missions, projectId]);
  const favorite = data.favorites.some((f) => f.project_id === projectId && f.mission === mission);
  const save = async () => {
    submission.current ??= crypto.randomUUID();
    setSaving(true);
    setError(null);
    try {
      const result = await saveTimeAction({ id: entry?.id ?? submission.current, project_id: projectId, mission, work_date: date, hours: String(hours), minutes: String(minutes), note, ...(entry ? { updated_at: entry.updated_at } : {}) }, data.test);
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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{entry ? say('Modifier le temps passé', 'Edit time spent') : say('Ajouter du temps', 'Log time')}</h2>
        <span className="small muted">{day(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label={say('Fermer', 'Close')}><Icon name="close" size={14} /></button>
      </div>
      {selection.entries.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="small muted">{say('Saisies de ce jour :', 'Entries that day:')}</span>{selection.entries.map((e) => <button key={e.id} className={`btn sm ${entry?.id === e.id ? 'primary' : ''}`} onClick={() => onPick(e)}>{duration(e.duration_minutes)}{e.note ? ` · ${e.note.slice(0, 24)}` : ''}</button>)}</div>}
      <div className="grid3">
        <Field label={say('Projet', 'Project')}><Select recent="missions" className="in" value={projectId} disabled={Boolean(entry)} onChange={(e) => { setProjectId(e.target.value); setMission(''); }}><option value="">{say('— choisir —', '— choose —')}</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={say('Mission · tâche', 'Mission · task')}><Suggest options={suggestions} value={mission} maxLength={200} onChange={(e) => setMission(e.target.value)} placeholder={say('Ex. Revue du dossier', 'E.g. File review')} /></Field>
        <Field label={say('Jour', 'Day')}><input className="in mono" type="date" value={date} min={data.week} max={data.days[6] < data.today ? data.days[6] : data.today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={say('Heures', 'Hours')}><input className="in num" type="number" min={0} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
        <Field label="Minutes"><input className="in num" type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></Field>
        <Field label={say('Raccourcis', 'Shortcuts')}><div style={{ display: 'flex', gap: 4 }}>{[30, 60, 120, 240, 480].map((m) => <button key={m} className="btn sm" onClick={() => { setHours(Math.floor(m / 60)); setMinutes(m % 60); }}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}</div></Field>
      </div>
      <Field label={say('Détail du travail (facultatif)', 'Work details (optional)')}><textarea className="in" style={{ height: 60, padding: 8 }} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <div className="banner crit">{say(...ERRORS[error])}</div>}
      <div className="actions">
        {projectId && mission.trim() && !data.test && <button className="btn sm ghost" style={{ marginRight: 'auto' }} onClick={toggleFavorite}>{favorite ? say('★ Retirer des favorites', '★ Remove from favourites') : say('☆ Ajouter aux favorites', '☆ Add to favourites')}</button>}
        <button className="btn sm" onClick={onClose} disabled={saving}>{say('Annuler', 'Cancel')}</button>
        <button className="btn sm primary" disabled={saving || !projectId || !mission.trim() || hours * 60 + minutes <= 0} onClick={save}>{saving ? say('Enregistrement…', 'Saving…') : say('Enregistrer', 'Save')}</button>
      </div>
    </div>
  );
}

function TeamSheet() {
  const say = useSay();
  const { state, toast } = useStore();
  const day = useDayLabel();
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<TeamTime | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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
  const floorName = (code: string | null) => (code ? state.entities.find((e) => e.code === floorCode(code))?.name ?? code : '—');
  const s = q.trim().toLowerCase();
  const rows = data.profiles
    .map((p) => {
      const total = totals.get(p.id) ?? 0;
      const st = statusOf.get(p.id)?.status ?? 'draft';
      return { p, total, st, incomplete: total < Math.max(p.weekly_capacity_hours, 1) * 60 };
    })
    .filter((r) => (!s || `${r.p.full_name} ${floorName(r.p.entity_code)}`.toLowerCase().includes(s)) && (statusFilter === 'all' || statusFilter === r.st || (statusFilter === 'incomplete' && r.incomplete)))
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.st === 'submitted' ? 0 : r.incomplete ? 1 : r.st === 'draft' ? 2 : 3);
      return rank(a) - rank(b) || a.p.full_name.localeCompare(b.p.full_name);
    });
  const submitted = rows.filter((r) => r.st === 'submitted').map((r) => r.p.id);

  return (
    <>
      <WeekBar week={data.week} days={data.days} today={data.today} onWeek={setWeek} say={say} />
      <div className="grid4">
        <div className="kpi"><div className="l">{say('Personnes', 'People')}</div><div className="v">{data.profiles.length}</div></div>
        <div className="kpi"><div className="l">{say('À valider', 'To approve')}</div><div className="v" style={{ color: data.statuses.some((x) => x.status === 'submitted') ? 'var(--warn)' : undefined }}>{data.statuses.filter((x) => x.status === 'submitted').length}</div></div>
        <div className="kpi"><div className="l">{say('Incomplètes', 'Incomplete')}</div><div className="v">{data.profiles.filter((p) => (totals.get(p.id) ?? 0) < Math.max(p.weekly_capacity_hours, 1) * 60).length}</div></div>
        <div className="kpi"><div className="l">{say('Temps déclaré', 'Time logged')}</div><div className="v">{duration(data.entries.reduce((a, e) => a + e.duration_minutes, 0))}</div></div>
      </div>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <input className="in" style={{ maxWidth: 260 }} placeholder={say('Rechercher une personne…', 'Search for a person…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="in" style={{ width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{say('Tous les statuts', 'Every status')}</option>
          {Object.entries(STATUS).map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}
          <option value="incomplete">{say('Incomplètes', 'Incomplete')}</option>
        </Select>
        {selected.length > 0 && <button className="btn sm primary" disabled={busy} onClick={() => act(() => approveTimesheetWeeksAction(selected, data.week), say(`${selected.length} feuille(s) validée(s)`, `${selected.length} timesheet(s) approved`))}>{say('Valider la sélection', 'Approve the selection')} · {selected.length}</button>}
      </div>
      {returning && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small">{say('Motif du retour (3 à 500 caractères)', 'Reason for returning it (3 to 500 characters)')}</span>
          <input className="in" style={{ flex: '1 1 260px' }} value={returning.reason} onChange={(e) => setReturning({ ...returning, reason: e.target.value })} autoFocus />
          <button className="btn sm" onClick={() => setReturning(null)}>{say('Annuler', 'Cancel')}</button>
          <button className="btn sm danger" disabled={busy || returning.reason.trim().length < 3} onClick={() => { const form = new FormData(); form.set('reason', returning.reason); const id = returning.id; setReturning(null); void act(() => returnTimesheetWeekAction(id, data.week, form), say('Feuille retournée', 'Timesheet returned')); }}>{say('Retourner', 'Return it')}</button>
        </div>
      )}
      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}><input type="checkbox" checked={submitted.length > 0 && submitted.every((id) => selected.includes(id))} disabled={!submitted.length} onChange={(e) => setSelected(e.target.checked ? submitted : [])} aria-label={say('Toutes les envoyées', 'Every submitted one')} /></th>
              <th>{say('Personne', 'Person')}</th>
              {data.days.map((d) => <th key={d} className="num">{day(d, { weekday: 'short' })}</th>)}
              <th className="num">Total</th><th>{say('Statut', 'Status')}</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, total, st, incomplete }) => (
              <Fragment key={p.id}>
                <tr className={open === p.id ? 'sel' : ''}>
                  <td>{st === 'submitted' && <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} aria-label={p.full_name} />}</td>
                  <td className="click" onClick={() => setOpen(open === p.id ? null : p.id)}><b>{p.full_name}</b><div className="small muted">{floorName(p.entity_code)}</div></td>
                  {data.days.map((d) => { const m = daily.get(p.id)?.get(d) ?? 0; return <td key={d} className="num small">{m ? duration(m) : '—'}</td>; })}
                  <td className="num" style={{ color: incomplete ? 'var(--warn)' : undefined }}><b>{duration(total)}</b><div className="small muted">/ {p.weekly_capacity_hours} h</div></td>
                  <td><Chip kind={STATUS[st][2]}>{say(STATUS[st][0], STATUS[st][1])}</Chip></td>
                  <td>
                    <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      {st === 'submitted' && <button className="btn sm primary" disabled={busy} onClick={() => act(() => approveTimesheetWeekAction(p.id, data.week), say('Feuille validée', 'Timesheet approved'))}>{say('Valider', 'Approve')}</button>}
                      {(st === 'submitted' || st === 'approved') && <button className="btn sm" disabled={busy} onClick={() => setReturning({ id: p.id, reason: '' })}>{say('Retourner', 'Return')}</button>}
                      {(st === 'draft' || st === 'returned') && p.id !== data.me && <button className="btn sm ghost" disabled={busy} onClick={() => act(() => remindTimesheetWeekAction(p.id, data.week), say('Rappel envoyé', 'Reminder sent'))}>{say('Relancer', 'Remind')}</button>}
                    </div>
                  </td>
                </tr>
                {open === p.id && (
                  <tr>
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
    </>
  );
}
