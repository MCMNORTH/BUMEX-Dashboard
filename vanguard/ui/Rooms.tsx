import { useEffect } from 'react';
import { canOpenRoom, floorSignals } from '@bumex/domain';
import { useStore } from '../store';
import type { Room } from '../i18n';
import { AccountingPanel } from './panels/Accounting';
import { ClientsPanel } from './panels/Clients';
import { BankPanel } from './panels/Bank';
import { MissionsPanel, PenthousePanel } from './panels/Other';
import { SuppliersPanel } from './panels/Suppliers';
import { AssetsPanel } from './panels/Assets';
import { HrPanel } from './panels/Hr';
import { TaxPanel } from './panels/Tax';
import { TasksRoom } from '../one/Tasks'; // [bumex-one] the tasks are BUMEX One's tickets
import { MyDay } from '../one/MyDay'; // [bumex-one] the home's panel
import { ArchivesPanel } from './panels/Archives';
import { ReportsPanel } from './panels/Reports';
import { SettingsPanel } from './panels/Settings';
import { Icon } from './common';

export function RoomContent({ room, entityId, tab, compact }: { room: Room; entityId: string; tab?: string | null; compact?: boolean }) {
  switch (room) {
    case 'accounting': return <AccountingPanel entityId={entityId} initialTab={tab} />;
    case 'clients': return <ClientsPanel entityId={entityId} initialTab={tab} />;
    case 'bank': return <BankPanel entityId={entityId} initialTab={tab} />;
    case 'missions': return <MissionsPanel entityId={entityId} initialTab={tab} />;
    case 'suppliers': return <SuppliersPanel entityId={entityId} initialTab={tab} />;
    case 'assets': return <AssetsPanel entityId={entityId} initialTab={tab} />;
    case 'hr': return <HrPanel entityId={entityId} initialTab={tab} />;
    case 'tax': return <TaxPanel entityId={entityId} initialTab={tab} />;
    case 'penthouse': return <PenthousePanel />;
    case 'tasks': return <TasksRoom entityId={entityId} initialTab={tab} />;
    case 'archives': return <ArchivesPanel entityId={entityId} compact={compact} />;
    case 'reports': return <ReportsPanel entityId={entityId} />;
    case 'settings': return <SettingsPanel initialTab={tab} />;
    case 'myday': return <MyDay />; // [bumex-one]
  }
}

// The 2D panel that slides over the 3D scene. The archive panel stays narrow so the rack remains visible.
export function Sheet() {
  const { ui, t, openRoom, setUi } = useStore();
  useEffect(() => {
    document.body.style.cursor = '';
  }, []);
  if (!ui.room || !ui.entityId) return null;
  return (
    <>
      <div className="sheet-back" onClick={() => openRoom(null)} />
      <section className="sheet" role="dialog" aria-label={t(`room_${ui.room}`) === `room_${ui.room}` ? t(`nav_${ui.room}`) : t(`room_${ui.room}`)}>
        <div className="sheet-tools">
          <button className="btn sm" onClick={() => setUi({ view: 'flat' })}>{t('flat')}</button>
          <button className="btn sm" onClick={() => openRoom(null)} aria-label={t('close')} title={t('close')}><Icon name="close" size={15} /> {t('close')}</button>
        </div>
        <RoomContent room={ui.room} entityId={ui.entityId} tab={ui.tab} />
      </section>
    </>
  );
}

// Flat mode: the same panels as full pages, entity navigation on the left, the rail carries the modules.
export function FlatLayout() {
  const { state, ui, t, setUi, openRoom } = useStore();
  const entityId = ui.entityId ?? state.entities.find((e) => e.code === 'AUD')!.id;
  const entity = state.entities.find((e) => e.id === entityId)!;
  // [bumex-one] the first room the person may open (the missions are open to everyone)
  const room: Room = ui.room ?? (entity.isHolding ? (canOpenRoom(state, entityId, 'penthouse') ? 'penthouse' : 'tasks') : canOpenRoom(state, entityId, 'accounting') ? 'accounting' : 'missions');
  return (
    <div className="page">
      <nav className="nav" aria-label="Entités et salles">
        <h3>{t('entities')}</h3>
        {[...state.entities].sort((a, b) => a.floorOrder - b.floorOrder).map((e) => {
          const vis = floorSignals(state, e.id).visible;
          return (
            <button key={e.id} className={`${e.id === entityId ? 'on' : ''} ${vis ? '' : 'off'}`} disabled={!vis} onClick={() => { setUi({ entityId: e.id }); openRoom(e.isHolding ? 'penthouse' : ['tasks', 'reports', 'settings', 'archives'].includes(room) ? room : 'accounting'); }}>
              <span>{e.name}</span>
              <span className="small">{e.isHolding ? 'consolidé' : e.functionalCurrency}</span>
            </button>
          );
        })}
        <div className="small muted" style={{ padding: '14px 10px' }}>{t('demo_note')}</div>
      </nav>
      <main className="page-main">
        <RoomContent room={room} entityId={entityId} tab={ui.tab} />
      </main>
    </div>
  );
}
