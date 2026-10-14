"use client";

import { Suspense, useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { EntitySwitchProvider } from "@/components/entities/entity-switch-dialog";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageBackButton } from "@/components/layout/page-back-button";
import { SidebarAppearanceProvider } from "@/components/layout/sidebar-appearance-provider";
import { SidebarLogoFilters } from "@/components/layout/sidebar-logo";
import type { SidebarAppearance } from "@/lib/settings/appearance";
import { sidebarCollapsedCookieName } from "@/lib/site";

export function AppShell({
  children,
  initialCollapsed = false,
  initialAppearance,
}: {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  initialAppearance: SidebarAppearance;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      // Stored in a cookie so the server renders the same width on the next load (no flash).
      document.cookie = `${sidebarCollapsedCookieName}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);
  const closeMobileSidebar = useCallback(() => setMobileOpen(false), []);
  const openMobileSidebar = useCallback(() => setMobileOpen(true), []);

  return (
    <SidebarAppearanceProvider initialAppearance={initialAppearance}>
      <EntitySwitchProvider>
        <SidebarLogoFilters />
        <div className="min-h-screen bg-background text-foreground">
          <AppSidebar
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={closeMobileSidebar}
          />
          <div
            className={cn(
              "min-h-screen min-w-0 bg-background",
              collapsed ? "lg:pl-20" : "lg:pl-72",
            )}
          >
            <main className="min-h-screen min-w-0 bg-background">
              <div className="flex min-h-screen w-full min-w-0 flex-col bg-background">
                <AppHeader onOpenMobileSidebar={openMobileSidebar} />
                <div className="min-w-0 flex-1 px-3 py-4 sm:px-5 lg:px-6">
                  <Suspense fallback={null}>
                    <PageBackButton />
                  </Suspense>
                  {children}
                </div>
              </div>
            </main>
          </div>
        </div>
      </EntitySwitchProvider>
    </SidebarAppearanceProvider>
  );
}
