import "server-only";

import { cache } from "react";

import { getErpAccess } from "@/lib/erp/access";
import { resolveErpModules } from "@/lib/erp/config";
import { withErpSystemSession } from "@/lib/erp/db";
import { createAdminClient } from "@/lib/firebase/server";
import type { AppRole, Profile } from "@/types/auth";
import type { ErpAccessInput } from "@/lib/erp/access";
import type { ErpAccess, ErpRole } from "@/types/erp";

// One person, one role: Vanguard's (erp.user_access). Everyone gets one the first time they open the app, from the
// BUMEX One role they had; from then on the BUMEX One role (profiles.role) only follows it, so BUMEX One's remaining
// pages keep their rules until they move into Vanguard. Choices of 2026-10-25: supervisors are managers, shareholders
// are staff who see the reports only, partners and the finance lead act as admins on BUMEX One's pages.

type Person = Pick<Profile, "id" | "role" | "entity_code" | "is_super_admin">;

// BUMEX One's role → Vanguard's, once
export function erpAccessFor(person: Person): ErpAccessInput {
  const ownEntity = person.entity_code ? [person.entity_code] : null;
  if (person.is_super_admin || person.role === "admin") return { role: "admin", entityCodes: null, modules: null };
  if (person.role === "manager" || person.role === "supervisor") return { role: "manager", entityCodes: ownEntity, modules: null };
  if (person.role === "shareholder") return { role: "staff", entityCodes: null, modules: ["reports"] };
  return { role: "staff", entityCodes: ownEntity, modules: null };
}

// Vanguard's role → the BUMEX One role that follows it
export function bumexOneRoleFor(access: { role: ErpRole; modules: readonly string[] | null }): AppRole {
  if (access.role === "admin" || access.role === "partner" || access.role === "raf") return "admin";
  if (access.role === "manager") return "manager";
  if (access.role === "staff" && access.modules?.length === 1 && access.modules[0] === "reports") return "shareholder";
  return "employee";
}

// The BUMEX One role of these people follows their Vanguard role (people without one keep theirs).
export async function syncBumexOneRoles(userIds?: string[]) {
  const db = createAdminClient();
  if (!db) return;
  const rows = await withErpSystemSession("bumex-one", (tx) =>
    tx.query<{ user_id: string; erp_role: ErpRole; modules: string[] | null }>(
      `select user_id, erp_role, modules from erp.user_access ${userIds ? "where user_id = any($1::text[])" : ""}`,
      userIds ? [userIds] : [],
    ),
  );
  if (!rows.length) return;
  const { data: profiles } = await db.from("profiles").select("id, role").in("id", rows.map((r) => r.user_id)).returns<{ id: string; role: AppRole }[]>();
  const current = new Map((profiles ?? []).map((p) => [p.id, p.role]));
  for (const row of rows) {
    const role = bumexOneRoleFor({ role: row.erp_role, modules: row.modules });
    if (current.has(row.user_id) && current.get(row.user_id) !== role) {
      await db.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", row.user_id);
    }
  }
}

// The first time a person opens the app: their Vanguard role from their BUMEX One one (an existing access is returned
// as it is). Someone whose access an administrator removed is not given one again (the history keeps every row).
export async function provisionErpAccess(person: Person): Promise<ErpAccess | null> {
  const input = erpAccessFor(person);
  const result = await withErpSystemSession(person.id, async (tx) => {
    const [existing] = await tx.query<{ role: ErpRole; entity_codes: ErpAccess["entityCodes"]; modules: ErpAccessInput["modules"] }>(
      "select erp_role as role, entity_codes, modules from erp.user_access where user_id = $1",
      [person.id],
    );
    if (existing) return { access: { role: existing.role, entityCodes: existing.entity_codes, modules: existing.modules }, created: false };
    const [{ removed }] = await tx.query<{ removed: boolean }>(
      `select exists (select 1 from erp.audit_log where table_name = 'user_access'
                                               and coalesce(after_row, before_row) ->> 'user_id' = $1) as removed`,
      [person.id],
    );
    if (removed) return null;
    await tx.query("insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)", [
      person.id, input.role, input.entityCodes, input.modules,
    ]);
    return { access: input, created: true };
  });
  if (!result) return null;
  if (result.created) await syncBumexOneRoles([person.id]);
  return { role: result.access.role, entityCodes: result.access.entityCodes, modules: resolveErpModules(result.access.role, result.access.modules) };
}

// What every page asks: the person's access, given on their first visit. Once per request (the root layout and the
// app's layout ask it together, with the request's profile).
export const getOrProvisionErpAccess = cache(async (person: Person): Promise<ErpAccess | null> => {
  return (await getErpAccess(person.id)) ?? (await provisionErpAccess(person).catch(() => null));
});
