import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { Room } from '../i18n';
import { useStore } from '../store';

// The browser's Back goes back one screen inside the app instead of leaving it (docs/plans/mobile-tablet.md, step 4):
// on a phone (its Back gesture, Android's Back button, the app installed on the home screen), and on a PC too.
//
// - A screen is a floor + a room + a detail page (a tab with a ":": ticket:…, mission:…, client:…, person:…): opening
//   one adds a history entry; changing a plain tab only rewrites the current one.
// - A layer is something opened over a screen that Back should close: a ticket opened from a list, a sheet, a dialog
//   (useBackLayer). It adds an entry while open; closing it by hand takes that entry back off.
// - Back restores the screen of the entry it lands on and closes the layers above it.
//
// The address stays /vanguard: Next (16) keeps its own data in each entry (copied by its pushState), so Back to one of
// ours re-renders nothing and never reloads the page.

interface Snap { entityId: string | null; room: Room | null; tab: string | null; depth: number; layer?: string }

const detail = (tab: string | null | undefined) => (tab && tab.includes(':') ? tab : '');
const keyOf = (s: { entityId: string | null; room: Room | null; tab: string | null | undefined }) => `${s.entityId}|${s.room}|${detail(s.tab)}`;

let depth = 0; // this entry's place: 0 = where the app was opened
let ignorePops = 0; // our own history.back() calls (a layer closed by hand)
let deferred: (() => void)[] = []; // what waits for those to land
const layers: { id: string; depth: number; close: () => void }[] = [];
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const current = (): Snap => {
  const ui = useStore.getState().ui;
  return { entityId: ui.entityId, room: ui.room, tab: ui.tab ?? null, depth };
};
function push(snap: Omit<Snap, 'depth'>) {
  const run = () => {
    depth += 1;
    window.history.pushState({ vg: { ...snap, depth } }, '');
    changed();
  };
  if (ignorePops) deferred.push(run);
  else run();
}

/** Whether Back stays inside the app (the phone header's Back arrow shows then). */
export function useCanGoBack(): boolean {
  return useSyncExternalStore(
    (notify) => { listeners.add(notify); return () => listeners.delete(notify); },
    () => depth > 0,
    () => false,
  );
}

/** Back, inside the app: one screen or one layer. */
export function goBack() {
  if (depth > 0) window.history.back();
}

/** Mounted once (vanguard/App.tsx): the screens into the browser's history, and Back out of it. */
export function useRoomHistory() {
  useEffect(() => {
    let restoring = false;
    const start = window.history.state?.vg as Snap | undefined;
    depth = start?.depth ?? 0;
    let last = current();
    let lastKey = keyOf(last);
    window.history.replaceState({ ...window.history.state, vg: { ...last, depth } }, '');
    changed();

    const unsubscribe = useStore.subscribe((s) => {
      const ui = s.ui;
      if (ui.entityId === last.entityId && ui.room === last.room && (ui.tab ?? null) === last.tab) return;
      const key = keyOf({ entityId: ui.entityId, room: ui.room, tab: ui.tab });
      last = { entityId: ui.entityId, room: ui.room, tab: ui.tab ?? null, depth };
      if (restoring || ui.switching || !s.loadedAt) { lastKey = key; return; }
      if (key !== lastKey) push({ entityId: ui.entityId, room: ui.room, tab: ui.tab ?? null });
      else if (!ignorePops) window.history.replaceState({ ...window.history.state, vg: { ...(window.history.state?.vg ?? {}), tab: ui.tab ?? null } }, '');
      lastKey = key;
    });

    const onPop = (event: PopStateEvent) => {
      const vg = event.state?.vg as Snap | undefined;
      depth = vg?.depth ?? 0;
      if (ignorePops) {
        ignorePops -= 1;
        if (!ignorePops) { const run = deferred; deferred = []; run.forEach((f) => f()); }
        changed();
        return;
      }
      // the layers above this entry close
      for (let i = layers.length - 1; i >= 0; i--) if (layers[i].depth > depth) layers.splice(i, 1)[0].close();
      // and its screen comes back
      const s = useStore.getState();
      const target = vg ?? { entityId: s.ui.entityId, room: null, tab: null, depth: 0 };
      if (keyOf(target) !== keyOf({ entityId: s.ui.entityId, room: s.ui.room, tab: s.ui.tab }) || (s.ui.tab ?? null) !== target.tab) {
        restoring = true;
        try {
          if (s.ui.view === 'flat') s.setUi({ entityId: target.entityId ?? s.ui.entityId, room: target.room, tab: target.tab });
          else {
            if (target.entityId && target.entityId !== s.ui.entityId) s.goFloor(target.entityId);
            s.openRoom(target.room, target.tab);
          }
        } finally {
          restoring = false;
        }
      }
      last = current();
      lastKey = keyOf(last);
      changed();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}

/** While `open`, Back closes it (calls `close`) instead of leaving the screen. */
export function useBackLayer(open: boolean, close: () => void) {
  const id = useId();
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    if (!open) return;
    const layer = { id, depth: 0, close: () => closeRef.current() };
    const run = () => {
      depth += 1;
      layer.depth = depth;
      layers.push(layer);
      window.history.pushState({ vg: { ...current(), depth, layer: id } }, '');
      changed();
    };
    if (ignorePops) deferred.push(run);
    else run();
    return () => {
      const i = layers.indexOf(layer);
      if (i < 0) { deferred = deferred.filter((f) => f !== run); return; } // closed by Back, or never pushed
      layers.splice(i, 1);
      // closed by hand: its entry comes off, if it is still the last one
      if ((window.history.state?.vg as Snap | undefined)?.layer === id) {
        ignorePops += 1;
        window.history.back();
      }
    };
  }, [open, id]);
}
