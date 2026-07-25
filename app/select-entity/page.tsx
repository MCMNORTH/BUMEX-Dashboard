import { redirect } from "next/navigation";

import { EntitySelectionShell } from "@/components/entities/entity-selection-shell";
import { requireAuthenticatedUser } from "@/lib/auth/server";

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SelectEntityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAuthenticatedUser();
  const params = (await searchParams) ?? {};

  if (auth.profile.entity_code) {
    redirect("/overview");
  }

  return <EntitySelectionShell error={getString(params.error) ?? ""} />;
}
