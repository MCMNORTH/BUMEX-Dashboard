import "server-only";

type GraphMail = {
  to: string;
  subject: string;
  html: string;
};

const tenantId = process.env.MICROSOFT_TENANT_ID;
const clientId = process.env.MICROSOFT_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const sender = process.env.NOTIFICATION_EMAIL_SENDER_EMAIL || "bumex@bumex.mr";
let cachedToken: { value: string; expiresAt: number } | null = null;

export function isMicrosoftGraphConfigured() {
  return Boolean(tenantId && clientId && clientSecret && sender);
}

export async function sendMicrosoftGraphMail({ to, subject, html }: GraphMail) {
  if (!isMicrosoftGraphConfigured() || !tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph mail is not configured.");
  }

  if (!cachedToken || cachedToken.expiresAt <= Date.now() + 60_000) {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!tokenResponse.ok) {
      throw new Error(`Microsoft Graph token request failed (${tokenResponse.status}).`);
    }

    const tokenPayload = await tokenResponse.json() as { access_token?: string; expires_in?: number };
    if (!tokenPayload.access_token) {
      throw new Error("Microsoft Graph did not return an access token.");
    }

    cachedToken = {
      value: tokenPayload.access_token,
      expiresAt: Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
    };
  }

  const sendResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${cachedToken.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!sendResponse.ok) {
    throw new Error(`Microsoft Graph sendMail failed (${sendResponse.status}).`);
  }
}
