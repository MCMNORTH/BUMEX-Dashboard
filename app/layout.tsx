import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { getAuthContext } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";

const fontSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "BUMEX IT Dashboard",
  description: "Premium internal dashboard foundation for BUMEX IT.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authContext = await getAuthContext();
  const locale = await getCurrentLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
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
