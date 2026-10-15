"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { NAVIGATION_START_EVENT, type NavigationStartDetail } from "@/lib/navigation-events";

// While a page change is under way (instrumentation-client.ts reports its
// start; the new URL committing ends it):
// - a thin bar at the top, after a short delay so pages shown from the
//   browser's cache open without it, so a click always visibly registers;
// - a no-op re-render every 100 ms. Next 16.2 / React 19.2 sometimes hold a
//   page that has already arrived back until React has another update to
//   process (see lib/live/page-refresh.ts), which looks like a click that
//   did nothing. These re-renders are such updates.

const SHOW_AFTER_MS = 150;
const GIVE_UP_AFTER_MS = 10_000;

type Progress = { elapsed: number } | null;

let pending: { target: string; startedAt: number } | null = null;
// A new object on every tick, so each one is an update React has to render.
let progress: Progress = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  progress = pending ? { elapsed: Date.now() - pending.startedAt } : null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stop() {
  pending = null;

  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }

  emit();
}

function start(target: string) {
  pending = { target, startedAt: Date.now() };

  if (timer === null) {
    timer = window.setInterval(() => {
      if (!pending || Date.now() - pending.startedAt > GIVE_UP_AFTER_MS) {
        stop();
      } else {
        emit();
      }
    }, 100);
  }

  emit();
}

function locationKey(url: URL | Location) {
  return `${url.pathname}${url.search}`;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = useSyncExternalStore(subscribe, () => progress, () => null);

  useEffect(() => {
    function onStart(event: Event) {
      const { url } = (event as CustomEvent<NavigationStartDetail>).detail;
      const target = new URL(url, window.location.href);

      // Same page (a hash link, or a replace that changes nothing): nothing will commit.
      if (target.origin === window.location.origin && locationKey(target) !== locationKey(window.location)) {
        start(locationKey(target));
      }
    }

    window.addEventListener(NAVIGATION_START_EVENT, onStart);
    return () => window.removeEventListener(NAVIGATION_START_EVENT, onStart);
  }, []);

  // The new page committed (or a redirect landed elsewhere): done.
  useEffect(() => {
    if (pending) {
      stop();
    }
  }, [pathname, search]);

  if (!current || current.elapsed < SHOW_AFTER_MS) {
    return null;
  }

  // Creeps towards 90% and waits there for the page.
  const width = 10 + 80 * (1 - Math.exp(-(current.elapsed - SHOW_AFTER_MS) / 1200));

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5">
      <div className="h-full bg-primary transition-[width] duration-100 ease-out" style={{ width: `${width}%` }} />
    </div>
  );
}
