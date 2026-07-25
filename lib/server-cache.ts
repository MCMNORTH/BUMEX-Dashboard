import "server-only";

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
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
    if (predicate(key)) {
      cacheStore.delete(key);
    }
  }
}
