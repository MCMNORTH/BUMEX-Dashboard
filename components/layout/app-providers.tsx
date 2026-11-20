"use client";

import { AuthProvider } from "@/components/auth/auth-provider";
import { I18nProvider } from "@/components/layout/i18n-provider";
import type { Locale } from "@/lib/i18n/config";
import { useThemePref } from "@/lib/theme";
import type { AuthUser, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

// Keeps the theme in step with the person's choice and, when they follow it, the system's (lib/theme.ts).
function ThemeSync() {
  useThemePref();
  return null;
}

export function AppProviders({
  children,
  initialUser,
  initialProfile,
  initialActiveEntityCode,
  initialAvailableEntityCodes,
  initialLocale,
}: {
  children: React.ReactNode;
  initialUser: AuthUser | null;
  initialProfile: Profile | null;
  initialActiveEntityCode: BumexEntityCode | null;
  initialAvailableEntityCodes: BumexEntityCode[];
  initialLocale: Locale;
}) {
  return (
    <I18nProvider key={initialLocale} initialLocale={initialLocale}>
      <AuthProvider
        initialUser={initialUser}
        initialProfile={initialProfile}
        initialActiveEntityCode={initialActiveEntityCode}
        initialAvailableEntityCodes={initialAvailableEntityCodes}
      >
        <ThemeSync />
        {children}
      </AuthProvider>
    </I18nProvider>
  );
}
