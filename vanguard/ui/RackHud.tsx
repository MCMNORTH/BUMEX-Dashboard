import { useMemo, useState } from 'react';
import { archiveRows, retrieveArchive, returnArchive, destroyArchive, rackLayout, RACK_CAPACITY, fmtDate, type ArchiveStatus } from '@bumex/domain';
import { useStore } from '../store';
import { Chip, Icon } from './common';

// Shelf mode: the rack is the main element on screen. A slim toolbar switches to the table, the selected box shows in
// a compact card at the bottom left; nothing covers the shelves.
const STATUS_KIND: Record<ArchiveStatus, 'good' | 'warn' | 'crit' | 'dim'> = { archived: 'good', retrieved: 'warn', pending_destruction: 'crit', destroyed: 'dim' };

export function RackHud() {
  const { state, ui, t, apply, setUi, openArchive, openRoom, focusRoom } = useStore();
  const entityId = ui.entityId!;
  const rows = useMemo(() => archiveRows(state, entityId, { status: 'all' }), [state, entityId]);
  const layout = useMemo(() => rackLayout(state, entityId), [state, entityId]);
  const sel = rows.find((r) => r.record.id === ui.archiveId) ?? null;
  const [q, setQ] = useState('');
  const hits = q.trim().length >= 2 ? rows.filter((r) => `${r.record.reference} ${r.engagement.name} ${r.customer?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const statusLabel = (s: ArchiveStatus) => t(`arc_${s === 'archived' ? 'archived' : s === 'retrieved' ? 'retrieved' : s === 'pending_destruction' ? 'pending' : 'destroyed'}`);
  const isPartner = state.session.role === 'partner' || state.session.role === 'admin';
  const toTable = () => setUi({ rackFocus: false, room: 'archives', tab: null });
  const toFloor = () => { setUi({ rackFocus: false, archiveId: null, room: null }); focusRoom(null); };
  const openEngagement = (id: string) => { setUi({ focusEngagementId: id, rackFocus: false, archiveId: null }); focusRoom('missions'); openRoom('missions'); };
  return (
    <>
      <div className="rack-tools">
        <div className="search" style={{ width: 260 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
          <input className="in" style={{ paddingLeft: 32 }} placeholder={t('arc_search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('arc_search')} />
          {hits.length > 0 && (
            <div className="search-results">
              {hits.map((r) => <button key={r.record.id} onClick={() => { openArchive(r.record.id, true); setQ(''); }}><span className="mono">{r.record.reference}</span><span className="muted small">{r.engagement.name}</span></button>)}
            </div>
          )}
        </div>
        <span className="small" style={{ color: 'var(--dark-muted)' }}>{layout.used} / {RACK_CAPACITY} {t('arc_used')}</span>
        <button className="btn dark" onClick={toTable}><Icon name="reports" size={14} /> Tableau</button>
        <button className="btn dark" onClick={toFloor}>{t('back_floor')}</button>
      </div>
      <div className="rack-card">
        {sel ? (
          <div className="panel arc-detail">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <b className="mono">{sel.record.reference}</b>
              <Chip kind={STATUS_KIND[sel.record.status]}>{statusLabel(sel.record.status)}</Chip>
              <button className="btn dark sm" onClick={() => openArchive(null, false)} aria-label={t('close')}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ fontWeight: 600, margin: '6px 0 4px' }}>{sel.engagement.name}</div>
            <div className="small" style={{ color: 'var(--dark-muted)' }}>{sel.customer?.name ?? '—'} · {sel.engagement.code} · {t('arc_bay')} {sel.record.bay} · {t('arc_shelf')} {sel.record.shelf} · {t('arc_slot')} {sel.record.slot}</div>
            <div className="small" style={{ color: 'var(--dark-muted)' }}>{t('arc_date')} {fmtDate(sel.record.archivedAt)} · {t('arc_retention')} <span style={{ color: sel.record.retentionUntil <= state.today ? 'var(--crit)' : undefined }}>{fmtDate(sel.record.retentionUntil)}</span>{sel.record.retrievedBy ? ` · ${t('arc_retrieved').toLowerCase()} ${t('arc_by')} ${sel.record.retrievedBy}` : ''}</div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn dark sm" onClick={() => openEngagement(sel.engagement.id)}>{t('arc_open_eng')}</button>
              {(sel.record.status === 'archived' || sel.record.status === 'pending_destruction') && <button className="btn dark sm" onClick={() => apply((s) => retrieveArchive(s, sel.record.id), `${t('arc_retrieved')} · ${sel.record.reference}`)}>{t('arc_retrieve')}</button>}
              {sel.record.status === 'retrieved' && <button className="btn sm primary" onClick={() => apply((s) => returnArchive(s, sel.record.id), `${t('arc_archived')} · ${sel.record.reference}`)}>{t('arc_return')}</button>}
              {sel.record.status === 'pending_destruction' && isPartner && <button className="btn sm danger" onClick={() => { if (confirm(`${t('arc_destroy')} ${sel.record.reference} ?`)) apply((s) => destroyArchive(s, sel.record.id), `${t('arc_destroyed')} · ${sel.record.reference}`); }}>{t('arc_destroy')}</button>}
            </div>
          </div>
        ) : (
          <div className="panel" style={{ padding: '8px 12px' }}><span className="small" style={{ color: 'var(--dark-muted)' }}>{t('arc_select')}</span></div>
        )}
      </div>
    </>
  );
}
