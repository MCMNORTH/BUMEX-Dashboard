"use server";

import { withErpSession } from "@/lib/erp/db";
import { requireErpAccess } from "@/lib/erp/server";
import { createClient } from "@/lib/firebase/server";
import type { ClientRecord } from "@/types/client";

// The relationship side of the clients for Vanguard's Clients room (vanguard/one/Clients.tsx): BUMEX One's clients
// the person sees, each with its customer accounts in the entities (clients.ts).

export type ClientRelation = Pick<ClientRecord, "id" | "name" | "status" | "prospect_stage" | "contact_email" | "contact_phone" | "city" | "country" | "tax_id"> & {
  manager: string | null;
  accounts: { entityId: string; customerId: string; code: string }[];
};

export async function clientRelationsAction(): Promise<ClientRelation[]> {
  const { auth } = await requireErpAccess();
  const db = await createClient();
  if (!db) return [];
  const [{ data: clients }, { data: people }] = await Promise.all([
    db
      .from("clients")
      .select("id, name, status, prospect_stage, contact_email, contact_phone, city, country, tax_id, account_manager_id")
      .order("name")
      .returns<(Omit<ClientRelation, "manager" | "accounts"> & { account_manager_id: string | null })[]>(),
    db.from("profiles").select("id, full_name").returns<{ id: string; full_name: string }[]>(),
  ]);
  const accounts = await withErpSession(auth.profile.id, (tx) =>
    tx.query<{ client: string; entityId: string; customerId: string; code: string }>(
      `select bumex_client_id as client, entity_id as "entityId", id as "customerId", code from erp.customer where bumex_client_id is not null`,
    ),
  );
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return (clients ?? []).map(({ account_manager_id, ...c }) => ({
    ...c,
    manager: account_manager_id ? (names.get(account_manager_id) ?? null) : null,
    accounts: accounts.filter((a) => a.client === c.id).map((a) => ({ entityId: a.entityId, customerId: a.customerId, code: a.code })),
  }));
}
