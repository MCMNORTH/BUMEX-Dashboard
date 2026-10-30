import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { getAuthContext } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "BUMEX Vanguard",
  description: "BUMEX Vanguard — l'ERP et le travail du groupe BUMEX.",
};

// A phone's or a tablet's own width; "cover" so the app can keep clear of the notch (env(safe-area-inset-*)).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131d33",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authContext = await getAuthContext();
  const locale = await getCurrentLocale();

  return (
    <html lang={locale}>
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
