import "server-only";

import { isSmtpConfigured, sendMail } from "@/lib/email/server";
import { isMicrosoftGraphConfigured, sendMicrosoftGraphMail } from "@/lib/email/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 5;
const NOTIFICATION_EMAIL_FROM = process.env.NOTIFICATION_EMAIL_FROM || "BUMEX <bumex@bumex.mr>";

type NotificationEmail = {
  id: string;
  notification_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  entity_type: string;
  entity_id: string;
  attempts: number;
};

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function getNotificationPath(notification: Pick<NotificationEmail, "entity_type" | "entity_id">) {
  const id = encodeURIComponent(notification.entity_id);

  switch (notification.entity_type) {
    case "project": return `/projects/${id}`;
    case "ticket": return `/tickets/${id}`;
    case "client": return `/clients/${id}`;
    case "contract": return `/contracts/${id}`;
    case "invoice": return `/finance/invoices/${id}`;
    case "payment": return "/finance/payments";
    case "transfer": return "/finance/transfers";
    case "timesheet": return "/timesheet";
    default: return "/notifications";
  }
}

function getAppBaseUrl() {
  const configured = process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL;

  if (!configured) return "";
  return (configured.startsWith("http") ? configured : `https://${configured}`).replace(/\/+$/, "");
}

function createEmailContent(notification: NotificationEmail) {
  const title = escapeHtml(notification.subject);
  const body = escapeHtml(notification.body).replace(/\r?\n/g, "<br>");
  const path = getNotificationPath(notification);
  const baseUrl = getAppBaseUrl();
  const link = baseUrl ? `${baseUrl}${path}` : "";
  const linkHtml = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#173b67;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Ouvrir BUMEX Dashboard</a></p>`
    : "";

  return {
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:0 auto"><p style="font-size:12px;color:#65748b">BUMEX Dashboard</p><h1 style="font-size:22px">${title}</h1><p>${body}</p>${linkHtml}</div>`,
    text: `${notification.subject}\n\n${notification.body}${link ? `\n\nOuvrir BUMEX Dashboard : ${link}` : ""}`,
  };
}

function retryDelayMinutes(attempt: number) {
  return [5, 15, 60, 360][Math.max(0, attempt - 1)] ?? 360;
}

async function processEmail(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  notification: NotificationEmail,
) {
  try {
    const content = createEmailContent(notification);
    if (isMicrosoftGraphConfigured()) {
      await sendMicrosoftGraphMail({
        to: notification.recipient_email,
        subject: notification.subject,
        html: content.html,
      });
    } else {
      await sendMail({
        from: NOTIFICATION_EMAIL_FROM,
        to: notification.recipient_email,
        subject: notification.subject,
        ...content,
      });
    }

    const { error } = await supabase
      .from("notification_email_outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), locked_at: null, last_error: null })
      .eq("id", notification.id)
      .eq("status", "processing");

    if (error) throw new Error(`Could not mark notification email as sent (${error.code ?? "database"}).`);
    return { sent: 1, failed: 0 };
  } catch (error) {
    const retry = notification.attempts < MAX_ATTEMPTS;
    const retryAt = new Date(Date.now() + retryDelayMinutes(notification.attempts) * 60_000).toISOString();
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.";
    const { error: updateError } = await supabase
      .from("notification_email_outbox")
      .update({
        status: retry ? "pending" : "failed",
        next_attempt_at: retryAt,
        locked_at: null,
        last_error: message,
      })
      .eq("id", notification.id)
      .eq("status", "processing");

    if (updateError) {
      console.error("[notification-email:update-failure]", notification.id, updateError.code ?? "database");
    }
    console.error("[notification-email:delivery-failure]", notification.id, message);
    return { sent: 0, failed: 1 };
  }
}

export async function dispatchNotificationEmails(notificationIds?: string[]) {
  if (notificationIds && notificationIds.length === 0) return { sent: 0, failed: 0, deferred: false };

  const supabase = createAdminClient();
  if (!supabase || (!isMicrosoftGraphConfigured() && !isSmtpConfigured(NOTIFICATION_EMAIL_FROM))) {
    return { sent: 0, failed: 0, deferred: true };
  }

  const { data, error } = await supabase.rpc("claim_notification_email_outbox", {
    p_batch_size: 100,
    p_notification_ids: notificationIds ?? null,
  }).returns<NotificationEmail[]>();

  if (error) {
    throw new Error(`Could not claim notification emails (${error.code ?? "database"}).`);
  }

  let sent = 0;
  let failed = 0;
  const items = (Array.isArray(data) ? data : []) as NotificationEmail[];

  for (let index = 0; index < items.length; index += 5) {
    const batch = await Promise.all(items.slice(index, index + 5).map((item) => processEmail(supabase, item)));
    sent += batch.reduce((total, result) => total + result.sent, 0);
    failed += batch.reduce((total, result) => total + result.failed, 0);
  }

  return { sent, failed, deferred: false };
}
