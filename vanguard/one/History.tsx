import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bumexOneHistoryAction, type BumexOneEvent } from '@/lib/erp/vanguard/history-actions';
import { useStore } from '../store';
import { Chip } from '../ui/common';
import { useSay } from './say';
import { Select } from '../ui/Select';
import { activityDetail, activityText, entityLabel, tableLabel, valueLabel } from './labels';
import { useCached } from './cache';
import { POLICY } from './policies';

// The one History (the Settings room's "Historique" tab): the ERP's audit log, which is in the state, and BUMEX One's
// activity log (projects, tickets, clients, contracts…), latest first, filtered together. Replaces the delivered
// History of ui/panels/Settings.tsx and BUMEX One's Activity page.

type Row = { key: string; at: string; who: string; role?: string; source: 'erp' | 'one'; action: string; kind: 'I' | 'U' | 'D' | null; object: string; ref?: string; detail: string; entityId?: string | null; url?: string | null };
const NONE: BumexOneEvent[] = [];

export function History() {
  const { state, t, ui } = useStore();
  const say = useSay();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'' | 'erp' | 'one'>('');
  const [action, setAction] = useState<'' | 'I' | 'U' | 'D'>('');
  const [scope, setScope] = useState<'entity' | 'all'>('entity');
  // BUMEX One's activity log, kept between visits; read again when the work moves, or after a minute (one/policies.ts);
  // unreadable, the ERP's log alone
  const log = useCached<BumexOneEvent[]>(['history'], () => bumexOneHistoryAction(), POLICY.history);
  const events = log.data ?? (log.error ? NONE : null);

  const A: Record<'I' | 'U' | 'D', [string, string, 'good' | 'warn' | 'crit']> = { I: ['Création', 'Created', 'good'], U: ['Modification', 'Changed', 'warn'], D: ['Suppression', 'Deleted', 'crit'] };
  const rows = useMemo(() => {
    // said in the person's language (labels.ts): a person's name, not their id; the table's name, the log's sentence
    const names = new Map(state.users.map((u) => [u.id, u.name]));
    const erp: Row[] = state.auditLog.map((r, i) => ({ key: `erp-${i}`, at: r.at, who: names.get(r.actorId) ?? r.actorId, role: r.role, source: 'erp', action: '', kind: r.action, object: tableLabel(r.table, say), ref: r.rowId, detail: r.summary, entityId: r.entityId }));
    const one: Row[] = (events ?? []).map((e) => ({ key: `one-${e.id}`, at: e.at, who: e.who, source: 'one', action: activityText(e.action, say), kind: null, object: entityLabel(e.entity, say), detail: activityDetail(e.metadata, say, e.entity), url: e.url }));
    const s = q.trim().toLowerCase();
    return [...erp, ...one]
      .filter((r) => (!source || r.source === source)
        && (!action || r.kind === action)
        && (scope === 'all' || r.source === 'one' || !r.entityId || r.entityId === ui.entityId)
        && (!s || `${r.who} ${r.action} ${r.object} ${r.detail} ${r.ref ?? ''}`.toLowerCase().includes(s)))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 300);
  }, [state.auditLog, state.users, events, q, source, action, scope, ui.entityId, say]);

  return (
    <>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <input className="in" style={{ maxWidth: 320 }} placeholder={say("Filtrer l'historique…", 'Filter the history…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="in" style={{ maxWidth: 190 }} value={source} onChange={(e) => setSource(e.target.value as '' | 'erp' | 'one')} aria-label={say('Origine', 'Source')}>
          <option value="">{say('Tout', 'Everything')}</option>
          <option value="erp">{say('ERP · comptabilité, gestion', 'ERP · accounting, management')}</option>
          <option value="one">{say('Travail · projets, tickets, clients', 'Work · projects, tickets, clients')}</option>
        </Select>
        <Select className="in" style={{ maxWidth: 170 }} value={action} onChange={(e) => setAction(e.target.value as '' | 'I' | 'U' | 'D')}>
          <option value="">{say('Toutes les actions', 'Every action')}</option>
          <option value="I">{say('Créations', 'Creations')}</option>
          <option value="U">{say('Modifications · validations', 'Changes · validations')}</option>
          <option value="D">{say('Suppressions', 'Deletions')}</option>
        </Select>
        <Select className="in" style={{ maxWidth: 160 }} value={scope} onChange={(e) => setScope(e.target.value as 'entity' | 'all')}>
          <option value="entity">{say('Entité courante', 'Current entity')}</option>
          <option value="all">{say('Tout le groupe', 'The whole group')}</option>
        </Select>
        <span className="small muted">{rows.length} {say('lignes', 'rows')}{events === null ? ` · ${say('chargement du travail…', 'loading the work…')}` : ''}</span>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>{say('Quand', 'When')}</th><th>{say('Qui', 'Who')}</th><th>{t('role')}</th><th>Action</th><th>{say('Objet', 'Object')}</th><th>{say('Détail', 'Detail')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={r.url ? () => router.push(r.url!) : undefined} style={r.url ? { cursor: 'pointer' } : undefined}>
                <td className="small mono">{r.at.slice(0, 16).replace('T', ' ')}</td>
                <td>{r.who || '—'}</td>
                <td className="small">{r.role ? (t(r.role) !== r.role ? t(r.role) : valueLabel('role', r.role, say)) : ''}</td>
                <td>{r.kind ? <Chip kind={A[r.kind][2]}>{say(A[r.kind][0], A[r.kind][1])}</Chip> : <span className="small">{r.action}</span>}</td>
                <td className="small">{r.source === 'one' ? <Chip kind="dim">{r.object}</Chip> : r.object}{r.ref && <div className="muted mono">{r.ref}</div>}</td>
                <td className="small">{r.detail}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted small">{say('Rien dans l’historique pour ces filtres.', 'Nothing in the history for these filters.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
