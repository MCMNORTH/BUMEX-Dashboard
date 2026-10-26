import "server-only";

import { isAppMailConfigured, sendAppMail } from "@/lib/email/send";
import { asSystem, select } from "@/lib/work/db";

const MAX_ATTEMPTS = 5;
// An email that couldn't go out within a day is stale news; it is marked
// expired instead. This also keeps the backlog queued while no provider was
// configured from reaching inboxes all at once.
const MAX_EMAIL_AGE_MS = 24 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweepAt = 0;

type NotificationEmail = {
  id: string;
  notification_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  entity_type: string;
  entity_id: string;
  attempts: number;
  created_at: string;
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
  const footer = "Vous recevez cet e-mail car cette notification vous concerne dans BUMEX Dashboard. Vous pouvez désactiver ces e-mails dans Paramètres › Préférences.";

  return {
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:0 auto"><p style="font-size:12px;color:#65748b">BUMEX Dashboard</p><h1 style="font-size:22px">${title}</h1><p>${body}</p>${linkHtml}<p style="font-size:12px;color:#65748b;border-top:1px solid #e2e8f0;padding-top:12px">${escapeHtml(footer)}</p></div>`,
    text: `${notification.subject}\n\n${notification.body}${link ? `\n\nOuvrir BUMEX Dashboard : ${link}` : ""}\n\n${footer}`,
  };
}

function retryDelayMinutes(attempt: number) {
  return [5, 15, 60, 360][Math.max(0, attempt - 1)] ?? 360;
}

// The outbox (work.notification_email) is the server's own: written in its session, one row at a time, only while the
// row is still claimed (processing).
async function settle(id: string, set: string, params: unknown[] = []) {
  try {
    await asSystem("notification-email", (tx) =>
      tx.query(`update work.notification_email set ${set} where id = $1::uuid and status = 'processing'`, [id, ...params]),
    );
    return true;
  } catch (error) {
    console.error("[notification-email:update-failure]", id, error instanceof Error ? error.message : "database");
    return false;
  }
}

async function processEmail(notification: NotificationEmail) {
  const createdAt = Date.parse(notification.created_at);
  if (Number.isFinite(createdAt) && Date.now() - createdAt > MAX_EMAIL_AGE_MS) {
    await settle(notification.id, "status = 'expired', locked_at = null, last_error = 'Not sent: older than 24 hours when delivery ran.'");
    return { sent: 0, failed: 0 };
  }

  try {
    await sendAppMail({
      to: notification.recipient_email,
      subject: notification.subject,
      ...createEmailContent(notification),
      idempotencyKey: `notification-email/${notification.id}`,
    });

    if (!(await settle(notification.id, "status = 'sent', sent_at = now(), locked_at = null, last_error = null"))) {
      throw new Error("Could not mark notification email as sent (database).");
    }
    return { sent: 1, failed: 0 };
  } catch (error) {
    const retry = notification.attempts < MAX_ATTEMPTS;
    const retryAt = new Date(Date.now() + retryDelayMinutes(notification.attempts) * 60_000).toISOString();
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.";
    await settle(notification.id, "status = $2, next_attempt_at = $3::timestamptz, locked_at = null, last_error = $4", [retry ? "pending" : "failed", retryAt, message]);
    console.error("[notification-email:delivery-failure]", notification.id, message);
    return { sent: 0, failed: 1 };
  }
}

export async function dispatchNotificationEmails(notificationIds?: string[]) {
  if (notificationIds && notificationIds.length === 0) return { sent: 0, failed: 0, deferred: false };

  if (!isAppMailConfigured()) {
    return { sent: 0, failed: 0, deferred: true };
  }

  const items = await asSystem("notification-email", (tx) =>
    select<NotificationEmail>(
      tx,
      `select id, notification_id, recipient_email, subject, body, subject_type as entity_type, subject_id as entity_id, attempts, created_at
         from work.claim_notification_emails(100, $1::uuid[])`,
      [notificationIds ?? null],
    ),
  ).catch((error: unknown) => {
    throw new Error(`Could not claim notification emails (${error instanceof Error ? error.message : "database"}).`);
  });

  let sent = 0;
  let failed = 0;

  for (let index = 0; index < items.length; index += 5) {
    const batch = await Promise.all(items.slice(index, index + 5).map((item) => processEmail(item)));
    sent += batch.reduce((total, result) => total + result.sent, 0);
    failed += batch.reduce((total, result) => total + result.failed, 0);
  }

  return { sent, failed, deferred: false };
}

// Retrying failed sends is the cron's job, but App Hosting runs no cron, so
// instances that are creating notifications anyway also pick up due retries,
// at most once every few minutes each.
export async function sweepNotificationEmails() {
  if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) {
    return null;
  }

  lastSweepAt = Date.now();
  return dispatchNotificationEmails();
}
