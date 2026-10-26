import "server-only";

import type { State } from "@/lib/erp/engine";
import { withErpSession } from "@/lib/erp/db";
import { vanguardErrorMessage } from "@/lib/erp/vanguard/errors";
import { listPeople, loadVanguardState, vanguardVersion } from "@/lib/erp/vanguard/load";
import type { VanguardChange } from "@/lib/erp/vanguard/record";
import { applyVanguardChange } from "@/lib/erp/vanguard/save";
import type { Locale } from "@/lib/i18n/config";
import type { Profile } from "@/types/auth";
import type { ErpAccess } from "@/types/erp";

// What the page and every change send to the browser: the state, the entries whose hash check failed, when it was
// read (the browser keeps a newer state than a page it gets from the router's cache) and the database's version.
export type VanguardData = { state: State; chainBreaks: string[]; loadedAt: number; version: number };
export type VanguardResult = ({ ok: true } | { ok: false; error: string }) & Partial<VanguardData>;

type Person = Pick<Profile, "id" | "full_name">;

const stamped = (data: { state: State; chainBreaks: string[]; version: number }): VanguardData => ({ ...data, loadedAt: Date.now() });

export async function loadVanguard(person: Person, access: ErpAccess): Promise<VanguardData> {
  const who = { id: person.id, name: person.full_name };
  return stamped(await withErpSession(person.id, async (tx) => loadVanguardState(tx, who, access, await listPeople(tx))));
}

// One apply() of the browser: replayed on the database's state, written, and the new state sent back. On a refusal
// the browser gets the reason and the database's state, so its screens drop what was not saved. (A customer's client
// and a client's customers follow each other in the database: 0008.)
export async function runVanguardChange(person: Person, access: ErpAccess, change: VanguardChange, locale: Locale): Promise<VanguardResult> {
  const who = { id: person.id, name: person.full_name };
  try {
    const data = await withErpSession(person.id, async (tx) => applyVanguardChange(tx, who, access, await listPeople(tx), change));
    return { ok: true, ...stamped(data) };
  } catch (error) {
    const message = vanguardErrorMessage(error, locale);
    const data = await withErpSession(person.id, async (tx) => loadVanguardState(tx, who, access, await listPeople(tx))).catch(() => undefined);
    return { ok: false, error: message, ...(data ? stamped(data) : {}) };
  }
}

// The database's version for the person's screen (a cheap read: the screen reads the state again when it moved).
export async function getVanguardVersion(person: Person): Promise<number> {
  return withErpSession(person.id, vanguardVersion);
}
