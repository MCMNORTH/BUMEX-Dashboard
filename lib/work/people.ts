import "server-only";

import type { Profile } from "@/types/auth";
import { asSystem, select, selectOne, type Tx } from "@/lib/work/db";

// A person as the app's Profile has them. Their role is Vanguard's (erp.user_access), read as BUMEX One's rules read it
// (work.person_role, as lib/erp/roles.ts bumexOneRoleFor); someone without access reads as an employee.
export const PROFILE_COLUMNS = `p.id, p.email, p.full_name, p.is_super_admin, p.entity_code, p.avatar_url, p.job_title, p.department, p.skills,
  p.phone, p.availability_status, p.weekly_capacity_hours, p.email_notifications, p.created_at, p.updated_at, work.person_role(p.id) as role`;

export const PROFILE_FROM = "work.person p";

export function readProfiles(tx: Tx, where = "true", params: unknown[] = []) {
  return select<Profile>(tx, `select ${PROFILE_COLUMNS} from ${PROFILE_FROM} where ${where} order by p.full_name`, params);
}

// Sign-in's read of a person (the server's: their own rules are not yet known).
export function getPersonProfile(id: string) {
  return asSystem(id, (tx) => selectOne<Profile>(tx, `select ${PROFILE_COLUMNS} from ${PROFILE_FROM} where p.id = $1`, [id]));
}

// A first sign-in: the person's row, from their account. Their entity is chosen next (/select-entity).
export function createPerson(person: { id: string; email: string; fullName: string; isSuperAdmin: boolean }) {
  return asSystem(person.id, async (tx) => {
    await tx.query(
      `insert into work.person (id, email, full_name, is_super_admin) values ($1, $2, $3, $4) on conflict (id) do nothing`,
      [person.id, person.email, person.fullName, person.isSuperAdmin],
    );
    return selectOne<Profile>(tx, `select ${PROFILE_COLUMNS} from ${PROFILE_FROM} where p.id = $1`, [person.id]);
  });
}

export function setSuperAdmin(id: string) {
  return asSystem(id, (tx) => tx.query("update work.person set is_super_admin = true where id = $1 and not is_super_admin", [id]));
}
