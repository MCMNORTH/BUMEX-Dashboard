"use client";

import { useEffect, useState } from "react";

import { useUser } from "@/hooks/use-user";
import {
  archiveNotificationAction,
  listNotificationsAction,
  markAllNotificationsAsReadAction,
  markNotificationAsReadAction,
} from "@/lib/notifications/actions";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

const OPERATIONAL_READ_STORAGE_KEY = "bumex-operational-notifications-read";
const OPERATIONAL_ARCHIVED_STORAGE_KEY = "bumex-operational-notifications-archived";

// Firestore is only reachable from the server, so the list is refreshed by
// polling instead of a realtime subscription.
const POLL_INTERVAL_MS = 30_000;

function isOperationalNotification(notification: NotificationRecord) {
  return notification.id.startsWith("operational-");
}

function getStoredIds(key: string) {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function storeId(key: string, id: string) {
  const ids = getStoredIds(key);
  ids.add(id);
  window.localStorage.setItem(key, JSON.stringify([...ids]));
}

export function useNotifications(limit = 8, filters: NotificationFilters = {}) {
  const { profile } = useUser();
  const currentUserId = profile?.id ?? null;
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(() => Boolean(currentUserId));
  const { search = "", unreadOnly = false, type = "", date = "all" } = filters;

  useEffect(() => {
    let mounted = true;

    if (!currentUserId) {
      return;
    }

    async function load() {
      const [stored, operationalResponse] = await Promise.all([
        listNotificationsAction(limit, { search, unreadOnly, type, date }).catch(() => null),
        fetch("/api/notifications/operational", { cache: "no-store" }).catch(() => null),
      ]);

      const operationalPayload = operationalResponse?.ok
        ? await operationalResponse.json() as { notifications?: NotificationRecord[] }
        : { notifications: [] };
      const readOperationalIds = getStoredIds(OPERATIONAL_READ_STORAGE_KEY);
      const archivedOperationalIds = getStoredIds(OPERATIONAL_ARCHIVED_STORAGE_KEY);
      const operationalNotifications = (operationalPayload.notifications ?? [])
        .filter((notification) => !archivedOperationalIds.has(notification.id))
        .map((notification) => ({ ...notification, is_read: readOperationalIds.has(notification.id) }))
        .filter((notification) => !search || `${notification.title} ${notification.body}`.toLowerCase().includes(search.toLowerCase()))
        .filter((notification) => !unreadOnly || !notification.is_read)
        .filter((notification) => !type || notification.type === type);

      if (mounted) {
        // Keep the last known list when the stored notifications fail to load.
        setNotifications((current) =>
          stored === null
            ? current
            : [...operationalNotifications, ...stored].slice(0, limit),
        );
        setLoading(false);
      }
    }

    const loadingTimer = window.setTimeout(() => {
      if (mounted) {
        setLoading(true);
      }
    }, 0);
    void load();

    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [currentUserId, date, limit, search, type, unreadOnly]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function markAsRead(notificationId: string) {
    if (!currentUserId) {
      return;
    }

    if (isOperationalNotification(notifications.find((notification) => notification.id === notificationId) ?? {} as NotificationRecord)) {
      storeId(OPERATIONAL_READ_STORAGE_KEY, notificationId);
      setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, is_read: true } : notification));
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification,
      ),
    );

    await markNotificationAsReadAction(notificationId);
  }

  async function markAllAsRead() {
    const operationalIds = notifications.filter(isOperationalNotification).map((notification) => notification.id);
    operationalIds.forEach((id) => storeId(OPERATIONAL_READ_STORAGE_KEY, id));
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true })),
    );

    if (!currentUserId) {
      return;
    }

    await markAllNotificationsAsReadAction();
  }

  async function archiveNotification(notificationId: string) {
    if (isOperationalNotification(notifications.find((notification) => notification.id === notificationId) ?? {} as NotificationRecord)) {
      storeId(OPERATIONAL_ARCHIVED_STORAGE_KEY, notificationId);
      setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
      return;
    }

    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );

    if (!currentUserId) {
      return;
    }

    await archiveNotificationAction(notificationId);
  }

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  };
}
