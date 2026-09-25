import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getPlanningAlerts } from "@/lib/alerts/service";
import { getInvoices, getTransfers } from "@/lib/finance/service";
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

    if (auth.role === "admin") {
      const pendingInvoices = await getInvoices("admin").catch(() => []);
      for (const invoice of pendingInvoices) {
        if (hasActiveRevisionRequest(invoice)) continue;
        const waitingDays = Math.max(0, Math.floor((Date.now() - new Date(invoice.updated_at).getTime()) / 86_400_000));
        if (waitingDays < 3) continue;

        notifications.push({
          id: `operational-invoice-approval-${invoice.id}-${invoice.updated_at.slice(0, 10)}`,
          user_id: auth.profile.id,
          type: "deadline",
          title: isFr ? "Validation de facture en attente" : "Invoice approval overdue",
          body: isFr
            ? `${invoice.invoice_number} · ${invoice.client?.name ?? "Client non renseigné"} attend une validation depuis ${waitingDays} jours.`
            : `${invoice.invoice_number} · ${invoice.client?.name ?? "No client"} has been awaiting approval for ${waitingDays} days.`,
          entity_type: "invoice",
          entity_id: invoice.id,
          is_read: false,
          created_at: invoice.updated_at,
          archived_at: null,
        });
      }
    }

    const transfers = await getTransfers(auth.role, {}).catch(() => []);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const transfer of transfers) {
      if (!transfer.renewal.enabled || !transfer.renewal.next_due_date || transfer.status === "cancelled") continue;
      const dueDate = new Date(`${transfer.renewal.next_due_date}T00:00:00`);
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - transfer.renewal.reminder_days);
      if (today < reminderDate) continue;
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
      const timing = daysUntil < 0
        ? (isFr ? `échu depuis ${Math.abs(daysUntil)} jour(s)` : `${Math.abs(daysUntil)} day(s) overdue`)
        : daysUntil === 0
          ? (isFr ? "à renouveler aujourd’hui" : "due today")
          : (isFr ? `à renouveler dans ${daysUntil} jour(s)` : `due in ${daysUntil} day(s)`);
      notifications.push({
        id: `operational-transfer-renewal-${transfer.id}-${transfer.renewal.next_due_date}`,
        user_id: auth.profile.id,
        type: "payment_due",
        title: isFr ? "Renouvellement de paiement à prévoir" : "Payment renewal due",
        body: isFr
          ? `${transfer.beneficiary_name} · ${transfer.amount} ${transfer.currency} · ${timing}.`
          : `${transfer.beneficiary_name} · ${transfer.amount} ${transfer.currency} · ${timing}.`,
        entity_type: "transfer",
        entity_id: transfer.id,
        is_read: false,
        created_at: reminderDate.toISOString(),
        archived_at: null,
      });
    }

    notifications.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ notifications: [] }, { status: 200 });
  }
}

function hasActiveRevisionRequest(invoice: Awaited<ReturnType<typeof getInvoices>>[number]) {
  const request = invoice.recentActivity.find((activity) => activity.action === "Invoice changes requested");
  return Boolean(request && new Date(request.created_at).getTime() > new Date(invoice.updated_at).getTime());
}
