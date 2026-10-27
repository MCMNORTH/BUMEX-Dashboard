import { useEffect, useState } from 'react';
import { fmt, type Engagement, type Id } from '@bumex/domain';
import { missionDetailsAction, missionOptionsAction, saveMissionAction, type MissionInput, type MissionOptions } from '@/lib/erp/vanguard/mission-actions';
import type { VanguardData } from '@/lib/erp/vanguard/run';
import { useStore } from '../store';
import { Chip, D, Field, Icon } from '../ui/common';
import { useSay } from './say';
import { Select } from '../ui/Select';

// BUMEX One's projects are Vanguard's missions: created and edited here, in the Missions room (ui/panels/Other.tsx).
// Their page is vanguard/one/Mission.tsx (BUMEX One's project page); their board, the Tasks room's "Tableau" tab
// (vanguard/one/Board.tsx).

type Mission = Engagement & { projectId?: string };

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
const STAGES: [string, string][] = [['Planification', 'Planning'], ['Terrain', 'Fieldwork'], ['Revue associé', 'Partner review'], ['Rapport', 'Report'], ['Facturation', 'Invoicing']];

// partners, the finance lead and the administrator create missions; managers too, for missions they lead
export function canEditMissions(role: string) {
  return ['admin', 'partner', 'raf', 'manager'].includes(role);
}

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

  if (!options || !v) return <div className="card"><span className="muted">{say('Chargement…', 'Loading…')}</span></div>;
  const internal = v.project_kind === 'internal_product' || v.project_kind === 'internal_tool';
  const toggleMember = (id: string) => set({ member_ids: v.member_ids.includes(id) ? v.member_ids.filter((m) => m !== id) : [...v.member_ids, id] });
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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>{projectId ? `${say('Modifier', 'Edit')} · ${v.name}` : say('Nouvelle mission', 'New mission')}</h2>
      <div className="grid3">
        <Field label={say('Nom', 'Name')}><input className="in" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Audit légal 2026" /></Field>
        <Field label="Type"><Select className="in" value={v.project_kind} onChange={(e) => set({ project_kind: e.target.value as MissionInput['project_kind'] })}>{KINDS.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label="Client"><Select recent="clients" className="in" value={internal ? '' : v.client_id} disabled={internal} onChange={(e) => set({ client_id: e.target.value })}><option value="">{internal ? say('Sans client (interne)', 'No client (internal)') : say('— choisir —', '— choose —')}</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={say('Responsable', 'Lead')}><Select recent="people" className="in" value={v.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={say('Statut', 'Status')}><Select className="in" value={v.status} onChange={(e) => set({ status: e.target.value as MissionInput['status'] })}>{STATUSES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label={say('Priorité', 'Priority')}><Select className="in" value={v.priority} onChange={(e) => set({ priority: e.target.value as MissionInput['priority'] })}>{PRIORITIES.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label={say('Début', 'Start')}><input className="in mono" type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
        <Field label={say('Échéance', 'Deadline')}><input className="in mono" type="date" value={v.end_date} onChange={(e) => set({ end_date: e.target.value })} /></Field>
        <Field label={say('Avancement manuel (%)', 'Manual progress (%)')}><input className="in num" value={v.manual_progress} onChange={(e) => set({ manual_progress: e.target.value })} placeholder={say("d'après les tâches", 'from the tasks')} /></Field>
        <Field label={say('Honoraires', 'Fee')}><input className="in num" value={v.budget_amount} onChange={(e) => set({ budget_amount: e.target.value })} placeholder="0" /></Field>
        <Field label={say('Facturation', 'Billing')}><Select className="in" value={v.fee_type} onChange={(e) => set({ fee_type: e.target.value as MissionInput['fee_type'] })}><option value="fixed">{say('Forfait', 'Fixed fee')}</option><option value="time">{say('Temps passé', 'Time spent')}</option></Select></Field>
        <Field label={say("Budget d'heures", 'Hours budget')}><input className="in num" value={v.budget_hours} onChange={(e) => set({ budget_hours: e.target.value })} placeholder="0" /></Field>
      </div>
      <Field label="Description"><textarea className="in" style={{ height: 64, padding: 8 }} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label={`${say('Équipe', 'Team')} · ${v.member_ids.length}`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflow: 'auto' }}>
          {options.people.map((p) => (
            <button key={p.id} type="button" className={`btn sm ${v.member_ids.includes(p.id) ? 'primary' : ''}`} onClick={() => toggleMember(p.id)}>{p.name}</button>
          ))}
        </div>
      </Field>
      <div className="actions">
        <button className="btn" onClick={() => onClose()} disabled={busy}>{say('Annuler', 'Cancel')}</button>
        <button className="btn primary" onClick={save} disabled={busy || !v.name.trim()}>{busy ? say('Enregistrement…', 'Saving…') : projectId ? say('Enregistrer', 'Save') : say('Créer la mission', 'Create the mission')}</button>
      </div>
    </div>
  );
}

// The mission chosen on the board: what BUMEX One knows of it and what the ERP does.
export function MissionCard({ mission, onEdit, onClose }: { mission: Mission; onEdit: () => void; onClose: () => void }) {
  const { state } = useStore();
  const say = useSay();
  const customer = state.customers.find((c) => c.id === mission.customerId);
  const invoices = state.salesInvoices.filter((i) => i.engagementId === mission.id && i.status !== 'draft');
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{mission.name}</h2>
        <Chip kind="dim">{mission.code}</Chip>
        <span className="small muted">{customer?.name ?? mission.kind}</span>
        <div className="actions" style={{ marginLeft: 'auto' }}>
          {mission.projectId && <button className="btn sm" onClick={() => useStore.getState().openRoom('tasks', `board:${mission.id}`)}><Icon name="tasks" size={13} /> {say('Tableau', 'Board')}</button>}
          {mission.projectId && <button className="btn sm" onClick={() => useStore.getState().openRoom('missions', `mission:${mission.projectId}`)}>{say('Ouvrir la mission', 'Open the mission')}</button>}
          {mission.projectId && canEditMissions(state.session.role) && <button className="btn sm" onClick={onEdit}>{say('Modifier', 'Edit')}</button>}
          <button className="btn sm" onClick={onClose} aria-label={say('Fermer', 'Close')}>×</button>
        </div>
      </div>
      <div className="grid4 small">
        <div><div className="muted">{say('Étape', 'Stage')}</div>{say(...(STAGES[mission.stage - 1] ?? STAGES[0]))}</div>
        <div><div className="muted">{say('Échéance', 'Deadline')}</div><D iso={mission.deadline} /></div>
        <div><div className="muted">{say('Heures', 'Hours')}</div>{mission.actualHours} h{mission.budgetHours ? ` / ${mission.budgetHours} h` : ''}</div>
        <div><div className="muted">{say('Honoraires · facturé', 'Fee · invoiced')}</div>{fmt(mission.fixedFee ?? 0, 0)} · {fmt(mission.invoicedToDate, 0)} {mission.currency}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {mission.staff.map((s) => <Chip key={s} kind="dim">{s}</Chip>)}
        {invoices.length > 0 && <Chip kind="good">{invoices.length} {say('facture', 'invoice')}{invoices.length > 1 ? 's' : ''}</Chip>}
      </div>
    </div>
  );
}
