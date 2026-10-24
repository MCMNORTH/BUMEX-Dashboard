import { create } from 'zustand';
import { buildDemo, DomainError, SEED_VERSION, signInAs, activateInvite, canSee, type State, type Id } from '@bumex/domain';
import type { Lang, Room } from './i18n';
import { makeT } from './i18n';

export type View = 'tower' | 'floor' | 'flat';
export type BarTab = 'tasks' | 'deadlines' | 'activity' | 'alerts';

export interface Toast {
  kind: 'ok' | 'error' | 'info';
  text: string;
  at: number;
}

export interface Quality {
  shadows: boolean;
  ao: boolean;
  people: boolean;
}

interface UI {
  view: View;
  entityId: Id | null;
  room: Room | null; // the module panel that is open (sheet in 3D, page in flat mode)
  tab: string | null; // initial tab requested for that panel
  focusRoom: string | null; // the 3D zone the camera is looking at (hotspot popover), without the panel open
  focusEngagementId: Id | null;
  focusTaskId: Id | null;
  archiveId: Id | null; // selected box on the rack
  hoverArchiveId: Id | null;
  rackFocus: boolean; // camera on the rack
  lang: Lang;
  hoverFloor: Id | null;
  hoverRoom: string | null;
  toast: Toast | null;
  webgl: boolean;
  fiscalYearLabel: string;
  transition: 'none' | 'to-floor' | 'to-tower';
  search: string;
  sidebarOpen: boolean;
  barOpen: boolean;
  barTab: BarTab;
  quality: Quality;
  sceneReady: boolean;
  sceneError: string | null;
  cameraBusy: boolean; // a camera flight is in progress
  flyout: 'floors' | null; // the sidebar's floor picker
  deletion: { table: string; rowId: Id; label: string; entityId?: Id } | null; // the confirmation dialog
}

interface Store {
  state: State;
  ui: UI;
  t: (k: string) => string;
  apply: (fn: (s: State) => State | [State, unknown], okMessage?: string) => boolean;
  setUi: (patch: Partial<UI>) => void;
  goTower: () => void;
  goFloor: (entityId: Id) => void;
  openRoom: (room: Room | null, tab?: string | null) => void;
  focusRoom: (room: string | null) => void;
  openArchive: (archiveId: Id | null, focus?: boolean) => void;
  setLang: (lang: Lang) => void;
  signIn: (userId: Id) => void;
  askDeletion: (d: { table: string; rowId: Id; label: string; entityId?: Id } | null) => void;
  setQuality: (patch: Partial<Quality>) => void;
  reset: () => void;
  toast: (kind: Toast['kind'], text: string) => void;
}

const STORAGE_KEY = `bumex-vanguard-v${SEED_VERSION}`;
const PREFS_KEY = 'bumex-vanguard-prefs';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function load(): { state: State; lang: Lang } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state: State; lang: Lang };
    if (!parsed.state?.entities?.length || !Array.isArray(parsed.state.tasks) || !Array.isArray(parsed.state.archives)) return null;
    return { state: { ...parsed.state, today: todayISO() }, lang: parsed.lang ?? 'fr' };
  } catch {
    return null;
  }
}

function loadPrefs(): { quality: Quality; sidebarOpen: boolean; barOpen: boolean } {
  const def = { quality: { shadows: true, ao: true, people: true }, sidebarOpen: false, barOpen: false };
  // ?q=low (or #q=low) starts in the light rendering mode: tablets, laptops without a GPU, automated tests
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search + '&' + location.hash.replace('#', '')).get('q') : null;
  if (q === 'low') return { ...def, quality: { shadows: false, ao: false, people: false } };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<typeof def>;
    return { quality: { ...def.quality, ...(p.quality ?? {}) }, sidebarOpen: !!p.sidebarOpen, barOpen: !!p.barOpen };
  } catch {
    return def;
  }
}

function savePrefs(ui: UI) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ quality: ui.quality, sidebarOpen: ui.sidebarOpen, barOpen: ui.barOpen }));
  } catch {
    /* ignore */
  }
}

let saveTimer: number | undefined;
function save(state: State, lang: Lang) {
  try {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, lang }));
      } catch {
        /* storage full or blocked: the session keeps working in memory */
      }
    }, 300);
  } catch {
    /* ignore */
  }
}

const initial = load();
let initialState = initial?.state ?? buildDemo(todayISO());
let welcome: string | null = null;
// An invitation link (#invite=<token>) activates the account and signs the person in.
try {
  const m = location.hash.match(/invite=([a-f0-9]+)/);
  if (m) {
    const [s1, u] = activateInvite(initialState, m[1]);
    initialState = s1;
    welcome = `Bienvenue ${u.name} · compte activé`;
    history.replaceState(null, '', location.pathname + location.search);
  }
} catch (e) {
  welcome = e instanceof Error ? e.message : String(e);
}
const initialLang: Lang = initial?.lang ?? 'fr';
const audit = initialState.entities.find((e) => e.code === 'AUD' && canSee(initialState, e.id)) ?? initialState.entities.find((e) => canSee(initialState, e.id)) ?? initialState.entities[0];
const currentFy = initialState.fiscalYears.find((f) => f.entityId === audit.id && initialState.today >= f.start && initialState.today <= f.end)?.label ?? String(new Date().getFullYear());
const webgl = typeof document !== 'undefined' ? webglAvailable() : false;
const prefs = loadPrefs();

