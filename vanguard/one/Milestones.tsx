import { useEffect, useMemo, useState } from 'react';
import type { Id } from '@bumex/domain';
import { changeMilestoneAction, saveMilestoneAction } from '@/app/(app)/roadmap/actions';
import { roadmapAction, type RoadmapData, type RoadmapLane } from '@/lib/erp/vanguard/calendar-actions';
import type { MilestoneStatus } from '@/types/milestone';
import { useStore } from '../store';
import { Chip, D, Field, Icon } from '../ui/common';
import { useSay } from './say';

// The Missions room's "Jalons" tab: BUMEX One's Roadmap page. Each mission as a lane over six months with its
// milestones, and the milestones themselves (added, edited, completed, deleted by the people who lead the mission;
// BUMEX One's milestone actions check it).

const STATUS: Record<MilestoneStatus, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  planned: ['Prévu', 'Planned', 'dim'],
  in_progress: ['En cours', 'In progress', 'warn'],
  completed: ['Atteint', 'Completed', 'good'],
  delayed: ['En retard', 'Delayed', 'crit'],
  cancelled: ['Annulé', 'Cancelled', 'dim'],
};
const MONTHS = 6;
const shiftMonth = (first: string, by: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
};
type Draft = { id: string; projectId: string; title: string; description: string; status: MilestoneStatus; dueDate: string; ownerId: string };

