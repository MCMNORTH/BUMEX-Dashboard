"use client";

import { useMemo, useSyncExternalStore } from "react";

import { useUser } from "@/hooks/use-user";
import {
  archiveNotificationAction,
  listNotificationsAction,
  markAllNotificationsAsReadAction,
  markNotificationAsReadAction,
  notificationsVersionAction,
} from "@/lib/notifications/actions";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

const OPERATIONAL_READ_STORAGE_KEY = "bumex-operational-notifications-read";
const OPERATIONAL_ARCHIVED_STORAGE_KEY = "bumex-operational-notifications-archived";

// The browser learns about new notifications by asking for their version every half minute while the tab is
// visible (lib/notifications/service.ts getNotificationsVersion), and reads the list only when it moved.
const CHECK_INTERVAL_MS = 30_000;

// Operational alerts are computed from the current data (overdue, blocked…): read again every 15 minutes, since
// "overdue" also depends on today's date.
const OPERATIONAL_MAX_AGE_MS = 15 * 60_000;

function isOperationalNotification(notificationId: string) {
  return notificationId.startsWith("operational-");
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
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Storage full or blocked: the change still applies until the next reload.
  }
}

type View = {
  /** Both kinds together (alerts first), for the notification center. */
  notifications: NotificationRecord[];
  /** Notifications people or the app sent to this user. */
  stored: NotificationRecord[];
  /** Operational alerts computed from current data (overdue, blocked...). */
  alerts: NotificationRecord[];
  loading: boolean;
};

// One list per user, limit and filters, shared by every component showing it
// (the bell and its dropdown read the same one) and kept while unmounted, so
// reopening the dropdown shows it at once.
type Store = {
  userId: string;
  limit: number;
  filters: Required<NotificationFilters>;
  stored: NotificationRecord[] | null;
  operational: NotificationRecord[];
  operationalAt: number;
  seenVersion: string | null;
  view: View;
  listeners: Set<() => void>;
  stopLive: (() => void) | null;
};

const stores = new Map<string, Store>();
const SERVER_VIEW: View = { notifications: [], stored: [], alerts: [], loading: false };

function rebuild(store: Store) {
  const { search, unreadOnly, type } = store.filters;
  const readIds = getStoredIds(OPERATIONAL_READ_STORAGE_KEY);
  const archivedIds = getStoredIds(OPERATIONAL_ARCHIVED_STORAGE_KEY);
  const alerts = store.operational
    .filter((notification) => !archivedIds.has(notification.id))
    .map((notification) => ({ ...notification, is_read: readIds.has(notification.id) }))
    .filter((notification) => !search || `${notification.title} ${notification.body}`.toLowerCase().includes(search.toLowerCase()))
    .filter((notification) => !unreadOnly || !notification.is_read)
    .filter((notification) => !type || notification.type === type);

  const stored = store.stored ?? [];

  store.view = {
    notifications: [...alerts, ...stored].slice(0, store.limit),
    stored: stored.slice(0, store.limit),
    alerts: alerts.slice(0, store.limit),
    loading: store.stored === null,
  };
  store.listeners.forEach((listener) => listener());
}

function storesOf(userId: string) {
  return [...stores.values()].filter((store) => store.userId === userId);
}

async function loadStored(store: Store) {
  const stored = await listNotificationsAction(store.limit, store.filters).catch(() => null);

  // Keep the last known list when the stored notifications fail to load.
  if (stored !== null) {
    store.stored = stored;
    rebuild(store);
  } else if (store.stored === null) {
    store.stored = [];
    rebuild(store);
  }
}

async function loadOperational(store: Store) {
  store.operationalAt = Date.now();
  const response = await fetch("/api/notifications/operational", { cache: "no-store" }).catch(() => null);

  if (response?.ok) {
    const payload = (await response.json()) as { notifications?: NotificationRecord[] };
    store.operational = payload.notifications ?? [];
    rebuild(store);
  }
}

async function check(store: Store) {
  const version = await notificationsVersionAction().catch(() => null);

  if (version !== null && version !== store.seenVersion) {
    store.seenVersion = version;
    void loadStored(store);
  }

  if (Date.now() - store.operationalAt > OPERATIONAL_MAX_AGE_MS) {
    void loadOperational(store);
  }
}

