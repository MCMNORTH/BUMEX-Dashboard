import "server-only";

import { getCurrentSessionUser } from "@/lib/firebase/server";

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

// Loaders only return rows the current user may see, so entries must never be
// shared between users.
const USER_SEPARATOR = "\u0000";

export async function getCached<T>(baseKey: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const user = await getCurrentSessionUser();
  const key = `${user?.id ?? "anonymous"}${USER_SEPARATOR}${baseKey}`;
  const now = Date.now();
  const current = cacheStore.get(key) as CacheEntry<T> | undefined;

  if (current && current.expiresAt > now) {
    return current.value;
  }

  const value = loader().catch((error) => {
    cacheStore.delete(key);
    throw error;
  });

  cacheStore.set(key, {
    expiresAt: now + ttlMs,
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