export function MilestonesView({ entityId }: { entityId: Id }) {
  const { state, ui, toast, openRoom } = useStore();
  const say = useSay();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<RoadmapData | null>(null);
  const [from, setFrom] = useState(() => `${state.today.slice(0, 7)}-01`);
  const [scope, setScope] = useState<'floor' | 'all'>('floor');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    roadmapAction().then((d) => live && setData(d)).catch(() => live && setData({ lanes: [], owners: [], canManage: false, me: '', role: '' }));
    return () => { live = false; };
  }, [loadedAt]);

  const floorProjects = useMemo(() => new Set(state.engagements.filter((e) => e.entityId === entityId).map((e) => (e as { projectId?: string }).projectId).filter(Boolean) as string[]), [state.engagements, entityId]);
  if (!data) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;

  const lanes = data.lanes.filter((l) => scope === 'all' || floorProjects.has(l.id));
  const to = shiftMonth(from, MONTHS);
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  const at = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / span) * 100));
  const locale = ui.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(from, i));
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
  const blank = (projectId = lanes[0]?.id ?? ''): Draft => ({ id: '', projectId, title: '', description: '', status: 'planned', dueDate: state.today, ownerId: data.me });

  return (
    <>
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setFrom(shiftMonth(from, -3))} aria-label={say('Plus tôt', 'Earlier')}>‹</button>
        <b style={{ minWidth: 220, textAlign: 'center' }}>{new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${from}T00:00:00Z`))} – {new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${shiftMonth(to, -1)}T00:00:00Z`))}</b>
        <button className="btn sm" onClick={() => setFrom(shiftMonth(from, 3))} aria-label={say('Plus tard', 'Later')}>›</button>
        <select className="in" style={{ width: 170, marginLeft: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value as 'floor' | 'all')} aria-label={say('Périmètre', 'Scope')}>
          <option value="floor">{say('Cet étage', 'This floor')}</option>
          <option value="all">{say('Tout le groupe', 'The whole group')}</option>
        </select>
        {data.canManage && !draft && lanes.length > 0 && <button className="btn sm primary" onClick={() => setDraft(blank())}><Icon name="plus" size={13} /> {say('Nouveau jalon', 'New milestone')}</button>}
      </div>

      {draft && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>{draft.id ? say('Modifier le jalon', 'Edit the milestone') : say('Nouveau jalon', 'New milestone')}</h2>
          <div className="grid3">
            <Field label={say('Mission', 'Mission')}><select className="in" value={draft.projectId} disabled={Boolean(draft.id)} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>{data.lanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label={say('Titre', 'Title')} style={{ gridColumn: 'span 2' }}><input className="in" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label={say('Échéance', 'Due')}><input className="in mono" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field>
            <Field label={say('Statut', 'Status')}><select className="in" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as MilestoneStatus })}>{(Object.keys(STATUS) as MilestoneStatus[]).map((s) => <option key={s} value={s}>{say(STATUS[s][0], STATUS[s][1])}</option>)}</select></Field>
            <Field label={say('Responsable', 'Owner')}><select className="in" value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}><option value="">—</option>{data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          </div>
          <Field label="Description"><textarea className="in" style={{ height: 60, padding: 8 }} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="actions"><button className="btn sm" onClick={() => setDraft(null)}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy || !draft.projectId || !draft.title.trim() || !draft.dueDate} onClick={save}>{say('Enregistrer', 'Save')}</button></div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `220px repeat(${MONTHS}, 1fr)`, fontSize: 11 }} className="muted">
          <span />
          {months.map((m) => <span key={m} style={{ borderLeft: '1px solid var(--line)', paddingLeft: 4, textTransform: 'capitalize' }}>{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}T00:00:00Z`))}</span>)}
        </div>
        {lanes.map((l) => <Lane key={l.id} lane={l} at={at} from={from} to={to} today={state.today} onOpen={() => openRoom('missions', `mission:${l.id}`)} />)}
        {!lanes.length && <span className="small muted">{say('Aucune mission sur cet étage.', 'No mission on this floor.')}</span>}
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>{say('Jalon', 'Milestone')}</th><th>{say('Mission', 'Mission')}</th><th>{say('Échéance', 'Due')}</th><th>{say('Responsable', 'Owner')}</th><th>{say('Statut', 'Status')}</th><th /></tr></thead>
          <tbody>
            {lanes.flatMap((l) => l.milestones.map((m) => ({ l, m }))).sort((a, b) => a.m.dueDate.localeCompare(b.m.dueDate)).map(({ l, m }) => (
              <tr key={m.id}>
                <td><b>{m.title}</b>{m.description ? <div className="small muted">{m.description}</div> : null}</td>
                <td className="small">{l.name}</td>
                <td><D iso={m.dueDate} /></td>
                <td className="small">{m.ownerName ?? '—'}</td>
                <td><Chip kind={STATUS[m.status][2]}>{say(STATUS[m.status][0], STATUS[m.status][1])}</Chip></td>
                <td>
                  {data.canManage && (
                    <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      {m.status !== 'completed' && m.status !== 'cancelled' && <button className="btn sm primary" disabled={busy} onClick={() => run(() => changeMilestoneAction(m.id, l.id, 'complete'), say('Jalon atteint', 'Milestone completed'))}>{say('Atteint', 'Done')}</button>}
                      <button className="btn sm" onClick={() => setDraft({ id: m.id, projectId: l.id, title: m.title, description: m.description ?? '', status: m.status, dueDate: m.dueDate, ownerId: m.ownerId ?? '' })}>{say('Modifier', 'Edit')}</button>
                      <button className="btn sm ghost" disabled={busy} onClick={() => { if (window.confirm(say(`Supprimer le jalon « ${m.title} » ?`, `Delete the milestone "${m.title}"?`))) void run(() => changeMilestoneAction(m.id, l.id, 'delete'), say('Jalon supprimé', 'Milestone deleted')); }} aria-label={say('Supprimer', 'Delete')}><Icon name="close" size={13} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!lanes.some((l) => l.milestones.length) && <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>{say('Aucun jalon.', 'No milestone.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Lane({ lane, at, from, to, today, onOpen }: { lane: RoadmapLane; at: (iso: string) => number; from: string; to: string; today: string; onOpen: () => void }) {
  const say = useSay();
  const start = lane.start && lane.start > from ? at(lane.start) : 0;
  const end = lane.end && lane.end < to ? at(lane.end) : 100;
  const visible = (!lane.start || lane.start < to) && (!lane.end || lane.end >= from);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center', gap: 0 }}>
      <div className="click small" onClick={onOpen} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}><b>{lane.name}</b><div className="muted">{lane.clientName ?? '—'} · {lane.completion} %</div></div>
      <div style={{ position: 'relative', height: 26, background: 'var(--ground)', borderRadius: 6 }}>
        {visible && <div style={{ position: 'absolute', left: `${start}%`, width: `${Math.max(1, end - start)}%`, top: 8, height: 10, borderRadius: 5, background: lane.health === 'delayed' || lane.health === 'at_risk' ? 'var(--warn-bg)' : 'var(--blue-pale)', border: '1px solid var(--border)' }} />}
        {today >= from && today < to && <div style={{ position: 'absolute', left: `${at(today)}%`, top: 0, bottom: 0, width: 2, background: 'var(--accent)', opacity: 0.4 }} title={say("Aujourd'hui", 'Today')} />}
        {lane.milestones.filter((m) => m.dueDate >= from && m.dueDate < to).map((m) => (
          <div key={m.id} title={`${m.title} · ${m.dueDate}`} style={{ position: 'absolute', left: `calc(${at(m.dueDate)}% - 6px)`, top: 6, width: 12, height: 12, transform: 'rotate(45deg)', background: m.status === 'completed' ? 'var(--good)' : m.status === 'delayed' ? 'var(--crit)' : m.status === 'cancelled' ? 'var(--muted)' : 'var(--accent)', border: '2px solid var(--paper)' }} />
        ))}
      </div>
    </div>
  );
}
