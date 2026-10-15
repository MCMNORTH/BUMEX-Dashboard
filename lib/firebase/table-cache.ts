import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldValue, type Timestamp, type Transaction, type WriteBatch } from "firebase-admin/firestore";

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
// has not moved past the one it was loaded under. When it has, the entry
// catches up from the change log instead of reading the table again: every
// write to a cached table also records, in the same batch, which documents it
// touched (`_meta_changes`), so only those are fetched. MAX_AGE_MS bounds how
// long edits made outside the app (Firebase console, scripts) can go unseen.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

export type TableSnapshot = {
  readonly rows: readonly Row[];
  readonly byId: ReadonlyMap<string, Row>;
  /** Firestore's read time for this copy: changes committed after it are not in it. */
  readonly syncedAt: Timestamp;
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

const MAX_AGE_MS = 15 * 60_000;
const CHANGES = "_meta_changes";
// Change records older than this can no longer help any entry (entries this
// old are read again in full), so they are deleted now and then.
const CHANGES_KEPT_MS = 2 * MAX_AGE_MS;
// Past this much catching up, reading the table again is simpler and as cheap.
const MAX_CHANGE_RECORDS = 400;

// Next bundles each route on its own, so a plain module-level Map would give
// every page and API route its own copy; the process-wide one lives on globalThis.
const shared = globalThis as typeof globalThis & { __bumexTableCache?: Map<string, Entry>; __bumexChangesPrunedAt?: number };
const entries = (shared.__bumexTableCache ??= new Map<string, Entry>());

export function isCachedTable(table: string) {
  return CACHED_TABLES.has(table);
}

function toRow(id: string, data: Row, idColumn: boolean) {
  const row = idColumn ? { ...data, id } : { ...data };
  deepFreeze(row);
  return row;
}

function byDocumentId(left: [string, Row], right: [string, Row]) {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

async function loadTable(table: string, idColumn: boolean): Promise<TableSnapshot> {
  const result = await adminDb().collection(table).get();
  const byId = new Map<string, Row>();

  for (const doc of result.docs) {
    byId.set(doc.id, toRow(doc.id, doc.data(), idColumn));
  }

  // Firestore returns documents in id order; the rows keep it.
  return { rows: [...byId.values()], byId, syncedAt: result.readTime };
}

/** Brings `base` up to date with the changes recorded since it was read. */
async function catchUp(table: string, base: TableSnapshot, idColumn: boolean): Promise<TableSnapshot> {
  const changes = await adminDb().collection(CHANGES).where("at", ">", base.syncedAt).orderBy("at").limit(MAX_CHANGE_RECORDS + 1).get();

  if (changes.size > MAX_CHANGE_RECORDS) {
    return loadTable(table, idColumn);
  }

  const ids = new Set<string>();

  for (const record of changes.docs) {
    if (record.get("table") === table) {
      for (const id of record.get("ids") as string[]) ids.add(id);
    }
  }

  pruneChanges();

  if (!ids.size) {
    return { ...base, syncedAt: changes.readTime };
  }

  const collection = adminDb().collection(table);
  const docs = await adminDb().getAll(...[...ids].map((id) => collection.doc(id)));
  const byId = new Map(base.byId);

  for (const doc of docs) {
    if (doc.exists) {
      byId.set(doc.id, toRow(doc.id, doc.data()!, idColumn));
    } else {
      byId.delete(doc.id);
    }
  }

  const ordered = [...byId.entries()].sort(byDocumentId);
  // Changes committed after the change log was read are picked up next time,
  // even if the documents fetched above already include them.
  return { rows: ordered.map(([, row]) => row), byId: new Map(ordered), syncedAt: changes.readTime };
}

/**
 * The table's rows as of at least `versions`, loading or catching up once for
 * every request that needs them at the same time. Rows are frozen: copy before
 * changing. `byId` is keyed by document id.
 */
export function readCachedTable(table: string, versions: TableVersions, idColumn = true): Promise<TableSnapshot> {
  const wanted = versionOf(versions, table);
  const current = entries.get(table);
  const now = Date.now();
  const fresh = current && now - current.loadedAt < MAX_AGE_MS;

  // An entry loaded under a newer counter than this request saw is fresher still.
  if (current && fresh && current.version >= wanted) {
    return current.snapshot;
  }

  const previous = fresh ? current.snapshot : null;
  const entry: Entry = {
    version: wanted,
    loadedAt: previous ? current!.loadedAt : now,
    snapshot: previous
      ? previous.then((base) => catchUp(table, base, idColumn), () => loadTable(table, idColumn))
      : loadTable(table, idColumn),
  };
  entries.set(table, entry);
  entry.snapshot.catch(() => {
    if (entries.get(table) === entry) {
      entries.delete(table);
    }
  });

  return entry.snapshot;
}

/** Records, in the batch that writes them, which documents of a cached table changed. */
export function recordChangesInBatch(batch: WriteBatch, table: string, documentIds: string[]) {
  if (CACHED_TABLES.has(table) && documentIds.length) {
    batch.set(adminDb().collection(CHANGES).doc(), { table, ids: documentIds, at: FieldValue.serverTimestamp() });
  }
}

/** Same, for the few writes made in a transaction. */
export function recordChangesInTransaction(transaction: Transaction, table: string, documentIds: string[]) {
  if (CACHED_TABLES.has(table) && documentIds.length) {
    transaction.set(adminDb().collection(CHANGES).doc(), { table, ids: documentIds, at: FieldValue.serverTimestamp() });
  }
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

// At most every few minutes per process, and without holding up the caller.
function pruneChanges() {
  const now = Date.now();

  if (now - (shared.__bumexChangesPrunedAt ?? 0) < 5 * 60_000) {
    return;
  }

  shared.__bumexChangesPrunedAt = now;
  const before = new Date(now - CHANGES_KEPT_MS);

  void adminDb()
    .collection(CHANGES)
    .where("at", "<", before)
    .limit(400)
    .get()
    .then((old) => {
      if (old.empty) return;
      const batch = adminDb().batch();
      old.docs.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    })
    .catch(() => {
      // Best effort; the next pass tries again.
    });
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
