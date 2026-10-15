/** Fired by instrumentation-client.ts when the router starts a page change. */
export const NAVIGATION_START_EVENT = "bumex:navigation-start";

export type NavigationStartDetail = { url: string; navigationType: "push" | "replace" | "traverse" };
