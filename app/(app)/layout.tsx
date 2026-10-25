import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ErpAccessProvider } from "@/components/erp/erp-access-provider";
import { AppShell } from "@/components/layout/app-shell";
import { VanguardShell } from "@/components/vanguard/vanguard-shell";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getOrProvisionErpAccess } from "@/lib/erp/roles";
import { resolveSidebarAppearance } from "@/lib/settings/appearance";
import { sidebarCollapsedCookieName } from "@/lib/site";

export default async function ApplicationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile.entity_code) {
    redirect("/select-entity");
  }

  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get(sidebarCollapsedCookieName)?.value === "1";
  // everyone has a Vanguard role: given the first time from their BUMEX One role (lib/erp/roles.ts)
  const erpAccess = await getOrProvisionErpAccess(auth.profile);

  // People with ERP access work in Vanguard's frame, where BUMEX One's pages open; the others keep BUMEX One's shell.
  if (erpAccess) {
    return (
      <ErpAccessProvider access={erpAccess}>
        <VanguardShell initialAppearance={resolveSidebarAppearance(auth.profile)}>{children}</VanguardShell>
      </ErpAccessProvider>
    );
  }

  // Rendered on the server from the profile, so a reload never flashes another theme.
  return (
    <ErpAccessProvider access={erpAccess}>
      <AppShell initialCollapsed={sidebarCollapsed} initialAppearance={resolveSidebarAppearance(auth.profile)}>
        {children}
      </AppShell>
    </ErpAccessProvider>
  );
}
