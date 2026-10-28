import { useEffect, useState } from 'react';
import type { Engagement, Id } from '@bumex/domain';
import { missionDetailsAction, missionOptionsAction, saveMissionAction, type MissionInput, type MissionOptions } from '@/lib/erp/vanguard/mission-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import { useStore } from '../store';
import { Field, Icon } from '../ui/common';
import { useSay } from './say';
import type { Say } from './ticket-history';
import { Avatar, Dialog, type Tone } from './work-ui';
import { Select } from '../ui/Select';

// BUMEX One's projects are Vanguard's missions: created and edited here, in the Missions room (ui/panels/Other.tsx).
// Their list is vanguard/one/MissionList.tsx, their page vanguard/one/Mission.tsx (BUMEX One's project page), their
// board the Tasks room's "Tableau" tab (vanguard/one/Board.tsx).

/** A mission as the state holds it (lib/erp/vanguard/tables.ts): the engine's engagement and what its list shows. */
export type Mission = Engagement & {
  projectId?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  priority?: string | null;
  projectKind?: string | null;
  progress?: number | null;
  team?: string[];
};

export const KINDS: [MissionInput['project_kind'], string, string][] = [
  ['client_mission', 'Mission client', 'Client mission'],
  ['institutional_partnership', 'Partenariat institutionnel', 'Institutional partnership'],
  ['internal_product', 'Produit interne', 'Internal product'],
  ['internal_tool', 'Outil interne', 'Internal tool'],
];
export const STATUSES: [MissionInput['status'], string, string][] = [
  ['draft', 'Planifiée', 'Planned'],
  ['active', 'En cours', 'Active'],
  ['on_hold', 'En pause', 'On hold'],
  ['completed', 'Terminée', 'Completed'],
  ['cancelled', 'Annulée', 'Cancelled'],
];
export const PRIORITIES: [MissionInput['priority'], string, string][] = [
  ['', '—', '—'],
  ['low', 'Basse', 'Low'],
  ['medium', 'Moyenne', 'Medium'],
  ['high', 'Haute', 'High'],
  ['critical', 'Critique', 'Critical'],
];

// the state's statuses (erp.engagement_status: planned, active, on_hold, completed) as the list groups them
export const MISSION_STATUS: Record<string, [string, string, Tone]> = {
  active: ['En cours', 'Active', 'in_progress'],
  planned: ['Planifiée', 'Planned', 'todo'],
  draft: ['Planifiée', 'Planned', 'todo'],
  on_hold: ['En pause', 'On hold', 'review'],
  completed: ['Terminée', 'Completed', 'done'],
  cancelled: ['Annulée', 'Cancelled', 'archived'],
};
export const missionStatus = (status: string, say: Say): [string, Tone] => {
  const s = MISSION_STATUS[status] ?? [status, status, 'plain' as Tone];
  return [say(s[0], s[1]), s[2]];
};
/** The ticket icons' scale: a critical mission is drawn as an urgent ticket. */
export const missionPriority = (p: string | null | undefined) => (p === 'critical' ? 'urgent' : p || null);
export const kindLabel = (kind: string | null | undefined, say: Say) => {
  const found = KINDS.find(([k]) => k === kind);
  return found ? say(found[1], found[2]) : kind ?? '';
};

