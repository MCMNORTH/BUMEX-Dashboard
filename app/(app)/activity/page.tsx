import { requireRouteAccess } from "@/lib/auth/server";
import { getActivityLogs } from "@/lib/activity/service";
import { getCurrentLocale } from "@/lib/i18n/server";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { ActivityCenter } from "@/components/activity/activity-center";
import { Badge } from "@/components/ui/badge";
import type { ActivityLogRecord } from "@/types/activity";

export default async function ActivityPage() {
  const auth = await requireRouteAccess("activity");
  const locale = await getCurrentLocale();
  const isFr = locale === "fr";
  let activities: ActivityLogRecord[] = [];
  let loadError: string | null = null;

  try {
    activities = await getActivityLogs({
      role: auth.role,
      currentUserId: auth.profile.id,
      limit: 60,
    });
  } catch (error) {
    loadError = error instanceof Error ? error.message : (isFr ? "Impossible de charger le journal d’activité." : "Unable to load activity logs.");
    activities = [];
  }

  const isShareholder = auth.role === "shareholder";
  const isEmployee = auth.role === "employee";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isFr ? "Activité" : "Activity"}
        title={
          loadError
            ? (isFr ? "Le journal d’audit est temporairement indisponible." : "The audit trail is temporarily unavailable.")
            : isShareholder
              ? (isFr ? "Une piste exécutive compatible actionnaires des grands événements de portefeuille, finance et gouvernance." : "A shareholder-safe executive trail of major portfolio, finance, and governance events.")
              : isEmployee
                ? (isFr ? "Une piste d’audit ciblée sur votre travail, vos mises à jour et votre historique opérationnel récent." : "A scoped audit trail for your work, updates, and recent operational history.")
                : (isFr ? "Une piste d’audit centrale couvrant projets, tickets, clients, finance et événements clés de l’espace." : "A central audit trail across projects, tickets, clients, finance, and key workspace events.")
        }
        subtitle={
          loadError
            ? (isFr ? "La timeline d’activité n’a pas pu être chargée pour votre périmètre actuel. Réessayez lorsque la couche de données sera disponible." : "The activity timeline could not be loaded for your current scope. Try again after the data layer is available.")
            : isShareholder
              ? (isFr ? "Seule l’activité de haut niveau validée par le management est visible ici. Les détails sensibles sur les tickets, la finance et la collaboration interne restent masqués." : "Only management-approved, high-level activity is visible here. Sensitive ticket, finance, and internal collaboration detail stays hidden.")
              : isEmployee
                ? (isFr ? "Cette vue reste limitée à votre travail visible et à vos propres actions enregistrées." : "This surface stays scoped to your visible work and own recorded actions.")
                : (isFr ? "Une timeline premium des actions importantes de l’application, groupées par récence et reliées à leur entité associée." : "A premium timeline of important application actions, grouped by recency and linked back to their related entity.")
        }
        badge={
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
            {activities.length} {isFr ? "événements" : "events"}
          </Badge>
        }
      />

      {loadError ? (
        <SectionCard title={isFr ? "Impossible de charger l’activité" : "Unable to load activity"} description={isFr ? "La timeline de l’espace est actuellement indisponible pour votre périmètre." : "The workspace timeline is currently unavailable for your scope."} contentClassName="px-6 py-6">
          <div className="text-sm leading-6 text-muted-foreground">
            {loadError}
          </div>
        </SectionCard>
      ) : (
        <ActivityCenter
          activities={activities}
          role={auth.role}
          currentUserId={auth.profile.id}
          title={isShareholder ? (isFr ? "Activité exécutive" : "Executive activity") : (isFr ? "Activité de l’espace" : "Workspace activity")}
          description={
            isShareholder
              ? (isFr ? "Activité de haut niveau sur les projets, contrats, clients et sujets de gouvernance, ordonnée par dernier changement visible." : "High-level project, contract, client, and governance activity ordered by latest visible change.")
              : (isFr ? "Activité récente dans votre périmètre visible, ordonnée par dernier changement." : "Recent activity across your visible workspace scope, ordered by latest change.")
          }
          emptyMessage={
            isShareholder
              ? (isFr ? "Aucune activité exécutive compatible actionnaires n’est visible pour le moment." : "No shareholder-safe executive activity is visible right now.")
              : (isFr ? "Aucune activité n’est visible dans votre périmètre actuel." : "No activity is visible in your current scope.")
          }
        />
      )}
    </div>
  );
}
