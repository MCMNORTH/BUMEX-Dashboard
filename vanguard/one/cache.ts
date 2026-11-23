import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NOTIFICATIONS_CHANGED } from '@/hooks/use-notifications';
import { onDataChanged, sync, useStore } from '../store';

// What a screen reads from the server, kept while the app is open (asked on 2026-11-22: every visit of a page asked the
// server again, though nothing had changed). A page shows what it read last at once, and reads again only when:
// - it was never read, or a change made it stale: a table it depends on moved (`on`: the audited tables the store's
//   sync reports, task, time_entry, engagement…, "person" for the people, "erp" for a state read whole), or the
//   person's own change named it (invalidate(), with the same words or a tag of its own: "ticket:<id>", "roadmap"…);
// - its `fresh` time ran out (what the audit log does not see: comments, sub-tasks, milestones, notifications…): it is
//   still shown, and read again behind it;
// - ↻ asks for it (refreshPage: what the page shows, and the store's state).
// Several screens asking the same thing at once share one call. A change read while a page is shown reads it again
// behind what it shows; the pages not shown are read when next opened. Nothing is kept across people or modes: the
// cache is emptied when the signed-in person or the test mode changes, and lives in memory only.
//
//   const { data, error, loading, refresh, set } = useCached(['mywork'], () => myWorkAction(), WORK_POLICY);
//   invalidate(['ticket:' + id]);   // after a change the server accepted

export type Policy = {
  /** ms: what was read is shown as is, and not asked again, within this time (0: read again behind it at each visit). */
  fresh: number;
  /** what makes it stale: audited tables (task, time_entry, engagement, customer…), "person", "erp", or tags of its own. */
  on?: string[];
  /** ms: read again behind what is shown, while it is shown and the window is in view (data others change that the audit log does not see). */
  poll?: number;
};

export type Cached<T> = {
  data: T | undefined;
  error: string | null;
  /** nothing to show yet, being read */
  loading: boolean;
  /** shown, and being read again behind it */
  refreshing: boolean;
  /** when it was last read (ms), 0 never */
  updatedAt: number;
  /** read it again now (shown meanwhile); since: a change's time, a read started after it is shared */
  refresh: (since?: number) => Promise<void>;
  /** what the screen knows it became (a change's answer): kept, as if read */
  set: (next: T | ((previous: T | undefined) => T)) => void;
};

type Snapshot = Omit<Cached<unknown>, 'refresh' | 'set'>;
const EMPTY: Snapshot = { data: undefined, error: null, loading: false, refreshing: false, updatedAt: 0 };
const PENDING: Snapshot = { ...EMPTY, loading: true }; // asked for, not read yet

type Entry = {
  key: string;
  data: unknown;
  has: boolean;
  error: string | null;
  at: number;
  stale: boolean;
  promise: Promise<void> | null;
  startedAt: number; // when the running read started
  turn: number; // in which turn of the event loop
  again: Promise<void> | null; // one more read after the running one (it may have started before a change)
  fetcher: () => Promise<unknown>;
  policy: Policy;
  shown: number;
  timer: number;
  listeners: Set<() => void>;
  snapshot: Snapshot;
};

const entries = new Map<string, Entry>();
const anyListeners = new Set<() => void>();
let scope = '';
let confirmedAt = 0; // when the store's state was last found current (sync answered)

const snap = (e: Entry): Snapshot => ({ data: e.data, error: e.error, loading: !e.has && e.promise !== null, refreshing: e.has && e.promise !== null, updatedAt: e.at });
function changed(e: Entry) {
  e.snapshot = snap(e);
  e.listeners.forEach((l) => l());
  anyListeners.forEach((l) => l());
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error ?? 'unavailable'));

// The turns of the event loop: two calls of the same turn (an invalidate() then a refresh() of what it read) share a read.
let turnNumber = 0;
let turnEnding = false;
function currentTurn() {
  if (!turnEnding) { turnEnding = true; queueMicrotask(() => { turnNumber += 1; turnEnding = false; }); }
  return turnNumber;
}

