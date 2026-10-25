import "server-only";

import { withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import { createAdminClient } from "@/lib/firebase/server";

// One client, two sides. The relationship side is BUMEX One's client, one for the group (status, contacts, account
// manager, contracts); the accounting side is the ERP customer of each entity that bills it (code, tax regime,
// currency, terms, auxiliary account), linked by erp.customer.bumex_client_id. The identity fields both keep
// (name, e-mail, tax id) follow whichever side was edited: a customer saved in Vanguard updates its client
// (linkCustomersToClients, after the change), a client edited in BUMEX One updates its customers (mirrorClients).

export type ClientIdentity = { id: string; name: string; email: string | null; country: string | null; taxId: string | null };

// BUMEX One's client → its customers' copies, on the missions' mirror (missions.ts). Written only when different.
export async function mirrorClients(tx: ErpTransaction, clients: ClientIdentity[]) {
  if (!clients.length) return;
  await tx.query(
    `update erp.customer c set name = s.name, email = s.email, nif = s.tax_id
       from jsonb_to_recordset($1::jsonb) as s(id text, name text, email text, tax_id text)
      where c.bumex_client_id = s.id
        and (c.name, c.email, c.nif) is distinct from (s.name, s.email, s.tax_id)`,
    [JSON.stringify(clients.map((c) => ({ id: c.id, name: c.name, email: c.email, tax_id: c.taxId })))],
  );
}

// After a change made in Vanguard: every customer gets its client (the one of the same name, or a new one), and the
// customers just edited pass their name, e-mail and tax id on to their client.
export async function linkCustomersToClients(actorId: string, editedCustomerIds: string[] = []) {
  const db = createAdminClient();
  if (!db) return;
  await withErpSystemSession(actorId, async (tx) => {
    const customers = await tx.query<{ id: string; name: string; email: string | null; nif: string | null; country: string | null; client: string | null }>(
      "select id, name, email, nif, country::text as country, bumex_client_id as client from erp.customer where bumex_client_id is null or id = any($1::uuid[])",
      [editedCustomerIds],
    );
    if (!customers.length) return;
    const { data: clients } = await db.from("clients").select("id, name").returns<{ id: string; name: string }[]>();
    const byName = new Map((clients ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));

    for (const c of customers) {
      if (c.client) {
        await db.from("clients").update({ name: c.name, contact_email: c.email, tax_id: c.nif, updated_at: new Date().toISOString() }).eq("id", c.client);
        continue;
      }
      let clientId = byName.get(c.name.trim().toLowerCase());
      if (!clientId) {
        const { data, error } = await db
          .from("clients")
          .insert({ name: c.name, contact_email: c.email, tax_id: c.nif, country: c.country, type: "company", status: "active" })
          .select("id")
          .single<{ id: string }>();
        if (error || !data) {
          console.error("[erp:clients] client not created", c.name, error?.message);
          continue;
        }
        clientId = data.id;
        byName.set(c.name.trim().toLowerCase(), clientId);
      }
      await tx.query("update erp.customer set bumex_client_id = $2 where id = $1", [c.id, clientId]);
    }
  });
}
