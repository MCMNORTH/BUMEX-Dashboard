"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { isMailIntakeConfigured } from "@/lib/mail/config";
import { deleteConnection, forceMessage, readConnection, recentMessages, setConnectionStatus, type MailConnectionRow, type MailLogRow } from "@/lib/mail/store";
import { processNow } from "@/lib/mail/sync";
import { asPerson, asSystem, selectOne } from "@/lib/work/db";

// Settings, My account: the person's Outlook inbox turned into tickets (lib/mail, 0017). They read their connection
// and the e-mails it brought (their session); what they change, the server writes for them (the system session: the
// tables are the server's). Connecting goes through Microsoft's sign-in (app/api/mail/microsoft/*).

export type MailIntakeView = {
  enabled: boolean;
  connection: Pick<MailConnectionRow, "ms_email" | "status" | "connected_at" | "last_sync_at" | "last_error"> | null;
  messages: MailLogRow[];
};

export async function mailIntakeAction(): Promise<MailIntakeView> {
  const { auth } = await requireErpAccess();
  if (!isMailIntakeConfigured()) return { enabled: false, connection: null, messages: [] };
  const id = auth.profile.id;
  const { connection, messages } = await asPerson(async (tx) => ({ connection: await readConnection(tx, id), messages: await recentMessages(tx, id) }));
  return {
    enabled: true,
    connection: connection && {
      ms_email: connection.ms_email,
      status: connection.status,
      connected_at: connection.connected_at,
      last_sync_at: connection.last_sync_at,
      last_error: connection.last_error,
    },
    messages: connection ? messages : [],
  };
}

export async function setMailPausedAction(paused: boolean): Promise<{ error?: string }> {
  const { auth } = await requireErpAccess();
  const fr = (await getCurrentLocale()) === "fr";
  const changed = await asSystem(auth.profile.id, (tx) => setConnectionStatus(tx, auth.profile.id, paused ? "paused" : "active"));
  return changed ? {} : { error: fr ? "Reconnectez d'abord votre boîte Outlook." : "Reconnect your Outlook inbox first." };
}

/** The inbox is no longer read; its token goes (the e-mails already turned into tickets stay theirs). */
export async function disconnectMailAction(): Promise<{ error?: string }> {
  const { auth } = await requireErpAccess();
  await asSystem(auth.profile.id, (tx) => deleteConnection(tx, auth.profile.id));
  return {};
}

/** A skipped e-mail made a ticket now, at its person's request: Claude writes it, whatever its verdict was. */
export async function ticketFromMailAction(messageId: string): Promise<{ error?: string; ticketKey?: string | null }> {
  const { auth } = await requireErpAccess();
  const fr = (await getCurrentLocale()) === "fr";
  const id = auth.profile.id;
  const ready = await asSystem(id, (tx) => forceMessage(tx, messageId, id));
  if (!ready) return { error: fr ? "Cet e-mail n'est plus à traiter." : "This e-mail can no longer be processed." };

  const outcome = await processNow(messageId).catch(() => null);
  if (outcome !== "ticket") {
    return { error: fr ? "Le ticket n'a pas pu être créé ; un nouvel essai aura lieu sous peu." : "The ticket could not be created; it will be tried again shortly." };
  }
  const row = await asPerson((tx) =>
    selectOne<{ key: string | null }>(tx, "select work.task_key(ticket_id) as key from work.mail_message where id = $1::uuid", [messageId]),
  );
  return { ticketKey: row?.key ?? null };
}
