import type { Metadata } from "next";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { getAuthContext } from "@/lib/auth/server";
import { getOrProvisionErpAccess } from "@/lib/erp/roles";
import { getCurrentLocale } from "@/lib/i18n/server";
import { resolveSidebarAppearance } from "@/lib/settings/appearance";

export const metadata: Metadata = {
  title: "BUMEX Vanguard",
  description: "BUMEX Vanguard — l'ERP et le travail du groupe BUMEX.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authContext = await getAuthContext();
  const locale = await getCurrentLocale();
  // Set on <html> so dialogs and menus, which render outside the app shell, follow it too.
  const appTheme = authContext.profile ? resolveSidebarAppearance(authContext.profile).sidebarTheme : undefined;
  // People with ERP access work in Vanguard's frame and design (globals.css html.vanguard-app, light only).
  const vanguard = authContext.profile ? Boolean(await getOrProvisionErpAccess(authContext.profile)) : false;

  return (
    <html
      lang={locale}
      data-app-theme={appTheme}
      className={vanguard ? "vanguard-app" : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppProviders
          initialUser={authContext.user}
          initialProfile={authContext.profile}
          initialActiveEntityCode={authContext.activeEntityCode}
          initialAvailableEntityCodes={authContext.availableEntityCodes}
          initialLocale={locale}
          forcedTheme={vanguard ? "light" : undefined}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
