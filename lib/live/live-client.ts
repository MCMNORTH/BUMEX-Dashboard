"use client";

// ---------------------------------------------------------------------------
// The browser side of the table write counters (lib/firebase/table-versions.ts).
// Every part of the page that wants to know when its data changed subscribes
// here with the tables it shows; one poll of /api/live serves them all, and
// only while the tab is visible. Nothing is re-fetched unless a counter moved.
// ---------------------------------------------------------------------------

export type LiveVersions = Readonly<Record<string, number>>;

export type LiveStatus = "ok" | "offline" | "signed-out";

type Subscription = {
  tables: readonly string[];
  intervalMs: number;
  onVersions: (versions: LiveVersions) => void;
};

/** How often each kind of page checks while it is open. */
export const LIVE_INTERVALS = {
  // Boards people work on together (Kanban, My Work, a ticket).
  fast: 20_000,
  normal: 60_000,
} as const;

// A check this recent is reused instead of asking again when the tab comes back
// into view. A new subscriber (a page shown from the browser's cache must learn
// what changed since) only shares checks made within the same instant.
const FRESH_MS = 4_000;
const FRESH_ON_SUBSCRIBE_MS = 300;
// Signed out: keep asking now and then (no database read), so a session started
// in another tab brings this one back.
const SIGNED_OUT_INTERVAL_MS = 60_000;

const subscriptions = new Set<Subscription>();
const statusListeners = new Set<() => void>();
let latest: LiveVersions = {};
let checkedTables = new Set<string>();
let lastCheckAt = 0;
let status: LiveStatus = "ok";
let viewerId: string | null = null;
let timer: number | null = null;
let inflight: Promise<LiveStatus> | null = null;
let inflightTables = new Set<string>();
let recheck = false;
let listening = false;

function setStatus(next: LiveStatus) {
  if (status !== next) {
    status = next;
    statusListeners.forEach((listener) => listener());
  }
}

export function getLiveStatus() {
  return status;
}

export function subscribeLiveStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** The signed-in user the page was rendered for; another account's session reloads the page. */
export function setLiveViewer(userId: string | null) {
  if (userId === viewerId) return;
  viewerId = userId;

  // Signed in again in this tab: start over.
  if (userId && status === "signed-out") {
    setStatus("ok");
    void checkLiveVersions();
  }
}

function watchedTables() {
  return [...new Set([...subscriptions].flatMap((subscription) => subscription.tables))].sort();
}

function schedule() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }

  if (!subscriptions.size) {
    return;
  }

  const fastest = Math.min(...[...subscriptions].map((subscription) => subscription.intervalMs));
  const interval = status === "signed-out" ? Math.max(fastest, SIGNED_OUT_INTERVAL_MS) : fastest;
  const wait = Math.max(interval - (Date.now() - lastCheckAt), 1_000);
  timer = window.setTimeout(() => void checkLiveVersions(), wait);
}

function checkIfStale() {
  if (document.visibilityState === "visible" && Date.now() - lastCheckAt > FRESH_MS) {
    void checkLiveVersions();
  }
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", checkIfStale);
  window.addEventListener("focus", checkIfStale);
  window.addEventListener("online", checkIfStale);
}

/**
 * Asks the server for the current counters of every watched table and hands
 * them to the subscribers. Concurrent calls share one request. A hidden tab
 * does not poll; it checks again when it becomes visible.
 */
export function checkLiveVersions(options: { force?: boolean } = {}): Promise<LiveStatus> {
  const tables = watchedTables();

  if (inflight) {
    // A subscriber that arrived after the request left gets a second one.
    recheck ||= tables.some((table) => !inflightTables.has(table));
    return inflight;
  }

  if (!tables.length || (!options.force && document.visibilityState === "hidden")) {
    schedule();
    return Promise.resolve(status);
  }

  inflightTables = new Set(tables);
  inflight = (async () => {
    try {
      const response = await fetch(`/api/live?tables=${tables.join(",")}`, { cache: "no-store" });

      if (response.status === 401) {
        setStatus("signed-out");
        return status;
      }

      if (!response.ok) {
        setStatus("offline");
        return status;
      }

      const body = (await response.json()) as { uid: string; versions: LiveVersions };

      if (viewerId && body.uid !== viewerId) {
        // Another account signed in from another tab: never keep showing this one's data.
        window.location.reload();
        return status;
      }

      latest = { ...latest, ...body.versions };
      checkedTables = new Set([...checkedTables, ...tables]);
      lastCheckAt = Date.now();
      setStatus("ok");
      subscriptions.forEach((subscription) => subscription.onVersions(latest));
      return status;
    } catch {
      setStatus("offline");
      return status;
    } finally {
      inflight = null;

      if (recheck && status === "ok") {
        recheck = false;
        void checkLiveVersions();
      } else {
        recheck = false;
        schedule();
      }
    }
  })();

  return inflight;
}

/**
 * Calls `onVersions` with the latest counters whenever they are checked, and
 * right away when a recent check already covered `tables`.
 */
export function subscribeLive(
  tables: readonly string[],
  intervalMs: number,
  onVersions: (versions: LiveVersions) => void,
) {
  const subscription: Subscription = { tables, intervalMs, onVersions };
  subscriptions.add(subscription);
  listen();

  if (Date.now() - lastCheckAt < FRESH_ON_SUBSCRIBE_MS && tables.every((table) => checkedTables.has(table))) {
    onVersions(latest);
    schedule();
  } else {
    void checkLiveVersions();
  }

  return () => {
    subscriptions.delete(subscription);
    schedule();
  };
}

/** True when any of `tables` was written since `seen` was taken. */
export function hasNewerVersions(seen: LiveVersions, current: LiveVersions) {
  return Object.keys(seen).some((table) => (current[table] ?? 0) > (seen[table] ?? 0));
}
