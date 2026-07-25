"use client";

import { useAuthContext } from "@/components/auth/auth-provider";

export function usePermissions() {
  return useAuthContext().permissions;
}
