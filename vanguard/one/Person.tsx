import { useCallback, useEffect, useState } from 'react';
import { editTeamMemberAction } from '@/app/(app)/team/actions';
import { personViewAction, type PersonView } from '@/lib/erp/vanguard/people-actions';
import type { AvailabilityStatus } from '@/types/auth';
import { useStore } from '../store';
import { Chip, Field, Icon } from '../ui/common';
import { when } from './Conversation';
import { reload } from './Tasks';
import { useSay } from './say';
import { LoadBar, Lozenge, PriorityIcon, TypeIcon, hoursText } from './work-ui';
import { StageLozenge } from './stages';
import { remainingHours } from '@/lib/work/load';
import type { MyWorkTicket } from '@/lib/erp/vanguard/work-items';
import type { Say } from './ticket-history';
import { Select } from '../ui/Select';

// A person's page (the HR room's People tab, and the floor's overview: Overview.tsx), as BUMEX One's team member page had
// it: profile and availability, load, missions, tickets, activity and, for the administrator, managers and the person,
// their delivery figures. [bumex-one] Since 2026-10-28: their week (hours by day, its timesheet's state, where the time
// went: shown to whoever may read it), what they are on now with its stage, and what comes next (their backlog). The form is
// BUMEX One's (a manager does not change someone else's name, photo or phone; the role is Vanguard's).

// BUMEX One's admins (Vanguard's admin, partners and finance lead) change someone else's name and phone
const SENSITIVE_EDITORS = ['admin', 'partner', 'raf'];

const WEEK_STATUS: Record<string, [string, string, 'todo' | 'review' | 'done' | 'blocked']> = {
  draft: ['Brouillon', 'Draft', 'todo'], submitted: ['Envoyée', 'Submitted', 'review'], approved: ['Validée', 'Approved', 'done'], returned: ['À corriger', 'Needs changes', 'blocked'],
};
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

function WorkRow({ t, say, onOpen }: { t: MyWorkTicket; say: Say; onOpen: () => void }) {
  return (
    <div className="mw-ticket">
      <span className="wk-keycell"><TypeIcon type={t.type} say={say} /> <button className="linkish mono" onClick={onOpen}>{t.key ?? '—'}</button></span>
      <button className="linkish mw-title" onClick={onOpen}>{t.title}<span className="small muted"> · {t.projectName ?? '—'}</span></button>
      <StageLozenge name={t.stageName} status={t.status} />
      <PriorityIcon priority={t.priority} say={say} />
      <span className="mw-hours" title={say('Restant / estimation', 'Left / estimate')}>{t.estimatedHours ? `${hoursText(remainingHours({ estimated_hours: t.estimatedHours, logged_minutes: t.loggedMinutes }), say)} / ${hoursText(t.estimatedHours, say)}` : <span className="muted">{say('à estimer', 'to estimate')}</span>}</span>
      <span className={`mw-due ${t.dueState === 'overdue' ? 'late' : ''}`}>{t.dueDate ? t.dueDate.split('-').reverse().join('/') : '—'}</span>
    </div>
  );
}

const AVAILABILITY: Record<AvailabilityStatus, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  available: ['Disponible', 'Available', 'good'],
  busy: ['Occupé', 'Busy', 'dim'],
  overloaded: ['Surchargé', 'Overloaded', 'crit'],
  away: ['Absent', 'Away', 'warn'],
  inactive: ['Inactif', 'Inactive', 'dim'],
};

