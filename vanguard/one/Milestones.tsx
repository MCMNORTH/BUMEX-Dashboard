import { useEffect, useMemo, useState } from 'react';
import type { Id } from '@bumex/domain';
import { changeMilestoneAction, saveMilestoneAction } from '@/app/(app)/roadmap/actions';
import { roadmapAction, type RoadmapData, type RoadmapLane } from '@/lib/erp/vanguard/calendar-actions';
import type { MilestoneStatus } from '@/types/milestone';
import { useStore } from '../store';
import { Field, Icon } from '../ui/common';
import { dueIn } from './Missions';
import { useSay } from './say';
import { Avatar, Dialog, Lozenge, type Tone } from './work-ui';
import { Select } from '../ui/Select';

// The Missions room's "Jalons" tab: BUMEX One's Roadmap page (redrawn on 2026-10-28: the missions' names were cut).
// Each mission as a lane over 3, 6 or 12 months, its full name beside it, with its milestones; then the milestones
// themselves by mission, the next ones first (added, edited, completed, deleted by the people who lead the mission;
// BUMEX One's milestone actions check it).

export const MILESTONE_STATUS: Record<MilestoneStatus, [string, string, Tone]> = {
  planned: ['Prévu', 'Planned', 'todo'],
  in_progress: ['En cours', 'In progress', 'in_progress'],
  completed: ['Atteint', 'Completed', 'done'],
  delayed: ['En retard', 'Delayed', 'blocked'],
  cancelled: ['Annulé', 'Cancelled', 'archived'],
};
const SPANS = [3, 6, 12];
const shiftMonth = (first: string, by: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
};
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const settled = (s: MilestoneStatus) => s === 'completed' || s === 'cancelled';
type Draft = { id: string; projectId: string; title: string; description: string; status: MilestoneStatus; dueDate: string; ownerId: string };

