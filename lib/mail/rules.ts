import { isAllowedCompanyEmail, normalizeEmail } from "@/lib/auth/company-email";
import type { GraphAddress, GraphMessage } from "@/lib/mail/graph";

// The free part of e-mails to tickets, decided before Claude reads anything: which e-mails are never tasks, who a new
// ticket goes to, which thread a reply belongs to. Pure, so the tests read it all.

export type SkipReason =
  | "calendar" // a meeting request or answer
  | "automatic" // an auto-reply, an out-of-office, a no-reply sender
  | "newsletter" // a mailing list, a newsletter
  | "bounce" // a delivery report
  | "vanguard" // the app's own e-mails (its notifications would come back as tickets)
  | "empty" // no text, no file
  | "not_direct" // reached the inbox through a group or in copy hidden: whose ticket would be a guess
  | "sender_limit" // the sender's tickets of the day are many already
  | "not_a_task" // Claude's verdict
  | "ai_declined" // Claude declined to read it
  | "no_floor" // the person has no floor to file it on
  | "deleted"; // gone from the inbox before it was read

export const SENDER_DAILY_LIMIT = 20;

export function addressOf(recipient: GraphAddress | null | undefined) {
  return normalizeEmail(recipient?.emailAddress?.address ?? "");
}

export function nameOf(recipient: GraphAddress | null | undefined) {
  return (recipient?.emailAddress?.name ?? "").trim() || addressOf(recipient);
}

export function isColleague(address: string) {
  return isAllowedCompanyEmail(address);
}

function header(message: GraphMessage, name: string) {
  const wanted = name.toLowerCase();
  return message.internetMessageHeaders?.find((h) => h.name.toLowerCase() === wanted)?.value?.trim() ?? null;
}

/** The addresses the app sends from (NOTIFICATION_EMAIL_FROM, NOTIFICATION_EMAIL_SENDER_EMAIL, SMTP_FROM): "Name <a@b>" or "a@b". */
export function ownSenderAddresses(values: (string | undefined)[]) {
  return values.flatMap((value) => {
    const match = value?.match(/<([^>]+)>/)?.[1] ?? value ?? "";
    return match.includes("@") ? [normalizeEmail(match)] : [];
  });
}

const AUTOMATIC_SUBJECT = /^(automatic reply|auto(matic)?[- ]?reply|réponse automatique|out of office|absent du bureau|absence)\s*[:：]/i;
const BOUNCE_SUBJECT = /^(undeliverable|undelivered mail|non remis|delivery status notification|mail delivery failed|returned mail)\b/i;
const NO_REPLY_LOCAL = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|ne[-_.]?pas[-_.]?repondre|notifications?|mailer)(\+.*)?$/i;
const BOUNCE_LOCAL = /^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]+)$/i;

/** Why this e-mail can never be a task, or null (Claude then reads it). */
export function skipReason(message: GraphMessage, ownSenders: string[]): SkipReason | null {
  const from = addressOf(message.from);
  const local = from.split("@")[0] ?? "";
  const subject = (message.subject ?? "").trim();

  if ((message["@odata.type"] ?? "").toLowerCase().includes("eventmessage")) return "calendar";
  if (from && ownSenders.includes(from)) return "vanguard";
  if (BOUNCE_LOCAL.test(local) || /multipart\/report/i.test(header(message, "Content-Type") ?? "") || BOUNCE_SUBJECT.test(subject)) return "bounce";

  const autoSubmitted = header(message, "Auto-Submitted");
  const precedence = (header(message, "Precedence") ?? "").toLowerCase();
  if ((autoSubmitted && autoSubmitted.toLowerCase() !== "no") || precedence === "auto_reply" || header(message, "X-Autoreply") || header(message, "X-Autorespond")
    || AUTOMATIC_SUBJECT.test(subject) || NO_REPLY_LOCAL.test(local)) return "automatic";
  if (header(message, "List-Unsubscribe") || header(message, "List-Id") || ["bulk", "list", "junk"].includes(precedence)) return "newsletter";

  if (!bodyText(message).trim() && !message.hasAttachments) return "empty";
  return null;
}

export function bodyText(message: GraphMessage) {
  return message.body?.content ?? "";
}

/** The reply's own words (Graph's uniqueBody, without the quoted thread), else the whole text. */
export function replyText(message: GraphMessage) {
  return (message.uniqueBody?.content ?? "").trim() || bodyText(message).trim();
}

/** The e-mails this one answers: In-Reply-To, then References (their <message-id>s). */
export function threadIds(message: GraphMessage) {
  const ids = [header(message, "In-Reply-To"), header(message, "References")]
    .flatMap((value) => value?.match(/<[^<>\s]+>/g) ?? []);
  return [...new Set(ids)];
}

/**
 * Whose ticket a new e-mail is: the first person in To with a connected inbox, else the first in copy. The same e-mail
 * reaching several connected inboxes then gives the same person, whichever inbox is read first. None of them addressed
 * by name (a group, a hidden copy): null.
 */
export function pickAssignee(message: GraphMessage, connected: Map<string, string>) {
  for (const [list, via] of [[message.toRecipients, "to"], [message.ccRecipients, "cc"]] as const) {
    for (const recipient of list ?? []) {
      const personId = connected.get(addressOf(recipient));
      if (personId) return { personId, via };
    }
  }
  return null;
}

/** "RE: TR: Fwd: Devis" → "Devis". */
export function cleanSubject(subject: string | null | undefined) {
  let value = (subject ?? "").trim();
  for (let previous = ""; previous !== value; ) {
    previous = value;
    value = value.replace(/^(re|tr|fw|fwd|aw|wg|rv|réf|ref)\s*(\[\d+\])?\s*[:：]\s*/i, "").trim();
  }
  return value;
}
