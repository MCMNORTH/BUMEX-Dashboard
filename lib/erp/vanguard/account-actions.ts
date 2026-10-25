"use server";

import { canManageErpAccess, listErpAccessGrants } from "@/lib/erp/access";
import { requireErpAccess } from "@/lib/erp/server";
import { floors } from "@/lib/erp/vanguard/floors";
import { getSettingsUsers } from "@/lib/settings/users";
import type { AppRole } from "@/types/auth";

// The Settings room's "Mon compte" tab (vanguard/one/Account.tsx: BUMEX One's profile, preferences and security pages)
// and, in its accounts tab, BUMEX One's people who have no Vanguard access yet (BUMEX One's Users page, merged there on
// 2026-10-25).

export type MyAccount = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  avatarUrl: string | null;
  emailNotifications: boolean;
  role: AppRole;
};

export async function myAccountAction(): Promise<MyAccount> {
  const { auth } = await requireErpAccess();
  const p = auth.profile;
  return { fullName: p.full_name, email: p.email, phone: p.phone ?? "", jobTitle: p.job_title ?? "", avatarUrl: p.avatar_url, emailNotifications: p.email_notifications !== false, role: auth.role };
}

export type PersonWithoutAccess = { id: string; name: string; email: string; entityCode: string | null; floor: string | null };
export type PeopleWithoutAccess = { people: PersonWithoutAccess[]; canEditEntity: boolean } | null;

// The access administrator only (the super admin or an ERP admin), as on BUMEX One's Users page.
export async function peopleWithoutAccessAction(): Promise<PeopleWithoutAccess> {
  const { auth, access } = await requireErpAccess();
  if (!canManageErpAccess(auth.profile, access)) return null;
  const [{ users }, grants] = await Promise.all([getSettingsUsers({}), listErpAccessGrants(auth.profile.id)]);
  return {
    people: users
      .filter((u) => !grants.has(u.id))
      .map((u) => ({ id: u.id, name: u.full_name || u.email, email: u.email, entityCode: u.entity_code, floor: u.entity_code ? (floors[u.entity_code]?.code ?? null) : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // a person's home entity is BUMEX One's super admin's to change (settings/users/actions.ts)
    canEditEntity: auth.profile.is_super_admin,
  };
}
