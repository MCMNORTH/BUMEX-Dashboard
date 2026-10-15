import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { hasFirebaseEnv } from "@/lib/firebase/config";
import { AccessPolicy } from "@/lib/firebase/policies";
import { QueryBuilder } from "@/lib/firebase/query";
import { RpcCall } from "@/lib/firebase/rpc";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/firebase/session";
import { storage } from "@/lib/firebase/storage";
import { readCachedTable } from "@/lib/firebase/table-cache";
import { getTableVersions } from "@/lib/firebase/table-versions";
import { perRequest } from "@/lib/request-memo";
import type { AppRole } from "@/types/auth";

export class DataClient {
  readonly storage = storage;

  constructor(private readonly policy: AccessPolicy | null) {}

  from(table: string) {
    return new QueryBuilder(table, this.policy);
  }

  rpc(name: string, args: Record<string, unknown> = {}) {
    return new RpcCall(name, args, this.policy);
  }
}

async function sessionCookieValue() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? "";
}

// Once per request, also in Server Actions and Route Handlers (where React's
// cache() does not apply), and per session cookie, so a sign-in or sign-out
// made earlier in the same request is still seen.
export const getCurrentSessionUser = cache(async () =>
  perRequest(`session-user:${await sessionCookieValue()}`, getSessionUser),
);

const getRequestPolicy = cache(async () =>
  perRequest(`access-policy:${await sessionCookieValue()}`, buildRequestPolicy),
);

async function buildRequestPolicy() {
  const user = await getCurrentSessionUser();

  if (!user) {
    // Anonymous callers match no policy, exactly like the `authenticated`-only RLS.
    return new AccessPolicy("", null);
  }

  // Role changes bump the profiles counter, so they apply from the next request.
  const profiles = await readCachedTable("profiles", await getTableVersions());
  const profile = profiles.byId.get(user.id);
  const role = (profile?.role ?? null) as AppRole | null;

  return new AccessPolicy(user.id, role, {
    entityCode: profile?.entity_code ?? null,
    isSuperAdmin: profile?.is_super_admin === true,
  });
}

/**
 * Data client scoped to the signed-in user. Every read and write goes through
 * the row policies in lib/firebase/policies.ts.
 */
export async function createClient() {
  if (!hasFirebaseEnv()) {
    return null;
  }

  return new DataClient(await getRequestPolicy());
}

/**
 * Unrestricted data client. Only for trusted server flows that previously ran
 * inside database triggers or with the service role (e.g. signup provisioning).
 */
export function createAdminClient() {
  if (!hasFirebaseEnv()) {
    return null;
  }

  return new DataClient(null);
}
