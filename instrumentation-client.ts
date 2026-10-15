// Runs in the browser before hydration (Next.js instrumentation-client convention).

import { NAVIGATION_START_EVENT, type NavigationStartDetail } from "@/lib/navigation-events";

/** Tells the navigation progress bar (components/layout/navigation-progress.tsx) that a page change began. */
export function onRouterTransitionStart(url: string, navigationType: NavigationStartDetail["navigationType"]) {
  window.dispatchEvent(new CustomEvent<NavigationStartDetail>(NAVIGATION_START_EVENT, { detail: { url, navigationType } }));
}
