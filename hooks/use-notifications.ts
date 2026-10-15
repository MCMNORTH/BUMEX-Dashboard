"use client";

import { useMemo, useSyncExternalStore } from "react";

import { useUser } from "@/hooks/use-user";
import {
  archiveNotificationAction,
  listNotificationsAction,
  markAllNotificationsAsReadAction,
  markNotificationAsReadAction,
} from "@/lib/notifications/actions";
import { hasNewerVersions, subscribeLive, type LiveVersions } from "@/lib/live/live-client";
import type { NotificationFilters, NotificationRecord } from "@/types/notification";

const OPERATIONAL_READ_STORAGE_KEY = "bumex-operational-notifications-read";
const OPERATIONAL_ARCHIVED_STORAGE_KEY = "bumex-operational-notifications-archived";

// Firestore is only reachable from the server, so the browser learns about new
// notifications by polling the table write counters (lib/live/live-client.ts),
// and fetches the list only when this user's notifications counter moved.
const OWN_NOTIFICATIONS = "notifications:me";
const CHECK_INTERVAL_MS = 30_000;

// Operational alerts are computed from these tables. They are recomputed when
// one changed, at most every 5 minutes, and every 15 minutes regardless, since
// "overdue" also depends on today's date.
const OPERATIONAL_SOURCES = ["tasks", "projects", "milestones", "contracts", "invoices", "payments", "profiles"];
const OPERATIONAL_MIN_AGE_MS = 5 * 60_000;
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
  operationalVersions: LiveVersions | null;
  seenVersion: number | null;
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

function onVersions(store: Store, versions: LiveVersions) {
  if (OWN_NOTIFICATIONS in versions && versions[OWN_NOTIFICATIONS] !== store.seenVersion) {
    store.seenVersion = versions[OWN_NOTIFICATIONS];
    void loadStored(store);
  }

  const sources = Object.fromEntries(OPERATIONAL_SOURCES.filter((table) => table in versions).map((table) => [table, versions[table]]));
  const age = Date.now() - store.operationalAt;
  const changed = !store.operationalVersions || hasNewerVersions(store.operationalVersions, sources);

  if (age > OPERATIONAL_MAX_AGE_MS || (changed && age > OPERATIONAL_MIN_AGE_MS)) {
    store.operationalVersions = sources;
    void loadOperational(store);
  }
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
      operationalVersions: null,
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
    store.stopLive = subscribeLive([OWN_NOTIFICATIONS, ...OPERATIONAL_SOURCES], CHECK_INTERVAL_MS, (versions) => onVersions(store, versions));
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
