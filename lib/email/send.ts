import "server-only";

import { isMicrosoftGraphConfigured, sendMicrosoftGraphMail } from "@/lib/email/microsoft-graph";
import { isResendConfigured, sendResendMail } from "@/lib/email/resend";
import { isSmtpConfigured, sendMail } from "@/lib/email/server";

export const APP_EMAIL_FROM = process.env.NOTIFICATION_EMAIL_FROM || "BUMEX <bumex@bumex.mr>";

export function isAppMailConfigured() {
  return isResendConfigured() || isMicrosoftGraphConfigured() || isSmtpConfigured(APP_EMAIL_FROM);
}

// The app's e-mails go out through the first provider configured: Resend, then Microsoft Graph, then SMTP.
export async function sendAppMail({ to, subject, html, text, idempotencyKey }: { to: string; subject: string; html: string; text: string; idempotencyKey?: string }) {
  if (isResendConfigured()) {
    await sendResendMail({ from: APP_EMAIL_FROM, to, subject, html, text, idempotencyKey });
  } else if (isMicrosoftGraphConfigured()) {
    await sendMicrosoftGraphMail({ to, subject, html });
  } else {
    await sendMail({ from: APP_EMAIL_FROM, to, subject, html, text });
  }
}
