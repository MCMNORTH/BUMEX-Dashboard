import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth/server";

export default async function ApplicationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await requireAuthenticatedUser();

  if (!auth.profile.entity_code) {
    redirect("/select-entity");
  }

  return <AppShell>{children}</AppShell>;
}
