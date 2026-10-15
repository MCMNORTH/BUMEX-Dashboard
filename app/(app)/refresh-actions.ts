"use server";

import { refresh } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { TABLES } from "@/lib/firebase/schema";
import { forgetCachedTables } from "@/lib/firebase/table-cache";
import { invalidateCachedForUser } from "@/lib/server-cache";

/**
 * Re-renders the current page with the latest data and sends it back with the
 * action's response, so the browser swaps it in without a reload. `reload`
 * (the Refresh button) also re-reads the page's tables from Firestore; the
 * automatic refresh after a change does not need to, since the write counters
 * already told it the server copy is current.
 */
export async function refreshPageAction(tables: string[], options: { reload: boolean }) {
  const auth = await requireAuthenticatedUser();

  if (options.reload) {
    invalidateCachedForUser(auth.profile.id);
    forgetCachedTables(tables.filter((table) => typeof table === "string" && table in TABLES).slice(0, 40));
  }

  refresh();
}
