import "server-only";

import { cache } from "react";

import { adminDb } from "@/lib/firebase/admin";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { AccessPolicy } from "@/lib/firebase/policies";
import { QueryBuilder } from "@/lib/firebase/query";
import { RpcCall } from "@/lib/firebase/rpc";
import { getSessionUser } from "@/lib/firebase/session";
import { storage } from "@/lib/firebase/storage";
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

export const getCurrentSessionUser = cache(getSessionUser);

const getRequestPolicy = cache(async () => {
  const user = await getCurrentSessionUser();

  if (!user) {
    // Anonymous callers match no policy, exactly like the `authenticated`-only RLS.
    return new AccessPolicy("", null);
  }

  const profile = await adminDb().collection("profiles").doc(user.id).get();
  const role = (profile.exists ? profile.get("role") : null) as AppRole | null;

  return new AccessPolicy(user.id, role, {
    entityCode: (profile.exists ? profile.get("entity_code") : null) ?? null,
    isSuperAdmin: profile.exists ? profile.get("is_super_admin") === true : false,
  });
});

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
