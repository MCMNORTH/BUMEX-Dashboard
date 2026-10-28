"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { asPerson } from "@/lib/work/db";
import type { AppRole } from "@/types/auth";

// The Settings room's "Mon compte" tab (vanguard/one/Account.tsx: BUMEX One's profile, preferences and security pages).
// Everyone's access, with the people who have none, is the Permissions tab's (permission-actions.ts).

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

// The person's default entity (0015): the floor the app opens on and the logo comes back to. One of the floors they
// see, never the test floor; null goes back to their home entity.
export async function setDefaultEntityAction(entityId: string | null): Promise<{ error?: string }> {
  const { auth } = await requireErpAccess();
  try {
    const done = await asPerson((tx) =>
      tx.query(
        `update work.person p set default_entity_code = e.code
           from (select null::text as code where $2::uuid is null
                 union all select x.code from erp.entity x where x.id = $2::uuid and erp.can_see_entity(x.id) and not erp.is_test_entity(x.id)) e
          where p.id = $1
         returning p.id`,
        [auth.profile.id, entityId || null],
      ),
    );
    return done.length ? {} : { error: "Cette entité n'est pas l'une des vôtres." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Le choix n'est pas enregistré." };
  }
}
