import { useCallback, useEffect, useState } from 'react';
import { saveClientAction, shelveClientAction } from '@/app/(app)/clients/actions';
import { clientViewAction, type ClientView } from '@/lib/erp/vanguard/client-actions';
import type { ClientStatus, ClientType, ProspectStage } from '@/types/client';
import { useStore } from '../store';
import { Chip, D, Field, Icon, Tabs } from '../ui/common';
import { Comments, Notes, type Result, type Say, when } from './Conversation';
import { reload } from './Tasks';
import { useSay } from './say';

// A client's page in the Clients room, as BUMEX One's client page had it: the relationship (contact details, prospect
// stage and next follow-up, account manager), its customer accounts in the entities (the accounting side), what it
// holds (missions, contracts, documents, tickets), its history, notes and conversation. Saved by BUMEX One's client
// actions, under their rules.

export const CLIENT_STATUS: Record<string, [string, string, 'good' | 'warn' | 'dim']> = {
  prospect: ['Prospect', 'Prospect', 'warn'],
  active: ['Actif', 'Active', 'good'],
  inactive: ['Inactif', 'Inactive', 'dim'],
  suspended: ['Suspendu', 'Suspended', 'dim'],
  archived: ['Archivé', 'Archived', 'dim'],
};
const TYPES: Record<ClientType, [string, string]> = { company: ['Entreprise', 'Company'], public_institution: ['Institution publique', 'Public institution'], ngo: ['ONG', 'NGO'], individual: ['Particulier', 'Individual'], other: ['Autre', 'Other'] };
const STAGES: Record<ProspectStage, [string, string]> = { initial_contact: ['Premier contact', 'Initial contact'], qualification: ['À qualifier', 'Qualification'], negotiation: ['En négociation', 'Negotiation'], proposal_sent: ['Proposition envoyée', 'Proposal sent'], pending_signature: ['À signer', 'Pending signature'] };
const HEALTH: Record<string, [string, string, 'good' | 'warn' | 'crit']> = { healthy: ['Saine', 'Healthy', 'good'], attention_needed: ['À suivre', 'Needs attention', 'warn'], at_risk: ['À risque', 'At risk', 'crit'] };

type Tab = 'overview' | 'missions' | 'contracts' | 'documents' | 'tickets' | 'notes' | 'comments' | 'history';
export type ClientFormValues = {
  name: string; legal_name: string; type: ClientType; industry: string; contact_email: string; contact_phone: string; address: string; country: string; city: string;
  website: string; tax_id: string; status: ClientStatus; prospect_stage: ProspectStage | ''; next_follow_up_at: string; account_manager_id: string; notes: string;
};
export const blankClient = (me: string): ClientFormValues => ({ name: '', legal_name: '', type: 'company', industry: '', contact_email: '', contact_phone: '', address: '', country: 'MR', city: '', website: '', tax_id: '', status: 'prospect', prospect_stage: 'initial_contact', next_follow_up_at: '', account_manager_id: me, notes: '' });