// since: the read must see what changed by then (a change's time; "turn": a change just made, before this turn), so a
// read already running that started earlier is followed by another; without, a running read is shared as it is
type Since = number | 'turn';
function read(e: Entry, since?: Since): Promise<void> {
  if (e.promise) {
    if (since === undefined || (since === 'turn' ? e.turn === currentTurn() : e.startedAt >= since)) return e.promise;
    if (!e.again) e.again = e.promise.then(() => { e.again = null; return read(e); });
    return e.again;
  }
  e.startedAt = Date.now();
  e.turn = currentTurn();
  const asked = scope;
  if (!e.has) e.error = null; // a failure of an earlier visit is not shown again while the next read runs
  const reading: Promise<void> = e
    .fetcher()
    .then(
      (data) => {
        if (asked !== scope || entries.get(e.key) !== e) return; // read for someone else, or forgotten meanwhile
        e.data = data;
        e.has = true;
        e.error = null;
        e.at = Date.now();
        e.stale = false;
      },
      (error: unknown) => {
        if (asked === scope && entries.get(e.key) === e) e.error = message(error);
      },
    )
    .finally(() => {
      if (e.promise === reading) e.promise = null; // not a later read's (the person changed meanwhile)
      changed(e);
    });
  e.promise = reading;
  changed(e);
  return reading;
}

// at most this many reads kept: the ones shown least recently, and not shown now, go first
const MAX_ENTRIES = 300;

function entryFor(key: string, fetcher: () => Promise<unknown>, policy: Policy): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { key, data: undefined, has: false, error: null, at: 0, stale: false, promise: null, startedAt: 0, turn: -1, again: null, fetcher, policy, shown: 0, timer: 0, listeners: new Set(), snapshot: PENDING };
    entries.set(key, e);
    for (const old of entries.values()) {
      if (entries.size <= MAX_ENTRIES) break;
      if (old.shown === 0 && old.listeners.size === 0 && old !== e) entries.delete(old.key);
    }
  }
  return e;
}

const due = (e: Entry) => !e.has || e.stale || Date.now() - e.at >= e.policy.fresh;

function show(e: Entry) {
  e.shown += 1;
  entries.delete(e.key); // the most recently shown last (MAX_ENTRIES)
  entries.set(e.key, e);
  if (e.shown === 1 && e.policy.poll) {
    e.timer = window.setInterval(() => { if (document.visibilityState === 'visible') void read(e); }, e.policy.poll);
  }
  if (due(e)) void read(e);
}

function hide(e: Entry) {
  e.shown = Math.max(0, e.shown - 1);
  if (e.shown === 0 && e.timer) { window.clearInterval(e.timer); e.timer = 0; }
}

/** What the server says for this key, shown at once when read before; read again only when stale (see above). */
export function useCached<T>(parts: unknown[] | null, fetcher: () => Promise<T>, policy: Policy): Cached<T> {
  const key = parts ? JSON.stringify(parts) : null;
  const latest = useRef({ fetcher, policy });
  useEffect(() => { latest.current = { fetcher, policy }; });

  const subscribe = useCallback((listener: () => void) => {
    if (!key) return () => undefined;
    const e = entryFor(key, () => latest.current.fetcher(), latest.current.policy);
    e.listeners.add(listener);
    return () => { e.listeners.delete(listener); };
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, () => (key ? (entries.get(key)?.snapshot ?? PENDING) : EMPTY), () => (key ? PENDING : EMPTY));

  useEffect(() => {
    if (!key) return;
    const e = entryFor(key, () => latest.current.fetcher(), latest.current.policy);
    e.fetcher = () => latest.current.fetcher();
    e.policy = latest.current.policy;
    show(e);
    return () => hide(e);
  }, [key]);

  const refresh = useCallback(async (since?: number) => {
    const e = key ? entries.get(key) : undefined;
    if (e) await read(e, typeof since === 'number' ? since : 'turn'); // (an event when given as a handler)
  }, [key]);
  const set = useCallback((next: T | ((previous: T | undefined) => T)) => {
    const e = key ? entries.get(key) : undefined;
    if (!e) return;
    e.data = typeof next === 'function' ? (next as (p: T | undefined) => T)(e.data as T | undefined) : next;
    e.has = true;
    e.error = null;
    e.at = Date.now();
    e.stale = false;
    changed(e);
  }, [key]);

  return { ...(snapshot as Snapshot & { data: T | undefined }), refresh, set };
}

/** The time of a change just made, for refresh(since) and invalidate(words, since): a read started after it is shared. */
export const changeTime = () => Date.now();

/** What was read last, still shown while another key is read (a week, a year, a search: no skeleton between two). */
export function useLastRead<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value !== undefined ? value : last;
}

