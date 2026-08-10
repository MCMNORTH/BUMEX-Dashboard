"use client";

import { Bell } from "lucide-react";

import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { useI18n } from "@/components/layout/i18n-provider";

export function NotificationBell() {
  const { locale } = useI18n();
  const { unreadCount } = useNotifications(6);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label={locale === "fr" ? "Notifications" : "Notifications"}>
          <Bell className="size-4" />
          {unreadCount ? (
            <span className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <NotificationDropdown />
    </DropdownMenu>
  );
}
