"use client";

import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);
  const closeMobileSidebar = useCallback(() => setMobileOpen(false), []);
  const openMobileSidebar = useCallback(() => setMobileOpen(true), []);

  return (
    <div className="min-h-screen bg-[#161a22] text-foreground">
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobileSidebar}
      />
      <div
        className={cn(
          "min-h-screen min-w-0 bg-[#161a22]",
          collapsed ? "lg:pl-24" : "lg:pl-72",
        )}
      >
        <main className="min-h-screen min-w-0 bg-[#161a22]">
          <div className="flex min-h-screen w-full min-w-0 flex-col bg-[#161a22]">
            <AppHeader onOpenMobileSidebar={openMobileSidebar} />
            <div className="app-density min-w-0 flex-1 px-3 py-4 sm:px-5 lg:px-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
