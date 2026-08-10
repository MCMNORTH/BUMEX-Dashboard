"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { buildPermissionSetForContext } from "@/lib/auth/permissions";
import { sanitizeProfileEntityCode } from "@/lib/entities/runtime";
import { createClient } from "@/lib/supabase/client";
import type { AuthState, Profile, PermissionSet } from "@/types/auth";
import { DEFAULT_BUMEX_ENTITY_CODE, type BumexEntityCode } from "@/types/entity";

type AuthContextValue = AuthState & {
  permissions: PermissionSet;
  activeEntityCode: BumexEntityCode | null;
  availableEntityCodes: BumexEntityCode[];
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

async function fetchProfile(userId: string) {
  const supabase = createClient();

  if (!supabase) {
    return null;
  }

  let { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_super_admin, entity_code, avatar_url, job_title, department, skills, phone, availability_status, weekly_capacity_hours, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (error && isMissingEntityFoundationColumn(error.message)) {
    const legacyResponse = await supabase
      .from("profiles")
      .select("id, email, full_name, role, avatar_url, job_title, department, skills, phone, availability_status, weekly_capacity_hours, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle<LegacyProfileRow>();

    if (legacyResponse.error) {
      return null;
    }

    data = normalizeLegacyProfile(legacyResponse.data);
    error = null;
  }

  return error ? null : sanitizeProfileEntityCode(data ?? null);
}

export function AuthProvider({
  children,
  initialUser,
  initialProfile,
  initialActiveEntityCode,
  initialAvailableEntityCodes,
  disableAuthSync = false,
}: {
  children: ReactNode;
  initialUser: User | null;
  initialProfile: Profile | null;
  initialActiveEntityCode: BumexEntityCode | null;
  initialAvailableEntityCodes: BumexEntityCode[];
  disableAuthSync?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUser(initialUser);
      setProfile(initialProfile);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialProfile, initialUser]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    setLoading(true);
    const nextProfile = sanitizeProfileEntityCode(await fetchProfile(user.id));
    setProfile(nextProfile);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (disableAuthSync) {
      return;
    }

    const supabase = createClient();

    if (!supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        router.refresh();
        return;
      }

      const nextProfile = sanitizeProfileEntityCode(await fetchProfile(nextUser.id));
      setProfile(nextProfile);
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [disableAuthSync, router]);

  const value = useMemo<AuthContextValue>(() => {
    const resolvedActiveEntityCode =
      profile?.is_super_admin
        ? (initialActiveEntityCode ?? profile.entity_code ?? null)
        : (profile?.entity_code ?? initialActiveEntityCode ?? null);
    const resolvedAvailableEntityCodes =
      profile?.is_super_admin
        ? initialAvailableEntityCodes
        : (profile?.entity_code ? [profile.entity_code] : []);

    return {
      user,
      profile,
      loading,
      activeEntityCode: resolvedActiveEntityCode,
      availableEntityCodes: resolvedAvailableEntityCodes,
      permissions: buildPermissionSetForContext({
        role: profile?.role ?? null,
        isSuperAdmin: profile?.is_super_admin ?? false,
      }),
      refreshProfile,
    };
  }, [initialActiveEntityCode, initialAvailableEntityCodes, loading, profile, refreshProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider.");
  }

  return context;
}
