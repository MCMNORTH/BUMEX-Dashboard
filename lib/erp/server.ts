import "server-only";

import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { getErpAccess } from "@/lib/erp/access";
import type { ErpModuleKey } from "@/types/erp";

// Gate for every ERP page and action: the BUMEX One route check, then the person's ERP access (and module).
export async function requireErpAccess(module?: ErpModuleKey) {
  const auth = await requireRouteAccess("erp");
  const access = await getErpAccess(auth.profile.id);

  if (!access || (module && !access.modules.includes(module))) {
    redirect("/overview");
  }

  return { auth, access };
}
