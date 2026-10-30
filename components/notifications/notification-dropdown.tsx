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
import { useI18n } from "@/components/layout/i18n-provider";

export function NotificationDropdown() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { stored, alerts, unreadCount, loading, markAllAsRead, markAsRead } = useNotifications(6);
  const sectionTitle = "px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <DropdownMenuContent align="end" className="w-[24rem]">
      <DropdownMenuLabel className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>{isFr ? "Notifications" : "Notifications"}</span>
          <UnreadBadge count={unreadCount} />
        </div>
        {unreadCount ? (
          <button
            type="button"
            className="text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => void markAllAsRead()}
          >
            {isFr ? "Tout marquer comme lu" : "Mark all as read"}
          </button>
        ) : null}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-[min(28rem,calc(var(--radix-dropdown-menu-content-available-height)-8rem))] overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">{isFr ? "Chargement des notifications..." : "Loading notifications..."}</div>
        ) : (
          // Alerts are recomputed on every check and would always sort first,
          // pushing assignments and mentions out of view; each gets its own section.
          <div className="space-y-4">
            <section>
              <p className={sectionTitle}>{isFr ? "Récentes" : "Recent"}</p>
              <NotificationList
                notifications={stored.slice(0, 5)}
                compact
                onMarkRead={markAsRead}
                emptyMessage={isFr ? "Aucune notification récente." : "No recent notifications."}
              />
            </section>
            {alerts.length ? (
              <section>
                <p className={sectionTitle}>{isFr ? "À surveiller" : "Needs attention"}</p>
                <NotificationList notifications={alerts.slice(0, 3)} compact onMarkRead={markAsRead} />
              </section>
            ) : null}
          </div>
        )}
      </div>
      <DropdownMenuSeparator />
      <div className="p-2">
        <Button asChild variant="secondary" className="w-full rounded-xl">
          <Link href="/notifications">{isFr ? "Voir toutes les notifications" : "View all notifications"}</Link>
        </Button>
      </div>
    </DropdownMenuContent>
  );
}
