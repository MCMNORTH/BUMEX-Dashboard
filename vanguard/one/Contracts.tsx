import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fmt } from '@bumex/domain';
import { saveContractAction, shelveContractAction } from '@/app/(app)/contracts/actions';
import { contractsAction, contractViewAction, type ContractRow, type ContractsData, type ContractView } from '@/lib/erp/vanguard/client-actions';
import type { ContractFiltersData, ContractStatus, ContractType } from '@/types/contract';
import { useStore } from '../store';
import { Chip, D, Field, Icon } from '../ui/common';
import { Comments, Notes, type Result, type Say, when } from './Conversation';
import { useSay } from './say';

// The Clients room's "Contrats" tab: BUMEX One's contracts, with what renews soon, and each contract's page (details,
// edit form, archive, notes, conversation, history). Saved by BUMEX One's contract actions, under their rules.

const STATUS: Record<ContractStatus, [string, string, 'good' | 'warn' | 'crit' | 'dim']> = {
  draft: ['Brouillon', 'Draft', 'dim'],
  under_review: ['En revue', 'Under review', 'warn'],
  signed: ['Signé', 'Signed', 'good'],
  active: ['Actif', 'Active', 'good'],
  expired: ['Expiré', 'Expired', 'crit'],
  cancelled: ['Annulé', 'Cancelled', 'dim'],
  archived: ['Archivé', 'Archived', 'dim'],
};
const TYPES: Record<ContractType, [string, string]> = {
  development: ['Développement', 'Development'], maintenance: ['Maintenance', 'Maintenance'], consulting: ['Conseil', 'Consulting'], support: ['Support', 'Support'],
  hosting: ['Hébergement', 'Hosting'], audit: ['Audit', 'Audit'], other: ['Autre', 'Other'],
};
type FormValues = { title: string; contract_number: string; client_id: string; project_id: string; status: ContractStatus; contract_type: ContractType; start_date: string; end_date: string; signed_date: string; renewal_date: string; amount: string; currency: string; payment_terms: string; responsible_user_id: string; notes: string };
const fromRow = (c: ContractRow): FormValues => ({
  title: c.title, contract_number: c.contract_number ?? '', client_id: c.client_id, project_id: c.project_id ?? '', status: c.status, contract_type: c.contract_type,
  start_date: c.start_date?.slice(0, 10) ?? '', end_date: c.end_date?.slice(0, 10) ?? '', signed_date: c.signed_date?.slice(0, 10) ?? '', renewal_date: c.renewal_date?.slice(0, 10) ?? '',
  amount: c.amount?.toString() ?? '', currency: c.currency, payment_terms: c.payment_terms ?? '', responsible_user_id: c.responsible_user_id ?? '', notes: c.notes ?? '',
});

