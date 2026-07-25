"use client";

import { useAuthContext } from "@/components/auth/auth-provider";

export function useRole() {
  return useAuthContext().profile?.role ?? null;
}
