import { useEffect, useMemo, useState } from 'react'; // [bumex-one] useEffect
import { archiveRows, archiveQueue, rackLayout, archiveEngagement, retrieveArchive, returnArchive, destroyArchive, fmtDate, fmt, RACK_CAPACITY, type Id, type ArchiveStatus, type ArchiveKind } from '@bumex/domain';
import { useStore } from '../../store';
import { Chip, Icon, Tabs } from '../common'; // [bumex-one] Tabs
import { DocumentsTab } from '../../one/Documents'; // [bumex-one] BUMEX One's documents
import { useSay } from '../../one/say'; // [bumex-one]

// The archive module: the list behind the rack. Selecting a row selects the box in 3D (and the camera goes to the
// rack); selecting a box in 3D selects the row here. Actions change the records, so the rack changes too.

const STATUS_KIND: Record<ArchiveStatus, 'good' | 'warn' | 'crit' | 'dim'> = { archived: 'good', retrieved: 'warn', pending_destruction: 'crit', destroyed: 'dim' };

export function ArchivesPanel({ entityId, compact = false, initialTab }: { entityId: Id; compact?: boolean; initialTab?: string | null }) { // [bumex-one] initialTab
  const { state, t, apply, ui, setUi, openRoom, openArchive } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ArchiveStatus | 'all' | ''>('');
  const [year, setYear] = useState('');
  const [kind, setKind] = useState<ArchiveKind | 'all'>('all');
  const [boxKind, setBoxKind] = useState<ArchiveKind>('box');
  const rows = useMemo(() => archiveRows(state, entityId, { q, status: status === '' ? undefined : status, year: year || undefined, kind }), [state, entityId, q, status, year, kind]);
  const layout = useMemo(() => rackLayout(state, entityId), [state, entityId]);
  const queue = useMemo(() => archiveQueue(state, entityId), [state, entityId]);
  const years = useMemo(() => [...new Set(archiveRows(state, entityId, { status: 'all' }).map((r) => r.year))].sort().reverse(), [state, entityId]);
  const sel = rows.find((r) => r.record.id === ui.archiveId) ?? archiveRows(state, entityId, { status: 'all' }).find((r) => r.record.id === ui.archiveId) ?? null;
  const statusLabel = (s: ArchiveStatus) => t(`arc_${s === 'archived' ? 'archived' : s === 'retrieved' ? 'retrieved' : s === 'pending_destruction' ? 'pending' : 'destroyed'}`);
  const place = (r: { bay: number; shelf: number; slot: number }) => `${r.bay}·${r.shelf}·${r.slot}`;
  const isPartner = state.session.role === 'partner' || state.session.role === 'admin';
  const openEngagement = (id: Id) => { setUi({ focusEngagementId: id }); if (ui.view === 'floor') useStore.getState().focusRoom('missions'); openRoom('missions'); };
  // [bumex-one] two parts: the boxes, as delivered, and BUMEX One's documents (vanguard/one/Documents.tsx)
  const say = useSay();
  const [part, setPart] = useState<'boxes' | 'documents'>(initialTab === 'documents' ? 'documents' : 'boxes');
  useEffect(() => { if (initialTab === 'documents') setPart('documents'); }, [initialTab]);
  const parts = compact ? null : <Tabs tabs={[{ id: 'boxes' as const, label: say('Boîtes', 'Boxes') }, { id: 'documents' as const, label: 'Documents' }]} value={part} onChange={setPart} />;
  if (part === 'documents' && !compact) return (<><div className="sheet-head"><h1>{t('arc_title')}</h1>{parts}</div><div className="sheet-body"><DocumentsTab /></div></>);
  return (
    <>
      <div className="sheet-head">
        <h1>{t('arc_title')}</h1>
        {parts}
        <span className="muted small">{layout.used} / {RACK_CAPACITY} {t('arc_used')}</span>
        {ui.view === 'floor' && !compact && (
          <div className="hright">
            <button className="btn sm primary" onClick={() => setUi({ rackFocus: true, focusRoom: 'clients' })}><Icon name="archives" size={14} /> Mode étagère</button>
          </div>
        )}
      </div>
      <div className="sheet-body">
        <div className="toolbar">
          <div className="search" style={{ maxWidth: 360, flex: '1 1 220px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
            <input className="in" style={{ paddingLeft: 32, background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--border)' }} placeholder={t('arc_search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('arc_search')} />
          </div>
          <div className="pill-list">
            {([['', t('arc_on_rack')], ['archived', t('arc_archived')], ['retrieved', t('arc_retrieved')], ['pending_destruction', t('arc_pending')], ['all', t('arc_all')]] as [ArchiveStatus | 'all' | '', string][]).map(([s, l]) => (
              <button key={s} className={`pill ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{l}</button>
            ))}
          </div>
          <select className="in" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('arc_date')}><option value="">{t('arc_all')} · {t('arc_date').toLowerCase()}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <select className="in" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as ArchiveKind | 'all')} aria-label="Type"><option value="all">{t('arc_box')} + {t('arc_binder')}</option><option value="box">{t('arc_box')}</option><option value="binder">{t('arc_binder')}</option></select>
        </div>
        {queue.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--gold)' }}>
            <h2>{t('arc_queue')} · {queue.length}</h2>
            {queue.map((e) => (
              <div key={e.id} className="row" style={{ borderTopColor: 'var(--line)', color: 'var(--ink)' }}>
                <span><b>{e.code}</b> · {e.name} <span className="muted small">· {state.customers.find((c) => c.id === e.customerId)?.name}</span></span>
                <span className="toolbar">
                  <select className="in" style={{ width: 'auto', height: 27 }} value={boxKind} onChange={(ev) => setBoxKind(ev.target.value as ArchiveKind)}><option value="box">{t('arc_box')}</option><option value="binder">{t('arc_binder')}</option></select>
                  <button className="btn sm primary" onClick={() => apply((s) => { const [s1, rec] = archiveEngagement(s, { engagementId: e.id, kind: boxKind }); window.setTimeout(() => openArchive(rec.id, false), 0); return s1; }, t('arc_archive_now'))}>{t('arc_archive_now')}</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className={compact ? '' : 'cols'}>
          <div className={compact ? '' : 'grow'}>
            <div className="card flush">
              <table>
                <thead><tr><th>{t('arc_ref')}</th><th>{t('tsk_engagement')}</th>{!compact && <th>{t('customer')}</th>}{!compact && <th>{t('arc_date')}</th>}{!compact && <th>{t('arc_place')}</th>}<th>{t('status')}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.record.id} className={`click ${sel?.record.id === r.record.id ? 'sel' : ''}`} onClick={() => openArchive(r.record.id, false)}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}><b>{r.record.reference}</b><div className="small muted">{r.record.kind === 'box' ? `${r.record.boxCount} ${t('arc_box').toLowerCase()}${r.record.boxCount > 1 ? 's' : ''}` : t('arc_binder')}{compact ? ` · ${place(r.record)} · ${fmtDate(r.record.archivedAt)}` : ''}</div></td>
                      <td>{r.engagement.name}<div className="small muted">{r.engagement.code}{compact && r.customer ? ` · ${r.customer.name}` : ''}</div></td>
                      {!compact && <td>{r.customer?.name ?? '—'}</td>}
                      {!compact && <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.record.archivedAt)}</td>}
                      {!compact && <td className="small">{place(r.record)}</td>}
                      <td><Chip kind={STATUS_KIND[r.record.status]}>{statusLabel(r.record.status)}</Chip></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>{t('arc_empty')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className={compact ? '' : 'side'} style={compact ? { marginTop: 14 } : undefined}>
            {sel ? (
              <div className="card arc-detail" style={{ borderColor: 'var(--blue)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0 }} className="mono">{sel.record.reference}</h2>
                  <button className="btn sm ghost" onClick={() => openArchive(null, false)} aria-label={t('close')}><Icon name="close" size={16} /></button>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, margin: '8px 0 10px' }}>{sel.engagement.name}</p>
                <div className="kv">
                  <span className="k">{t('customer')}</span><span>{sel.customer?.name ?? '—'}</span>
                  <span className="k">{t('tsk_engagement')}</span><span className="mono">{sel.engagement.code} · {sel.engagement.kind}</span>
                  <span className="k">{t('arc_date')}</span><span className="mono">{fmtDate(sel.record.archivedAt)}</span>
                  <span className="k">{t('arc_retention')}</span><span className="mono" style={{ color: sel.record.retentionUntil <= state.today ? 'var(--crit)' : undefined }}>{fmtDate(sel.record.retentionUntil)}</span>
                  <span className="k">{t('status')}</span><span><Chip kind={STATUS_KIND[sel.record.status]}>{statusLabel(sel.record.status)}</Chip></span>
                  <span className="k">{t('arc_place')}</span><span>{t('arc_bay')} {sel.record.bay} · {t('arc_shelf')} {sel.record.shelf} · {t('arc_slot')} {sel.record.slot}</span>
                  <span className="k">{t('arc_box')}</span><span>{sel.record.kind === 'box' ? `${sel.record.boxCount} ${t('arc_boxes')}` : t('arc_binder')}</span>
                  <span className="k">Honoraires</span><span className="mono">{fmt(sel.engagement.fixedFee ?? 0, 0)} {sel.engagement.currency}</span>
                  <span className="k">Heures</span><span className="mono">{sel.engagement.actualHours} h</span>
                  <span className="k">Équipe</span><span>{sel.engagement.staff.join(', ')}</span>
                  {sel.record.retrievedBy && <><span className="k">{t('arc_retrieved')}</span><span>{t('arc_by')} {sel.record.retrievedBy} · {sel.record.retrievedAt ? fmtDate(sel.record.retrievedAt) : ''}</span></>}
                </div>
                {sel.record.notes && <div className="banner info" style={{ marginTop: 10 }}>{sel.record.notes}</div>}
                <div className="actions" style={{ marginTop: 12 }}>
                  {ui.view === 'floor' && <button className="btn sm" onClick={() => setUi({ rackFocus: true, focusRoom: 'clients', archiveId: sel.record.id })}>Voir sur l'étagère</button>}
                  <button className="btn sm" onClick={() => openEngagement(sel.engagement.id)}>{t('arc_open_eng')}</button>
                  {(sel.record.status === 'archived' || sel.record.status === 'pending_destruction') && <button className="btn sm" onClick={() => apply((s) => retrieveArchive(s, sel.record.id), `${t('arc_retrieved')} · ${sel.record.reference}`)}>{t('arc_retrieve')}</button>}
                  {sel.record.status === 'retrieved' && <button className="btn sm primary" onClick={() => apply((s) => returnArchive(s, sel.record.id), `${t('arc_archived')} · ${sel.record.reference}`)}>{t('arc_return')}</button>}
                  {sel.record.status === 'pending_destruction' && isPartner && <button className="btn sm danger" onClick={() => { if (confirm(`${t('arc_destroy')} ${sel.record.reference} ?`)) apply((s) => destroyArchive(s, sel.record.id), `${t('arc_destroyed')} · ${sel.record.reference}`); }}>{t('arc_destroy')}</button>}
                </div>
              </div>
            ) : (
              <div className="card"><div className="muted small">{t('arc_select')}</div></div>
            )}
            <div className="card" style={{ marginTop: 14 }}>
              <h2>{t('rack_view')}</h2>
              <div className="kv">
                <span className="k">{t('arc_bay')} 1</span><span>{layout.items.filter((r) => r.record.bay === 1).length} / 20</span>
                <span className="k">{t('arc_bay')} 2</span><span>{layout.items.filter((r) => r.record.bay === 2).length} / 20</span>
                <span className="k">{t('arc_bay')} 3</span><span>{layout.items.filter((r) => r.record.bay === 3).length} / 20</span>
              </div>
              <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${(layout.used / RACK_CAPACITY) * 100}%` }} /></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
