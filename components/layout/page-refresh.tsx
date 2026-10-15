import { PageRefreshRegistration } from "@/components/layout/page-refresh-registration";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { getTableVersions, versionOf } from "@/lib/firebase/table-versions";
import type { PageLiveMode } from "@/lib/live/page-refresh";

function renderTime() {
  return Date.now();
}

/**
 * Puts the Refresh button in the header for this page and keeps the page
 * current: `tables` are the tables its data comes from, `live` how often it
 * checks them for changes made elsewhere ("off" refreshes only on request).
 * Render it outside the page's Suspense boundaries, so the counters it reports
 * are read before the data is.
 */
export async function PageRefresh({ tables, live = "normal" }: { tables: readonly string[]; live?: PageLiveMode }) {
  const versions = hasFirebaseEnv() ? await getTableVersions() : {};

  return (
    <PageRefreshRegistration
      renderedAt={renderTime()}
      tables={tables}
      versions={Object.fromEntries(tables.map((table) => [table, versionOf(versions, table)]))}
      live={live}
    />
  );
}
