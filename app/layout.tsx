import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { getAuthContext } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { THEME_SCRIPT } from "@/lib/theme-script";

export const metadata: Metadata = {
  title: "BUMEX Vanguard",
  description: "BUMEX Vanguard — l'ERP et le travail du groupe BUMEX.",
};

// A phone's or a tablet's own width; "cover" so the app can keep clear of the notch (env(safe-area-inset-*)).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Fluent's frame, light or dark (lib/theme-script.ts)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authContext = await getAuthContext();
  const locale = await getCurrentLocale();

  return (
    // suppressHydrationWarning: THEME_SCRIPT sets the theme on <html> before React (lib/theme-script.ts)
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppProviders
          initialUser={authContext.user}
          initialProfile={authContext.profile}
          initialActiveEntityCode={authContext.activeEntityCode}
          initialAvailableEntityCodes={authContext.availableEntityCodes}
          initialLocale={locale}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
