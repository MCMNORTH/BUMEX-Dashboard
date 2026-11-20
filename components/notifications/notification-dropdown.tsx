"use client";

import Link from "next/link";

import { NotificationList } from "@/components/notifications/notification-list";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const sectionTitle = "px-1 pb-2 text-xs font-semibold text-muted-foreground";

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
          <div role="status" aria-busy="true" className="space-y-2 py-1">
            <span className="sr-only">{isFr ? "Chargement des notifications…" : "Loading notifications…"}</span>
            {[72, 56, 64].map((width) => (
              <div key={width} className="flex items-start gap-3 rounded-sm border p-3">
                <Skeleton className="size-8 shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3" style={{ width: `${width}%` }} />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
              </div>
            ))}
          </div>
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
