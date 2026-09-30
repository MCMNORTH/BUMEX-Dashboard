import type { NotificationEntityType, NotificationRecord, NotificationSeverity, NotificationType } from "@/types/notification";

export function getNotificationLink(entityType: NotificationEntityType, entityId: string) {
  switch (entityType) {
    case "project":
      return `/projects/${entityId}`;
    case "ticket":
      return `/tickets/${entityId}`;
    case "client":
      return `/clients/${entityId}`;
    case "contract":
      return `/contracts/${entityId}`;
    case "document":
      return `/documents`;
    case "invoice":
      return `/finance/invoices/${entityId}/preview`;
    case "payment":
      return `/finance/payments`;
    case "transfer":
      return `/finance/transfers`;
    case "milestone":
      return "/roadmap";
    case "timesheet":
      return "/timesheet";
    default:
      return "/overview";
  }
}

export function getNotificationTypeLabel(type: NotificationType) {
  return type.replaceAll("_", " ");
}

export function getNotificationSeverity(notification: Pick<NotificationRecord, "type" | "body">): NotificationSeverity {
  if (
    notification.type === "overdue"
    || notification.type === "payment_due"
    || notification.body.toLowerCase().includes("delayed")
    || notification.body.toLowerCase().includes("overdue")
  ) {
    return "critical";
  }

  if (
    notification.type === "deadline"
    || notification.type === "assignment"
    || notification.type === "contract_due"
    || notification.body.toLowerCase().includes("review")
  ) {
    return "warning";
  }

  return "info";
}
