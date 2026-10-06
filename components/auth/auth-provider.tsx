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

import { getCurrentProfileAction } from "@/lib/auth/actions";
import { buildPermissionSetForContext } from "@/lib/auth/permissions";
import { sanitizeProfileEntityCode } from "@/lib/entities/runtime";
import type { AuthState, AuthUser, Profile, PermissionSet } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

type AuthContextValue = AuthState & {
  permissions: PermissionSet;
  activeEntityCode: BumexEntityCode | null;
  availableEntityCodes: BumexEntityCode[];
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  initialProfile,
  initialActiveEntityCode,
  initialAvailableEntityCodes,
}: {
  children: ReactNode;
  initialUser: AuthUser | null;
  initialProfile: Profile | null;
  initialActiveEntityCode: BumexEntityCode | null;
  initialAvailableEntityCodes: BumexEntityCode[];
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
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
    const nextProfile = sanitizeProfileEntityCode(await getCurrentProfileAction());
    setProfile(nextProfile);
    setLoading(false);
  }, [user]);

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
