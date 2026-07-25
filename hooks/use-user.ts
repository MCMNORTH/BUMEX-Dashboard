"use client";

import { useAuthContext } from "@/components/auth/auth-provider";

export function useUser() {
  const { user, profile, loading, refreshProfile } = useAuthContext();

  return {
    user,
    profile,
    loading,
    refreshProfile,
  };
}
