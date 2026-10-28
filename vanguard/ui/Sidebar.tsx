import { useMemo } from 'react';
import { allFloors, floorSignals, canOpenRoom, taskStats, archiveQueue } from '@bumex/domain';
import { useStore, MODULE_ROOM } from '../store';
import type { Room } from '../i18n';
import { Icon, Lamp } from './common';
import { MyDayButton } from '../one/MyDay'; // [bumex-one]

// The left rail: slim by default, expandable for labels. It routes to the existing modules and the new ones; the
// 3D camera follows (a module opened from here focuses its room first) and the flat mode shows the same page.

interface Item { id: string; icon: string; label: string; badge?: number; room?: Room; off?: boolean; kbd?: string }

export function Sidebar() {
  const { state, ui, t, setUi, goTower, goFloor, openRoom, focusRoom } = useStore();
  const floors = useMemo(() => allFloors(state), [state]);
  const entityId = ui.entityId ?? state.entities.find((e) => e.code === 'AUD')!.id;
  const entity = state.entities.find((e) => e.id === entityId)!;
  const f = useMemo(() => floorSignals(state, entityId), [state, entityId]);
  const ts = useMemo(() => taskStats(state, entityId), [state, entityId]);
  const toArchive = archiveQueue(state, entityId).length;
  const allowed = (r: string) => canOpenRoom(state, entityId, r);
  const atOverview = (ui.view === 'tower' && !ui.room) || (ui.view === 'flat' && (ui.room === 'overview' || !ui.room)); // [bumex-one] flat: the floor's overview
  const modules: Item[] = entity.isHolding
    ? [{ id: 'penthouse', icon: 'penthouse', label: t('room_penthouse'), room: 'penthouse', off: !allowed('penthouse') }]
    : [
        { id: 'accounting', icon: 'accounting', label: t('room_accounting'), badge: f.drafts, room: 'accounting', off: !allowed('accounting') },
        { id: 'bank', icon: 'bank', label: t('room_bank'), badge: f.unmatchedBank, room: 'bank', off: !allowed('bank') },
        { id: 'clients', icon: 'clients', label: t('room_clients'), badge: f.overdueCount, room: 'clients', off: !allowed('clients') },
        { id: 'missions', icon: 'missions', label: t('room_missions'), badge: f.lateEngagements, room: 'missions', off: !allowed('missions') },
        { id: 'suppliers', icon: 'suppliers', label: t('room_suppliers'), badge: f.pendingApprovals, room: 'suppliers', off: !allowed('suppliers') },
        { id: 'assets', icon: 'assets', label: t('room_assets'), room: 'assets', off: !allowed('assets') },
        { id: 'hr', icon: 'hr', label: t('room_hr'), room: 'hr', off: !allowed('hr') },
        { id: 'tax', icon: 'tax', label: t('room_tax'), room: 'tax', off: !allowed('tax') },
      ];
  // [bumex-one] the person's work together (asked on 2026-10-27): My day, My work, the tasks, the time, the archives
  const work: Item[] = [
    { id: 'mywork', icon: 'mywork', label: t('nav_mywork'), room: 'mywork' },
    { id: 'tasks', icon: 'tasks', label: t('nav_tasks'), badge: ts.overdue, room: 'tasks' },
    { id: 'time', icon: 'clock', label: t('nav_time'), room: 'time' }, // [bumex-one] BUMEX One's timesheet (vanguard/one/Time.tsx)
    { id: 'archives', icon: 'archives', label: t('nav_archives'), badge: toArchive, room: 'archives', off: entity.isHolding || !allowed('archives') },
  ];
  const reports: Item = { id: 'reports', icon: 'reports', label: t('nav_reports'), room: 'reports' };
  const open = (item: Item) => {
    if (item.off || !item.room) return;
    if (ui.view === 'tower') {
      // from the exterior, a module takes you into the floor first, then opens the panel over its room
      setUi({ view: 'floor', transition: 'to-floor', focusRoom: MODULE_ROOM[item.room] ?? (item.room as string), room: item.room, tab: null, rackFocus: item.room === 'archives' });
      return;
    }
    if (ui.room === item.room) { openRoom(null); return; }
    if (ui.view === 'floor') {
      const target = MODULE_ROOM[item.room] ?? item.room;
      if (target !== 'penthouse' && !['tasks', 'reports', 'settings'].includes(target as string)) focusRoom(target as string);
      if (item.room === 'archives') setUi({ rackFocus: true });
    }
    openRoom(item.room);
  };
  const Btn = ({ item, on }: { item: Item; on: boolean }) => (
    <button className={`sb-item ${on ? 'on' : ''} ${item.off ? 'off' : ''}`} onClick={() => open(item)} aria-label={item.label} aria-current={on ? 'page' : undefined} disabled={item.off}>
      <Icon name={item.icon} />
      <span className="lbl">{item.label}</span>
      {item.badge ? <span className="badge">{item.badge}</span> : null}
      <span className="tip">{item.label}{item.off ? ' · accès non autorisé' : ''}{item.kbd ? <kbd>{item.kbd}</kbd> : null}</span>
    </button>
  );
  return (
    <nav className={`rail ${ui.sidebarOpen ? 'open' : ''}`} aria-label="Navigation">
      <div className="grp">
        <button className={`sb-item ${atOverview ? 'on' : ''}`} onClick={() => { if (ui.view === 'flat') openRoom('overview'); else goTower(); }} aria-label={t('nav_overview')}>
          <Icon name="overview" />
          <span className="lbl">{t('nav_overview')}</span>
          <span className="tip">{t('nav_overview')}<kbd>Échap</kbd></span>
        </button>
        <button className={`sb-item ${(ui.view === 'floor' && !ui.room) || ui.flyout === 'floors' ? 'on' : ''}`} onClick={() => setUi({ flyout: ui.flyout === 'floors' ? null : 'floors' })} aria-label={t('nav_floors')} aria-haspopup="menu" aria-expanded={ui.flyout === 'floors'}>
          <Icon name="floors" />
          <span className="lbl">{entity.name}</span>
          <span className="tip">{t('nav_floors')} · {entity.name}</span>
        </button>
      </div>
      {ui.flyout === 'floors' && (
        <>
          <div className="flyout-back" onClick={() => setUi({ flyout: null })} />
          <div className="flyout" role="menu" aria-label={t('nav_floors')}>
            <h2>{t('group')}</h2>
            {floors.map((f) => (
              <button
                key={f.entity.id}
                role="menuitem"
                className={`${f.entity.id === entityId ? 'cur' : ''} ${f.visible ? '' : 'off'}`}
                disabled={!f.visible}
                onClick={() => {
                  setUi({ flyout: null });
                  if (ui.view === 'flat') { setUi({ entityId: f.entity.id }); openRoom(f.entity.isHolding ? 'penthouse' : ['tasks', 'reports', 'settings', 'archives', 'overview', 'missions'].includes(ui.room ?? '') ? ui.room : 'overview'); return; } // [bumex-one] the floor's overview first
                  goFloor(f.entity.id);
                  if (f.entity.isHolding) openRoom('penthouse');
                }}
              >
                <span><b>{f.entity.isTest ? '−1' : state.entities.filter((e) => !e.isTest).length - f.entity.floorOrder}</b> {f.entity.name}<span className="small muted" style={{ marginLeft: 6 }}>{f.entity.activity}</span></span>
                {f.visible ? <span className="sigs"><Lamp kind={f.cashSignal} letter="T" /><Lamp kind={f.overdueSignal} letter="C" /><Lamp kind={f.engagementSignal} letter="M" /><Lamp kind={f.draftSignal === 'good' ? 'off' : f.draftSignal} letter="É" /></span> : <span className="small">non autorisé</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="grp">
        <div className="grp-h">{t('grp_work')}</div>
        <MyDayButton />{/* [bumex-one] the home's panel */}
        {work.map((m) => <Btn key={m.id} item={m} on={ui.room === m.room} />)}
      </div>
      <div className="grp">
        <div className="grp-h">{t('grp_modules')}</div>
        {modules.map((m) => <Btn key={m.id} item={m} on={ui.room === m.room} />)}
        <Btn item={reports} on={ui.room === 'reports'} />
      </div>
      <div className="grow" />
      <div className="grp">
        <Btn item={{ id: 'settings', icon: 'settings', label: t('nav_settings'), room: 'settings' }} on={ui.room === 'settings'} />
        <button className="sb-item" onClick={() => setUi({ sidebarOpen: !ui.sidebarOpen })} aria-label={ui.sidebarOpen ? t('collapse') : t('expand')} aria-expanded={ui.sidebarOpen}>
          <Icon name={ui.sidebarOpen ? 'chevronLeft' : 'chevronRight'} />
          <span className="lbl">{t('collapse')}</span>
          <span className="tip">{t('expand')}</span>
        </button>
      </div>
    </nav>
  );
}
