import "server-only";

import { cache } from "react";

import { resolveErpModules } from "@/lib/erp/config";
import { isErpDatabaseConfigured, withErpSession, withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import type { Profile } from "@/types/auth";
import type { ErpAccess, ErpAccessGrant, ErpModuleKey, ErpRole } from "@/types/erp";
import type { BumexEntityCode } from "@/types/entity";

type AccessRow = {
  user_id: string;
  erp_role: ErpRole;
  entity_codes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
  granted_by: string;
  granted_at: Date;
  updated_by: string | null;
  updated_at: Date;
};

const accessColumns = "user_id, erp_role, entity_codes, modules, granted_by, granted_at, updated_by, updated_at";

function toGrant(row: AccessRow): ErpAccessGrant {
  return {
    userId: row.user_id,
    role: row.erp_role,
    entityCodes: row.entity_codes,
    modules: row.modules,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at.toISOString(),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

// The signed-in person's ERP access, once per request. null = no ERP (no row, no database, or the database is
// unreachable: BUMEX One keeps working and the ERP stays hidden).
export const getErpAccess = cache(async (userId: string): Promise<ErpAccess | null> => {
  if (!isErpDatabaseConfigured()) {
    return null;
  }

  try {
    const [row] = await withErpSession(userId, (tx) =>
      tx.query<AccessRow>(`select ${accessColumns} from erp.user_access where user_id = $1`, [userId]),
    );

    return row
      ? { role: row.erp_role, entityCodes: row.entity_codes, modules: resolveErpModules(row.erp_role, row.modules) }
      : null;
  } catch (error) {
    console.error("[erp:access]", error instanceof Error ? error.message : error);
    return null;
  }
});

// The BUMEX One super admin manages ERP access, and so does anyone whose ERP role is admin.
export function canManageErpAccess(profile: Pick<Profile, "is_super_admin">, access: ErpAccess | null) {
  return profile.is_super_admin || access?.role === "admin";
}

export async function listErpAccessGrants(actorId: string): Promise<Map<string, ErpAccessGrant>> {
  const rows = await withErpSystemSession(actorId, (tx) =>
    tx.query<AccessRow>(`select ${accessColumns} from erp.user_access order by user_id`),
  );

  return new Map(rows.map((row) => [row.user_id, toGrant(row)]));
}

export type ErpAccessInput = {
  role: ErpRole;
  entityCodes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
};

// The super admin acts through the system context; an ERP administrator through their own session, where the
// schema refuses anything they may not do (for instance removing their own administrator role).
function asManager<T>(actor: Pick<Profile, "id" | "is_super_admin">, work: (tx: ErpTransaction) => Promise<T>) {
  return actor.is_super_admin ? withErpSystemSession(actor.id, work) : withErpSession(actor.id, work);
}

export async function saveErpAccess(actor: Pick<Profile, "id" | "is_super_admin">, userId: string, input: ErpAccessInput) {
  await asManager(actor, (tx) =>
    tx.query(
      `insert into erp.user_access (user_id, erp_role, entity_codes, modules)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
         set erp_role = excluded.erp_role, entity_codes = excluded.entity_codes, modules = excluded.modules`,
      [userId, input.role, input.entityCodes, input.modules],
    ),
  );
}

export async function removeErpAccess(actor: Pick<Profile, "id" | "is_super_admin">, userId: string) {
  await asManager(actor, (tx) => tx.query("delete from erp.user_access where user_id = $1", [userId]));
}
