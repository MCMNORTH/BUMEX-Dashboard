import { cookies } from "next/headers";

import { canProfileSwitchEntities } from "@/lib/auth/permissions";
import { activeEntityCookieName, getBumexEntity, isBumexEntityCode, selectableEntityCodes } from "@/lib/entities/config";
import type { Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

export async function getActiveEntityCodeForProfile(profile: Profile | null): Promise<BumexEntityCode | null> {
  if (!profile) {
    return null;
  }

  // Only the super admin's session cookie overrides the profile. Other admins
  // switch by updating their profile, so a cookie left in a shared browser
  // never moves them to another entity.
  if (profile.is_super_admin) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(activeEntityCookieName)?.value;

    if (isBumexEntityCode(cookieValue)) {
      return cookieValue;
    }
  }

  return profile.entity_code;
}

export function getAccessibleEntityCodes(profile: Profile | null): BumexEntityCode[] {
  if (!profile) {
    return [];
  }

  if (canProfileSwitchEntities(profile)) {
    return [...selectableEntityCodes];
  }

  return profile.entity_code ? [profile.entity_code] : [];
}

export async function getActiveEntityForProfile(profile: Profile | null) {
  const code = await getActiveEntityCodeForProfile(profile);
  return getBumexEntity(code);
}
