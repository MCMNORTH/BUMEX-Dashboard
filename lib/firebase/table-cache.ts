import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb } from "@/lib/firebase/admin";
import { type TableVersions, versionOf } from "@/lib/firebase/table-versions";

// ---------------------------------------------------------------------------
// Whole collections, held in this server process and shared by every request
// and every user. The data layer filters most queries in memory and the row
// policies need whole tables, so without this each page read the same
// collections from Firestore several times over.
//
// The rows are raw documents: what a caller may see is still decided per
// request by the row policies, exactly as for rows read from Firestore.
//
// An entry is used while its table's write counter (lib/firebase/table-versions.ts)
// has not moved past the one it was loaded under. MAX_AGE_MS only bounds how
// long edits made outside the app (Firebase console, scripts) can go unseen.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

export type TableSnapshot = {
  readonly rows: readonly Row[];
  readonly byId: ReadonlyMap<string, Row>;
};

type Entry = {
  version: number;
  loadedAt: number;
  snapshot: Promise<TableSnapshot>;
};

// Tables read on most pages, written only through the data layer, and small
// enough to hold whole. Logs that grow with every action (activity, comments,
// notifications) are left out: they are written so often that a cached copy
// would be reloaded more often than it is read.
const CACHED_TABLES = new Set([
  "profiles",
  "teams",
  "team_members",
  "clients",
  "projects",
  "project_members",
  "project_workflows",
  "tasks",
  "task_dependencies",
  "subtasks",
  "milestones",
  "contracts",
  "invoices",
  "payments",
  "transfers",
  "receipts",
  "documents",
  "staffing_assignments",
  "time_entries",
  "time_mission_favorites",
  "timesheet_week_status",
  "internal_notes",
  "bank_statements",
]);

const MAX_AGE_MS = 5 * 60_000;

// Next bundles each route on its own, so a plain module-level Map would give
// every page and API route its own copy; the process-wide one lives on globalThis.
const shared = globalThis as typeof globalThis & { __bumexTableCache?: Map<string, Entry> };
const entries = (shared.__bumexTableCache ??= new Map<string, Entry>());

export function isCachedTable(table: string) {
  return CACHED_TABLES.has(table);
}

async function loadTable(table: string, idColumn: boolean): Promise<TableSnapshot> {
  const result = await adminDb().collection(table).get();
  const rows = result.docs.map((doc) => (idColumn ? { ...doc.data(), id: doc.id } : { ...doc.data() }));
  const byId = new Map<string, Row>();

  result.docs.forEach((doc, index) => byId.set(doc.id, rows[index]));
  rows.forEach(deepFreeze);
  return { rows, byId };
}

/**
 * The table's rows as of at least `versions`, loading them once for every
 * request that needs them at the same time. Rows are frozen: copy before changing.
 * `byId` is keyed by document id.
 */
export function readCachedTable(table: string, versions: TableVersions, idColumn = true): Promise<TableSnapshot> {
  const wanted = versionOf(versions, table);
  const current = entries.get(table);
  const now = Date.now();

  // An entry loaded under a newer counter than this request saw is fresher still.
  if (current && current.version >= wanted && now - current.loadedAt < MAX_AGE_MS) {
    return current.snapshot;
  }

  const entry: Entry = { version: wanted, loadedAt: now, snapshot: loadTable(table, idColumn) };
  entries.set(table, entry);
  entry.snapshot.catch(() => {
    if (entries.get(table) === entry) {
      entries.delete(table);
    }
  });

  return entry.snapshot;
}

/** Drops a table after this process wrote to it; the next read loads it again. */
export function forgetCachedTable(table: string) {
  entries.delete(table);
}

/**
 * For a user's explicit "refresh": reloads the page's tables from Firestore,
 * which also picks up edits made outside the app. Copies loaded in the last
 * `minAgeMs` are kept, so repeated clicks (or many users) cannot hammer Firestore.
 */
export function forgetCachedTables(tables: readonly string[], minAgeMs = 30_000) {
  const now = Date.now();

  for (const table of tables) {
    const entry = entries.get(table);

    if (entry && now - entry.loadedAt >= minAgeMs) {
      entries.delete(table);
    }
  }
}

function deepFreeze(value: unknown) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    const prototype = Object.getPrototypeOf(value);

    // Firestore Timestamps and references keep their own classes; only plain data is frozen.
    if (Array.isArray(value) || prototype === Object.prototype || prototype === null) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
  }
}
