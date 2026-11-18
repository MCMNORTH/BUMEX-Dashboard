import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { outlookApp } from "@/lib/mail/config";

// Microsoft's side of e-mails to tickets: the person's sign-in (OAuth 2.0 authorization code + PKCE, delegated
// offline_access User.Read Mail.Read: read only, the app sends, moves and deletes nothing) and the reads of their
// Inbox through Microsoft Graph. Polled by the cron (a webhook must answer in 3 s and App Hosting starts cold).
// lib/email/microsoft-graph.ts is the other Graph use: the app's own mail, with the app's identity.

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const MAIL_SCOPES = "offline_access User.Read Mail.Read";

type Fetch = typeof fetch;

export type GraphAddress = { emailAddress?: { name?: string; address?: string } };

export type GraphMessage = {
  id: string;
  "@odata.type"?: string;
  internetMessageId?: string;
  subject?: string | null;
  from?: GraphAddress | null;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
  receivedDateTime?: string;
  conversationId?: string;
  isDraft?: boolean;
  internetMessageHeaders?: { name: string; value: string }[];
  body?: { contentType?: string; content?: string };
  uniqueBody?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
  webLink?: string;
  "@removed"?: unknown;
};

export type GraphAttachment = {
  id: string;
  "@odata.type"?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
};

/** Graph or the sign-in answered with an error (its HTTP status; Retry-After in seconds on a 429). */
export class GraphError extends Error {
  constructor(message: string, readonly status: number, readonly code = "", readonly retryAfter = 0) {
    super(message);
  }
}

/** The person's consent is gone (password changed, revoked, expired): they must sign in again. */
export class ReconnectError extends Error {}

export type Tokens = { accessToken: string; refreshToken: string };

// ---- sign-in -----------------------------------------------------------------

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl({ state, challenge, redirectUri, loginHint }: { state: string; challenge: string; redirectUri: string; loginHint: string }) {
  const { tenantId, clientId } = outlookApp();
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MAIL_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: loginHint,
    prompt: "select_account",
  });
  return `${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${query}`;
}

async function tokenRequest(grant: Record<string, string>, fetchImpl: Fetch): Promise<Tokens> {
  const { tenantId, clientId, clientSecret } = outlookApp();
  const response = await fetchImpl(`${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: MAIL_SCOPES, ...grant }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };

  if (payload.error === "invalid_grant" || payload.error === "interaction_required") {
    throw new ReconnectError(payload.error);
  }
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new GraphError(`Microsoft sign-in failed (${response.status}${payload.error ? `, ${payload.error}` : ""}).`, response.status, payload.error ?? "");
  }
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

export function exchangeCode({ code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string }, fetchImpl: Fetch = fetch) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri }, fetchImpl);
}

/** A new access token (and the refresh token Microsoft rotates with it, to keep). */
export function refreshTokens(refreshToken: string, fetchImpl: Fetch = fetch) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

// ---- the inbox ---------------------------------------------------------------

// what a delta page brings of each new e-mail (the rest is read when it is processed)
const DELTA_SELECT = "internetMessageId,subject,from,receivedDateTime,conversationId,isDraft";
const MESSAGE_SELECT =
  "internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,conversationId,internetMessageHeaders,body,uniqueBody,hasAttachments,webLink";

export class Mailbox {
  constructor(private readonly accessToken: string, private readonly fetchImpl: Fetch = fetch) {}

  private async request(url: string, headers: Record<string, string> = {}) {
    const response = await this.fetchImpl(url.startsWith("https://") ? url : `${GRAPH}${url}`, {
      headers: { authorization: `Bearer ${this.accessToken}`, ...headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw new GraphError(
        `Microsoft Graph ${response.status}${payload.error?.code ? ` ${payload.error.code}` : ""}.`,
        response.status,
        payload.error?.code ?? "",
        Number(response.headers.get("retry-after")) || 0,
      );
    }
    return response;
  }

  private async json<T>(url: string, headers?: Record<string, string>) {
    return (await (await this.request(url, headers)).json()) as T;
  }

  me() {
    return this.json<{ id: string; mail?: string | null; userPrincipalName?: string }>("/me?$select=id,mail,userPrincipalName");
  }

  /** The Inbox's new e-mails since `since`, as a delta link to follow; the first page holds those already there. */
  deltaFrom(since: Date) {
    const query = new URLSearchParams({ changeType: "created", $select: DELTA_SELECT, $filter: `receivedDateTime ge ${since.toISOString()}` });
    return `${GRAPH}/me/mailFolders/inbox/messages/delta?${query}`;
  }

  /** One page of a delta: its e-mails, and either the next page or the link the next run starts from. */
  async deltaPage(url: string) {
    const page = await this.json<{ value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }>(url, {
      prefer: "odata.maxpagesize=50",
    });
    return {
      messages: (page.value ?? []).filter((message) => !message["@removed"] && !message.isDraft && message.internetMessageId),
      nextLink: page["@odata.nextLink"] ?? null,
      deltaLink: page["@odata.deltaLink"] ?? null,
    };
  }

  /** An e-mail with its headers, recipients and text (Graph turns the HTML into text: no parser of ours). */
  message(id: string) {
    return this.json<GraphMessage>(`/me/messages/${encodeURIComponent(id)}?$select=${MESSAGE_SELECT}`, {
      prefer: 'outlook.body-content-type="text"',
    });
  }

  async attachments(messageId: string) {
    const page = await this.json<{ value?: GraphAttachment[] }>(
      `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return page.value ?? [];
  }

  async attachmentBytes(messageId: string, attachmentId: string) {
    const response = await this.request(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`);
    return Buffer.from(await response.arrayBuffer());
  }
}
