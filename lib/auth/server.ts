import { redirect } from "next/navigation";
import { cache } from "react";

import { getDefaultRouteForRole, canRoleAccessRoute } from "@/lib/auth/permissions";
import { getAccessibleEntityCodes, getActiveEntityCodeForProfile } from "@/lib/entities/server";
import { sanitizeProfileEntityCode } from "@/lib/entities/runtime";
import { getCurrentSessionUser } from "@/lib/auth/session-user";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { createPerson, getPersonProfile, setSuperAdmin } from "@/lib/work/people";
import type { AppRole, AuthUser, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";
import type { AppRouteKey } from "@/types/navigation";

const DEV_PREVIEW_PROFILE: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@bumex.mr",
  full_name: "Preview User",
  role: "admin",
  is_super_admin: true,
  entity_code: "bumex_it",
  avatar_url: null,
  job_title: "Preview Mode",
  department: "Product",
  skills: [],
  phone: null,
  availability_status: "available",
  weekly_capacity_hours: 40,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

const DEV_PREVIEW_USER: AuthUser = {
  id: DEV_PREVIEW_PROFILE.id,
  email: DEV_PREVIEW_PROFILE.email,
  email_confirmed: true,
  user_metadata: {
    full_name: DEV_PREVIEW_PROFILE.full_name,
  },
  created_at: DEV_PREVIEW_PROFILE.created_at,
};

function getConfiguredSuperAdminEmails() {
  const configured = process.env.BUMEX_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const fallback = "mohamed.cheikh@bumex.mr";

  return new Set([configured || fallback]);
}

function shouldForceSuperAdmin(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getConfiguredSuperAdminEmails().has(email.trim().toLowerCase());
}

// The super administrator's account is always flagged so (their Vanguard access comes from it: lib/erp/roles.ts).
async function elevateProfileIfNeeded(profile: Profile | null) {
  if (!profile || profile.is_super_admin || !shouldForceSuperAdmin(profile.email)) {
    return profile;
  }

  await setSuperAdmin(profile.id).catch(() => undefined);
  return { ...profile, is_super_admin: true };
}

export type AuthContext = {
  user: AuthUser | null;
  profile: Profile | null;
  role: AppRole | null;
  activeEntityCode: BumexEntityCode | null;
  availableEntityCodes: BumexEntityCode[];
};

export function isDevPreviewAuthEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_LOCAL_PREVIEW_AUTH === "1";
}

export function getDevPreviewAuthContext(): AuthContext & {
  user: AuthUser;
  profile: Profile;
  role: AppRole;
} {
  return {
    user: DEV_PREVIEW_USER,
    profile: DEV_PREVIEW_PROFILE,
    role: DEV_PREVIEW_PROFILE.role,
    activeEntityCode: DEV_PREVIEW_PROFILE.entity_code,
    availableEntityCodes: getAccessibleEntityCodes(DEV_PREVIEW_PROFILE),
  };
}

const getProfile = cache(async (userId: string) => sanitizeProfileEntityCode(await getPersonProfile(userId).catch(() => null)));

function fullNameOf(user: AuthUser) {
  const named = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return named || (user.email ?? "").split("@")[0];
}

// A signed-in account without its person (a first sign-in): the person is created from the account.
async function provisionMissingProfile(user: AuthUser) {
  if (!user.email) {
    return null;
  }

  return createPerson({ id: user.id, email: user.email, fullName: fullNameOf(user), isSuperAdmin: shouldForceSuperAdmin(user.email) }).catch(() => null);
}

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  if (!hasFirebaseEnv()) {
    return {
      user: null,
      profile: null,
      role: null,
      activeEntityCode: null,
      availableEntityCodes: [],
    };
  }

  const user = await getCurrentSessionUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      role: null,
      activeEntityCode: null,
      availableEntityCodes: [],
    };
  }

  let profile = await getProfile(user.id);

  if (!profile) {
    profile = await provisionMissingProfile(user);
  } else {
    profile = await elevateProfileIfNeeded(profile);
  }

  profile = sanitizeProfileEntityCode(profile);

  const activeEntityCode = await getActiveEntityCodeForProfile(profile);

  return {
    user,
    profile,
    role: profile?.role ?? null,
    activeEntityCode,
    availableEntityCodes: getAccessibleEntityCodes(profile),
  };
});

export async function requireAuthenticatedUser() {
  const auth = await getAuthContext();

  if (!auth.user) {
    if (isDevPreviewAuthEnabled()) {
      return getDevPreviewAuthContext();
    }
    redirect("/login");
  }

  if (!auth.profile) {
    if (isDevPreviewAuthEnabled()) {
      return getDevPreviewAuthContext();
    }
    redirect("/login?error=profile-missing");
  }

  return auth as AuthContext & { user: NonNullable<AuthContext["user"]>; profile: Profile; role: AppRole };
}

export async function requireRouteAccess(route: AppRouteKey) {
  const auth = await requireAuthenticatedUser();

  if (!canRoleAccessRoute(auth.role, route)) {
    redirect(getDefaultRouteForRole(auth.role));
  }

  return auth;
}

export async function requireFinanceOperationsAccess() {
  const auth = await requireAuthenticatedUser();

  if (auth.role !== "admin" && auth.role !== "manager") {
    redirect("/finance");
  }

  return auth;
}

export async function requireIncomingFinanceOperationsAccess() {
  const auth = await requireAuthenticatedUser();

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect("/finance");
  }

  return auth;
}