// Checks now, then every half minute while the tab is visible (and as soon as it is shown again).
function watch(store: Store) {
  let timer: number | null = null;
  const tick = () => {
    if (timer !== null) window.clearTimeout(timer);
    if (document.visibilityState === "visible") void check(store);
    timer = window.setTimeout(tick, CHECK_INTERVAL_MS);
  };
  const onShown = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onShown);
  tick();
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onShown);
  };
}

function getStore(userId: string, limit: number, filters: Required<NotificationFilters>) {
  const key = JSON.stringify([userId, limit, filters.search, filters.unreadOnly, filters.type, filters.date]);
  let store = stores.get(key);

  if (!store) {
    store = {
      userId,
      limit,
      filters,
      stored: null,
      operational: [],
      operationalAt: 0,
      seenVersion: null,
      view: { notifications: [], stored: [], alerts: [], loading: true },
      listeners: new Set(),
      stopLive: null,
    };
    stores.set(key, store);
  }

  return store;
}

function subscribe(store: Store, listener: () => void) {
  store.listeners.add(listener);

  if (!store.stopLive) {
    store.stopLive = watch(store);
  }

  return () => {
    store.listeners.delete(listener);

    if (!store.listeners.size) {
      store.stopLive?.();
      store.stopLive = null;
    }
  };
}

const noopSubscribe = () => () => {};

export function useNotifications(limit = 8, filters: NotificationFilters = {}) {
  const { profile } = useUser();
  const currentUserId = profile?.id ?? null;
  const { search = "", unreadOnly = false, type = "", date = "all" } = filters;
  const store = useMemo(
    () => (currentUserId ? getStore(currentUserId, limit, { search, unreadOnly, type, date }) : null),
    [currentUserId, limit, search, unreadOnly, type, date],
  );
  const subscribeToStore = useMemo(
    () => (store ? (listener: () => void) => subscribe(store, listener) : noopSubscribe),
    [store],
  );
  const view = useSyncExternalStore(subscribeToStore, () => store?.view ?? SERVER_VIEW, () => SERVER_VIEW);
  const notifications = view.notifications;
  // What the bell and its dropdown show: the latest stored notifications and the alerts.
  const unreadCount = [...view.stored, ...view.alerts].filter((notification) => !notification.is_read).length;

  async function markAsRead(notificationId: string) {
    if (!currentUserId) {
      return;
    }

    if (isOperationalNotification(notificationId)) {
      storeId(OPERATIONAL_READ_STORAGE_KEY, notificationId);
      storesOf(currentUserId).forEach(rebuild);
      return;
    }

    storesOf(currentUserId).forEach((item) => {
      item.stored = item.stored?.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification,
      ) ?? null;
      rebuild(item);
    });

    await markNotificationAsReadAction(notificationId);
  }

  async function markAllAsRead() {
    [...notifications, ...view.alerts]
      .filter((notification) => isOperationalNotification(notification.id))
      .forEach((notification) => storeId(OPERATIONAL_READ_STORAGE_KEY, notification.id));

    if (!currentUserId) {
      return;
    }

    storesOf(currentUserId).forEach((item) => {
      item.stored = item.stored?.map((notification) => ({ ...notification, is_read: true })) ?? null;
      rebuild(item);
    });

    await markAllNotificationsAsReadAction();
  }

  async function archiveNotification(notificationId: string) {
    if (!currentUserId) {
      return;
    }

    if (isOperationalNotification(notificationId)) {
      storeId(OPERATIONAL_ARCHIVED_STORAGE_KEY, notificationId);
      storesOf(currentUserId).forEach(rebuild);
      return;
    }

    storesOf(currentUserId).forEach((item) => {
      item.stored = item.stored?.filter((notification) => notification.id !== notificationId) ?? null;
      rebuild(item);
    });

    await archiveNotificationAction(notificationId);
  }

  return {
    notifications,
    stored: view.stored,
    alerts: view.alerts,
    unreadCount,
    loading: view.loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  };
}
