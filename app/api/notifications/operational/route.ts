import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getPlanningAlerts } from "@/lib/alerts/service";
import type { NotificationRecord, NotificationType } from "@/types/notification";

function toNotificationType(type: string): NotificationType {
  if (type === "overdue") return "overdue";
  if (type === "financial_due") return "payment_due";
  if (type === "contract_due") return "contract_due";
  if (type === "deadline_risk") return "deadline";
  return "system";
}

function getLocalizedCopy(type: string, title: string, description: string, isFr: boolean) {
  if (!isFr) return { title, description };

  const copy: Record<string, { title: string; description: string }> = {
    overdue: { title: "Ticket en retard", description: "Une action est nécessaire : l’échéance de ce ticket est dépassée." },
    blocked: { title: "Ticket bloqué", description: "Ce travail est bloqué et nécessite une intervention pour reprendre l’exécution." },
    workload: { title: "Surcharge de collaborateur", description: "La charge active ou les retards de ce collaborateur nécessitent un rééquilibrage." },
    deadline_risk: { title: "Échéance à risque", description: "L’avancement actuel exige une attention avant l’échéance du projet." },
    financial_due: { title: "Facture à suivre", description: "Un encaissement est en retard ou approche de son échéance." },
    contract_due: { title: "Renouvellement à suivre", description: "Un contrat approche de sa date de renouvellement." },
    unassigned: { title: "Ticket prioritaire non attribué", description: "Un ticket prioritaire n’a pas encore de responsable." },
  };

  return copy[type] ?? { title, description };
}

export async function GET() {
  try {
    const [auth, locale] = await Promise.all([requireAuthenticatedUser(), getCurrentLocale()]);
    const alerts = await getPlanningAlerts(auth.role, auth.profile.id);
    const isFr = locale === "fr";
    const now = new Date().toISOString();

    const notifications: NotificationRecord[] = alerts.map((alert) => {
      const copy = getLocalizedCopy(alert.type, alert.title, alert.description, isFr);
      const entityType = alert.entityType === "person" || alert.entityType === "placeholder"
        ? "system"
        : alert.entityType === "task"
          ? "ticket"
          : alert.entityType ?? "system";

      return {
        id: `operational-${alert.id}`,
        user_id: auth.profile.id,
        type: toNotificationType(alert.type),
        title: copy.title,
        body: alert.label ? `${copy.description} ${alert.label}.` : copy.description,
        entity_type: entityType,
        entity_id: alert.entityId ?? "operational",
        is_read: false,
        created_at: now,
        archived_at: null,
      };
    });

    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ notifications: [] }, { status: 200 });
  }
}
