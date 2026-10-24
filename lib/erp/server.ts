import "server-only";

import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { getErpAccess } from "@/lib/erp/access";
import type { ErpModuleKey } from "@/types/erp";

// Gate for every ERP page and action: the BUMEX One route check, then the person's ERP access. With modules, one of
// them is enough (the ledger and the trial balance open with "accounting" or "reports").
export async function requireErpAccess(modules?: ErpModuleKey | ErpModuleKey[]) {
  const auth = await requireRouteAccess("erp");
  const access = await getErpAccess(auth.profile.id);
  const needed = modules === undefined ? [] : Array.isArray(modules) ? modules : [modules];

  if (!access || (needed.length > 0 && !needed.some((module) => access.modules.includes(module)))) {
    redirect("/overview");
  }

  return { auth, access };
}