/** What these changes make stale: read again now where shown (the promise: those reads), at the next visit elsewhere. since: when the change was made (default: just now). */
export function invalidate(words: string[], since: Since = 'turn'): Promise<void> {
  const reads: Promise<void>[] = [];
  if (!words.length) return Promise.resolve();
  for (const e of entries.values()) {
    if (!e.policy.on?.some((w) => words.includes(w))) continue;
    e.stale = true;
    if (e.shown > 0) reads.push(read(e, since));
  }
  return Promise.all(reads).then(() => undefined);
}

/** Forget what was read under these keys (a record deleted): read again where shown. */
export function forget(parts: unknown[]) {
  const e = entries.get(JSON.stringify(parts));
  if (!e) return;
  e.stale = true;
  if (e.shown > 0) void read(e, 'turn');
}

/** ↻: what the page shows read again (and the store's state brought up to date), what it showed kept meanwhile; pressed again while it runs, the same refresh. */
let refreshing: Promise<{ ok: boolean }> | null = null;
export function refreshPage(): Promise<{ ok: boolean }> {
  if (!refreshing) refreshing = refreshShown().finally(() => { refreshing = null; });
  return refreshing;
}
async function refreshShown(): Promise<{ ok: boolean }> {
  const shown = [...entries.values()].filter((e) => e.shown > 0);
  const asked = Date.now();
  const [synced] = await Promise.all([sync(), ...shown.map((e) => read(e, asked))]);
  if (synced) confirmedAt = Date.now();
  anyListeners.forEach((l) => l());
  return { ok: synced && shown.every((e) => !e.error) };
}

/** When what the page shows was last read: its oldest read, and the store's state (checked every 30 seconds). */
export function usePageUpdatedAt(): { at: number; busy: boolean } {
  const subscribe = useCallback((listener: () => void) => { anyListeners.add(listener); return () => { anyListeners.delete(listener); }; }, []);
  const key = useSyncExternalStore(subscribe, () => {
    const shown = [...entries.values()].filter((e) => e.shown > 0);
    const at = Math.min(confirmedAt || Infinity, ...shown.map((e) => e.at || Infinity));
    return `${Number.isFinite(at) ? at : 0}|${shown.some((e) => e.promise !== null) ? 1 : 0}`;
  }, () => '0|0');
  const [at, busy] = key.split('|');
  return { at: Number(at), busy: busy === '1' };
}

// the store tells what moved (store.ts sync); a new person or mode empties everything
if (typeof window !== 'undefined') {
  onDataChanged((tables, since) => {
    confirmedAt = Date.now();
    void invalidate(tables, since);
    anyListeners.forEach((l) => l());
  });
  // the bell's own check found new notifications (hooks/use-notifications.ts)
  window.addEventListener(NOTIFICATIONS_CHANGED, () => void invalidate(['notifications']));
  const scopeOf = (s: ReturnType<typeof useStore.getState>) => (s.loadedAt ? `${s.state.session.userId}|${s.state.session.testMode === true ? 'test' : 'normal'}` : '');
  scope = scopeOf(useStore.getState());
  useStore.subscribe((s, prev) => {
    if (s.loadedAt !== prev.loadedAt) confirmedAt = Date.now();
    const next = scopeOf(s);
    if (!next || next === scope) return;
    const first = scope === '';
    scope = next;
    if (first) return;
    for (const e of [...entries.values()]) {
      if (e.shown > 0) {
        e.data = undefined; e.has = false; e.error = null; e.at = 0; e.stale = true; e.promise = null; e.again = null; e.startedAt = 0;
        void read(e);
      } else {
        if (e.timer) window.clearInterval(e.timer);
        entries.delete(e.key);
      }
    }
    scopeListeners.forEach((l) => l());
  });
}

const scopeListeners = new Set<() => void>();
/** Called when the signed-in person or the test mode changes (other caches empty themselves: stages.tsx's boards). */
export function onScopeChange(listener: () => void) {
  scopeListeners.add(listener);
  return () => { scopeListeners.delete(listener); };
}
