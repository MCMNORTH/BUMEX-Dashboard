"use server";

import { requireErpAccess } from "@/lib/erp/server";
import type { VanguardChange } from "@/lib/erp/vanguard/record";
import type { VanguardMarks } from "@/lib/erp/vanguard/load";
import { loadVanguard, runVanguardChange, syncVanguard, type VanguardResult, type VanguardSync } from "@/lib/erp/vanguard/run";
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


// What changed since the screen's marks, and what it needs of it (run.ts syncVanguard): after the person's own change
// and every 30 seconds (components/vanguard/vanguard-app.tsx).
export async function syncVanguardAction(since: VanguardMarks): Promise<VanguardSync> {
  const { auth, access } = await requireErpAccess();
  const marks = { audit: Number(since?.audit) || 0, seq: Number(since?.seq) || 0 };
  return syncVanguard(auth.profile, access, marks);
}
