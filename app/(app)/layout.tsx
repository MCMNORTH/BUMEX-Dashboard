import { redirect } from "next/navigation";

import { NoAccess } from "@/components/vanguard/no-access";
import { VanguardShell } from "@/components/vanguard/vanguard-shell";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getVanguardEntry } from "@/lib/erp/roles";

// The app is BUMEX Vanguard: everyone enters it with their Vanguard role (given on the first visit from their BUMEX One
// role, lib/erp/roles.ts). Someone whose access was removed, or who signs in while the ERP database is down, is told so.
export default async function ApplicationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile.entity_code) {
    redirect("/select-entity");
  }

  const entry = await getVanguardEntry(auth.profile);
  if (!entry.access) {
    return <NoAccess reason={entry.reason} email={auth.profile.email} />;
  }
  return <VanguardShell>{children}</VanguardShell>;
}