function ContractForm({ id, initial, options, onDone, say }: { id?: string; initial: FormValues; options: ContractFiltersData; onDone: (saved: boolean) => void; say: Say }) {
  const { toast } = useStore();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormValues>) => setV((x) => ({ ...x, ...patch }));
  const save = async () => {
    const form = new FormData();
    for (const [k, value] of Object.entries({ ...v, ...(id ? { contract_id: id } : {}) })) form.set(k, value);
    setBusy(true);
    try {
      const result = await saveContractAction(form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', id ? say('Contrat mis à jour', 'Contract updated') : say('Contrat créé', 'Contract created'));
      onDone(true);
    } catch {
      toast('error', say("Serveur injoignable : le contrat n'est pas enregistré.", 'Server unreachable: the contract was not saved.'));
    } finally {
      setBusy(false);
    }
  };
  const date = (key: 'start_date' | 'end_date' | 'signed_date' | 'renewal_date', label: string) => <Field label={label}><input className="in mono" type="date" value={v[key]} onChange={(e) => set({ [key]: e.target.value })} /></Field>;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0 }}>{id ? `${say('Modifier', 'Edit')} · ${initial.title}` : say('Nouveau contrat', 'New contract')}</h2>
      <div className="grid3">
        <Field label={say('Titre', 'Title')}><input className="in" value={v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label={say('Numéro', 'Number')}><input className="in mono" value={v.contract_number} onChange={(e) => set({ contract_number: e.target.value })} /></Field>
        <Field label="Client"><select className="in" value={v.client_id} onChange={(e) => set({ client_id: e.target.value })}><option value="">{say('— choisir —', '— choose —')}</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label={say('Mission', 'Mission')}><select className="in" value={v.project_id} onChange={(e) => set({ project_id: e.target.value })}><option value="">—</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label={say('Statut', 'Status')}><select className="in" value={v.status} onChange={(e) => set({ status: e.target.value as ContractStatus })}>{(Object.keys(STATUS) as ContractStatus[]).filter((s) => s !== 'archived').map((s) => <option key={s} value={s}>{say(STATUS[s][0], STATUS[s][1])}</option>)}</select></Field>
        <Field label="Type"><select className="in" value={v.contract_type} onChange={(e) => set({ contract_type: e.target.value as ContractType })}>{(Object.keys(TYPES) as ContractType[]).map((t) => <option key={t} value={t}>{say(...TYPES[t])}</option>)}</select></Field>
        {date('start_date', say('Début', 'Start'))}
        {date('end_date', say('Fin', 'End'))}
        {date('signed_date', say('Signé le', 'Signed'))}
        {date('renewal_date', say('Renouvellement', 'Renewal'))}
        <Field label={say('Montant', 'Amount')}><input className="in num" value={v.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
        <Field label={say('Devise', 'Currency')}><input className="in mono" value={v.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} /></Field>
        <Field label={say('Conditions de paiement', 'Payment terms')}><input className="in" value={v.payment_terms} onChange={(e) => set({ payment_terms: e.target.value })} /></Field>
        <Field label={say('Responsable', 'Responsible')}><select className="in" value={v.responsible_user_id} onChange={(e) => set({ responsible_user_id: e.target.value })}><option value="">—</option>{options.responsibleUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
      </div>
      <Field label="Notes"><textarea className="in" style={{ height: 60, padding: 8 }} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="actions"><button className="btn sm" onClick={() => onDone(false)} disabled={busy}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy || !v.title.trim() || !v.client_id} onClick={save}>{say('Enregistrer', 'Save')}</button></div>
    </div>
  );
}

