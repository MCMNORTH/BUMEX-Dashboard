"use server";

import { requireErpAccess } from "@/lib/erp/server";
import type { VanguardChange } from "@/lib/erp/vanguard/record";
import { getVanguardVersion, loadVanguard, runVanguardChange, type VanguardResult } from "@/lib/erp/vanguard/run";
import { getCurrentLocale } from "@/lib/i18n/server";

// A change made in BUMEX Vanguard (the store's apply()), replayed and saved for the signed-in person.
export async function runVanguardChangeAction(change: VanguardChange): Promise<VanguardResult> {
  const { auth, access } = await requireErpAccess();
  return runVanguardChange(auth.profile, access, change, await getCurrentLocale());
}

// The database's state again (a change that could not reach the server, the "reload" button).
export async function reloadVanguardAction(): Promise<VanguardResult> {
  const { auth, access } = await requireErpAccess();
  return { ok: true, ...(await loadVanguard(auth.profile, access)) };
}

// Whether someone else changed the ERP since the screen's state was read.
export async function vanguardVersionAction(): Promise<number> {
  const { auth } = await requireErpAccess();
  return getVanguardVersion(auth.profile);
}
