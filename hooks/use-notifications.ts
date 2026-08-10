"use client";

import { useEffect, useId, useState } from "react";

import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

const OPERATIONAL_READ_STORAGE_KEY = "bumex-operational-notifications-read";
const OPERATIONAL_ARCHIVED_STORAGE_KEY = "bumex-operational-notifications-archived";

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
  const [loading, setLoading] = useState(() => Boolean(createClient()) && Boolean(currentUserId));
  const instanceId = useId().replaceAll(":", "");
  const { search = "", unreadOnly = false, type = "", date = "all" } = filters;

  useEffect(() => {
    let mounted = true;
    const browserClient = createClient();

    if (!browserClient) {
      return;
    }

    if (!currentUserId) {
      return;
    }

    const supabase = browserClient;

    async function load() {
      let query = supabase
        .from("notifications")
        .select("id, user_id, type, title, body, entity_type, entity_id, is_read, created_at, archived_at")
        .eq("user_id", currentUserId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
      }

      if (unreadOnly) {
        query = query.eq("is_read", false);
      }

      if (type) {
        query = query.eq("type", type);
      }

      if (date === "today") {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        query = query.gte("created_at", today.toISOString());
      }

      if (date === "week") {
        const start = new Date();
        start.setUTCDate(start.getUTCDate() - 7);
        query = query.gte("created_at", start.toISOString());
      }

      if (date === "month") {
        const start = new Date();
        start.setUTCDate(start.getUTCDate() - 30);
        query = query.gte("created_at", start.toISOString());
      }

      const [{ data }, operationalResponse] = await Promise.all([
        query.limit(limit).returns<NotificationRecord[]>(),
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
        setNotifications([...operationalNotifications, ...(data ?? [])].slice(0, limit));
        setLoading(false);
      }
    }

    const loadingTimer = window.setTimeout(() => {
      if (mounted) {
        setLoading(true);
      }
    }, 0);
    void load();

    const channel = supabase
      .channel(`notifications-${limit}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${currentUserId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      window.clearTimeout(loadingTimer);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, date, instanceId, limit, search, type, unreadOnly]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function markAsRead(notificationId: string) {
    const supabase = createClient();

    if (!supabase || !currentUserId) {
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

    await supabase.from("notifications").update({ is_read: true }).eq("user_id", currentUserId).eq("id", notificationId);
  }

  async function markAllAsRead() {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    const operationalIds = notifications.filter(isOperationalNotification).map((notification) => notification.id);
    operationalIds.forEach((id) => storeId(OPERATIONAL_READ_STORAGE_KEY, id));
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true })),
    );

    if (!currentUserId) {
      return;
    }

    await supabase.from("notifications").update({ is_read: true }).eq("user_id", currentUserId).eq("is_read", false);
  }

  async function archiveNotification(notificationId: string) {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

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

    await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString(), is_read: true })
      .eq("user_id", currentUserId)
      .eq("id", notificationId);
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