export function MilestonesView({ entityId }: { entityId: Id }) {
  const { state, ui, toast, openRoom } = useStore();
  const say = useSay();
  const today = state.today;
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<RoadmapData | null>(null);
  const [months, setMonths] = useState(6);
  const [from, setFrom] = useState(() => shiftMonth(`${state.today.slice(0, 7)}-01`, -1));
  const [scope, setScope] = useState<'floor' | 'all'>('floor');
  const [show, setShow] = useState<'next' | 'all'>('next');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    roadmapAction().then((d) => live && setData(d)).catch(() => live && setData({ lanes: [], owners: [], canManage: false, me: '', role: '' }));
    return () => { live = false; };
  }, [loadedAt]);

  const floorProjects = useMemo(() => new Set(state.engagements.filter((e) => e.entityId === entityId).map((e) => (e as { projectId?: string }).projectId).filter(Boolean) as string[]), [state.engagements, entityId]);
  if (!data) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;

  const to = shiftMonth(from, months);
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  const at = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / span) * 100));
  const locale = ui.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const monthName = (iso: string, style: 'short' | 'long' = 'short', year = false) => new Intl.DateTimeFormat(locale, { month: style, ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const monthStarts = Array.from({ length: months }, (_, i) => shiftMonth(from, i));
  const lanes = data.lanes
    .filter((l) => scope === 'all' || floorProjects.has(l.id))
    .filter((l) => l.status !== 'cancelled')
    .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || (a.end ?? '9999').localeCompare(b.end ?? '9999'));
  const refresh = async () => setData(await roadmapAction());
  const run = async (work: () => Promise<{ error?: string }>, done: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (result.error) { toast('error', result.error); return false; }
      toast('ok', done);
      await refresh();
      return true;
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft) return;
    const form = new FormData();
    for (const [k, v] of Object.entries({ milestone_id: draft.id, project_id: draft.projectId, title: draft.title, description: draft.description, status: draft.status, due_date: draft.dueDate, owner_id: draft.ownerId })) form.set(k, v);
    if (await run(() => saveMilestoneAction(form), draft.id ? say('Jalon mis à jour', 'Milestone updated') : say('Jalon ajouté', 'Milestone added'))) setDraft(null);
  };
  const blank = (projectId = lanes[0]?.id ?? ''): Draft => ({ id: '', projectId, title: '', description: '', status: 'planned', dueDate: today, ownerId: data.me });
  const edit = (l: RoadmapLane, m: RoadmapLane['milestones'][number]) => data.canManage && setDraft({ id: m.id, projectId: l.id, title: m.title, description: m.description ?? '', status: m.status, dueDate: m.dueDate, ownerId: m.ownerId ?? '' });
  const groups = lanes
    .map((l) => ({ l, items: l.milestones.filter((m) => show === 'all' || !settled(m.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }))
    .filter((g) => g.items.length);
  const pending = lanes.reduce((s, l) => s + l.milestones.filter((m) => !settled(m.status)).length, 0);
  const behind = lanes.reduce((s, l) => s + l.milestones.filter((m) => !settled(m.status) && m.dueDate < today).length, 0);

  return (
    <div className="rm">
      <div className="ms-toolbar">
        <div className="rm-nav">
          <button className="btn sm" onClick={() => setFrom(shiftMonth(from, -Math.max(1, months / 3)))} aria-label={say('Plus tôt', 'Earlier')}>‹</button>
          <b className="rm-range">{monthName(from, 'short', true)} – {monthName(shiftMonth(to, -1), 'short', true)}</b>
          <button className="btn sm" onClick={() => setFrom(shiftMonth(from, Math.max(1, months / 3)))} aria-label={say('Plus tard', 'Later')}>›</button>
          <button className="btn sm" onClick={() => setFrom(shiftMonth(`${today.slice(0, 7)}-01`, -1))}>{say("Aujourd'hui", 'Today')}</button>
        </div>
        <div className="seg-mini" aria-label={say('Période', 'Period')}>
          {SPANS.map((n) => <button key={n} className={months === n ? 'on' : ''} onClick={() => setMonths(n)}>{n} {say('mois', 'months')}</button>)}
        </div>
        <div className="ms-toolbar-r">
          <Select className="in ms-filter" value={scope} onChange={(e) => setScope(e.target.value as 'floor' | 'all')} aria-label={say('Périmètre', 'Scope')}>
            <option value="floor">{say('Cet étage', 'This floor')}</option>
            <option value="all">{say('Tout le groupe', 'The whole group')}</option>
          </Select>
          {data.canManage && lanes.length > 0 && <button className="btn sm primary" onClick={() => setDraft(blank())}><Icon name="plus" size={13} /> {say('Nouveau jalon', 'New milestone')}</button>}
        </div>
      </div>

      <div className="card flush rm-chart">
        <div className="rm-inner" style={{ ['--rm-months' as string]: months }}>
          <div className="rm-row rm-head">
            <div className="rm-label muted">{say('Mission', 'Mission')} · {lanes.length}</div>
            <div className="rm-track">
              {monthStarts.map((m) => <span key={m} className="rm-month" style={{ left: `${at(m)}%` }}>{monthName(m, months > 6 ? 'short' : 'long')}{m.slice(5, 7) === '01' || m === from ? ` ${m.slice(0, 4)}` : ''}</span>)}
              {today >= from && today < to && <span className="rm-today-label" style={{ left: `${at(today)}%` }}>{say("aujourd'hui", 'today')}</span>}
            </div>
          </div>
          {lanes.map((l) => <Lane key={l.id} lane={l} at={at} from={from} to={to} today={today} monthStarts={monthStarts} onOpen={() => openRoom('missions', `mission:${l.id}`)} onEdit={(m) => edit(l, m)} />)}
          {!lanes.length && <div className="ms-empty"><b>{say('Aucune mission sur cet étage.', 'No mission on this floor.')}</b></div>}
        </div>
        <div className="rm-legend small muted">
          {(['planned', 'in_progress', 'completed', 'delayed'] as MilestoneStatus[]).map((s) => <span key={s}><i className={`rm-dia ${s}`} />{say(MILESTONE_STATUS[s][0], MILESTONE_STATUS[s][1])}</span>)}
          <span><i className="rm-legend-bar" />{say('Durée de la mission', 'Mission span')}</span>
        </div>
      </div>

      <div className="ms-toolbar">
        <h2 className="rm-h">{say('Jalons', 'Milestones')}</h2>
        <span className="small muted">{pending} {say('à venir', 'ahead')}{behind ? <> · <b className="ms-late">{behind} {say('en retard', 'late')}</b></> : null}</span>
        <div className="ms-toolbar-r">
          <div className="seg-mini">
            <button className={show === 'next' ? 'on' : ''} onClick={() => setShow('next')}>{say('À venir', 'Upcoming')}</button>
            <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>{say('Tous', 'All')}</button>
          </div>
        </div>
      </div>
      {groups.map(({ l, items }) => {
        const doneCount = l.milestones.filter((m) => m.status === 'completed').length;
        return (
          <section key={l.id} className="rm-group">
            <div className="rm-group-h">
              <button className="linkish" onClick={() => openRoom('missions', `mission:${l.id}`)}><b>{l.name}</b></button>
              <span className="small muted">{l.clientName ?? say('Interne', 'Internal')} · {doneCount}/{l.milestones.length} {say('atteints', 'reached')}</span>
              {data.canManage && <button className="btn sm ghost rm-group-add" onClick={() => setDraft(blank(l.id))}><Icon name="plus" size={13} /> {say('Jalon', 'Milestone')}</button>}
            </div>
            {items.map((m) => {
              const s = MILESTONE_STATUS[m.status];
              const due = settled(m.status) ? null : dueIn(m.dueDate, today, say);
              return (
                <div key={m.id} className={`rm-item ${m.status}`}>
                  <button className={`rm-check ${m.status === 'completed' ? 'on' : ''}`} disabled={!data.canManage || busy || settled(m.status)} title={m.status === 'completed' ? say('Atteint', 'Reached') : say('Marquer comme atteint', 'Mark as reached')}
                    onClick={() => run(() => changeMilestoneAction(m.id, l.id, 'complete'), say('Jalon atteint', 'Milestone reached'))} aria-label={say('Marquer comme atteint', 'Mark as reached')}>
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>
                  </button>
                  <div className="grow rm-item-t">
                    <b>{m.title}</b>
                    {m.description && <div className="small muted">{m.description}</div>}
                  </div>
                  <span className="rm-item-due"><span className="mono">{dmy(m.dueDate)}</span>{due && <span className={`small ${due.late ? 'ms-late' : due.soon ? 'ms-soon' : 'muted'}`}>{due.text}</span>}</span>
                  <span className="rm-item-owner small">{m.ownerName ? <><Avatar name={m.ownerName} size={20} /> {m.ownerName}</> : <span className="muted">—</span>}</span>
                  <Lozenge tone={s[2]}>{say(s[0], s[1])}</Lozenge>
                  {data.canManage && (
                    <span className="rm-item-acts">
                      <button className="btn sm ghost" onClick={() => edit(l, m)}>{say('Modifier', 'Edit')}</button>
                      <button className="btn sm ghost" disabled={busy} aria-label={say('Supprimer', 'Delete')} title={say('Supprimer', 'Delete')}
                        onClick={() => { if (window.confirm(say(`Supprimer le jalon « ${m.title} » ?`, `Delete the milestone "${m.title}"?`))) void run(() => changeMilestoneAction(m.id, l.id, 'delete'), say('Jalon supprimé', 'Milestone deleted')); }}><Icon name="close" size={13} /></button>
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
      {!groups.length && <div className="ms-empty"><b>{show === 'next' ? say('Aucun jalon à venir.', 'No upcoming milestone.') : say('Aucun jalon.', 'No milestone.')}</b>{data.canManage && lanes.length > 0 && <button className="btn sm primary" onClick={() => setDraft(blank())}><Icon name="plus" size={13} /> {say('Nouveau jalon', 'New milestone')}</button>}</div>}

      {draft && (
        <Dialog title={draft.id ? say('Modifier le jalon', 'Edit the milestone') : say('Nouveau jalon', 'New milestone')} onClose={() => setDraft(null)} wide>
          <div className="ms-form">
            <Field label={say('Mission', 'Mission')}><Select className="in" value={draft.projectId} disabled={Boolean(draft.id)} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>{data.lanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
            <Field label={say('Titre', 'Title')}><input className="in" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={say('Remise du rapport', 'Report delivered')} /></Field>
            <div className="ms-form-grid">
              <Field label={say('Échéance', 'Due')}><input className="in mono" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field>
              <Field label={say('Statut', 'Status')}><Select className="in" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as MilestoneStatus })}>{(Object.keys(MILESTONE_STATUS) as MilestoneStatus[]).map((s) => <option key={s} value={s}>{say(MILESTONE_STATUS[s][0], MILESTONE_STATUS[s][1])}</option>)}</Select></Field>
              <Field label={say('Responsable', 'Owner')}><Select recent="people" className="in" value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}><option value="">—</option>{data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            </div>
            <Field label="Description"><textarea className="in" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          </div>
          <div className="actions"><button className="btn" onClick={() => setDraft(null)}>{say('Annuler', 'Cancel')}</button><button className="btn primary" disabled={busy || !draft.projectId || !draft.title.trim() || !draft.dueDate} onClick={save}>{say('Enregistrer', 'Save')}</button></div>
        </Dialog>
      )}
    </div>
  );
}

function Lane({ lane, at, from, to, today, monthStarts, onOpen, onEdit }: {
  lane: RoadmapLane; at: (iso: string) => number; from: string; to: string; today: string; monthStarts: string[];
  onOpen: () => void; onEdit: (m: RoadmapLane['milestones'][number]) => void;
}) {
  const say = useSay();
  const start = lane.start && lane.start > from ? at(lane.start) : 0;
  const end = lane.end && lane.end < to ? at(lane.end) : 100;
  const visible = (!lane.start || lane.start < to) && (!lane.end || lane.end >= from);
  const late = lane.status !== 'completed' && lane.end && lane.end < today;
  const tone = lane.status === 'completed' ? 'done' : late || lane.health === 'delayed' || lane.health === 'at_risk' ? 'risk' : lane.health === 'warning' ? 'warn' : 'ok';
  return (
    <div className={`rm-row ${visible ? '' : 'out'}`}>
      <button className="rm-label" onClick={onOpen} title={lane.name}>
        <span className="rm-name">{lane.name}</span>
        <span className="small muted">{lane.clientName ?? say('Interne', 'Internal')}{lane.end ? ` · ${say('éch.', 'due')} ${dmy(lane.end)}` : ''}</span>
      </button>
      <div className="rm-track">
        {monthStarts.map((m) => <span key={m} className="rm-grid" style={{ left: `${at(m)}%` }} />)}
        {visible && <span className={`rm-bar ${tone}`} style={{ left: `${start}%`, width: `${Math.max(0.8, end - start)}%` }} title={`${lane.name} · ${lane.start ? dmy(lane.start) : '…'} → ${lane.end ? dmy(lane.end) : '…'}`} />}
        {today >= from && today < to && <span className="rm-today" style={{ left: `${at(today)}%` }} />}
        {lane.milestones.filter((m) => m.dueDate >= from && m.dueDate < to).map((m) => (
          <button key={m.id} className={`rm-dia ${m.status} ${!settled(m.status) && m.dueDate < today ? 'overdue' : ''}`} style={{ left: `${at(m.dueDate)}%` }}
            title={`${m.title} · ${dmy(m.dueDate)} · ${say(MILESTONE_STATUS[m.status][0], MILESTONE_STATUS[m.status][1])}`} aria-label={`${m.title} · ${dmy(m.dueDate)}`} onClick={() => onEdit(m)} />
        ))}
      </div>
    </div>
  );
}
