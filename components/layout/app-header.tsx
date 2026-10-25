"use client";

import { Menu } from "lucide-react";

import { AccountMenu } from "@/components/layout/account-menu";
import { GlobalSearch } from "@/components/layout/global-search";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { PageRefreshButton } from "@/components/layout/page-refresh-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  onOpenMobileSidebar: () => void;
};

export function AppHeader({ onOpenMobileSidebar }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 w-full border-b border-border bg-background/96 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="flex w-full min-w-0 items-center gap-1.5 px-3 py-2.5 sm:gap-2 sm:px-5 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 border border-border bg-card lg:hidden"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PageRefreshButton />

          <LanguageSwitcher />

          <NotificationBell />

          <ThemeToggle />

          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
