import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";

import { dispatchNotificationEmails, sweepNotificationEmails } from "@/lib/notifications/email-delivery";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select } from "@/lib/work/db";
import type { CommentEntityType, CommentRecord } from "@/types/comment";
import type {
  MentionCandidate,
  NotificationEntityType,
  NotificationFilters,
  NotificationRecord,
  NotificationType,
} from "@/types/notification";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

const CANDIDATE_SQL = "select p.id, p.full_name, p.email, p.avatar_url, work.person_role(p.id) as role from work.person p";

export async function getMentionCandidates(): Promise<MentionCandidate[]> {
  return asPerson((tx) => select<MentionCandidate>(tx, `${CANDIDATE_SQL} order by p.full_name`));
}

export function parseMentions(body: string, candidates: MentionCandidate[]) {
  const sanitizedBody = body.trim();

  if (!sanitizedBody) {
    return [];
  }

  const matches: MentionCandidate[] = [];
  const sortedCandidates = [...candidates].sort(
    (left, right) => right.full_name.length - left.full_name.length,
  );

  for (const candidate of sortedCandidates) {
    const pattern = new RegExp(`(^|[^\\w])@${escapeRegExp(candidate.full_name)}(?=$|[^\\w])`, "i");

    if (pattern.test(sanitizedBody)) {
      matches.push(candidate);
    }
  }

  return uniqueById(matches);
}

async function createNotifications(
  notifications: Array<{
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    entity_type: NotificationEntityType;
    entity_id: string;
    /** In-app only: the outbox trigger queues no email for it. */
    skip_email?: true;
  }>,
) {
  if (!notifications.length) {
    return;
  }

  const rows = notifications.map((notification) => ({ id: randomUUID(), ...notification }));

  await asPerson((tx) =>
    tx.query(
      `insert into work.notification (id, user_id, type, title, body, subject_type, subject_id, skip_email)
       select n.id, n.user_id, n.type, n.title, n.body, n.entity_type, n.entity_id, coalesce(n.skip_email, false)
         from jsonb_to_recordset($1::jsonb) as n(id uuid, user_id text, type text, title text, body text, entity_type text, entity_id text, skip_email boolean)`,
      [JSON.stringify(rows)],
    ),
  );

  try {
    after(async () => {
      try {
        await dispatchNotificationEmails(rows.map(({ id }) => id));
        await sweepNotificationEmails();
      } catch (dispatchError) {
        console.error(
          "[notification-email:dispatch]",
          dispatchError instanceof Error ? dispatchError.message : "unknown",
        );
      }
    });
  } catch (dispatchError) {
    console.error(
      "[notification-email:schedule]",
      dispatchError instanceof Error ? dispatchError.message : "unknown",
    );
  }
}

async function getCurrentNotificationUserId() {
  const auth = await requireAuthenticatedUser();
  return auth.profile.id;
}

export async function createScopedNotifications({
  userIds,
  type,
  title,
  body,
  entityType,
  entityId,
  skipUserId,
}: {
  userIds: Array<string | null | undefined>;
  type: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType;
  entityId: string;
  skipUserId?: string | null;
}) {
  const recipients = [...new Set(userIds.filter(Boolean) as string[])].filter(
    (userId) => userId !== skipUserId,
  );

  await createNotifications(
    recipients.map((userId) => ({
      user_id: userId,
      type,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
    })),
  );
}

export async function createMentionNotifications({
  comment,
  entityType,
  entityId,
  authorId,
}: {
  comment: Pick<CommentRecord, "id" | "body" | "is_internal">;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
}) {
  const candidates = await getMentionCandidates();
  const mentions = parseMentions(comment.body, candidates)
    .filter((candidate) => candidate.id !== authorId)
    .filter((candidate) => !(candidate.role === "shareholder" && comment.is_internal));

  if (!mentions.length) {
    return;
  }

  await createNotifications(
    mentions.map((mention) => ({
      user_id: mention.id,
      type: "mention" as const,
      title: "You were mentioned",
      body: `You were mentioned in a comment on this ${entityType}.`,
      entity_type: entityType,
      entity_id: entityId,
    })),
  );
}

