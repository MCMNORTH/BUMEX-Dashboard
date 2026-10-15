import "server-only";

import { hasFirebaseEnv } from "@/lib/firebase/config";
import { getCurrentSessionUser } from "@/lib/firebase/server";
import { getTableVersions, type TableVersions } from "@/lib/firebase/table-versions";

type CacheEntry<T> = {
  expiresAt: number;
  stamp: string;
  value: Promise<T>;
};

// Shared by every route of the process (Next bundles routes separately, so a
// module-level Map would be one per route).
const shared = globalThis as typeof globalThis & { __bumexServerCache?: Map<string, CacheEntry<unknown>> };
const cacheStore = (shared.__bumexServerCache ??= new Map<string, CacheEntry<unknown>>());

// Loaders only return rows the current user may see, so entries must never be
// shared between users.
const USER_SEPARATOR = "\u0000";

const stamps = new WeakMap<TableVersions, string>();

// Entries hold derived data whose source tables are not tracked, so any write
// to any table (on any server instance) retires them all.
function versionStamp(versions: TableVersions) {
  let stamp = stamps.get(versions);

  if (stamp === undefined) {
    stamp = Object.keys(versions).sort().map((table) => `${table}:${versions[table]}`).join(",");
    stamps.set(versions, stamp);
  }

  return stamp;
}

export async function getCached<T>(baseKey: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const [user, versions] = await Promise.all([
    getCurrentSessionUser(),
    hasFirebaseEnv() ? getTableVersions() : Promise.resolve<TableVersions>({}),
  ]);
  const key = `${user?.id ?? "anonymous"}${USER_SEPARATOR}${baseKey}`;
  const stamp = versionStamp(versions);
  const now = Date.now();
  const current = cacheStore.get(key) as CacheEntry<T> | undefined;

  if (current && current.expiresAt > now && current.stamp === stamp) {
    return current.value;
  }

  const value = loader().catch((error) => {
    cacheStore.delete(key);
    throw error;
  });

  // Keys include each user's filters, so expired entries are swept rather than left to pile up.
  if (cacheStore.size > 1_000) {
    for (const [staleKey, entry] of cacheStore) {
      if (entry.expiresAt <= now) cacheStore.delete(staleKey);
    }
  }

  cacheStore.set(key, {
    expiresAt: now + ttlMs,
    stamp,
    value,
  });

  return value;
}

export function invalidateCached(predicate: (key: string) => boolean) {
  for (const key of cacheStore.keys()) {
    if (predicate(key.slice(key.indexOf(USER_SEPARATOR) + 1))) {
      cacheStore.delete(key);
    }
  }
}

/** Drops the signed-in user's entries, for their explicit "refresh". */
export function invalidateCachedForUser(userId: string) {
  const prefix = `${userId}${USER_SEPARATOR}`;

  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}
