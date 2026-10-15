import "server-only";

import { cache } from "react";
import { FieldValue, type DocumentReference, type Transaction, type WriteBatch } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { forgetPerRequest, perRequest } from "@/lib/request-memo";

// ---------------------------------------------------------------------------
// One counter per table, in a single document. Every write through the data
// layer bumps its table's counter in the same batch as the write, so the
// counter can never claim data that is not committed yet.
//
// - The server caches (lib/firebase/table-cache.ts, lib/server-cache.ts) tag
//   what they hold with the counters they saw, so a write on any App Hosting
//   instance is noticed by every other instance on its next request.
// - The browser polls the counters (app/api/live) to learn that a page it
//   shows has changed, for one document read instead of a page render.
// ---------------------------------------------------------------------------

export type TableVersions = Readonly<Record<string, number>>;

// Internal bookkeeping nobody watches; bumping it on every send would only add writes.
const UNTRACKED_TABLES = new Set(["notification_email_outbox"]);

function versionsRef(): DocumentReference {
  return adminDb().collection("_meta").doc("table_versions");
}

export async function readTableVersions(): Promise<TableVersions> {
  const doc = await versionsRef().get();
  const data = doc.data() ?? {};
  const versions: Record<string, number> = {};

  for (const [table, value] of Object.entries(data)) {
    if (typeof value === "number") {
      versions[table] = value;
    }
  }

  return versions;
}

const REQUEST_KEY = "table-versions";

/**
 * The counters as seen at the start of this request: read once and shared by
 * everything the request loads, so a page and the caches it used agree on what
 * "current" meant. A write made by the request makes the next call read again.
 */
export const getTableVersions = cache(() => perRequest(REQUEST_KEY, readTableVersions));

/** After this request wrote: later reads in it must see the new counters. */
export function forgetRequestTableVersions() {
  return forgetPerRequest(REQUEST_KEY);
}

export function versionOf(versions: TableVersions, table: string) {
  return versions[table] ?? 0;
}

/** Adds the counter bump for `table` to a batch that writes to it. */
export function bumpTableVersionInBatch(batch: WriteBatch, table: string) {
  if (!UNTRACKED_TABLES.has(table)) {
    batch.set(versionsRef(), { [table]: FieldValue.increment(1) }, { merge: true });
  }
}

/** Same, for the few writes made in a transaction rather than a batch. */
export function bumpTableVersionInTransaction(transaction: Transaction, table: string) {
  if (!UNTRACKED_TABLES.has(table)) {
    transaction.set(versionsRef(), { [table]: FieldValue.increment(1) }, { merge: true });
  }
}
