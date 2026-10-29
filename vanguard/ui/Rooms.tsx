import { useEffect } from 'react';
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
import { MyWorkRoom } from '../one/MyWork'; // [bumex-one] everything the person has to do
import { TimeRoom } from '../one/Time'; // [bumex-one]
import { Inbox } from '../one/Inbox'; // [bumex-one]
import { OverviewRoom } from '../one/Overview'; // [bumex-one] the floor's overview
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
    case 'archives': return <ArchivesPanel entityId={entityId} compact={compact} initialTab={tab} />; // [bumex-one] initialTab
    case 'reports': return <ReportsPanel entityId={entityId} />;
    case 'settings': return <SettingsPanel initialTab={tab} />;
    case 'myday': return <MyDay initialTab={tab} />; // [bumex-one]
    case 'mywork': return <MyWorkRoom entityId={entityId} initialTab={tab} />; // [bumex-one] its board, its list, a ticket (tab)
    case 'time': return <TimeRoom initialTab={tab} />; // [bumex-one] BUMEX One's timesheet
    case 'inbox': return <Inbox />; // [bumex-one] BUMEX One's notifications
    case 'overview': return <OverviewRoom entityId={entityId} initialTab={tab} />; // [bumex-one] the floor at a glance
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
        <TestFloorBanner entityId={ui.entityId} />
        <RoomContent room={ui.room} entityId={ui.entityId} tab={ui.tab} />
      </section>
    </>
  );
}

// Flat mode: the same panels as full pages; the rail carries the floors and the modules.
// [bumex-one] the test floor (the basement, 0011) says so on every room: what is done there stays there. In test mode
// (0013) every room shows only test data, the cross-floor ones too (My day, My work…): the banner says so, with the way out.
function TestFloorBanner({ entityId }: { entityId: string }) {
  const test = useStore((s) => s.state.session.testMode === true || Boolean(s.state.entities.find((e) => e.id === entityId)?.isTest));
  const home = useStore((s) => s.state.entities.find((e) => !e.isTest && e.code === 'AUD')?.id ?? s.state.entities.find((e) => !e.isTest && !e.isHolding)?.id);
  const fr = useStore((s) => s.ui.lang === 'fr');
  const setUi = useStore((s) => s.setUi);
  if (!test) return null;
  return (
    <div className="banner warn test-banner" role="note" style={{ margin: '0 0 10px' }}>
      <span>
        <b>{fr ? 'Mode test · étage de test (sous-sol)' : 'Test mode · test floor (basement)'}</b>
        {fr ? " · vous ne voyez que les données de test, et rien de ce qui se fait ici n'apparaît ailleurs : ni e-mails, ni chiffres du groupe, ni feuilles de temps réelles."
          : ' · you see test data only, and nothing done here shows anywhere else: no e-mails, no group figures, no real timesheets.'}
      </span>
      {home && <button className="btn sm" onClick={() => setUi({ entityId: home, room: null, tab: null })}>{fr ? 'Quitter le mode test' : 'Leave test mode'}</button>}
    </div>
  );
}

export function FlatLayout() {
  const { state, ui } = useStore();
  const entityId = ui.entityId ?? state.entities.find((e) => e.code === 'AUD')!.id;
  // [bumex-one] the floor's overview first (asked on 2026-10-28; open to everyone, each part within the person's rights)
  const room: Room = ui.room ?? 'overview';
  return (
    <div className="page">
      {/* [bumex-one] no entity list here: the floor is chosen from the rail (ui/Sidebar.tsx) */}
      <main className="page-main">
        <TestFloorBanner entityId={entityId} />
        <RoomContent room={room} entityId={entityId} tab={ui.tab} />
      </main>
    </div>
  );
}
