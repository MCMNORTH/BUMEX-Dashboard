"use client";

import { getBumexEntity } from "@/lib/entities/config";
import { useAuthContext } from "@/components/auth/auth-provider";
import type { BumexEntity } from "@/types/entity";

export function useEntity() {
  const { activeEntityCode, availableEntityCodes, profile } = useAuthContext();
  const resolvedActiveEntityCode = activeEntityCode ?? profile?.entity_code ?? null;

  return {
    activeEntityCode: resolvedActiveEntityCode,
    activeEntity: getBumexEntity(resolvedActiveEntityCode),
    availableEntities: availableEntityCodes
      .map((code) => getBumexEntity(code))
      .filter((entity): entity is BumexEntity => Boolean(entity)),
  };
}