/** Days until the deadline: "dans 12 j", "aujourd'hui", "3 j de retard". */
export function dueIn(deadline: string | null | undefined, today: string, say: Say): { text: string; late: boolean; soon: boolean } | null {
  if (!deadline) return null;
  const days = Math.round((Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: say(`${-days} j de retard`, `${-days} d late`), late: true, soon: false };
  if (days === 0) return { text: say("aujourd'hui", 'today'), late: false, soon: true };
  return { text: say(`dans ${days} j`, `in ${days} d`), late: false, soon: days <= 7 };
}

// partners, the finance lead and the administrator create missions; managers too, for missions they lead
export function canEditMissions(role: string) {
  return ['admin', 'partner', 'raf', 'manager'].includes(role);
}

/** The mission's form, over the page: a new mission (projectId null) or this one. */
export function MissionForm({ entityId, projectId, onClose }: { entityId: Id; projectId: string | null; onClose: (saved?: string) => void }) {
  const { toast, hydrate } = useStore();
  const say = useSay();
  const [options, setOptions] = useState<MissionOptions | null>(null);
  const [v, setV] = useState<Omit<MissionInput, 'entity_id'> | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<MissionInput>) => setV((x) => (x ? { ...x, ...patch } : x));

  useEffect(() => {
    let live = true;
    void Promise.all([missionOptionsAction(entityId), projectId ? missionDetailsAction(projectId) : Promise.resolve(null)]).then(([o, details]) => {
      if (!live) return;
      setOptions(o);
      setV(details ?? {
        name: '', client_id: '', description: '', owner_id: o.me, status: 'active', start_date: '', end_date: '', budget_amount: '', priority: 'medium',
        project_kind: 'client_mission', manual_progress: '', member_ids: [], fee_type: 'fixed', budget_hours: '',
      });
    });
    return () => { live = false; };
  }, [projectId, entityId]);

  const title = projectId ? `${say('Modifier', 'Edit')} · ${v?.name ?? ''}` : say('Nouvelle mission', 'New mission');
  if (!options || !v) return <Dialog title={title} onClose={() => onClose()} wide><span className="muted">{say('Chargement…', 'Loading…')}</span></Dialog>;
  const internal = v.project_kind === 'internal_product' || v.project_kind === 'internal_tool';
  const nameOf = (id: string) => options.people.find((p) => p.id === id)?.name ?? id;
  const save = async () => {
    setBusy(true);
    try {
      const result = await saveMissionAction({ ...v, entity_id: entityId, client_id: internal ? '' : v.client_id });
      if (!result.ok) { toast('error', result.error); return; }
      if (result.state) hydrate(result as VanguardData);
      toast('ok', projectId ? say('Mission mise à jour', 'Mission updated') : say('Mission créée', 'Mission created'));
      onClose(result.projectId);
    } catch {
      toast('error', say('Serveur injoignable : la mission n\'est pas enregistrée.', 'Server unreachable: the mission was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={() => onClose()} wide>
      <div className="ms-form">
        <Field label={say('Nom de la mission', 'Mission name')}><input className="in ms-form-name" autoFocus value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Audit légal 2026" /></Field>
        <div className="ms-form-grid">
          <Field label="Type"><Select className="in" value={v.project_kind} onChange={(e) => set({ project_kind: e.target.value as MissionInput['project_kind'] })}>{KINDS.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label="Client"><Select recent="clients" className="in" value={internal ? '' : v.client_id} disabled={internal} onChange={(e) => set({ client_id: e.target.value })}><option value="">{internal ? say('Sans client (interne)', 'No client (internal)') : say('— choisir —', '— choose —')}</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={say('Responsable', 'Lead')}><Select recent="people" className="in" value={v.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label={say('Statut', 'Status')}><Select className="in" value={v.status} onChange={(e) => set({ status: e.target.value as MissionInput['status'] })}>{STATUSES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label={say('Priorité', 'Priority')}><Select className="in" value={v.priority} onChange={(e) => set({ priority: e.target.value as MissionInput['priority'] })}>{PRIORITIES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
          <Field label={say('Avancement manuel (%)', 'Manual progress (%)')}><input className="in num" value={v.manual_progress} onChange={(e) => set({ manual_progress: e.target.value })} placeholder={say("d'après les tickets", 'from the tickets')} /></Field>
        </div>
        <h3 className="ms-form-h">{say('Dates et budget', 'Dates and budget')}</h3>
        <div className="ms-form-grid">
          <Field label={say('Début', 'Start')}><input className="in mono" type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
          <Field label={say('Échéance', 'Deadline')}><input className="in mono" type="date" value={v.end_date} onChange={(e) => set({ end_date: e.target.value })} /></Field>
          <Field label={say('Facturation', 'Billing')}><Select className="in" value={v.fee_type} onChange={(e) => set({ fee_type: e.target.value as MissionInput['fee_type'] })}><option value="fixed">{say('Forfait', 'Fixed fee')}</option><option value="time">{say('Temps passé', 'Time spent')}</option></Select></Field>
          <Field label={say('Honoraires', 'Fee')}><input className="in num" value={v.budget_amount} onChange={(e) => set({ budget_amount: e.target.value })} placeholder="0" /></Field>
          <Field label={say("Budget d'heures", 'Hours budget')}><input className="in num" value={v.budget_hours} onChange={(e) => set({ budget_hours: e.target.value })} placeholder="0" /></Field>
        </div>
        <Field label="Description"><textarea className="in" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder={say('Objet, périmètre, livrables…', 'Purpose, scope, deliverables…')} /></Field>
        <h3 className="ms-form-h">{say('Équipe', 'Team')} · {v.member_ids.length}</h3>
        <div className="ms-team">
          {v.member_ids.map((id) => (
            <span key={id} className="ms-member"><Avatar name={nameOf(id)} size={20} /> {nameOf(id)}
              <button type="button" onClick={() => set({ member_ids: v.member_ids.filter((m) => m !== id) })} aria-label={say(`Retirer ${nameOf(id)}`, `Remove ${nameOf(id)}`)}>×</button>
            </span>
          ))}
          <Select recent="people" className="in ms-team-add" value="" onChange={(e) => e.target.value && set({ member_ids: [...v.member_ids, e.target.value] })} aria-label={say('Ajouter quelqu’un', 'Add someone')}>
            <option value="">{say('+ Ajouter quelqu’un…', '+ Add someone…')}</option>
            {options.people.filter((p) => !v.member_ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => onClose()} disabled={busy}>{say('Annuler', 'Cancel')}</button>
        <button className="btn primary" onClick={save} disabled={busy || !v.name.trim()}>{busy ? say('Enregistrement…', 'Saving…') : projectId ? say('Enregistrer', 'Save') : <><Icon name="plus" size={13} /> {say('Créer la mission', 'Create the mission')}</>}</button>
      </div>
    </Dialog>
  );
}
