import { useEffect, useMemo, useRef, useState } from 'react';
import { inMode, useStore } from '../store';
import type { Room } from '../i18n';
import emblemImage from '../assets/emblem.png'; // [bumex-one] Next imports images as objects
import { useBumexOneSearch } from '../one/search'; // [bumex-one] one search for everything
const emblem = emblemImage.src;
import { Select } from './Select';
import { Icon } from './common';
import { useScreen } from '../one/screen'; // [mobile]
import { goBack, useCanGoBack } from '../one/back'; // [mobile]
import { modalOpen } from '../one/modal';
import { NO_FISCAL_YEAR, fiscalYearChoices } from '../one/fiscal-years'; // [bumex-one] // [bumex-one] a dialog's keys are its own (2026-11-20)
import { setThemePref, useTheme } from '@/lib/theme'; // [bumex-one] light or dark (2026-11-19)

export function Header() {
  const { ui, state, t, setUi, goTower, goHome, goFloor, openRoom, setLang, focusRoom, openArchive } = useStore();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // [mobile] a phone's header: Back or the emblem, the screen's title, a search that opens over everything
  const { phone } = useScreen();
  const canBack = useCanGoBack();
  const [searching, setSearching] = useState(false);
  const searchOpen = phone && searching;
  const entity = state.entities.find((e) => e.id === ui.entityId);
  const fys = useMemo(() => fiscalYearChoices(state.fiscalYears.map((f) => f.label), ui.fiscalYearLabel), [state.fiscalYears, ui.fiscalYearLabel]); // [bumex-one] never blank (one/fiscal-years.ts)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen()) return; // [bumex-one] under a dialog, the page hears no key: Escape closes the dialog, not the room
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (document.activeElement === inputRef.current) {
          setQ('');
          inputRef.current?.blur();
          return;
        }
        const s = useStore.getState();
        if (s.ui.flyout) { s.setUi({ flyout: null }); return; }
        if (s.ui.room) s.openRoom(null);
        else if (s.ui.rackFocus) s.setUi({ rackFocus: false, archiveId: null });
        else if (s.ui.focusRoom) s.focusRoom(null);
        else if (s.ui.view === 'floor') s.goTower();
      }
      // ("F" switched Flat/3D: removed on 2026-11-02, it fired while typing in the rich-text editors; the header's buttons do it)
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { label: string; sub: string; go: () => void }[] = [];
    const enter = (entityId: string, room: Room, tab?: string) => { goFloor(entityId); openRoom(room, tab ?? null); };
    const mode = (entityId: string) => inMode(state, entityId); // [bumex-one] the test floor only in test mode, and alone then (0013)
    for (const c of state.customers) if (mode(c.entityId) && (c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s))) out.push({ label: c.name, sub: `Client · ${state.entities.find((e) => e.id === c.entityId)?.name}`, go: () => enter(c.entityId, 'clients', 'customers') });
    for (const i of state.salesInvoices) if (mode(i.entityId) && i.number?.toLowerCase().includes(s)) out.push({ label: i.number!, sub: `Facture · ${state.customers.find((c) => c.id === i.customerId)?.name}`, go: () => enter(i.entityId, 'clients', 'invoices') });
    for (const a of state.accounts) if (mode(a.entityId) && (a.code.startsWith(s) || a.nameFr.toLowerCase().includes(s)) && a.entityId === (ui.entityId ?? a.entityId)) out.push({ label: `${a.code} ${a.nameFr}`, sub: `Compte · ${state.entities.find((e) => e.id === a.entityId)?.name}`, go: () => enter(a.entityId, 'accounting', 'gl') });
    for (const e of state.engagements) if (mode(e.entityId) && (e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s))) out.push({ label: e.name, sub: `Mission · ${e.code}${e.status === 'completed' ? ' · terminée' : ''}`, go: () => { setUi({ focusEngagementId: e.id }); enter(e.entityId, 'missions'); } });
    for (const a of state.archives) { const eng = state.engagements.find((e) => e.id === a.engagementId); if (mode(a.entityId) && (a.reference.toLowerCase().includes(s) || a.label.toLowerCase().includes(s))) out.push({ label: `${a.reference} · ${eng?.name ?? ''}`, sub: `Archive · ${a.bay}·${a.shelf}·${a.slot}`, go: () => { goFloor(a.entityId); openArchive(a.id, true); } }); }
    for (const tk of state.tasks) { const key = (tk as { ticket?: { key?: string } }).ticket?.key ?? ''; /* [bumex-one] a ticket's key too (AUD-142) */ if (mode(tk.entityId) && (tk.title.toLowerCase().includes(s) || key.toLowerCase().startsWith(s))) out.push({ label: key ? `${key} · ${tk.title}` : tk.title, sub: `Tâche · ${tk.assignee} · ${tk.dueDate}`, go: () => { setUi({ focusTaskId: tk.id }); enter(tk.entityId, 'tasks', 'all'); } }); }
    return out.slice(0, 12);
  }, [q, state, ui.entityId, goFloor, openRoom, setUi, openArchive]);
  const oneResults = useBumexOneSearch(q); // [bumex-one] BUMEX One's records after Vanguard's
  const allResults = [...results, ...oneResults];

  const roomLabel = (r: Room) => (t(`room_${r}`) === `room_${r}` ? t(`nav_${r}`) : t(`room_${r}`));
  return (
    <header className={`header ${searchOpen ? 'search-open' : ''}`}>
      {phone && canBack && <button className="h-back" onClick={goBack} aria-label={ui.lang === 'fr' ? 'Retour' : 'Back'}><Icon name="back" size={20} /></button>}
      {phone && <span className="h-title">{roomLabel(ui.room ?? 'myday')}</span>}
      {phone && <button className="h-search" onClick={() => { setSearching(true); setTimeout(() => inputRef.current?.focus(), 0); }} aria-label={t('search_ph')}><Icon name="search" size={20} /></button>}
      {/* [bumex-one] Fluent's title bar (2026-11-19): the button that folds the navigation, the app's name, where one is */}
      {!phone && (
        <button className="h-menu" onClick={() => setUi({ sidebarOpen: !ui.sidebarOpen })} aria-label={ui.sidebarOpen ? t('collapse') : t('expand')} aria-expanded={ui.sidebarOpen} title={ui.sidebarOpen ? t('collapse') : t('expand')}>
          <Icon name="menu" size={20} />
        </button>
      )}
      <div className="brand" onClick={goHome} style={{ cursor: 'pointer' }} title={t('nav_overview')}>
        <img src={emblem} alt="" />
        <span><b>BUMEX</b> <span>Vanguard</span></span>
      </div>
      <nav className="crumbs" aria-label="Fil d'Ariane">
        {ui.view === 'flat' ? (
          <>
            {entity && <span className="cur">{entity.name}</span>}
          </>
        ) : (
          <>
            <button onClick={goTower}>{t('nav_overview')}</button>
            {ui.view === 'floor' && entity && (
              <>
                <span aria-hidden="true">›</span>
                {ui.room || ui.focusRoom ? <button onClick={() => { openRoom(null); focusRoom(null); }}>{entity.name}</button> : <span className="cur">{entity.name}</span>}
              </>
            )}
            {ui.view === 'floor' && ui.focusRoom && !ui.room && (
              <>
                <span aria-hidden="true">›</span>
                <span className="cur">{roomLabel(ui.focusRoom as Room)}</span>{/* [bumex-one] a work room (My work…) has a nav_ label, not a room_ one */}
              </>
            )}
            {ui.room && (
              <>
                <span aria-hidden="true">›</span>
                <span className="cur">{roomLabel(ui.room)}</span>
              </>
            )}
          </>
        )}
      </nav>
      <div className="search">
        <label htmlFor="search" style={{ position: 'absolute', left: -9999 }}>Rechercher</label>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
        <input id="search" ref={inputRef} type="search" placeholder={t('search_ph')} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {allResults.length > 0 && (
          <div className="search-results">
            {allResults.map((r, i) => (
              <button key={i} onClick={() => { r.go(); setQ(''); setSearching(false); }}>
                <span>{r.label}</span>
                <span className="muted small">{r.sub}</span>
              </button>
            ))}
          </div>
        )}
        {searchOpen && <button className="h-cancel" onClick={() => { setQ(''); setSearching(false); }}>{ui.lang === 'fr' ? 'Annuler' : 'Cancel'}</button>}
      </div>
      <div className="hright">
        <Select className="dark" aria-label={t('fiscal_year')} value={fys.length ? ui.fiscalYearLabel : ''} disabled={!fys.length} onChange={(e) => setUi({ fiscalYearLabel: e.target.value })}>
          {fys.length ? fys.map((f) => (
            <option key={f} value={f}>
              {t('fiscal_year')} {f}
            </option>
          )) : <option value="">{ui.lang === 'en' ? NO_FISCAL_YEAR[1] : NO_FISCAL_YEAR[0]}</option>}
        </Select>
        {ui.scene3d && ( // [bumex-one] the building is the person's option (0010)
          <div className="seg" role="group" aria-label="Mode">
            <button className={`btn dark ${ui.view !== 'flat' ? 'on' : ''}`} disabled={!ui.webgl} title={ui.webgl ? '' : t('no_webgl')} onClick={() => setUi({ view: 'tower', room: null, focusRoom: null, rackFocus: false, transition: 'none' })}>
              {t('tower')}
            </button>
            <button className={`btn dark ${ui.view === 'flat' ? 'on' : ''}`} onClick={() => setUi({ view: 'flat' })}>
              {t('flat')}
            </button>
          </div>
        )}
        <button className="btn dark" onClick={() => setLang(ui.lang === 'fr' ? 'en' : 'fr')} aria-label="Langue">
          {t('lang')}
        </button>
        <ThemeButton fr={ui.lang === 'fr'} />
        {/* [bumex-one] the person's chip is the account menu now (components/layout/account-menu.tsx) */}
        {/* [bumex-one] room for BUMEX One's controls (refresh, notifications, theme, account: vanguard-shell.tsx) */}
        <span aria-hidden="true" style={{ flex: 'none', width: 'var(--bumex-tools, 132px)' }} />
      </div>
    </header>
  );
}

// [bumex-one] Light or dark, one click from the title bar (the system's choice: Settings › Display, or the account menu)
function ThemeButton({ fr }: { fr: boolean }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? (fr ? 'Thème sombre' : 'Dark theme') : (fr ? 'Thème clair' : 'Light theme');
  return (
    <button className="btn dark h-theme" onClick={() => setThemePref(next)} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
