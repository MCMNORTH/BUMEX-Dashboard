import "server-only";

import { sanitizeShareholderMetadata } from "@/lib/activity/presentation";
import { sanitizeActivityCollectionForViewer } from "@/lib/activity/security";
import { getClients } from "@/lib/clients/service";
import { getContractsDueForRenewal } from "@/lib/contracts/service";
import { SHAREHOLDER_NOTES_ENTITY_ID } from "@/lib/notes/constants";
import { getNotesForEntity } from "@/lib/notes/service";
import { asPerson, select } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { ActivityEntityType, ActivityLogRecord, ActivityMetadata } from "@/types/activity";

// The work's history as people read it: work.activity (0008), each row seen by whoever may see its subject (the rules).

const ACTIVITY_SQL = `
  select a.id, a.user_id, a.action, a.subject_type as entity_type, a.subject_id as entity_id, a.metadata, a.created_at,
         (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url)
            from work.person p where p.id = a.user_id) as "user"
    from work.activity a`;

export async function logActivity(params: {
  userId: string | null;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  metadata?: ActivityMetadata;
}) {
  await asPerson((tx) =>
    tx.query(
      `insert into work.activity (user_id, action, subject_type, subject_id, metadata, entity_code)
       values ($1, $2, $3, $4, $5::jsonb, (select entity_code from work.person where id = erp.actor_id()))`,
      [params.userId, params.action, params.entityType, params.entityId, JSON.stringify(params.metadata ?? {})],
    ),
  );
}

async function queryActivityLogs(limit = 40) {
  return asPerson((tx) => select<ActivityLogRecord>(tx, `${ACTIVITY_SQL} order by a.created_at desc limit $1`, [limit]));
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

export async function getProjectActivity(projectId: string, taskIds: string[] = [], milestoneIds: string[] = [], limit = 12) {
  return asPerson((tx) =>
    select<ActivityLogRecord>(
      tx,
      `${ACTIVITY_SQL}
        where (a.subject_type = 'project' and a.subject_id = $1) or (a.subject_type = 'task' and a.subject_id = any($2::text[]))
           or (a.subject_type = 'milestone' and a.subject_id = any($3::text[]))
        order by a.created_at desc limit $4`,
      [projectId, taskIds, milestoneIds, limit],
    ),
  );
}

export async function getTicketActivity(ticketId: string, projectId: string, limit = 12) {
  return asPerson((tx) =>
    select<ActivityLogRecord>(
      tx,
      `${ACTIVITY_SQL}
        where (a.subject_type = 'task' and a.subject_id = $1) or (a.subject_type = 'project' and a.subject_id = $2)
        order by a.created_at desc limit $3`,
      [ticketId, projectId, limit],
    ),
  );
}

// The activity of some subjects (a list's records), latest first, for the lists' "recent activity".
export async function getSubjectsActivity(subjectType: ActivityEntityType, subjectIds: string[], limitPerSubject = 5) {
  const out = new Map<string, ActivityLogRecord[]>();
  if (!subjectIds.length) return out;
  const ranked = ACTIVITY_SQL.replace("from work.activity a", ", row_number() over (partition by a.subject_id order by a.created_at desc) as n from work.activity a");
  const rows = await asPerson((tx) =>
    select<ActivityLogRecord>(
      tx,
      `select id, user_id, action, entity_type, entity_id, metadata, created_at, "user"
         from (${ranked} where a.subject_type = $1 and a.subject_id = any($2::text[])) x
        where x.n <= $3 order by x.created_at desc`,
      [subjectType, subjectIds, limitPerSubject],
    ),
  );
  for (const row of rows) out.set(row.entity_id, [...(out.get(row.entity_id) ?? []), row]);
  return out;
}

// The activity of several kinds of subjects at once (a client's timeline: the client, its projects, tickets, contracts
// and documents), latest first.
export async function getScopedActivity(scopes: { type: ActivityEntityType; ids: string[] }[], limit: number) {
  const used = scopes.filter((scope) => scope.ids.length);
  if (!used.length) return [];
  return asPerson((tx) =>
    select<ActivityLogRecord>(
      tx,
      `${ACTIVITY_SQL}
         join jsonb_to_recordset($1::jsonb) as s(type text, ids text[]) on a.subject_type = s.type and a.subject_id = any(s.ids)
        order by a.created_at desc limit $2`,
      [JSON.stringify(used), limit],
    ),
  );
}

// What a person did, and what was done to their profile, latest first.
export async function getPersonActivity(userId: string, limit = 12) {
  return asPerson((tx) =>
    select<ActivityLogRecord>(
      tx,
      `${ACTIVITY_SQL} where (a.subject_type = 'profile' and a.subject_id = $1) or a.user_id = $1 order by a.created_at desc limit $2`,
      [userId, limit],
    ),
  );
}
