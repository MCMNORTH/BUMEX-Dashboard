"use client";

import { startTransition } from "react";

import { refreshPageAction } from "@/app/(app)/refresh-actions";
import {
  checkLiveVersions,
  hasNewerVersions,
  LIVE_INTERVALS,
  subscribeLive,
  type LiveVersions,
} from "@/lib/live/live-client";

// ---------------------------------------------------------------------------
// The page currently on screen, as registered by <PageRefresh /> (with the
// table counters it was rendered under), and the header's Refresh button.
//
// - "fast"/"normal" pages refresh themselves when a watched table changes,
//   unless the user is mid-action (dragging, typing, a dialog open): then the
//   button shows that updates are waiting and the refresh runs once they stop.
// - "off" pages (reports, settings) only refresh on request.
// ---------------------------------------------------------------------------

export type PageLiveMode = keyof typeof LIVE_INTERVALS | "off";

export type PageRegistration = {
  /** When the server rendered this page's data (survives the client cache). */
  renderedAt: number;
  tables: readonly string[];
  versions: LiveVersions;
  live: PageLiveMode;
};

export type PageRefreshError = "offline" | "signed-out" | "failed";

export type PageRefreshState = {
  page: PageRegistration | null;
  refreshing: boolean;
  updateAvailable: boolean;
  error: PageRefreshError | null;
};

const EMPTY: PageRefreshState = { page: null, refreshing: false, updateAvailable: false, error: null };

let state: PageRefreshState = EMPTY;
const listeners = new Set<() => void>();
let stopLive: (() => void) | null = null;
let idleRetry: number | null = null;
let inflight: Promise<void> | null = null;
let pointerDownAt = 0;
let trackingPointer = false;

function setState(patch: Partial<PageRefreshState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function getPageRefreshState() {
  return state;
}

export function getServerPageRefreshState() {
  return EMPTY;
}

export function subscribePageRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function trackPointer() {
  if (trackingPointer) return;
  trackingPointer = true;
  const release = () => { pointerDownAt = 0; };
  window.addEventListener("pointerdown", () => { pointerDownAt = Date.now(); }, true);
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  // A button released outside the window never sends pointerup here.
  window.addEventListener("blur", release);
}

// Swapping data under someone who is dragging a card, typing, or working in a
// dialog would undo what they are doing, so those wait.
function isUserBusy() {
  // A press older than a minute is not a drag in progress but a lost release.
  if (pointerDownAt && Date.now() - pointerDownAt < 60_000) return true;

  const active = document.activeElement;

  if (
    active instanceof HTMLElement
    && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")
  ) {
    return true;
  }

  return Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));
}

function clearIdleRetry() {
  if (idleRetry !== null) {
    window.clearInterval(idleRetry);
    idleRetry = null;
  }
}

function onPageChanged(page: PageRegistration) {
  if (state.page !== page || inflight) {
    return;
  }

  if (!isUserBusy()) {
    void refreshPage("auto");
    return;
  }

  setState({ updateAvailable: true });

  if (idleRetry === null) {
    idleRetry = window.setInterval(() => {
      if (state.page !== page) {
        clearIdleRetry();
      } else if (!isUserBusy()) {
        clearIdleRetry();
        void refreshPage("auto");
      }
    }, 3_000);
  }
}

/** Called by <PageRefresh /> on mount and whenever the page is re-rendered with new data. */
export function registerPage(page: PageRegistration) {
  trackPointer();
  clearIdleRetry();
  stopLive?.();
  stopLive = null;
  setState({ page, updateAvailable: false, error: state.error === "failed" ? null : state.error });

  if (page.live !== "off") {
    // Also runs right away, so a page shown from the client cache revalidates on return.
    stopLive = subscribeLive(page.tables, LIVE_INTERVALS[page.live], (versions) => {
      if (state.page === page && hasNewerVersions(page.versions, versions)) {
        onPageChanged(page);
      }
    });
  }

  return () => {
    if (state.page === page) {
      clearIdleRetry();
      stopLive?.();
      stopLive = null;
      setState({ page: null, updateAvailable: false });
    }
  };
}

// Next 16.2 / React 19.2 sometimes hold a refreshed page back (the old content
// stays) until React has some other update to process; it happens with
// router.refresh() too. A no-op store update every 100 ms is such an update,
// so this nudges until the page re-registers with its new render, for at most 3 s.
async function untilPageReplaced(previous: PageRegistration) {
  for (let attempt = 0; attempt < 30 && state.page === previous; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    setState({});
  }
}

/**
 * Re-renders the current page on the server and swaps it in, keeping what is
 * on screen until the new data arrives. Calls made while one is running share it.
 * "manual" (the button) first checks the server is reachable, so a failure is
 * reported instead of falling back to a full reload, and re-reads the tables.
 */
export function refreshPage(kind: "manual" | "auto"): Promise<void> {
  if (inflight) {
    return inflight;
  }

  const page = state.page;

  if (!page) {
    return Promise.resolve();
  }

  setState({ refreshing: true, error: kind === "manual" ? null : state.error });

  inflight = (async () => {
    try {
      if (kind === "manual") {
        const status = await checkLiveVersions({ force: true });

        if (status !== "ok") {
          setState({ error: status });
          return;
        }
      }

      await new Promise<void>((resolve, reject) => {
        startTransition(async () => {
          try {
            await refreshPageAction([...page.tables], { reload: kind === "manual" });
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      await untilPageReplaced(page);
      setState({ updateAvailable: false, error: null });
    } catch {
      // An automatic refresh that fails is retried on the next change; only a click reports it.
      if (kind === "manual") {
        setState({ error: "failed" });
      }
    } finally {
      inflight = null;
      setState({ refreshing: false });
    }
  })();

  return inflight;
}
