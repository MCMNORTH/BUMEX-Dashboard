"use server";

import {
  archiveNotification,
  getNotificationsVersion,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications/service";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

export async function listNotificationsAction(
  limit: number,
  filters: NotificationFilters,
): Promise<NotificationRecord[]> {
  return getUserNotifications(filters, Math.min(Math.max(Math.trunc(Number(limit)) || 1, 1), 200));
}

export async function markNotificationAsReadAction(notificationId: string) {
  await markNotificationAsRead(notificationId);
}

export async function markAllNotificationsAsReadAction() {
  await markAllNotificationsAsRead();
}

export async function archiveNotificationAction(notificationId: string) {
  await archiveNotification(notificationId);
}

export async function notificationsVersionAction(): Promise<string | null> {
  return getNotificationsVersion().catch(() => null);
}
