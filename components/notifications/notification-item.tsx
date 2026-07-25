"use client";

import Link from "next/link";
import {
  AlertTriangle,
  AtSign,
  BellRing,
  CalendarClock,
  CheckCircle2,
  FolderSync,
  Landmark,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import { UnreadBadge } from "@/components/notifications/unread-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/layout/i18n-provider";
import { getNotificationLink, getNotificationSeverity, getNotificationTypeLabel } from "@/lib/notifications/helpers";
import type { NotificationRecord } from "@/types/notification";

const iconMap = {
  mention: AtSign,
  assignment: BellRing,
  status_change: RefreshCcw,
  comment: BellRing,
  deadline: CalendarClock,
  overdue: AlertTriangle,
  payment_due: Landmark,
  contract_due: FolderSync,
  system: CheckCircle2,
} as const;

function formatRelativeDate(value: string, locale: "en" | "fr") {
  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function NotificationItem({
  notification,
  compact = false,
  onMarkRead,
  onArchive,
}: {
  notification: NotificationRecord;
  compact?: boolean;
  onMarkRead?: (notificationId: string) => void | Promise<void>;
  onArchive?: (notificationId: string) => void | Promise<void>;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const Icon = iconMap[notification.type];
  const severity = getNotificationSeverity(notification);

  return (
    <div
      className={`rounded-[22px] border p-4 transition-colors ${
        notification.is_read
          ? "border-border/65 bg-background/30"
          : "border-primary/25 bg-primary/8"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border ${
            severity === "critical"
              ? "border-rose-400/30 bg-rose-400/12 text-rose-100"
              : severity === "warning"
                ? "border-amber-400/30 bg-amber-400/12 text-amber-100"
                : "border-primary/30 bg-primary/12 text-primary"
          }`}
        >
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{notification.title}</p>
              {!notification.is_read ? <UnreadBadge count={1} /> : null}
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase">
                {isFr
                  ? ({
                      mention: "mention",
                      assignment: "affectation",
                      status_change: "statut",
                      comment: "commentaire",
                      deadline: "échéance",
                      overdue: "retard",
                      payment_due: "paiement",
                      contract_due: "contrat",
                      system: "système",
                    }[notification.type])
                  : getNotificationTypeLabel(notification.type)}
              </Badge>
              {severity !== "info" ? (
                <Badge
                  className={`rounded-full px-3 py-1 text-[10px] uppercase ${
                    severity === "critical"
                      ? "bg-rose-500/15 text-rose-100"
                      : "bg-amber-500/15 text-amber-100"
                  }`}
                >
                  {isFr ? (severity === "critical" ? "critique" : "alerte") : severity}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{formatRelativeDate(notification.created_at, locale)}</p>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{notification.body}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" className="rounded-full px-4">
              <Link href={getNotificationLink(notification.entity_type, notification.entity_id)}>
                {isFr ? "Ouvrir l'élément lié" : "Open related item"}
              </Link>
            </Button>

            {!notification.is_read ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full px-4"
                onClick={() => void onMarkRead?.(notification.id)}
              >
                {isFr ? "Marquer comme lu" : "Mark as read"}
              </Button>
            ) : null}

            {!compact ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full px-4 text-muted-foreground"
                onClick={() => void onArchive?.(notification.id)}
              >
                <Trash2 className="size-4" />
                {isFr ? "Archiver" : "Archive"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
