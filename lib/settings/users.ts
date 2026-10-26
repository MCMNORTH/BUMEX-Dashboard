import "server-only";

import { getBumexEntity } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import { matchesSearchTerms, searchTerms } from "@/lib/search/text";
import { asPerson, select } from "@/lib/work/db";
import type { AppRole, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

// The people for the access administrator (Settings › accounts, people without access: vanguard/one/Account.tsx).

type SettingsUserFilters = {
  search?: string;
  role?: AppRole | "";
};

type SettingsUserRecord = Pick<Profile, "id" | "full_name" | "email" | "role" | "is_super_admin" | "entity_code" | "availability_status" | "created_at"> & {
  entity_name: string | null;
};

export async function getSettingsUsers(filters: SettingsUserFilters = {}) {
  const rows = await asPerson((tx) =>
    select<Omit<SettingsUserRecord, "entity_name">>(
      tx,
      `select p.id, p.full_name, p.email, work.person_role(p.id) as role, p.is_super_admin, p.entity_code, p.availability_status, p.created_at
         from work.person p order by p.full_name`,
    ),
  );
  const terms = filters.search?.trim() ? searchTerms(filters.search) : [];

  return {
    users: rows
      .filter((user) => (!filters.role || user.role === filters.role) && matchesSearchTerms(terms, [user.full_name, user.email]))
      .map((user) => ({ ...user, entity_name: getBumexEntity(user.entity_code as BumexEntityCode | null)?.name ?? null })),
    supportsEntityManagement: true,
  };
}

export async function updateSettingsUserEntity(userId: string, entityCode: BumexEntityCode) {
  try {
    await asPerson((tx) => tx.query("update work.person set entity_code = $2 where id = $1", [userId, entityCode]));
  } catch (error) {
    throw new Error(normalizeEntityMutationError(error, entityCode));
  }
}
