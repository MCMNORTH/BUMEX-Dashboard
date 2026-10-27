import "server-only";

import { cache } from "react";

import { resolveErpModules } from "@/lib/erp/config";
import { isErpDatabaseConfigured, withErpSession, withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import type { ErpAccess, ErpAccessGrant, ErpEntityModules, ErpModuleKey, ErpRole } from "@/types/erp";
import type { BumexEntityCode } from "@/types/entity";

type AccessRow = {
  user_id: string;
  erp_role: ErpRole;
  entity_codes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
  entity_modules: ErpEntityModules | null;
  manages_access: boolean;
  view_3d: boolean;
  granted_by: string;
  granted_at: Date;
  updated_by: string | null;
  updated_at: Date;
};

const accessColumns = "user_id, erp_role, entity_codes, modules, entity_modules, manages_access, view_3d, granted_by, granted_at, updated_by, updated_at";

function toGrant(row: AccessRow): ErpAccessGrant {
  return {
    userId: row.user_id,
    role: row.erp_role,
    entityCodes: row.entity_codes,
    modules: row.modules,
    entityModules: row.entity_modules,
    managesAccess: row.manages_access,
    view3d: row.view_3d,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at.toISOString(),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

// A row as what the person may open: the role's modules when none were chosen.
export function accessOf(row: Pick<AccessRow, "erp_role" | "entity_codes" | "modules" | "entity_modules" | "manages_access" | "view_3d">): ErpAccess {
  return {
    role: row.erp_role,
    entityCodes: row.entity_codes,
    modules: resolveErpModules(row.erp_role, row.modules),
    entityModules: row.entity_modules ?? {},
    managesAccess: row.manages_access,
    view3d: row.view_3d,
  };
}

// A person's access as the transaction sees it (after a change: lib/erp/vanguard/save.ts).
export async function readErpAccess(tx: ErpTransaction, userId: string): Promise<ErpAccess | null> {
  const [row] = await tx.query<AccessRow>(`select ${accessColumns} from erp.user_access where user_id = $1`, [userId]);
  return row ? accessOf(row) : null;
}

// The signed-in person's ERP access, once per request. null = no ERP (no row, no database, or the database is
// unreachable: BUMEX One keeps working and the ERP stays hidden).
export const getErpAccess = cache(async (userId: string): Promise<ErpAccess | null> => {
  if (!isErpDatabaseConfigured()) {
    return null;
  }

  try {
    return await withErpSession(userId, (tx) => readErpAccess(tx, userId));
  } catch (error) {
    console.error("[erp:access]", error instanceof Error ? error.message : error);
    return null;
  }
});

// Access is changed by an administrator who manages it (the "role modifier", 0009) and by nobody else: the database
// refuses the others whatever their role.
export function canManageErpAccess(access: ErpAccess | null) {
  return access?.managesAccess === true;
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
  entityModules?: ErpEntityModules | null;
  managesAccess?: boolean;
  view3d?: boolean;
};

// Written in the role modifier's own session (lib/erp/permissions.ts), where the schema refuses anyone else and what
// nobody may do to themselves.
export async function writeErpAccess(tx: ErpTransaction, userId: string, input: ErpAccessInput) {
  await tx.query(
    `insert into erp.user_access (user_id, erp_role, entity_codes, modules, entity_modules, manages_access, view_3d)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id) do update
       set erp_role = excluded.erp_role, entity_codes = excluded.entity_codes, modules = excluded.modules,
           entity_modules = excluded.entity_modules, manages_access = excluded.manages_access, view_3d = excluded.view_3d`,
    [userId, input.role, input.entityCodes, input.modules, input.entityModules ?? null, input.managesAccess === true, input.view3d === true],
  );
}

export async function deleteErpAccess(tx: ErpTransaction, userId: string) {
  return tx.run("delete from erp.user_access where user_id = $1", [userId]);
}
