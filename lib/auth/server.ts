import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { getDefaultRouteForRole, canRoleAccessRoute } from "@/lib/auth/permissions";
import { getAccessibleEntityCodes, getActiveEntityCodeForProfile } from "@/lib/entities/server";
import { sanitizeProfileEntityCode } from "@/lib/entities/runtime";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Profile, AppRole } from "@/types/auth";
import { DEFAULT_BUMEX_ENTITY_CODE, type BumexEntityCode } from "@/types/entity";
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

const DEV_PREVIEW_USER = {
  id: DEV_PREVIEW_PROFILE.id,
  email: DEV_PREVIEW_PROFILE.email,
  user_metadata: {
    full_name: DEV_PREVIEW_PROFILE.full_name,
  },
  app_metadata: {},
  aud: "authenticated",
  created_at: DEV_PREVIEW_PROFILE.created_at,
} as User;

const profileSelectClause =
  "id, email, full_name, role, is_super_admin, entity_code, avatar_url, job_title, department, skills, phone, availability_status, weekly_capacity_hours, created_at, updated_at";
const legacyProfileSelectClause =
  "id, email, full_name, role, avatar_url, job_title, department, skills, phone, availability_status, weekly_capacity_hours, created_at, updated_at";

type LegacyProfileRow = Omit<Profile, "is_super_admin" | "entity_code">;

function isMissingEntityFoundationColumn(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  return normalized.includes("is_super_admin") || normalized.includes("entity_code");
}

function normalizeLegacyProfile(profile: LegacyProfileRow | null): Profile | null {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    is_super_admin: false,
    entity_code: DEFAULT_BUMEX_ENTITY_CODE,
  };
}

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

async function elevateProfileIfNeeded(profile: Profile | null) {
  if (!profile || !shouldForceSuperAdmin(profile.email)) {
    return profile;
  }

  if (profile.role === "admin" && profile.is_super_admin) {
    return profile;
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      ...profile,
      role: "admin" as AppRole,
      is_super_admin: true,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      role: "admin",
      is_super_admin: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .select(profileSelectClause)
    .maybeSingle<Profile>();

  if (error) {
    return {
      ...profile,
      role: "admin" as AppRole,
      is_super_admin: true,
    };
  }

  return data ?? {
    ...profile,
    role: "admin" as AppRole,
    is_super_admin: true,
  };
}

export type AuthContext = {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  activeEntityCode: BumexEntityCode | null;
  availableEntityCodes: BumexEntityCode[];
};

export function isDevPreviewAuthEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_LOCAL_PREVIEW_AUTH === "1";
}

export function getDevPreviewAuthContext(): AuthContext & {
  user: User;
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

const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  let { data, error } = await supabase
    .from("profiles")
    .select(profileSelectClause)
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (error) {
    const ownProfileResponse = await supabase
      .rpc("get_own_profile")
      .maybeSingle<Profile>();

    if (!ownProfileResponse.error && ownProfileResponse.data) {
      data = ownProfileResponse.data;
      error = null;
    }
  }

  if (error && isMissingEntityFoundationColumn(error.message)) {
    const legacyResponse = await supabase
      .from("profiles")
      .select(legacyProfileSelectClause)
      .eq("id", userId)
      .maybeSingle<LegacyProfileRow>();

    if (legacyResponse.error) {
      return null;
    }

    data = normalizeLegacyProfile(legacyResponse.data);
    error = null;
  }

  return error ? null : sanitizeProfileEntityCode(data ?? null);
});

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager" || value === "supervisor" || value === "employee" || value === "shareholder";
}

function buildFallbackProfile(user: User): Profile | null {
  if (!user.email) {
    return null;
  }

  const inferredRole = isAppRole(user.user_metadata?.role)
    ? user.user_metadata.role
    : "employee";
  const fullName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email.split("@")[0];
  const now = new Date().toISOString();

  return {
    id: user.id,
    email: user.email,
    full_name: fullName,
    role: shouldForceSuperAdmin(user.email) ? "admin" : inferredRole,
    is_super_admin: shouldForceSuperAdmin(user.email),
    entity_code: null,
    avatar_url: null,
    job_title: "Workspace member",
    department: "Operations",
    skills: [],
    phone: null,
    availability_status: "available",
    weekly_capacity_hours: 40,
    created_at: now,
    updated_at: now,
  };
}

async function provisionMissingProfile(user: User) {
  const supabase = await createClient();

  if (!supabase || !user.email) {
    return null;
  }

  const fallbackProfile = buildFallbackProfile(user);

  if (!fallbackProfile) {
    return null;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: fallbackProfile.id,
        email: fallbackProfile.email,
        full_name: fallbackProfile.full_name,
        role: fallbackProfile.role,
        is_super_admin: fallbackProfile.is_super_admin,
        entity_code: fallbackProfile.entity_code,
        avatar_url: fallbackProfile.avatar_url,
        job_title: fallbackProfile.job_title,
        department: fallbackProfile.department,
        skills: fallbackProfile.skills,
        phone: fallbackProfile.phone,
        availability_status: fallbackProfile.availability_status,
        weekly_capacity_hours: fallbackProfile.weekly_capacity_hours,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select(profileSelectClause)
    .maybeSingle<Profile>();

  if (error && isMissingEntityFoundationColumn(error.message)) {
    const { data: legacyData, error: legacyError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: fallbackProfile.id,
          email: fallbackProfile.email,
          full_name: fallbackProfile.full_name,
          role: fallbackProfile.role,
          avatar_url: fallbackProfile.avatar_url,
          job_title: fallbackProfile.job_title,
          department: fallbackProfile.department,
          skills: fallbackProfile.skills,
          phone: fallbackProfile.phone,
          availability_status: fallbackProfile.availability_status,
          weekly_capacity_hours: fallbackProfile.weekly_capacity_hours,
          updated_at: now,
        },
        { onConflict: "id" },
      )
      .select(legacyProfileSelectClause)
      .maybeSingle<LegacyProfileRow>();

    if (legacyError) {
      return fallbackProfile;
    }

    return normalizeLegacyProfile(legacyData) ?? fallbackProfile;
  }

  if (error) {
    return fallbackProfile;
  }

  return sanitizeProfileEntityCode(await elevateProfileIfNeeded(data ?? fallbackProfile));
}

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  if (!hasSupabaseEnv()) {
    return {
      user: null,
      profile: null,
      role: null,
      activeEntityCode: null,
      availableEntityCodes: [],
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      user: null,
      profile: null,
      role: null,
      activeEntityCode: null,
      availableEntityCodes: [],
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  if (!profile) {
    profile = buildFallbackProfile(user);
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
