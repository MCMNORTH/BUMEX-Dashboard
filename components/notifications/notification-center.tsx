"use client";

import { useState } from "react";
import { BellRing, CheckCheck, Inbox } from "lucide-react";

import { NotificationFilters } from "@/components/notifications/notification-filters";
import { NotificationList } from "@/components/notifications/notification-list";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNotifications } from "@/hooks/use-notifications";
import { useI18n } from "@/components/layout/i18n-provider";
import type { NotificationFilters as NotificationFiltersType } from "@/types/notification";

const initialFilters: NotificationFiltersType = {
  search: "",
  unreadOnly: false,
  type: "",
  date: "all",
};

export function NotificationCenter() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [filters, setFilters] = useState<NotificationFiltersType>(initialFilters);
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead, archiveNotification } = useNotifications(200, filters);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Notifications visibles" : "Visible notifications"}</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{notifications.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isFr ? "Éléments actuellement présents dans votre centre de notifications." : "Current items in your notification center."}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                <Inbox className="size-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Non lues" : "Unread"}</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{unreadCount}</p>
                <p className="mt-2 text-sm text-muted-foreground">{isFr ? "Éléments qui attendent encore votre attention." : "Items still awaiting attention."}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background/45">
                <BellRing className="size-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-highlight relative overflow-hidden border-border/70 bg-card/72 backdrop-blur-xl">
          <CardContent className="flex h-full flex-col justify-between gap-4 px-5 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Actions" : "Actions"}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Gardez le flux propre" : "Keep the feed clean"}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{isFr ? "Utilisez les états lu et archivé pour garder le centre ciblé et exploitable." : "Use read and archive states to keep the center focused and actionable."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <UnreadBadge count={unreadCount} />
              <Button
                type="button"
                variant="secondary"
                className="rounded-full px-4"
                onClick={() => void markAllAsRead()}
                disabled={!unreadCount}
              >
                <CheckCheck className="size-4" />
                {isFr ? "Tout marquer comme lu" : "Mark all as read"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <NotificationFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="rounded-[28px] border border-dashed border-border/70 bg-background/35 p-8 text-center text-sm text-muted-foreground">
          {isFr ? "Chargement des notifications..." : "Loading notifications..."}
        </div>
      ) : (
        <NotificationList
          notifications={notifications}
          onMarkRead={markAsRead}
          onArchive={archiveNotification}
          emptyMessage={isFr ? "Aucune notification ne correspond aux filtres actuels." : "No notifications match the current filters."}
        />
      )}
    </div>
  );
}