export function ContractsTab() {
  const say = useSay();
  const { openRoom } = useStore();
  const loadedAt = useStore((s) => s.loadedAt);
  const [data, setData] = useState<ContractsData | undefined>(undefined);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => setData(await contractsAction().catch(() => null)), []);
  useEffect(() => {
    let live = true;
    contractsAction().catch(() => null).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [loadedAt]);

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner warn">{say("Les contrats sont réservés à l'administrateur, aux managers et aux actionnaires.", 'Contracts are for the administrator, managers and shareholders.')}</div>;
  const s = q.trim().toLowerCase();
  const rows = data.contracts.filter((c) => (!status || c.status === status) && (!s || `${c.title} ${c.contract_number ?? ''} ${c.clientName ?? ''} ${c.projectName ?? ''}`.toLowerCase().includes(s)));
  const soon = data.contracts.filter((c) => c.renewalState === 'renewing_soon' || c.renewalState === 'expired');

  return (
    <>
      {soon.length > 0 && (
        <div className="banner warn">
          <b>{say('À renouveler', 'To renew')}</b> · {soon.map((c) => <span key={c.id} className="click" onClick={() => openRoom('clients', `contract:${c.id}`)} style={{ marginRight: 10 }}>{c.title} ({c.renewalState === 'expired' ? say('expiré', 'expired') : `${c.daysUntilRenewal ?? '?'} ${say('j', 'd')}`})</span>)}
        </div>
      )}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <input className="in" style={{ maxWidth: 280 }} placeholder={say('Rechercher un contrat…', 'Search for a contract…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{say('Tous les statuts', 'Every status')}</option>{(Object.keys(STATUS) as ContractStatus[]).map((k) => <option key={k} value={k}>{say(STATUS[k][0], STATUS[k][1])}</option>)}</select>
        {data.canEdit && !creating && <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}><Icon name="plus" size={13} /> {say('Nouveau contrat', 'New contract')}</button>}
      </div>
      {creating && <ContractForm initial={{ title: '', contract_number: '', client_id: '', project_id: '', status: 'draft', contract_type: 'audit', start_date: '', end_date: '', signed_date: '', renewal_date: '', amount: '', currency: 'MRU', payment_terms: '', responsible_user_id: data.me, notes: '' }} options={data.options} onDone={(saved) => { setCreating(false); if (saved) void load(); }} say={say} />}
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Contrat', 'Contract')}</th><th>Client</th><th>{say('Mission', 'Mission')}</th><th>Type</th><th>{say('Statut', 'Status')}</th><th className="num">{say('Montant', 'Amount')}</th><th>{say('Renouvellement', 'Renewal')}</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="click" onClick={() => openRoom('clients', `contract:${c.id}`)}>
                <td><b>{c.title}</b>{c.contract_number ? <div className="small muted mono">{c.contract_number}</div> : null}</td>
                <td className="small">{c.clientName ?? '—'}</td>
                <td className="small">{c.projectName ?? '—'}</td>
                <td className="small">{say(...(TYPES[c.contract_type] ?? TYPES.other))}</td>
                <td><Chip kind={STATUS[c.status][2]}>{say(STATUS[c.status][0], STATUS[c.status][1])}</Chip></td>
                <td className="num">{c.amount !== null ? `${fmt(c.amount, 0)} ${c.currency}` : '—'}</td>
                <td><D iso={c.renewal_date?.slice(0, 10)} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>{say('Aucun contrat.', 'No contract.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ContractPanel({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const { toast, openRoom } = useStore();
  const say = useSay();
  const [view, setView] = useState<ContractView | null | undefined>(undefined);
  const [options, setOptions] = useState<ContractFiltersData | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'details' | 'notes' | 'comments' | 'history'>('details');

  const load = useCallback(async () => setView(await contractViewAction(contractId).catch(() => null)), [contractId]);
  useEffect(() => {
    let live = true;
    contractViewAction(contractId).catch(() => null).then((next) => { if (live) setView(next); });
    return () => { live = false; };
  }, [contractId]);
  const run = async (work: () => Promise<Result | void>, done?: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (result && result.error) { toast('error', result.error); return false; }
      if (done) toast('ok', done);
      await load();
      return true;
    } catch {
      toast('error', say("Serveur injoignable : rien n'a changé.", 'Server unreachable: nothing changed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined) return <div className="card"><span className="muted">{say('Chargement du contrat…', 'Loading the contract…')}</span></div>;
  if (view === null) return <div className="card"><div className="banner warn">{say("Ce contrat n'existe plus ou ne vous est pas accessible.", 'This contract no longer exists or is not open to you.')}</div><div className="actions" style={{ marginTop: 10 }}><button className="btn sm" onClick={onClose}>{say('Retour', 'Back')}</button></div></div>;
  const c = view.contract;
  const canEdit = view.role !== 'shareholder' && view.role !== 'supervisor';
  const edit = async () => {
    if (!options) setOptions((await contractsAction().catch(() => null))?.options ?? null);
    setEditing(!editing);
  };
  const kv = (label: string, value: ReactNode) => <><span className="k">{label}</span><span>{value ?? '—'}</span></>;

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={onClose} aria-label={say('Retour', 'Back')}><Icon name="back" size={14} /></button>
          <h2 style={{ margin: 0 }}>{c.title}</h2>
          <Chip kind={STATUS[c.status][2]}>{say(STATUS[c.status][0], STATUS[c.status][1])}</Chip>
          <Chip kind="dim">{say(...(TYPES[c.contract_type] ?? TYPES.other))}</Chip>
          {c.renewalState === 'renewing_soon' && <Chip kind="warn">{say('à renouveler', 'renewing soon')}</Chip>}
          <div className="actions" style={{ marginLeft: 'auto' }}>
            {canEdit && <button className="btn sm" onClick={edit}>{editing ? say('Fermer le formulaire', 'Close the form') : say('Modifier', 'Edit')}</button>}
            {canEdit && c.status !== 'archived' && <button className="btn sm danger" disabled={busy} onClick={async () => { if (window.confirm(say(`Archiver « ${c.title} » ?`, `Archive "${c.title}"?`)) && (await run(() => shelveContractAction(c.id), say('Contrat archivé', 'Contract archived')))) onClose(); }}>{say('Archiver', 'Archive')}</button>}
          </div>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          {([['details', 'Détails', 'Details'], ['notes', 'Notes', 'Notes'], ['comments', 'Commentaires', 'Comments'], ['history', 'Historique', 'History']] as const).map(([k, fr, en]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{say(fr, en)}</button>)}
        </div>
      </div>
      {editing && options && <ContractForm id={c.id} initial={fromRow(c)} options={options} onDone={(saved) => { setEditing(false); if (saved) void load(); }} say={say} />}
      {tab === 'details' && (
        <div className="card">
          <div className="kv">
            {kv(say('Numéro', 'Number'), c.contract_number)}
            {kv('Client', c.clientName ? <span className="click" onClick={() => openRoom('clients', `client:${c.client_id}`)}>{c.clientName}</span> : null)}
            {kv(say('Mission', 'Mission'), c.projectName && c.project_id ? <span className="click" onClick={() => openRoom('missions', `mission:${c.project_id}`)}>{c.projectName}</span> : null)}
            {kv(say('Montant', 'Amount'), c.amount !== null ? `${fmt(c.amount, 0)} ${c.currency}` : null)}
            {kv(say('Conditions de paiement', 'Payment terms'), c.payment_terms)}
            {kv(say('Début', 'Start'), <D iso={c.start_date?.slice(0, 10)} />)}
            {kv(say('Fin', 'End'), <D iso={c.end_date?.slice(0, 10)} />)}
            {kv(say('Signé le', 'Signed'), <D iso={c.signed_date?.slice(0, 10)} />)}
            {kv(say('Renouvellement', 'Renewal'), <><D iso={c.renewal_date?.slice(0, 10)} />{c.daysUntilRenewal !== null ? ` · ${c.daysUntilRenewal} ${say('j', 'd')}` : ''}</>)}
            {kv(say('Responsable', 'Responsible'), c.responsibleName)}
            {kv(say('Mis à jour', 'Updated'), when(c.updated_at))}
          </div>
          {c.notes && <div className="banner info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
        </div>
      )}
      {tab === 'notes' && <Notes entityType="contract" entityId={c.id} notes={view.notes} role={view.role} me={view.me} busy={busy} run={run} say={say} />}
      {tab === 'comments' && <Comments entityType="contract" entityId={c.id} comments={view.comments} people={view.people} role={view.role} me={view.me} canComment={view.canComment} busy={busy} run={run} say={say} />}
      {tab === 'history' && (
        <div className="card">
          {view.history.map((h) => <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '7px 0', fontSize: 12.5 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{h.action}</b><span className="muted mono">{when(h.at)}</span></div><div className="muted">{h.who}{h.detail ? ` · ${h.detail}` : ''}</div></div>)}
          {!view.history.length && <span className="small muted">{say('Aucune activité.', 'No activity.')}</span>}
        </div>
      )}
    </>
  );
}
