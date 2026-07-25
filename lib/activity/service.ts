import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sanitizeShareholderMetadata } from "@/lib/activity/presentation";
import { sanitizeActivityCollectionForViewer } from "@/lib/activity/security";
import { getClients } from "@/lib/clients/service";
import { getContractsDueForRenewal } from "@/lib/contracts/service";
import { applyEntityScope, getOptionalCurrentEntityCode } from "@/lib/entities/scope";
import { SHAREHOLDER_NOTES_ENTITY_ID } from "@/lib/notes/constants";
import { getNotesForEntity } from "@/lib/notes/service";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";
import type { ActivityEntityType, ActivityLogRecord, ActivityMetadata } from "@/types/activity";

type ActivityRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  metadata: ActivityMetadata | null;
  created_at: string;
  user:
    | {
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }
    | Array<{
        id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
      }>
    | null;
};

function isMissingActivityEntityCodeError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("activity_logs")
    && message.includes("entity_code")
    && (message.includes("schema cache") || message.includes("does not exist"));
}

function single<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function mapActivity(row: ActivityRow): ActivityLogRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    user: single(row.user),
  };
}

export async function logActivity(params: {
  userId: string | null;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  metadata?: ActivityMetadata;
}) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getOptionalCurrentEntityCode();
  const basePayload = {
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: params.metadata ?? {},
  };

  let { error } = await supabase.from("activity_logs").insert({
    ...basePayload,
    ...(entityCode ? { entity_code: entityCode } : {}),
  });

  if (error && entityCode && isMissingActivityEntityCodeError(error)) {
    ({ error } = await supabase.from("activity_logs").insert(basePayload));
  }

  if (error) {
    throw new Error(error.message);
  }
}

async function queryActivityLogs(limit = 40) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getOptionalCurrentEntityCode();
  let query = supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityCode) {
    query = applyEntityScope(query, entityCode);
  }

  let { data, error } = await query.returns<ActivityRow[]>();

  if (error && entityCode && isMissingActivityEntityCodeError(error)) {
    ({ data, error } = await supabase
      .from("activity_logs")
      .select(
        `
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at,
          user:profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ActivityRow[]>());
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapActivity);
}

async function getShareholderActivityLogs(limit = 40) {
  const [clients, contracts, notes] = await Promise.all([
    getClients("shareholder"),
    getContractsDueForRenewal("shareholder"),
    getNotesForEntity("shareholder", SHAREHOLDER_NOTES_ENTITY_ID),
  ]);

  const clientActivities = clients.flatMap((client) =>
    client.recentActivity.map((activity) => sanitizeShareholderMetadata(activity)),
  );

  const contractActivities = contracts.flatMap((contract) =>
    contract.recentActivity.map((activity) => sanitizeShareholderMetadata(activity)),
  );

  const noteActivities: ActivityLogRecord[] = notes
    .filter((note) => note.visibility === "shareholders")
    .map((note) => ({
      id: `note-${note.id}`,
      user_id: note.author_id,
      action: note.pinned ? "Pinned executive note" : "Executive note updated",
      entity_type: "note",
      entity_id: note.id,
      metadata: {
        kind: note.pinned ? "pin" : "update",
        summary: note.title,
        related_type: note.entity_type,
        related_id: note.entity_id,
        note_id: note.id,
        note_title: note.title,
        visibility: note.visibility,
      },
      created_at: note.updated_at,
      user: note.author,
    }));

  return [...clientActivities, ...contractActivities, ...noteActivities]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit);
}

export async function getActivityLogs(
  limitOrOptions:
    | number
    | {
        role: AppRole;
        currentUserId: string;
        limit?: number;
      } = 40,
) {
  if (typeof limitOrOptions === "number") {
    return queryActivityLogs(limitOrOptions);
  }

  const { role, currentUserId, limit = 40 } = limitOrOptions;

  if (role === "shareholder") {
    // Shareholder activity is rebuilt from already-sanitized executive sources.
    const activities = await getShareholderActivityLogs(limit);
    return sanitizeActivityCollectionForViewer(activities, { role, currentUserId });
  }

  const activities = await queryActivityLogs(limit);
  return sanitizeActivityCollectionForViewer(activities, { role, currentUserId });
}

export async function getProjectActivity(
  projectId: string,
  taskIds: string[] = [],
  milestoneIds: string[] = [],
  limit = 12,
  existingClient?: SupabaseClient,
) {
  const supabase = existingClient ?? await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const taskFilter = taskIds.length
    ? `,and(entity_type.eq.task,entity_id.in.(${taskIds.join(",")}))`
    : "";
  const milestoneFilter = milestoneIds.length
    ? `,and(entity_type.eq.milestone,entity_id.in.(${milestoneIds.join(",")}))`
    : "";
  const projectFilter = projectId
    ? `and(entity_type.eq.project,entity_id.eq.${projectId})`
    : "";

  const entityCode = await getOptionalCurrentEntityCode();
  let query = supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .or(`${projectFilter}${taskFilter}${milestoneFilter}`.replace(/^,/, ""))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityCode) {
    query = applyEntityScope(query, entityCode);
  }

  let { data, error } = await query.returns<ActivityRow[]>();

  if (error && entityCode && isMissingActivityEntityCodeError(error)) {
    ({ data, error } = await supabase
      .from("activity_logs")
      .select(
        `
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at,
          user:profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `,
      )
      .or(`${projectFilter}${taskFilter}${milestoneFilter}`.replace(/^,/, ""))
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ActivityRow[]>());
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapActivity);
}

export async function getTicketActivity(ticketId: string, projectId: string, limit = 12) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entityCode = await getOptionalCurrentEntityCode();
  let query = supabase
    .from("activity_logs")
    .select(
      `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user:profiles (
          id,
          full_name,
          email,
          avatar_url
        )
      `,
    )
    .or(`and(entity_type.eq.task,entity_id.eq.${ticketId}),and(entity_type.eq.project,entity_id.eq.${projectId})`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityCode) {
    query = applyEntityScope(query, entityCode);
  }

  let { data, error } = await query.returns<ActivityRow[]>();

  if (error && entityCode && isMissingActivityEntityCodeError(error)) {
    ({ data, error } = await supabase
      .from("activity_logs")
      .select(
        `
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at,
          user:profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `,
      )
      .or(`and(entity_type.eq.task,entity_id.eq.${ticketId}),and(entity_type.eq.project,entity_id.eq.${projectId})`)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ActivityRow[]>());
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapActivity);
}
