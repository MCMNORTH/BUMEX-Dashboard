import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/server";
import { getOrProvisionErpAccess } from "@/lib/erp/roles";

export default async function Home() {
  const auth = await getAuthContext();

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile?.entity_code) {
    redirect("/select-entity");
  }

  // Vanguard is the home of everyone with ERP access
  redirect((await getOrProvisionErpAccess(auth.profile)) ? "/vanguard" : "/overview");
}
