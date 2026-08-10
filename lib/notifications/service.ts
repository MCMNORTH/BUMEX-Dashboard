import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/server";
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

async function getProfilesByIds(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .in("id", ids)
    .order("full_name", { ascending: true })
    .returns<MentionCandidate[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getMentionCandidates(): Promise<MentionCandidate[]> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role")
    .order("full_name", { ascending: true })
    .returns<MentionCandidate[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
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
  }>,
) {
  if (!notifications.length) {
    return;
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("notifications").insert(
    notifications.map((notification) => ({
      ...notification,
      is_read: false,
      archived_at: null,
    })),
  );

  if (error) {
    throw new Error(error.message);
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

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error: mentionError } = await supabase.from("mentions").insert(
    mentions.map((mention) => ({
      comment_id: comment.id,
      mentioned_user_id: mention.id,
      mentioned_by: authorId,
      entity_type: entityType,
      entity_id: entityId,
    })),
  );

  if (mentionError) {
    throw new Error(mentionError.message);
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
}: {
  userId: string | null | undefined;
  type?: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType;
  entityId: string;
  skipUserId?: string | null;
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

export async function getRecentNotifications(limit = 8) {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, entity_type, entity_id, is_read, created_at, archived_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<NotificationRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getUnreadNotificationCount() {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null)
    .eq("is_read", false);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getNotificationRecipientsForProject(projectId: string) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [{ data: project }, { data: members }] = await Promise.all([
    supabase
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle<{ owner_id: string }>(),
    supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .returns<Array<{ user_id: string }>>(),
  ]);

  const ids = [
    project?.owner_id,
    ...(members ?? []).map((member) => member.user_id),
  ].filter(Boolean) as string[];

  return getProfilesByIds([...new Set(ids)]);
}

export async function markNotificationAsRead(notificationId: string) {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("id", notificationId)
    .is("archived_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markAllNotificationsAsRead() {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .is("archived_at", null)
    .eq("is_read", false);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getUserNotifications(filters: NotificationFilters = {}) {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = supabase
    .from("notifications")
    .select("id, user_id, type, title, body, entity_type, entity_id, is_read, created_at, archived_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,body.ilike.%${filters.search}%`);
  }

  if (filters.unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  const today = new Date();

  if (filters.date === "today") {
    query = query.gte("created_at", new Date(today.setUTCHours(0, 0, 0, 0)).toISOString());
  }

  if (filters.date === "week") {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    query = query.gte("created_at", weekStart.toISOString());
  }

  if (filters.date === "month") {
    const monthStart = new Date();
    monthStart.setUTCDate(monthStart.getUTCDate() - 30);
    query = query.gte("created_at", monthStart.toISOString());
  }

  const { data, error } = await query.returns<NotificationRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function archiveNotification(notificationId: string) {
  const userId = await getCurrentNotificationUserId();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ archived_at: new Date().toISOString(), is_read: true })
    .eq("user_id", userId)
    .eq("id", notificationId)
    .is("archived_at", null);

  if (error) {
    throw new Error(error.message);
  }
}
