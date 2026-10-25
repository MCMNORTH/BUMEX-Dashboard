import { create } from 'zustand';
import { DomainError, canSee, setChainBreaks, type State, type Id } from '@bumex/domain';
import type { Lang, Room } from './i18n';
import { makeT } from './i18n';
// [bumex-one] The state is the ERP database's: the page brings it (hydrate), each change is recorded and sent to the
// server, which replays it and answers with the database's state (lib/erp/vanguard). Nothing is kept in the browser.
import { reloadVanguardAction, runVanguardChangeAction, vanguardVersionAction } from '@/lib/erp/vanguard/actions';
import { record, type VanguardChange } from '@/lib/erp/vanguard/record';
import type { VanguardData, VanguardResult } from '@/lib/erp/vanguard/run';

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
  loadedAt: number; // [bumex-one] when the server read the state shown
  version: number; // [bumex-one] the database's version of that state (refreshIfChanged)
  ui: UI;
  t: (k: string) => string;
  apply: (fn: (s: State) => State | [State, unknown], okMessage?: string) => boolean;
  hydrate: (data: VanguardData) => void; // [bumex-one]
  refreshIfChanged: () => void; // [bumex-one] reads the database again when someone else changed it
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

// [bumex-one] Until hydrate(): VanguardApp hydrates the store before anything renders.
const EMPTY: State = {
  group: { id: '', name: '', presentationCurrency: 'MRU' },
  session: { userId: '', actorId: '', actorName: '', role: 'intern', entityIds: [], modules: [] },
  today: todayISO(),
  entities: [], fxRates: [], fiscalYears: [], periods: [], accounts: [], journals: [], mappings: [], taxCodes: [], taxRules: [], entries: [],
  chains: {}, counters: {}, customers: [], salesInvoices: [], creditNotes: [], customerPayments: [], allocations: [], suppliers: [],
  supplierInvoices: [], supplierPayments: [], loans: [], loanPayments: [], bankAccounts: [], bankTransactions: [], bankRules: [], engagements: [],
  assignments: [], assetCategories: [], assets: [], depreciationRuns: [], employees: [], payrollRules: [], payrollRuns: [], users: [],
  deletionRequests: [], tasks: [], archives: [], auditLog: [], seq: 0,
};
// BUMEX One's language (it keeps the two apps on the same one: components/vanguard/vanguard-app.tsx)
const initialLang: Lang = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'fr';
const webgl = typeof document !== 'undefined' ? webglAvailable() : false;
const prefs = loadPrefs();

// The floor shown first: BUMEX Audit when the person sees it, else the first floor they see.
function defaultEntity(state: State) {
  return state.entities.find((e) => e.code === 'AUD' && canSee(state, e.id)) ?? state.entities.find((e) => canSee(state, e.id)) ?? state.entities[0];
}

// [bumex-one] Changes reach the server one after the other. Its answer replaces the screen's state once no other
// change is on its way (a later one was made on top of this one and is replayed on the database's state as well).
let pending = 0;
let checking = false;
let queue: Promise<void> = Promise.resolve();
function send(change: VanguardChange) {
  pending++;
  queue = queue.then(async () => {
    const lang = useStore.getState().ui.lang;
    const result: VanguardResult = await runVanguardChangeAction(change).catch(() => ({
      ok: false as const,
      error: lang === 'fr' ? 'Serveur injoignable : la modification n\'est pas enregistrée.' : 'Server unreachable: the change was not saved.',
    }));
    pending--;
    if (!result.ok) useStore.getState().toast('error', result.error);
    if (pending > 0) return;
    if (result.state) useStore.getState().hydrate(result as VanguardData);
    else if (!result.ok) await reload();
  });
}
async function reload() {
  const result = await reloadVanguardAction().catch(() => null);
  if (result?.state) useStore.getState().hydrate(result as VanguardData);
  return Boolean(result?.state);
}

export const MODULE_ONLY: Room[] = ['tasks', 'archives', 'reports', 'settings', 'penthouse', 'myday']; // [bumex-one] myday

export const useStore = create<Store>((set, get) => ({
  state: EMPTY,
  loadedAt: 0,
  version: 0,
  ui: {
    view: webgl ? 'tower' : 'flat',
    entityId: null,
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
    toast: webgl ? null : { kind: 'info', text: makeT(initialLang)('no_webgl'), at: Date.now() },
    webgl,
    fiscalYearLabel: String(new Date().getFullYear()),
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
      const { result: r, change } = record(get().state, fn); // [bumex-one] the engine calls, for the server
      const next = Array.isArray(r) ? r[0] : r;
      set({ state: next });
      if (change) send(change);
      if (okMessage) get().toast('ok', okMessage);
      return true;
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e);
      get().toast('error', msg);
      return false;
    }
  },
  // [bumex-one] The database's state, unless the store already shows a newer one. The floor stays when the person
  // still sees it; the fiscal year is chosen on the first state.
  hydrate: (data) => {
    if (data.loadedAt <= get().loadedAt) return;
    setChainBreaks(data.chainBreaks);
    const state = data.state;
    const { ui, loadedAt } = get();
    const keep = ui.entityId && state.entities.some((e) => e.id === ui.entityId) && canSee(state, ui.entityId);
    const entity = keep ? state.entities.find((e) => e.id === ui.entityId) : defaultEntity(state);
    const fiscalYearLabel = loadedAt ? ui.fiscalYearLabel : state.fiscalYears.find((f) => f.entityId === entity?.id && state.today >= f.start && state.today <= f.end)?.label ?? ui.fiscalYearLabel;
    set({ state, loadedAt: data.loadedAt, version: data.version, ui: { ...ui, entityId: entity?.id ?? null, fiscalYearLabel } });
  },
  refreshIfChanged: () => {
    if (pending > 0 || checking) return;
    checking = true;
    void vanguardVersionAction()
      .then((version) => (version > get().version && pending === 0 ? reload() : false))
      .catch(() => false)
      .finally(() => (checking = false));
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
  },
  // [bumex-one] The person is the one signed in to BUMEX One, with their ERP access.
  signIn: () => {
    get().toast('info', get().ui.lang === 'fr' ? 'Votre compte et vos accès ERP viennent de BUMEX One.' : 'Your account and ERP access come from BUMEX One.');
  },
  askDeletion: (d) => set((s) => ({ ui: { ...s.ui, deletion: d } })),
  setQuality: (patch) => {
    set((s) => ({ ui: { ...s.ui, quality: { ...s.ui.quality, ...patch } } }));
    savePrefs(get().ui);
  },
  // [bumex-one] Reads the database again.
  reset: () => {
    void reload().then((ok) => get().toast(ok ? 'ok' : 'error', get().ui.lang === 'fr' ? (ok ? 'Données rechargées' : 'Serveur injoignable') : ok ? 'Data reloaded' : 'Server unreachable'));
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