export function PersonPanel({ personId, onClose }: { personId: string; onClose: () => void }) {
  const { state, toast, openRoom } = useStore();
  const say = useSay();
  const [view, setView] = useState<PersonView | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', job_title: '', department: '', phone: '', skills: '', availability_status: 'available' as AvailabilityStatus, weekly_capacity_hours: '40' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setView(await personViewAction(personId).catch(() => null)), [personId]);
  useEffect(() => {
    let live = true;
    personViewAction(personId).catch(() => null).then((v) => { if (live) setView(v); });
    return () => { live = false; };
  }, [personId]);

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement…', 'Loading…')}</span></div>;
  if (view === null) return <div className="card"><div className="banner warn">{say("Cette personne n'est pas visible pour vous.", 'This person is not visible to you.')}</div><div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour', 'Back')}</button></div></div>;
  const { member: m, performance: perf } = view;
  const availability = AVAILABILITY[m.availability] ?? AVAILABILITY.available;
  const floor = state.entities.find((e) => e.code === m.floor);
  const startEdit = () => {
    setForm({ full_name: m.name, job_title: m.jobTitle ?? '', department: m.department ?? '', phone: m.phone ?? '', skills: m.skills.join(', '), availability_status: m.availability, weekly_capacity_hours: String(m.capacity) });
    setEditing(true);
  };
  const save = async () => {
    const data = new FormData();
    for (const [k, v] of Object.entries({ ...form, member_id: m.id, role: m.role, avatar_url: m.avatarUrl ?? '' })) data.set(k, v);
    setBusy(true);
    try {
      const result = await editTeamMemberAction(data);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', say('Profil mis à jour', 'Profile updated'));
      setEditing(false);
      await Promise.all([load(), reload()]);
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
    } finally {
      setBusy(false);
    }
  };
  const most = Math.max(1, ...(perf?.contributionByProject.map((c) => c.completed) ?? [1]));
  const openTicket = (id: string) => openRoom('tasks', `ticket:${id}`);
  const dayName = (d: string) => new Intl.DateTimeFormat(say('fr-FR', 'en-GB'), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const week = view.week;

  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn sm ghost" onClick={onClose} aria-label={say('Retour', 'Back')}><Icon name="back" size={14} /></button>
        {m.avatarUrl ? <span role="img" aria-label={m.name} style={{ width: 44, height: 44, borderRadius: '50%', background: `center / cover url("${m.avatarUrl}")` }} /> : null}
        <div><h2 style={{ margin: 0 }}>{m.name}</h2><div className="small muted">{m.jobTitle ?? '—'}{m.department ? ` · ${m.department}` : ''} · {floor?.name ?? m.floor ?? '—'}</div></div>
        <Chip kind={availability[2]}>{say(availability[0], availability[1])}</Chip>
        <div className="actions" style={{ marginLeft: 'auto' }}>{view.canEdit && <button className="btn sm" onClick={() => (editing ? setEditing(false) : startEdit())}>{editing ? say('Fermer le formulaire', 'Close the form') : say('Modifier', 'Edit')}</button>}</div>
      </div>

      {editing && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="grid3">
            <Field label={say('Nom complet', 'Full name')}><input className="in" value={form.full_name} disabled={!view.isSelf && !SENSITIVE_EDITORS.includes(state.session.role)} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label={say('Fonction', 'Job title')}><input className="in" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></Field>
            <Field label={say('Service', 'Department')}><input className="in" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label={say('Disponibilité', 'Availability')}><Select className="in" value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value as AvailabilityStatus })}>{(Object.keys(AVAILABILITY) as AvailabilityStatus[]).map((k) => <option key={k} value={k}>{say(AVAILABILITY[k][0], AVAILABILITY[k][1])}</option>)}</Select></Field>
            <Field label={say('Capacité hebdomadaire (h)', 'Weekly capacity (h)')}><input className="in num" type="number" min={0} max={80} value={form.weekly_capacity_hours} onChange={(e) => setForm({ ...form, weekly_capacity_hours: e.target.value })} /></Field>
            <Field label={say('Téléphone', 'Phone')}><input className="in" value={form.phone} disabled={!view.isSelf && !SENSITIVE_EDITORS.includes(state.session.role)} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label={say('Compétences (séparées par des virgules)', 'Skills (comma-separated)')}><input className="in" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
          <div className="actions"><button className="btn sm" onClick={() => setEditing(false)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy || form.full_name.trim().length < 3} onClick={save}>{say('Enregistrer', 'Save')}</button></div>
        </div>
      )}

      <div className="pv-top">
        <section className="card pv-week">
          <div className="mw-block-h"><h2>{say('Cette semaine', 'This week')}</h2><span className="grow" />{week?.status && <Lozenge tone={WEEK_STATUS[week.status]?.[2] ?? 'todo'}>{say(...(WEEK_STATUS[week.status] ?? [week.status, week.status, 'todo']).slice(0, 2) as [string, string])}</Lozenge>}</div>
          {week ? (
            <>
              <div className="pv-week-total"><b>{hm(week.minutes)}</b> <span className="muted">/ {m.capacity} h</span></div>
              <div className="pv-days">
                {week.days.map((d, i) => (
                  <div key={d} className={d === state.today ? 'today' : ''} title={hm(week.byDay[i])}>
                    <div className="pv-bar"><i style={{ height: `${week.byDay[i] ? Math.max(12, Math.min(100, Math.round((week.byDay[i] / 480) * 100))) : 4}%` }} /></div>
                    <span>{dayName(d)}</span>
                    <b>{week.byDay[i] ? hoursText(week.byDay[i] / 60, say) : '—'}</b>
                  </div>
                ))}
              </div>
              {week.missions.length > 0 && <div className="pv-where">{week.missions.slice(0, 6).map((w) => <div key={`${w.project}${w.mission}`} className="small"><span>{w.mission}<span className="muted"> · {w.project ?? '—'}</span></span><b>{hm(w.minutes)}</b></div>)}</div>}
            </>
          ) : <p className="small muted">{say('Réservé : seuls la personne, les managers de son entité et les administrateurs voient ses heures.', "Restricted: only the person, their entity's managers and the administrators see their hours.")}</p>}
        </section>
        <section className="card pv-now">
          <div className="mw-block-h"><h2>{say('En cours', 'In progress')}</h2><span className={`tk-count ${view.current.some((t) => t.status === 'blocked' || t.dueState === 'overdue') ? 'crit' : ''}`}>{view.current.length}</span></div>
          <div className="mw-rows">
            {view.current.map((t) => <WorkRow key={t.id} t={t} say={say} onOpen={() => openTicket(t.id)} />)}
            {!view.current.length && <div className="small muted mw-empty">{say('Rien en cours.', 'Nothing in progress.')}</div>}
          </div>
          <div className="mw-block-h" style={{ marginTop: 12 }}><h2>{say('À venir', 'Up next')}</h2><span className="tk-count">{view.next.length}</span></div>
          <div className="mw-rows">
            {view.next.map((t) => <WorkRow key={t.id} t={t} say={say} onOpen={() => openTicket(t.id)} />)}
            {!view.next.length && <div className="small muted mw-empty">{say('Aucun ticket en attente.', 'No ticket waiting.')}</div>}
          </div>
        </section>
      </div>

      <div className="grid4">
        <div className="kpi"><div className="l">{say('Charge', 'Load')}</div>{view.load ? <LoadBar load={view.load} say={say} /> : <div className="v">{Math.round(view.figures.utilization)} %</div>}<div className="small muted">{m.capacity} h / {say('semaine', 'week')} · {say('pondérée par priorité', 'weighted by priority')}</div></div>
        <div className="kpi"><div className="l">{say('Tickets terminés', 'Tickets done')}</div><div className="v">{view.figures.completed}</div></div>
        <div className="kpi"><div className="l">{say('En retard', 'Overdue')}</div><div className="v" style={{ color: view.figures.overdue ? 'var(--crit)' : undefined }}>{view.figures.overdue}</div></div>
        <div className="kpi"><div className="l">{say('Mis à jour récemment', 'Recently updated')}</div><div className="v">{view.figures.recentlyUpdated}</div></div>
      </div>

      {perf && (
        <div className="cols">
          <div className="grow">
            <div className="card">
              <h2>{say('Livraison', 'Delivery')}</h2>
              <div className="kv">
                <span className="k">{say('Terminés cette semaine · ce mois', 'Done this week · this month')}</span><span>{perf.completedThisWeek} · {perf.completedThisMonth}</span>
                <span className="k">{say('À temps', 'On time')}</span><span>{Math.round(perf.onTimeCompletionRate)} %</span>
                <span className="k">{say('Délai moyen', 'Average time')}</span><span>{perf.averageCompletionDays.toFixed(1)} {say('j', 'd')}</span>
                <span className="k">{say('Bloqués', 'Blocked')}</span><span>{perf.blockedTickets}</span>
              </div>
              {perf.contributionByProject.length > 0 && <div style={{ marginTop: 10 }}>{perf.contributionByProject.map((c) => <div key={c.projectId} className="small" style={{ margin: '4px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c.projectName}</span><span>{c.completed}</span></div><div className="bar"><i style={{ width: `${(c.completed / most) * 100}%` }} /></div></div>)}</div>}
            </div>
          </div>
          <div className="side">
            <div className="card"><h2>{say('Livré récemment', 'Recently delivered')}</h2>{perf.recentDeliveredWork.slice(0, 6).map((w) => <div key={w.id} className="small" style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}>{w.title}<span className="muted"> · {w.completedAt.slice(0, 10)}{w.completedOnTime ? '' : ` · ${say('en retard', 'late')}`}</span></div>)}{!perf.recentDeliveredWork.length && <span className="small muted">—</span>}</div>
          </div>
        </div>
      )}

      <div>
        <div className="card flush"><table>
          <thead><tr><th>{say('Missions', 'Missions')}</th><th>{say('Rôle', 'Role')}</th><th>{say('Statut', 'Status')}</th></tr></thead>
          <tbody>
            {view.projects.map((p) => <tr key={p.id} className="click" onClick={() => openRoom('missions', `mission:${p.id}`)}><td><b>{p.name}</b>{p.clientName ? <div className="small muted">{p.clientName}</div> : null}</td><td className="small">{p.role}</td><td className="small">{p.status}</td></tr>)}
            {!view.projects.length && <tr><td colSpan={3} className="muted" style={{ padding: 14 }}>{say('Aucune mission.', 'No mission.')}</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div className="card">
        <h2>{say('Activité', 'Activity')}</h2>
        {view.history.map((h) => <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '6px 0', fontSize: 12.5 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{h.action}</b><span className="muted mono">{when(h.at)}</span></div>{h.detail && <div className="muted">{h.detail}</div>}</div>)}
        {!view.history.length && <span className="small muted">{say('Aucune activité.', 'No activity.')}</span>}
      </div>
    </>
  );
}
