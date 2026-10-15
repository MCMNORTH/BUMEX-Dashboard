import { redirect } from "next/navigation";

import { PageRefresh } from "@/components/layout/page-refresh";
import { UsersManagement } from "@/components/settings/users-management";
import { requireRouteAccess } from "@/lib/auth/server";
import { getSettingsUsers } from "@/lib/settings/users";
import type { AppRole } from "@/types/auth";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Accounts change rarely and only here: cached for 10 minutes, refreshed on request.
export const unstable_dynamicStaleTime = 600;

export default async function SettingsUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireRouteAccess("settings");
  if (auth.role !== "admin") {
    redirect("/settings");
  }
  const params = (await searchParams) ?? {};
  const search = getString(params.search) ?? "";
  const role = ((getString(params.role) ?? "") as AppRole | "") || "";
  const error = getString(params.error) ?? "";
  const success = getString(params.success) ?? "";
  const { users, supportsEntityManagement } = await getSettingsUsers({
    search,
    role,
  });

  return (
    <>
    <PageRefresh tables={["profiles", "team_members"]} live="off" />
    <UsersManagement
      users={users}
      currentUserId={auth.profile.id}
      currentRole={auth.role}
      isSuperAdmin={auth.profile.is_super_admin}
      supportsEntityManagement={supportsEntityManagement}
      error={error}
      success={success}
    />
    </>
  );
}