export const MODULE_ONLY: Room[] = ['tasks', 'archives', 'reports', 'settings', 'penthouse'];

export const useStore = create<Store>((set, get) => ({
  state: initialState,
  ui: {
    view: webgl ? 'tower' : 'flat',
    entityId: audit.id,
    room: null,
    tab: null,
    focusRoom: null,
    focusEngagementId: null,
    focusTaskId: null,
    archiveId: null,
    hoverArchiveId: null,
    rackFocus: false,
    lang: initialLang,
    hoverFloor: null,
    hoverRoom: null,
    toast: welcome ? { kind: 'info', text: welcome, at: Date.now() } : webgl ? null : { kind: 'info', text: makeT(initialLang)('no_webgl'), at: Date.now() },
    webgl,
    fiscalYearLabel: currentFy,
    transition: 'none',
    search: '',
    sidebarOpen: prefs.sidebarOpen,
    barOpen: prefs.barOpen,
    barTab: 'tasks',
    quality: prefs.quality,
    sceneReady: false,
    sceneError: null,
    cameraBusy: false,
    flyout: null,
    deletion: null,
  },
  t: makeT(initialLang),
  apply: (fn, okMessage) => {
    try {
      const r = fn(get().state);
      const next = Array.isArray(r) ? r[0] : r;
      set({ state: next });
      save(next, get().ui.lang);
      if (okMessage) get().toast('ok', okMessage);
      return true;
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e);
      get().toast('error', msg);
      return false;
    }
  },
  setUi: (patch) => {
    set((s) => ({ ui: { ...s.ui, ...patch } }));
    if ('quality' in patch || 'sidebarOpen' in patch || 'barOpen' in patch) savePrefs(get().ui);
  },
  goTower: () => set((s) => ({ ui: { ...s.ui, view: s.ui.view === 'flat' ? 'flat' : 'tower', room: null, tab: null, focusRoom: null, hoverRoom: null, archiveId: null, rackFocus: false, transition: 'to-tower' } })),
  goFloor: (entityId) => set((s) => ({ ui: { ...s.ui, view: s.ui.view === 'flat' ? 'flat' : 'floor', entityId, room: null, tab: null, focusRoom: null, hoverFloor: null, archiveId: null, rackFocus: false, transition: 'to-floor' } })),
  openRoom: (room, tab = null) => set((s) => ({ ui: { ...s.ui, room, tab, focusRoom: room && !MODULE_ONLY.includes(room) ? room : s.ui.focusRoom, hoverRoom: null, rackFocus: room === 'archives' ? s.ui.rackFocus : false, focusTaskId: room === 'tasks' ? s.ui.focusTaskId : null, focusEngagementId: room === 'missions' ? s.ui.focusEngagementId : null } })),
  focusRoom: (room) => set((s) => ({ ui: { ...s.ui, focusRoom: room, rackFocus: false, archiveId: room === 'clients' ? s.ui.archiveId : null } })),
  openArchive: (archiveId, focus = true) => set((s) => ({ ui: { ...s.ui, archiveId, room: archiveId || s.ui.room === 'archives' ? 'archives' : s.ui.room, rackFocus: focus && s.ui.view === 'floor' ? true : s.ui.rackFocus, focusRoom: s.ui.view === 'floor' ? 'clients' : s.ui.focusRoom } })),
  setLang: (lang) => {
    set((s) => ({ ui: { ...s.ui, lang }, t: makeT(lang) }));
    save(get().state, lang);
  },
  signIn: (userId) => {
    try {
      const next = signInAs(get().state, userId);
      const entityId = get().ui.entityId;
      const visible = entityId && canSee(next, entityId) ? entityId : next.entities.find((e) => canSee(next, e.id))?.id ?? null;
      set((s) => ({ state: next, ui: { ...s.ui, entityId: visible, room: null, focusRoom: null, rackFocus: false, archiveId: null } }));
      save(next, get().ui.lang);
      get().toast('ok', `${next.session.actorName} · ${get().t(next.session.role)}`);
    } catch (e) {
      get().toast('error', e instanceof Error ? e.message : String(e));
    }
  },
  askDeletion: (d) => set((s) => ({ ui: { ...s.ui, deletion: d } })),
  setQuality: (patch) => {
    set((s) => ({ ui: { ...s.ui, quality: { ...s.ui.quality, ...patch } } }));
    savePrefs(get().ui);
  },
  reset: () => {
    const next = buildDemo(todayISO());
    set({ state: next });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    get().toast('ok', get().ui.lang === 'fr' ? 'Démo réinitialisée' : 'Demo reset');
  },
  toast: (kind, text) => {
    set((s) => ({ ui: { ...s.ui, toast: { kind, text, at: Date.now() } } }));
    window.setTimeout(() => {
      const cur = get().ui.toast;
      if (cur && Date.now() - cur.at >= 3900) set((s) => ({ ui: { ...s.ui, toast: null } }));
    }, 4000);
  },
}));

export function useT() {
  return useStore((s) => s.t);
}

// Which 3D room a module lives in (the camera focuses there when the module opens from the sidebar).
export const MODULE_ROOM: Partial<Record<Room, Room>> = { archives: 'clients', tasks: 'missions', reports: 'accounting' };
