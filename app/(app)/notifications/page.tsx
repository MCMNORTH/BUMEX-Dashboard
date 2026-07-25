import { PageHeader } from "@/components/layout/page-header";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function NotificationsPage() {
  await requireRouteAccess("notifications");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isFr ? "Centre de notifications" : "Notification center"}
        title={
          isFr
            ? "Une boîte de réception intégrée, ciblée sur les mentions, affectations, changements delivery et signaux opérationnels."
            : "A focused in-app inbox for mentions, assignments, delivery changes, and operational signals."
        }
        subtitle={
          isFr
            ? "Consultez ce qui a changé, traitez ce qui est géré et accédez directement au travail lié sans quitter l'application."
            : "Review what changed, clear what is handled, and jump directly into the related work without leaving the application shell."
        }
      />
      <NotificationCenter />
    </div>
  );
}
