import type { Profile } from "@/types/auth";
import { DEFAULT_BUMEX_ENTITY_CODE, type BumexEntityCode } from "@/types/entity";

import { getBumexEntity, isBumexEntityCode } from "@/lib/entities/config";

type UnsafeEntityCarrier = {
  entity_code: string | null | undefined;
};

export function normalizeEntityCode(
  value: string | null | undefined,
  fallback: BumexEntityCode | null = null,
): BumexEntityCode | null {
  if (!value) {
    return fallback;
  }

  return isBumexEntityCode(value) ? value : fallback;
}

export function normalizeLegacyEntityCode(value: string | null | undefined) {
  return normalizeEntityCode(value, DEFAULT_BUMEX_ENTITY_CODE) ?? DEFAULT_BUMEX_ENTITY_CODE;
}

export function sanitizeEntityCarrier<T extends UnsafeEntityCarrier>(
  value: T | null,
  fallback: BumexEntityCode | null = null,
): (Omit<T, "entity_code"> & { entity_code: BumexEntityCode | null }) | null {
  if (!value) {
    return null;
  }

  return {
    ...value,
    entity_code: normalizeEntityCode(value.entity_code, fallback),
  };
}

export function sanitizeProfileEntityCode(profile: Profile | null, fallback: BumexEntityCode | null = null) {
  return sanitizeEntityCarrier(profile, fallback) as Profile | null;
}

export function getEntityConstraintErrorMessage(entityCode: string | null | undefined) {
  const entity = isBumexEntityCode(entityCode) ? getBumexEntity(entityCode) : null;
  const entityName = entity?.name ?? "this entity";

  return `The live database schema does not yet allow ${entityName}. Apply the latest production entity constraint migration before assigning this entity.`;
}
