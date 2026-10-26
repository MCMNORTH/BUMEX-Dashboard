import "server-only";

import { cache } from "react";

import { getErpAccess, readErpAccess } from "@/lib/erp/access";
import { isErpDatabaseConfigured, withErpSystemSession } from "@/lib/erp/db";
import type { AppRole, Profile } from "@/types/auth";
import type { ErpAccessInput } from "@/lib/erp/access";
import type { ErpAccess, ErpRole } from "@/types/erp";

// One person, one role: Vanguard's (erp.user_access). Everyone got one from the BUMEX One role they had (the work
// data's copy gave it to those who had not opened the app yet: scripts/work-copy.mjs); a new person gets staff on
// their entity. BUMEX One's rules read it back (bumexOneRoleFor here, work.actor_class in the database). Choices of
// 2026-10-25: supervisors are managers, shareholders are staff who see the reports only, partners and the finance lead
// act as administrators of the work.

type Person = Pick<Profile, "id" | "role" | "entity_code" | "is_super_admin">;

// BUMEX One's role → Vanguard's, once (lib/work/people.ts reads every person without access as an employee)
export function erpAccessFor(person: Person): ErpAccessInput {
  const ownEntity = person.entity_code ? [person.entity_code] : null;
  if (person.is_super_admin || person.role === "admin") return { role: "admin", entityCodes: null, modules: null };
  if (person.role === "manager" || person.role === "supervisor") return { role: "manager", entityCodes: ownEntity, modules: null };
  if (person.role === "shareholder") return { role: "staff", entityCodes: null, modules: ["reports"] };
  return { role: "staff", entityCodes: ownEntity, modules: null };
}

// Vanguard's role → the one BUMEX One's rules give (lib/work/people.ts PROFILE_COLUMNS, work.actor_class: the same)
export function bumexOneRoleFor(access: { role: ErpRole; modules: readonly string[] | null }): AppRole {
  if (access.role === "admin" || access.role === "partner" || access.role === "raf") return "admin";
  if (access.role === "manager") return "manager";
  if (access.role === "staff" && access.modules?.length === 1 && access.modules[0] === "reports") return "shareholder";
  return "employee";
}

// The first time a person opens the app: their Vanguard role from their BUMEX One one (an existing access is returned
// as it is). Someone whose access an administrator removed is not given one again (the history keeps every row).
export async function provisionErpAccess(person: Person): Promise<ErpAccess | null> {
  const input = erpAccessFor(person);
  // someone who has not chosen their entity yet would get every entity: they choose it first (/select-entity; the
  // page and its layout render together, so the page's own check must not give it meanwhile)
  const reportsOnly = input.modules?.length === 1 && input.modules[0] === "reports";
  if (input.role !== "admin" && !reportsOnly && !input.entityCodes) return null;
  return withErpSystemSession(person.id, async (tx) => {
    const existing = await readErpAccess(tx, person.id);
    if (existing) return existing;
    const [{ removed }] = await tx.query<{ removed: boolean }>(
      `select exists (select 1 from erp.audit_log where table_name = 'user_access'
                                               and coalesce(after_row, before_row) ->> 'user_id' = $1) as removed`,
      [person.id],
    );
    if (removed) return null;
    await tx.query("insert into erp.user_access (user_id, erp_role, entity_codes, modules) values ($1, $2, $3, $4)", [
      person.id, input.role, input.entityCodes, input.modules,
    ]);
    return readErpAccess(tx, person.id);
  });
}

// What every page asks: the person's access, given on their first visit. Once per request (the root layout and the
// app's layout ask it together, with the request's profile).
export const getOrProvisionErpAccess = cache(async (person: Person): Promise<ErpAccess | null> => {
  return (await getErpAccess(person.id)) ?? (await provisionErpAccess(person).catch(() => null));
});

// Whether the person enters Vanguard, the app: their access, or why not. Someone whose access an administrator
// removed sees so; a database that cannot be reached is said as such (getErpAccess hides its errors).
export type VanguardEntry = { access: ErpAccess } | { access: null; reason: "removed" | "unavailable" };

export async function getVanguardEntry(person: Person): Promise<VanguardEntry> {
  if (!isErpDatabaseConfigured()) return { access: null, reason: "unavailable" };
  const access = await getOrProvisionErpAccess(person);
  if (access) return { access };
  const reachable = await withErpSystemSession(person.id, (tx) => tx.query("select 1")).then(() => true, () => false);
  return { access: null, reason: reachable ? "removed" : "unavailable" };
}
