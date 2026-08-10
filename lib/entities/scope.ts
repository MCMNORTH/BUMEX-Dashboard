import "server-only";

import {
  getAuthContext,
  isDevPreviewAuthEnabled,
  requireAuthenticatedUser,
} from "@/lib/auth/server";
import type { BumexEntityCode } from "@/types/entity";

function resolveEntityCode(
  code: BumexEntityCode | null | undefined,
): BumexEntityCode {
  if (!code) {
    throw new Error("The current account does not have an active Bumex entity.");
  }

  return code;
}

export async function requireCurrentEntityContext() {
  const auth = await requireAuthenticatedUser();
  const entityCode = resolveEntityCode(auth.activeEntityCode ?? auth.profile.entity_code);

  return {
    auth,
    entityCode,
  };
}

export async function getCurrentEntityCode() {
  const { entityCode } = await requireCurrentEntityContext();
  return entityCode;
}

export async function getOptionalCurrentEntityCode() {
  const auth = await getAuthContext();
  return auth.activeEntityCode ?? auth.profile?.entity_code ?? null;
}

type QueryWithEq<TQuery> = {
  eq: (column: string, value: string) => TQuery;
};

export function isEntityScopingEnabled() {
  if (process.env.ENABLE_ENTITY_SCOPING === "1") {
    return true;
  }

  if (process.env.ENABLE_ENTITY_SCOPING === "0") {
    return false;
  }

  if (process.env.NODE_ENV === "development") {
    return false;
  }

  return !isDevPreviewAuthEnabled();
}

export function applyEntityScope<TQuery>(
  query: TQuery,
  entityCode: string,
  column = "entity_code",
): TQuery {
  if (!isEntityScopingEnabled()) {
    return query;
  }

  return (query as QueryWithEq<TQuery>).eq(column, entityCode);
}

export function extendWithEntityCode<T extends Record<string, unknown>>(
  payload: T,
  entityCode: string,
) {
  if (!isEntityScopingEnabled()) {
    return payload;
  }

  return {
    ...payload,
    entity_code: entityCode,
  };
}

export function getEntityScopedCacheKey(baseKey: string, entityCode: string) {
  return `${baseKey}:entity:${entityCode}`;
}
