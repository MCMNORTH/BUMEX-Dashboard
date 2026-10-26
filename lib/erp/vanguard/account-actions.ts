"use server";

import { requireErpAccess } from "@/lib/erp/server";
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
