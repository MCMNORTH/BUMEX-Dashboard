"use client";

import { useI18n } from "@/components/layout/i18n-provider";
import { NotificationItem } from "@/components/notifications/notification-item";
import type { NotificationRecord } from "@/types/notification";

export function NotificationList({
  notifications,
  compact = false,
  onMarkRead,
  onArchive,
  emptyMessage = "No notifications yet.",
}: {
  notifications: NotificationRecord[];
  compact?: boolean;
  onMarkRead?: (notificationId: string) => void | Promise<void>;
  onArchive?: (notificationId: string) => void | Promise<void>;
  emptyMessage?: string;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";

  if (!notifications.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 bg-background/35 p-6 text-sm text-muted-foreground">
        {emptyMessage === "No notifications yet." ? (isFr ? "Aucune notification pour le moment." : emptyMessage) : emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          compact={compact}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
