import "server-only";

import { logActivity } from "@/lib/activity/service";
import { getBumexEntity } from "@/lib/entities/config";
import type { PickerPerson } from "@/lib/entities/people-options";
import { createAssignmentNotification } from "@/lib/notifications/service";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

// A mission's team: erp.engagement_staff (0008). The rules let only the mission's managers (and the staffing managers
// of its entity) change it, so a caller without that right gets a refused write rather than a silent change.

/**
 * People who can join a project's team, from every entity: active staff who are not on it yet. Shareholders are left
 * out, as in Staffing.
 */
export async function getProjectMemberCandidates(memberIds: string[]): Promise<PickerPerson[]> {
  const rows = await asPerson((tx) =>
    select<PickerPerson>(
      tx,
      `select p.id, p.full_name, p.email, p.job_title, p.entity_code from work.person p
        where work.person_role(p.id) <> 'shareholder' and p.availability_status <> 'inactive' and not (p.id = any($1::text[]))
        order by p.full_name`,
      [memberIds],
    ),
  );
  return rows;
}

type Person = { id: string; full_name: string; role: AppRole; availability_status: string | null; entity_code: BumexEntityCode | null };

export async function addProjectMember(projectId: string, userId: string, actorUserId: string) {
  const { project, person } = await asPerson(async (tx) => {
    const project = await selectOne<{ id: string; name: string }>(tx, "select id, name from erp.engagement where id = $1::uuid", [projectId]);
    if (!project) throw new Error("Project not found.");
    const person = await selectOne<Person>(
      tx,
      "select id, full_name, work.person_role(id) as role, availability_status, entity_code from work.person where id = $1",
      [userId],
    );
    if (!person) throw new Error("Person not found.");
    if (person.availability_status === "inactive") throw new Error("This person is inactive.");
    if (person.role === "shareholder") throw new Error("Shareholders cannot join a project team.");
    await tx.query(
      `insert into erp.engagement_staff (engagement_id, user_id, role) values ($1::uuid, $2, $3)
       on conflict (engagement_id, user_id) do update set role = excluded.role`,
      [projectId, userId, person.role],
    );
    return { project, person };
  });

  const entityName = getBumexEntity(person.entity_code)?.name;
  await logActivity({
    userId: actorUserId,
    action: `Added ${person.full_name} to the team`,
    entityType: "project",
    entityId: projectId,
    metadata: {
      kind: "assignment_change",
      summary: entityName ? `${person.full_name} (${entityName}) joined the team` : `${person.full_name} joined the team`,
      assignee_id: userId,
    },
  });
  await createAssignmentNotification({
    userId,
    skipUserId: actorUserId,
    title: "Added to a project team",
    body: `You were added to the ${project.name} team.`,
    entityType: "project",
    entityId: projectId,
  });
}

export async function removeProjectMember(projectId: string, userId: string, actorUserId: string) {
  const name = await asPerson(async (tx) => {
    const removed = await tx.query("delete from erp.engagement_staff where engagement_id = $1::uuid and user_id = $2 returning user_id", [projectId, userId]);
    if (!removed.length) throw new Error("This person could not be removed from the team.");
    return (await selectOne<{ full_name: string }>(tx, "select full_name from work.person where id = $1", [userId]))?.full_name;
  });

  await logActivity({
    userId: actorUserId,
    action: `Removed ${name ?? "a member"} from the team`,
    entityType: "project",
    entityId: projectId,
    metadata: { kind: "assignment_change", summary: `${name ?? "A member"} left the team`, assignee_id: userId },
  });
}
