import "server-only";

// E-mails to tickets (db/erp/migrations/0017_mail_intake.sql): each person connects their Outlook inbox through the
// Entra app "BUMEX Vanguard – Mail to tickets" (delegated Mail.Read). The names are OUTLOOK_*, not MICROSOFT_*: those
// make lib/email/send.ts send the app's own mail through Graph.
// Read when used (not when the module loads), so the tests and the smoke run can set them.

export function mailIntakeEnabled() {
  return process.env.MAIL_INTAKE_ENABLED === "1";
}

export function outlookApp() {
  return {
    tenantId: process.env.OUTLOOK_TENANT_ID?.trim() ?? "",
    clientId: process.env.OUTLOOK_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET?.trim() ?? "",
  };
}

/** The model that reads the e-mails (Claude Haiku 5.5 unless MAIL_AI_MODEL names another). */
export function mailAiModel() {
  return process.env.MAIL_AI_MODEL?.trim() || "claude-haiku-5-5";
}

/** Everything the job needs: the switch, the Entra app, the token key and Anthropic's key. */
export function isMailIntakeConfigured() {
  const app = outlookApp();
  return mailIntakeEnabled() && Boolean(app.tenantId && app.clientId && app.clientSecret && process.env.MAIL_TOKEN_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim());
}

/** The Microsoft sign-in comes back here (registered on the Entra app). */
export function outlookRedirectUri(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/mail/microsoft/callback`;
}

/** The sign-in's state between /api/mail/microsoft/connect and its callback (sealed, 10 minutes). */
export const OUTLOOK_STATE_COOKIE = "vg-mail-oauth";
