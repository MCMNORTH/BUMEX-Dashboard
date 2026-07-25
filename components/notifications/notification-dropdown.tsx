"use client";

import Link from "next/link";

import { NotificationList } from "@/components/notifications/notification-list";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationDropdown() {
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead } = useNotifications(6);

  return (
    <DropdownMenuContent align="end" className="w-[24rem]">
      <DropdownMenuLabel className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>Notifications</span>
          <UnreadBadge count={unreadCount} />
        </div>
        {unreadCount ? (
          <button
            type="button"
            className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => void markAllAsRead()}
          >
            Mark all as read
          </button>
        ) : null}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-[28rem] overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">Loading notifications...</div>
        ) : (
          <NotificationList
            notifications={notifications}
            compact
            onMarkRead={markAsRead}
            emptyMessage="No recent notifications."
          />
        )}
      </div>
      <DropdownMenuSeparator />
      <div className="p-2">
        <Button asChild variant="secondary" className="w-full rounded-2xl">
          <Link href="/notifications">View all notifications</Link>
        </Button>
      </div>
    </DropdownMenuContent>
  );
}
