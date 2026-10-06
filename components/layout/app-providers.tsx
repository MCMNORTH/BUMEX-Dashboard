"use client";

import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/components/auth/auth-provider";
import { I18nProvider } from "@/components/layout/i18n-provider";
import type { Locale } from "@/lib/i18n/config";
import type { AuthUser, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider key={initialLocale} initialLocale={initialLocale}>
        <AuthProvider
          initialUser={initialUser}
          initialProfile={initialProfile}
          initialActiveEntityCode={initialActiveEntityCode}
          initialAvailableEntityCodes={initialAvailableEntityCodes}
        >
          {children}
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