export async function createAssignmentNotification({
  userId,
  type = "assignment",
  title,
  body,
  entityType,
  entityId,
  skipUserId,
  email = true,
}: {
  userId: string | null | undefined;
  type?: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType;
  entityId: string;
  skipUserId?: string | null;
  /** False keeps the notification in the app only (the creator chose not to email it). */
  email?: boolean;
}) {
  if (!userId || userId === skipUserId) {
    return;
  }

  await createNotifications([
    {
      user_id: userId,
      type,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
      ...(email ? {} : { skip_email: true as const }),
    },
  ]);
}

export async function createStatusChangeNotification({
  userIds,
  title,
  body,
  entityType,
  entityId,
  skipUserId,
}: {
  userIds: Array<string | null | undefined>;
  title: string;
  body: string;
  entityType: NotificationEntityType;
  entityId: string;
  skipUserId?: string | null;
}) {
  await createScopedNotifications({
    userIds,
    type: "status_change",
    title,
    body,
    entityType,
    entityId,
    skipUserId,
  });
}

export async function getNotificationRecipientsForProject(projectId: string) {
  return asPerson((tx) =>
    select<MentionCandidate>(
      tx,
      `${CANDIDATE_SQL}
        where p.id in (select owner_id from erp.engagement where id = $1::uuid
                       union select user_id from erp.engagement_staff where engagement_id = $1::uuid)
        order by p.full_name`,
      [projectId],
    ),
  );
}

// The person's own notification, changed; the rules let nobody else's be.
async function updateOwn(set: string, where: string, params: unknown[] = []) {
  const userId = await getCurrentNotificationUserId();
  await asPerson((tx) => tx.query(`update work.notification set ${set} where user_id = $1 and archived_at is null and ${where}`, [userId, ...params]));
}

export async function markNotificationAsRead(notificationId: string) {
  await updateOwn("is_read = true", "id = $2::uuid", [notificationId]);
}

export async function markAllNotificationsAsRead() {
  await updateOwn("is_read = true", "not is_read");
}

/** The user's notifications, newest first; `limit` keeps it to the latest ones. */
export async function getUserNotifications(filters: NotificationFilters = {}, limit?: number) {
  const userId = await getCurrentNotificationUserId();
  const where = ["user_id = $1", "archived_at is null"];
  const params: unknown[] = [userId];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.unreadOnly) where.push("not is_read");
  if (filters.type) where.push(`type = ${param(filters.type)}`);
  const since = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString();
  };
  if (filters.date === "today") {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    where.push(`created_at >= ${param(today.toISOString())}::timestamptz`);
  }
  if (filters.date === "week") where.push(`created_at >= ${param(since(7))}::timestamptz`);
  if (filters.date === "month") where.push(`created_at >= ${param(since(30))}::timestamptz`);
  // a search reads them all (then keeps the latest); otherwise only the latest are read
  const limitSql = limit && !filters.search ? ` limit ${param(limit)}` : "";

  const rows = await asPerson((tx) =>
    select<NotificationRecord>(
      tx,
      `select id, user_id, type, title, body, subject_type as entity_type, subject_id as entity_id, is_read, created_at, archived_at
         from work.notification where ${where.join(" and ")} order by created_at desc${limitSql}`,
      params,
    ),
  );
  if (!filters.search) return rows;
  const terms = searchTerms(filters.search);
  const found = rows.filter((row) => matchesSearchTerms(terms, [row.title, row.body]));
  return limit ? found.slice(0, limit) : found;
}

// What the bell checks every half minute: a version of the person's live notifications (it moves when one arrives, is
// read or archived), so the list is read again only then.
export async function getNotificationsVersion(): Promise<string> {
  const userId = await getCurrentNotificationUserId();
  const [row] = await asPerson((tx) =>
    select<{ version: string }>(
      tx,
      `select count(*) || ':' || count(*) filter (where is_read) || ':' || coalesce(max(created_at)::text, '') as version
         from work.notification where user_id = $1 and archived_at is null`,
      [userId],
    ),
  );
  return row?.version ?? "";
}

export async function archiveNotification(notificationId: string) {
  await updateOwn("archived_at = now(), is_read = true", "id = $2::uuid", [notificationId]);
}
