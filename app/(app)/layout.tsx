import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth/server";
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

  return <AppShell initialCollapsed={sidebarCollapsed}>{children}</AppShell>;
}
