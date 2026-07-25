"use client";

import { useEffect, useId, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

export function useNotifications(limit = 8, filters: NotificationFilters = {}) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(() => Boolean(createClient()));
  const instanceId = useId().replaceAll(":", "");
  const { search = "", unreadOnly = false, type = "", date = "all" } = filters;

  useEffect(() => {
    let mounted = true;
    const browserClient = createClient();

    if (!browserClient) {
      return;
    }

    const supabase = browserClient;

    async function load() {
      let query = supabase
        .from("notifications")
        .select("id, user_id, type, title, body, entity_type, entity_id, is_read, created_at, archived_at")
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

      const { data } = await query
        .limit(limit)
        .returns<NotificationRecord[]>();

      if (mounted) {
        setNotifications(data ?? []);
        setLoading(false);
      }
    }

    void load();

    const channel = supabase
      .channel(`notifications-${limit}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [date, instanceId, limit, search, type, unreadOnly]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function markAsRead(notificationId: string) {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification,
      ),
    );

    await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
  }

  async function markAllAsRead() {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true })),
    );

    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  }

  async function archiveNotification(notificationId: string) {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );

    await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString(), is_read: true })
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
