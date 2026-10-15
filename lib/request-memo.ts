import "server-only";

import { headers } from "next/headers";

// React's cache() only memoizes while a page renders. Server Actions and Route
// Handlers run outside that, so without this every data call in them verified
// the session and built its access policy again. The request's headers object
// is the same for the whole request, so it scopes the memo; outside a request
// (e.g. after()) calls simply run unmemoized. Kept on globalThis, since Next
// bundles routes separately and each bundle would otherwise get its own.
const shared = globalThis as typeof globalThis & { __bumexRequestMemo?: WeakMap<object, Map<string, Promise<unknown>>> };
const scopes = (shared.__bumexRequestMemo ??= new WeakMap<object, Map<string, Promise<unknown>>>());

async function currentScope() {
  try {
    return await headers();
  } catch {
    return null;
  }
}

/** Runs `load` once per request and key, sharing the promise with later callers. */
export async function perRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scope = await currentScope();

  if (!scope) {
    return load();
  }

  let memo = scopes.get(scope);

  if (!memo) {
    memo = new Map();
    scopes.set(scope, memo);
  }

  let pending = memo.get(key) as Promise<T> | undefined;

  if (!pending) {
    const entries = memo;
    pending = load();
    entries.set(key, pending);
    pending.catch(() => entries.delete(key));
  }

  return pending;
}

/** Forgets a memoized value for the rest of the request (after a write changed it). */
export async function forgetPerRequest(key: string) {
  const scope = await currentScope();

  if (scope) {
    scopes.get(scope)?.delete(key);
  }
}
