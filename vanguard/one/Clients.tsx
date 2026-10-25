import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addCustomer, type Currency, type Id } from '@bumex/domain';
import { clientRelationsAction, type ClientRelation } from '@/lib/erp/vanguard/client-actions';
import { useStore } from '../store';
import { Chip } from '../ui/common';
import { useSay } from './say';

// The relationship side of the clients (BUMEX One's clients, one for the group) under the Clients room's customer
// accounts of the floor (ui/panels/Clients.tsx): which clients have an account here, and opening one for the others.

const STATUS: Record<string, [string, string, 'good' | 'warn' | 'dim']> = {
  prospect: ['Prospect', 'Prospect', 'warn'],
  active: ['Actif', 'Active', 'good'],
  inactive: ['Inactif', 'Inactive', 'dim'],
  suspended: ['Suspendu', 'Suspended', 'dim'],
  archived: ['Archivé', 'Archived', 'dim'],
};

export function ClientRelations({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRelation[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'without'>('all');
  const loadedAt = useStore((s) => s.loadedAt);
  const entity = state.entities.find((e) => e.id === entityId);

  // read again with the state: a customer just created here is linked to its client on the server
  useEffect(() => {
    let live = true;
    void clientRelationsAction().then((list) => live && setClients(list)).catch(() => live && setClients([]));
    return () => { live = false; };
  }, [loadedAt]);

  if (!clients) return <div className="card"><span className="muted">{say('Chargement des relations…', 'Loading the relations…')}</span></div>;
  const here = (c: ClientRelation) => c.accounts.find((a) => a.entityId === entityId);
  const rows = clients.filter((c) => filter === 'all' || !here(c));
  const open = (c: ClientRelation) =>
    apply(
      (s) => addCustomer(s, { entityId, name: c.name, regime: 'standard', country: c.country && /^[a-z]{2}$/i.test(c.country) ? c.country.toUpperCase() : 'MR', defaultCurrency: (entity?.functionalCurrency ?? 'MRU') as Currency, paymentTermsDays: 30, email: c.contact_email ?? undefined, nif: c.tax_id ?? undefined }),
      say(`Compte client ouvert · ${c.name}`, `Customer account opened · ${c.name}`),
    );

  return (
    <div className="card flush">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <h2 style={{ margin: 0 }}>{say('Relations', 'Relations')} · {clients.length}</h2>
        <span className="small muted">{say('les clients du groupe (BUMEX One) et leur compte dans cette entité', "the group's clients (BUMEX One) and their account in this entity")}</span>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button className={`btn sm ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>{say('Tous', 'All')}</button>
          <button className={`btn sm ${filter === 'without' ? 'on' : ''}`} onClick={() => setFilter('without')}>{say('Sans compte ici', 'No account here')}</button>
        </div>
      </div>
      <table>
        <thead><tr><th>{say('Client', 'Client')}</th><th>{say('Statut', 'Status')}</th><th>{say('Responsable', 'Account manager')}</th><th>{say('Contact', 'Contact')}</th><th>{say('Compte ici', 'Account here')}</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => {
            const account = here(c);
            const status = STATUS[c.status];
            return (
              <tr key={c.id}>
                <td><b>{c.name}</b><div className="small muted">{[c.city, c.country].filter(Boolean).join(' · ')}{c.accounts.length ? ` · ${c.accounts.length} ${say('entité(s)', 'entity(ies)')}` : ''}</div></td>
                <td>{status ? <Chip kind={status[2]}>{say(status[0], status[1])}</Chip> : c.status}</td>
                <td className="small">{c.manager ?? '—'}</td>
                <td className="small">{c.contact_email ?? '—'}{c.contact_phone ? <div className="muted">{c.contact_phone}</div> : null}</td>
                <td className="mono">{account?.code ?? '—'}</td>
                <td>
                  <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => router.push(`/clients/${c.id}`)}>{say('Fiche relation', 'Relationship')}</button>
                    {!account && <button className="btn sm primary" onClick={() => open(c)}>{say('Ouvrir un compte client', 'Open a customer account')}</button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>{say('Aucun client.', 'No client.')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
