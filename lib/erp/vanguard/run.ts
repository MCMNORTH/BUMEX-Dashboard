import "server-only";

import type { State } from "@/lib/erp/engine";
import { withErpSession } from "@/lib/erp/db";
import { vanguardErrorMessage } from "@/lib/erp/vanguard/errors";
import { loadVanguardState, vanguardVersion, type VanguardPerson } from "@/lib/erp/vanguard/load";
import type { VanguardChange } from "@/lib/erp/vanguard/record";
import { bumexOneVersion, syncMissions } from "@/lib/erp/vanguard/missions";
import { listTickets } from "@/lib/erp/vanguard/tickets";
import { syncBumexOneRoles } from "@/lib/erp/roles";
import { linkCustomersToClients } from "@/lib/erp/vanguard/clients";
import { applyVanguardChange } from "@/lib/erp/vanguard/save";
import { createClient } from "@/lib/firebase/server";
import type { Locale } from "@/lib/i18n/config";
import type { Profile } from "@/types/auth";
import type { ErpAccess } from "@/types/erp";

// What the page and every change send to the browser: the state, the entries whose hash check failed, when it was
// read (the browser keeps a newer state than a page it gets from the router's cache) and the database's version.
export type VanguardData = { state: State; chainBreaks: string[]; loadedAt: number; version: number };
export type VanguardResult = ({ ok: true } | { ok: false; error: string }) & Partial<VanguardData>;

type Person = Pick<Profile, "id" | "full_name">;

// BUMEX One's people: names for the ERP's user ids, and who works on each floor.
async function listPeople(): Promise<VanguardPerson[]> {
  const db = await createClient();
  if (!db) return [];
  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, entity_code, availability_status")
    .returns<Pick<Profile, "id" | "full_name" | "email" | "entity_code" | "availability_status">[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    email: p.email,
    entityCode: p.entity_code,
    active: p.availability_status !== "inactive",
    present: ["available", "busy", "overloaded"].includes(p.availability_status),
  }));
}

// The screen's version: the ERP's (its last audit row) and BUMEX One's (its tables' counters) together.
async function stamped(data: { state: State; chainBreaks: string[]; version: number }): Promise<VanguardData> {
  return { ...data, version: data.version + (await bumexOneVersion().catch(() => 0)), loadedAt: Date.now() };
}

export async function loadVanguard(person: Person, access: ErpAccess): Promise<VanguardData> {
  const [people, tickets] = await Promise.all([listPeople(), listTickets(), syncMissions(person.id)]);
  const data = await withErpSession(person.id, (tx) => loadVanguardState(tx, { id: person.id, name: person.full_name }, access, people, { tickets }));
  return stamped(data);
}

// One apply() of the browser: replayed on the database's state, written, and the new state sent back. On a refusal
// the browser gets the reason and the database's state, so its screens drop what was not saved.
export async function runVanguardChange(person: Person, access: ErpAccess, change: VanguardChange, locale: Locale): Promise<VanguardResult> {
  const [people, tickets] = await Promise.all([listPeople(), listTickets()]);
  const who = { id: person.id, name: person.full_name };
  try {
    const data = await withErpSession(person.id, (tx) => applyVanguardChange(tx, who, access, people, change, tickets));
    // a customer created or edited: its BUMEX One client follows (clients.ts)
    const edited = change.calls.filter((c) => c.name === "updateCustomer").map((c) => String(c.args[0]));
    if (edited.length || change.calls.some((c) => c.name === "addCustomer")) {
      await linkCustomersToClients(person.id, edited).catch((error) => console.error("[erp:clients]", error instanceof Error ? error.message : error));
    }
    // the accounts panel changed someone's Vanguard role: their BUMEX One role follows (lib/erp/roles.ts)
    if (change.calls.some((c) => ["createUser", "updateUserAccess", "setUserStatus", "requestDeletion", "decideDeletion"].includes(c.name))) {
      await syncBumexOneRoles().catch((error) => console.error("[erp:roles]", error instanceof Error ? error.message : error));
    }
    return { ok: true, ...(await stamped(data)) };
  } catch (error) {
    const message = vanguardErrorMessage(error, locale);
    const data = await withErpSession(person.id, (tx) => loadVanguardState(tx, who, access, people, { tickets })).catch(() => undefined);
    return { ok: false, error: message, ...(data ? await stamped(data) : {}) };
  }
}

// The database's version for the person's screen (a cheap read: the screen reads the state again when it moved).
// BUMEX One's projects are mirrored first: a project changed there moves the version too.
export async function getVanguardVersion(person: Person): Promise<number> {
  await syncMissions(person.id);
  const [erp, one] = await Promise.all([withErpSession(person.id, vanguardVersion), bumexOneVersion().catch(() => 0)]);
  return erp + one;
}
