import "server-only";

type ResendMail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  // Resend drops a repeat of the same key for 24 hours, so a retry after a
  // lost response can't send the email twice.
  idempotencyKey?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_RATE_LIMIT_WAIT_MS = 5_000;

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendResendMail({ from, to, subject, html, text, idempotencyKey }: ResendMail) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY.");
  }

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      return;
    }

    // The team-wide rate limit is short-lived; a daily quota is not, so only
    // short waits are retried here and the outbox retries the rest later.
    const waitMs = Number(response.headers.get("retry-after") ?? "1") * 1000;
    if (response.status === 429 && attempt < 3 && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 500)));
      continue;
    }

    const detail = await response.json().catch(() => null) as { name?: string; message?: string } | null;
    const reason = [detail?.name, detail?.message].filter(Boolean).join(": ");
    throw new Error(`Resend send failed (${response.status})${reason ? ` ${reason}` : ""}.`);
  }
}
