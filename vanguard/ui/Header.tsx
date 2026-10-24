import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Room } from '../i18n';
import { Icon } from './common';
import emblemImage from '../assets/emblem.png'; // [bumex-one] Next imports images as objects
const emblem = emblemImage.src;

export function Header() {
  const { ui, state, t, setUi, goTower, goFloor, openRoom, setLang, focusRoom, openArchive } = useStore();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const entity = state.entities.find((e) => e.id === ui.entityId);
  const fys = useMemo(() => [...new Set(state.fiscalYears.map((f) => f.label))].sort().reverse(), [state.fiscalYears]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (e.key.toLowerCase() === 'f' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement) && !e.ctrlKey && !e.metaKey) {
        const s = useStore.getState();
        if (s.ui.view === 'flat' && s.ui.webgl) s.setUi({ view: 'tower', room: null, focusRoom: null, rackFocus: false });
        else if (s.ui.view !== 'flat') s.setUi({ view: 'flat' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { label: string; sub: string; go: () => void }[] = [];
    const enter = (entityId: string, room: Room, tab?: string) => { goFloor(entityId); openRoom(room, tab ?? null); };
    for (const c of state.customers) if (c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s)) out.push({ label: c.name, sub: `Client · ${state.entities.find((e) => e.id === c.entityId)?.name}`, go: () => enter(c.entityId, 'clients', 'customers') });
    for (const i of state.salesInvoices) if (i.number?.toLowerCase().includes(s)) out.push({ label: i.number!, sub: `Facture · ${state.customers.find((c) => c.id === i.customerId)?.name}`, go: () => enter(i.entityId, 'clients', 'invoices') });
    for (const a of state.accounts) if ((a.code.startsWith(s) || a.nameFr.toLowerCase().includes(s)) && a.entityId === (ui.entityId ?? a.entityId)) out.push({ label: `${a.code} ${a.nameFr}`, sub: `Compte · ${state.entities.find((e) => e.id === a.entityId)?.name}`, go: () => enter(a.entityId, 'accounting', 'gl') });
    for (const e of state.engagements) if (e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s)) out.push({ label: e.name, sub: `Mission · ${e.code}${e.status === 'completed' ? ' · terminée' : ''}`, go: () => { setUi({ focusEngagementId: e.id }); enter(e.entityId, 'missions'); } });
    for (const a of state.archives) { const eng = state.engagements.find((e) => e.id === a.engagementId); if (a.reference.toLowerCase().includes(s) || a.label.toLowerCase().includes(s)) out.push({ label: `${a.reference} · ${eng?.name ?? ''}`, sub: `Archive · ${a.bay}·${a.shelf}·${a.slot}`, go: () => { goFloor(a.entityId); openArchive(a.id, true); } }); }
    for (const tk of state.tasks) if (tk.title.toLowerCase().includes(s)) out.push({ label: tk.title, sub: `Tâche · ${tk.assignee} · ${tk.dueDate}`, go: () => { setUi({ focusTaskId: tk.id }); enter(tk.entityId, 'tasks', 'all'); } });
    return out.slice(0, 12);
  }, [q, state, ui.entityId, goFloor, openRoom, setUi, openArchive]);

  const roomLabel = (r: Room) => (t(`room_${r}`) === `room_${r}` ? t(`nav_${r}`) : t(`room_${r}`));
  return (
    <header className="header">
      <div className="brand" onClick={goTower} style={{ cursor: 'pointer' }} title={t('nav_overview')}>
        <img src={emblem} alt="" />
        <span><b>BUMEX</b> <span>VANGUARD</span></span>
      </div>
      <nav className="crumbs" aria-label="Fil d'Ariane">
        {ui.view === 'flat' ? (
          <>
            <span className="cur">{t('flat')}</span>
            {entity && (<><span aria-hidden="true">›</span><span className="cur">{entity.name}</span></>)}
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
                <span className="cur">{t(`room_${ui.focusRoom}`)}</span>
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
        {results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <button key={i} onClick={() => { r.go(); setQ(''); }}>
                <span>{r.label}</span>
                <span className="muted small">{r.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="hright">
        <select aria-label={t('fiscal_year')} value={ui.fiscalYearLabel} onChange={(e) => setUi({ fiscalYearLabel: e.target.value })}>
          {fys.map((f) => (
            <option key={f} value={f}>
              {t('fiscal_year')} {f}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Mode">
          <button className={`btn dark ${ui.view !== 'flat' ? 'on' : ''}`} disabled={!ui.webgl} title={ui.webgl ? '' : t('no_webgl')} onClick={() => setUi({ view: 'tower', room: null, focusRoom: null, rackFocus: false, transition: 'none' })}>
            {t('tower')}
          </button>
          <button className={`btn dark ${ui.view === 'flat' ? 'on' : ''}`} onClick={() => setUi({ view: 'flat' })}>
            {t('flat')}
          </button>
        </div>
        <button className="btn dark" onClick={() => setLang(ui.lang === 'fr' ? 'en' : 'fr')} aria-label="Langue">
          {t('lang')}
        </button>
        <button className="user-chip" onClick={() => openRoom(ui.room === 'settings' ? null : 'settings')} title={t('nav_settings')}>
          <i>{state.session.actorName.slice(0, 1).toUpperCase()}</i>
          <span>{t(state.session.role)}</span>
          <Icon name="settings" size={15} />
        </button>
      </div>
    </header>
  );
}
