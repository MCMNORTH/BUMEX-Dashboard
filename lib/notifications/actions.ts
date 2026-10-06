"use server";

import {
  archiveNotification,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications/service";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

export async function listNotificationsAction(
  limit: number,
  filters: NotificationFilters,
): Promise<NotificationRecord[]> {
  const notifications = await getUserNotifications(filters);
  return notifications.slice(0, limit);
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