// floor: where a new client is created (the test floor's are its own, 0011)
export function ClientForm({ id, initial, managers, floor, onDone, say }: { id?: string; initial: ClientFormValues; managers: { id: string; name: string }[]; floor?: string; onDone: (saved: boolean) => void; say: Say }) {
  const { toast } = useStore();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ClientFormValues>) => setV((x) => ({ ...x, ...patch }));
  const save = async () => {
    const form = new FormData();
    for (const [k, value] of Object.entries({ ...v, ...(id ? { client_id: id } : floor ? { floor } : {}) })) form.set(k, value);
    setBusy(true);
    try {
      const result = await saveClientAction(form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', id ? say('Client mis à jour', 'Client updated') : say('Client créé', 'Client created'));
      onDone(true);
    } catch {
      toast('error', say("Serveur injoignable : le client n'est pas enregistré.", 'Server unreachable: the client was not saved.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0 }}>{id ? `${say('Modifier', 'Edit')} · ${initial.name}` : say('Nouveau client', 'New client')}</h2>
      <div className="grid3">
        <Field label={say('Nom', 'Name')}><input className="in" value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={say('Raison sociale', 'Legal name')}><input className="in" value={v.legal_name} onChange={(e) => set({ legal_name: e.target.value })} /></Field>
        <Field label="Type"><select className="in" value={v.type} onChange={(e) => set({ type: e.target.value as ClientType })}>{(Object.keys(TYPES) as ClientType[]).map((k) => <option key={k} value={k}>{say(...TYPES[k])}</option>)}</select></Field>
        <Field label={say('Statut', 'Status')}><select className="in" value={v.status} onChange={(e) => set({ status: e.target.value as ClientStatus })}>{Object.entries(CLIENT_STATUS).filter(([k]) => k !== 'archived').map(([k, [fr, en]]) => <option key={k} value={k}>{say(fr, en)}</option>)}</select></Field>
        {v.status === 'prospect' && <Field label={say('Phase commerciale', 'Sales stage')}><select className="in" value={v.prospect_stage} onChange={(e) => set({ prospect_stage: e.target.value as ProspectStage })}>{(Object.keys(STAGES) as ProspectStage[]).map((k) => <option key={k} value={k}>{say(...STAGES[k])}</option>)}</select></Field>}
        {v.status === 'prospect' && <Field label={say('Prochain suivi', 'Next follow-up')}><input className="in mono" type="date" value={v.next_follow_up_at.slice(0, 10)} onChange={(e) => set({ next_follow_up_at: e.target.value })} /></Field>}
        <Field label={say('Responsable', 'Account manager')}><select className="in" value={v.account_manager_id} onChange={(e) => set({ account_manager_id: e.target.value })}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label={say('Secteur', 'Industry')}><input className="in" value={v.industry} onChange={(e) => set({ industry: e.target.value })} /></Field>
        <Field label="E-mail"><input className="in" value={v.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></Field>
        <Field label={say('Téléphone', 'Phone')}><input className="in" value={v.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></Field>
        <Field label={say('Identifiant fiscal', 'Tax id')}><input className="in" value={v.tax_id} onChange={(e) => set({ tax_id: e.target.value })} /></Field>
        <Field label={say('Site web', 'Website')}><input className="in" value={v.website} onChange={(e) => set({ website: e.target.value })} /></Field>
        <Field label={say('Adresse', 'Address')}><input className="in" value={v.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label={say('Ville', 'City')}><input className="in" value={v.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label={say('Pays', 'Country')}><input className="in" value={v.country} onChange={(e) => set({ country: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><textarea className="in" style={{ height: 60, padding: 8 }} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="actions"><button className="btn sm" onClick={() => onDone(false)} disabled={busy}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy || !v.name.trim()} onClick={save}>{say('Enregistrer', 'Save')}</button></div>
    </div>
  );
}

export function ClientPanel({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { state, toast, openRoom } = useStore();
  const say = useSay();
  const [view, setView] = useState<ClientView | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  const load = useCallback(async () => setView(await clientViewAction(clientId).catch(() => null)), [clientId]);
  useEffect(() => {
    let live = true;
    clientViewAction(clientId).catch(() => null).then((next) => { if (live) setView(next); });
    return () => { live = false; };
  }, [clientId]);

  const run = async (work: () => Promise<Result | void>, done?: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (result && result.error) { toast('error', result.error); return false; }
      if (done) toast('ok', done);
      await Promise.all([load(), reload()]);
      return true;
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement du client…', 'Loading the client…')}</span></div>;
  if (view === null) {
    return (
      <div className="card">
        <div className="banner warn">{say("Ce client n'existe plus ou ne vous est pas accessible.", 'This client no longer exists or is not open to you.')}</div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour', 'Back')}</button></div>
      </div>
    );
  }

  const { client, summary } = view;
  const status = CLIENT_STATUS[client.status];
  const health = HEALTH[summary.relationshipHealth] ?? HEALTH.healthy;
  const accounts = state.customers.filter((c) => (c as { clientId?: string }).clientId === client.id);
  const archive = async () => {
    if (!window.confirm(say(`Archiver le client « ${client.name} » ?`, `Archive the client "${client.name}"?`))) return;
    if (await run(() => shelveClientAction(client.id), say('Client archivé', 'Client archived'))) onClose();
  };
  const tabs = [
    { id: 'overview' as Tab, label: say("Vue d'ensemble", 'Overview') },
    { id: 'missions' as Tab, label: `${say('Missions', 'Missions')} · ${client.linkedProjects.length}` },
    { id: 'contracts' as Tab, label: `${say('Contrats', 'Contracts')} · ${view.contracts.length}` },
    { id: 'documents' as Tab, label: `Documents · ${view.documents.length}` },
    { id: 'tickets' as Tab, label: `${say('Tickets', 'Tickets')} · ${view.tickets.length}` },
    { id: 'notes' as Tab, label: `${say('Notes', 'Notes')} · ${view.notes.filter((n) => !n.archived_at).length}` },
    { id: 'comments' as Tab, label: `${say('Commentaires', 'Comments')} · ${view.comments.length}` },
    { id: 'history' as Tab, label: say('Historique', 'History') },
  ];
  const kv = (label: string, value: string | null | undefined) => <><span className="k">{label}</span><span>{value || '—'}</span></>;

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={onClose} aria-label={say('Retour', 'Back')}><Icon name="back" size={14} /></button>
          <h2 style={{ margin: 0 }}>{client.name}</h2>
          {status && <Chip kind={status[2]}>{say(status[0], status[1])}</Chip>}
          <Chip kind={health[2]}>{say(health[0], health[1])}</Chip>
          <Chip kind="dim">{say(...(TYPES[client.type] ?? TYPES.other))}</Chip>
          <div className="actions" style={{ marginLeft: 'auto' }}>
            {view.canManage && <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? say('Fermer le formulaire', 'Close the form') : say('Modifier', 'Edit')}</button>}
            {view.canManage && client.status !== 'archived' && <button className="btn sm danger" disabled={busy} onClick={archive}>{say('Archiver', 'Archive')}</button>}
          </div>
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {editing && (
        <ClientForm
          id={client.id}
          initial={{ name: client.name, legal_name: client.legal_name ?? '', type: client.type, industry: client.industry ?? '', contact_email: client.contact_email ?? '', contact_phone: client.contact_phone ?? '', address: client.address ?? '', country: client.country ?? '', city: client.city ?? '', website: client.website ?? '', tax_id: client.tax_id ?? '', status: client.status, prospect_stage: client.prospect_stage ?? '', next_follow_up_at: client.next_follow_up_at ?? '', account_manager_id: client.account_manager_id ?? '', notes: client.notes ?? '' }}
          managers={view.managers}
          onDone={(saved) => { setEditing(false); if (saved) void Promise.all([load(), reload()]); }}
          say={say}
        />
      )}

      {tab === 'overview' && (
        <>
          <div className="grid4">
            <div className="kpi"><div className="l">{say('Missions actives', 'Active missions')}</div><div className="v">{summary.activeProjects} / {summary.totalProjects}</div></div>
            <div className="kpi"><div className="l">{say('Tickets ouverts', 'Open tickets')}</div><div className="v">{summary.openTickets}</div>{summary.overdueTickets > 0 && <div className="small" style={{ color: 'var(--crit)' }}>{summary.overdueTickets} {say('en retard', 'overdue')}</div>}</div>
            <div className="kpi"><div className="l">{say('Contrats actifs', 'Active contracts')}</div><div className="v">{summary.activeContracts}</div>{summary.expiredContracts > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{summary.expiredContracts} {say('expiré(s)', 'expired')}</div>}</div>
            <div className="kpi"><div className="l">Documents</div><div className="v">{summary.documentsCount}</div></div>
          </div>
          <div className="cols">
            <div className="grow">
              <div className="card">
                {client.status === 'prospect' && <div className="banner info" style={{ marginBottom: 10 }}><b>{say(...(STAGES[client.prospect_stage ?? 'initial_contact'] ?? STAGES.initial_contact))}</b>{client.next_follow_up_at ? ` · ${say('prochain suivi', 'next follow-up')} ${client.next_follow_up_at.slice(0, 10)}` : ''}</div>}
                <div className="kv">
                  {kv(say('Raison sociale', 'Legal name'), client.legal_name)}
                  {kv(say('Responsable', 'Account manager'), client.managerName)}
                  {kv('E-mail', client.contact_email)}
                  {kv(say('Téléphone', 'Phone'), client.contact_phone)}
                  {kv(say('Adresse', 'Address'), [client.address, client.city, client.country].filter(Boolean).join(', '))}
                  {kv(say('Identifiant fiscal', 'Tax id'), client.tax_id)}
                  {kv(say('Secteur', 'Industry'), client.industry)}
                  {kv(say('Site web', 'Website'), client.website)}
                  {kv(say('Dernière activité', 'Last activity'), summary.lastActivityDate?.slice(0, 10))}
                </div>
                {client.notes && <div className="banner info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{client.notes}</div>}
              </div>
            </div>
            <div className="side">
              <div className="card">
                <h2>{say('Comptes clients (comptabilité)', 'Customer accounts (accounting)')}</h2>
                {accounts.length ? accounts.map((a) => <div key={a.id} className="small" style={{ borderTop: '1px solid var(--line)', padding: '5px 0' }}><span className="mono">{a.code}</span> · {state.entities.find((e) => e.id === a.entityId)?.name}</div>) : <span className="small muted">{say("Pas encore de compte dans une entité : l'ouvrir depuis Relations.", 'No account in an entity yet: open one from Relations.')}</span>}
              </div>
              {summary.upcomingContractRenewal && <div className="card"><h2>{say('Prochain renouvellement', 'Next renewal')}</h2><span className="click" onClick={() => openRoom('clients', `contract:${summary.upcomingContractRenewal!.id}`)}>{summary.upcomingContractRenewal.title} · <D iso={summary.upcomingContractRenewal.renewal_date?.slice(0, 10)} /></span></div>}
              {summary.upcomingProjectDeadline && <div className="card"><h2>{say('Prochaine échéance', 'Next deadline')}</h2><span className="click" onClick={() => openRoom('missions', `mission:${summary.upcomingProjectDeadline!.id}`)}>{summary.upcomingProjectDeadline.name} · <D iso={summary.upcomingProjectDeadline.end_date?.slice(0, 10)} /></span></div>}
            </div>
          </div>
        </>
      )}

      {tab === 'missions' && (
        <div className="card flush"><table>
          <thead><tr><th>{say('Mission', 'Mission')}</th><th>{say('Statut', 'Status')}</th><th className="num">{say('Avancement', 'Progress')}</th><th>{say('Échéance', 'Deadline')}</th></tr></thead>
          <tbody>
            {client.linkedProjects.map((p) => <tr key={p.id} className="click" onClick={() => openRoom('missions', `mission:${p.id}`)}><td><b>{p.name}</b></td><td className="small">{p.status}</td><td className="num">{p.progress} %</td><td><D iso={p.end_date?.slice(0, 10)} /></td></tr>)}
            {!client.linkedProjects.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>{say('Aucune mission.', 'No mission.')}</td></tr>}
          </tbody>
        </table></div>
      )}
      {tab === 'contracts' && (
        <div className="card flush"><table>
          <thead><tr><th>{say('Contrat', 'Contract')}</th><th>{say('Statut', 'Status')}</th><th>{say('Renouvellement', 'Renewal')}</th><th>{say('Fin', 'End')}</th></tr></thead>
          <tbody>
            {view.contracts.map((c) => <tr key={c.id} className="click" onClick={() => openRoom('clients', `contract:${c.id}`)}><td><b>{c.title}</b></td><td className="small">{c.status}</td><td><D iso={c.renewal_date?.slice(0, 10)} /></td><td><D iso={c.end_date?.slice(0, 10)} /></td></tr>)}
            {!view.contracts.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>{say('Aucun contrat.', 'No contract.')}</td></tr>}
          </tbody>
        </table></div>
      )}
      {tab === 'documents' && (
        <div className="card flush"><table>
          <thead><tr><th>Document</th><th>Type</th><th>{say('Lié à', 'Linked to')}</th><th>{say('Mis à jour', 'Updated')}</th></tr></thead>
          <tbody>
            {view.documents.map((d) => <tr key={d.id} className="click" onClick={() => window.open(`/api/documents/${d.id}/download`, '_blank', 'noopener')}><td><b>{d.title}</b>{d.is_archived && <> <Chip kind="dim">{say('archivé', 'archived')}</Chip></>}</td><td className="small">{d.document_type}</td><td className="small">{d.relatedLabel ?? '—'}</td><td className="mono small">{when(d.updated_at)}</td></tr>)}
            {!view.documents.length && <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>{say('Aucun document.', 'No document.')}</td></tr>}
          </tbody>
        </table></div>
      )}
      {tab === 'tickets' && (
        <div className="card flush"><table>
          <thead><tr><th>Ticket</th><th>{say('Mission', 'Mission')}</th><th>{say('Assigné à', 'Assignee')}</th><th>{say('Statut', 'Status')}</th><th>{say('Échéance', 'Due')}</th></tr></thead>
          <tbody>
            {view.tickets.map((t) => <tr key={t.id} className="click" onClick={() => openRoom('tasks', `ticket:${t.id}`)}><td><b>{t.title}</b></td><td className="small">{t.projectName ?? '—'}</td><td className="small">{t.assigneeName ?? '—'}</td><td className="small">{t.status}</td><td><D iso={t.dueDate ?? undefined} /></td></tr>)}
            {!view.tickets.length && <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>{say('Aucun ticket.', 'No ticket.')}</td></tr>}
          </tbody>
        </table></div>
      )}
      {tab === 'notes' && <Notes entityType="client" entityId={client.id} notes={view.notes} role={view.role} me={view.me} busy={busy} run={run} say={say} />}
      {tab === 'comments' && <Comments entityType="client" entityId={client.id} comments={view.comments} people={view.people} role={view.role} me={view.me} canComment={view.canComment} busy={busy} run={run} say={say} />}
      {tab === 'history' && (
        <div className="card">
          <select className="in" style={{ width: 200, marginBottom: 8 }} value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} aria-label={say('Filtrer', 'Filter')}>
            {[['all', 'Tout', 'Everything'], ['projects', 'Missions', 'Missions'], ['tickets', 'Tickets', 'Tickets'], ['contracts', 'Contrats', 'Contracts'], ['documents', 'Documents', 'Documents'], ['client', 'Client', 'Client']].map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}
          </select>
          {view.timeline.filter((h) => historyFilter === 'all' || h.type === historyFilter).map((h) => (
            <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '7px 0', fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{h.title}</b><span className="muted mono">{when(h.date)}</span></div>
              <div className="muted">{h.actorName}{h.description ? ` · ${h.description}` : ''}</div>
            </div>
          ))}
          {!view.timeline.length && <span className="small muted">{say('Aucune activité.', 'No activity.')}</span>}
        </div>
      )}
    </>
  );
}
