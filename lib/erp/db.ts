import "server-only";

import { Connector } from "@google-cloud/cloud-sql-connector";
import { Pool, type PoolClient } from "pg";

// The app's PostgreSQL: the books (schema `erp`) and the work (schema `work`, migration 0008), migrations in db/erp.
// Every unit of work is one transaction that switches to role erp_app (which never bypasses row-level security)
// and opens the session context the schema's triggers and policies read (erp.actor_id / actor_role / entity_ids).
// Nothing else in the app talks to this pool, so no query can run without that context.
//
// Two ways in:
// - ERP_DATABASE_URL: a plain connection string (local PostgreSQL, or Cloud SQL through cloud-sql-proxy).
// - ERP_CLOUDSQL_INSTANCE (project:region:instance) + ERP_DATABASE_USER / _PASSWORD / _NAME: production. Google's
//   connector authorises with the server's service account (Cloud SQL Client) and brings the client certificate the
//   instance requires; no IP has to be allowed.

function cloudSqlInstance() {
  return process.env.ERP_CLOUDSQL_INSTANCE?.trim() || "";
}

export function isErpDatabaseConfigured() {
  return Boolean(process.env.ERP_DATABASE_URL?.trim() || cloudSqlInstance());
}

const poolKey = Symbol.for("bumex.erp.pool");
type PoolHolder = { [poolKey]?: Promise<Pool> };

async function createPool(): Promise<Pool> {
  const url = process.env.ERP_DATABASE_URL?.trim();
  const instanceConnectionName = cloudSqlInstance();
  // The (app) layout asks for ERP access on every page: if the database cannot be reached, give up quickly and let
  // BUMEX One render without the ERP rather than hold every page (pg waits forever by default).
  // Every timestamp the app reads is in UTC (the work's dates are compared as YYYY-MM-DD strings).
  const sizing = { max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, statement_timeout: 15_000, options: "-c TimeZone=UTC" };

  if (url) {
    return new Pool({ connectionString: url, ...sizing });
  }
  if (!instanceConnectionName) {
    throw new Error("The ERP database is not configured.");
  }

  const connector = new Connector();
  const clientOptions = await connector.getOptions({ instanceConnectionName });
  return new Pool({
    ...clientOptions,
    user: process.env.ERP_DATABASE_USER?.trim() || "bumex_app",
    password: process.env.ERP_DATABASE_PASSWORD,
    database: process.env.ERP_DATABASE_NAME?.trim() || "bumex_erp",
    ...sizing,
  });
}

function getPool(): Promise<Pool> {
  // Kept on globalThis so dev hot reloads reuse the connections instead of opening new ones.
  const holder = globalThis as PoolHolder;
  if (!holder[poolKey]) {
    holder[poolKey] = createPool().then(
      (pool) => {
        pool.on("error", (error) => console.error("[erp:pool]", error.message));
        return pool;
      },
      (error: unknown) => {
        // Not cached: the next request tries again (an instance restarting, a credential not yet propagated).
        holder[poolKey] = undefined;
        throw error;
      },
    );
  }

  return holder[poolKey];
}

export type ErpTransaction = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  // how many rows a write touched (without RETURNING: a row the write leaves out of the person's sight cannot be returned)
  run: (sql: string, params?: unknown[]) => Promise<number>;
};

async function inTransaction<T>(
  openContext: (client: PoolClient) => Promise<unknown>,
  work: (tx: ErpTransaction) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();

  try {
    await client.query("begin");
    await client.query("set local role erp_app");
    await openContext(client);
    const result = await work({
      query: async <R,>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as R[],
      run: async (sql: string, params?: unknown[]) => (await client.query(sql, params)).rowCount ?? 0,
    });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Work done for a signed-in person: their ERP role, entities and row-level security apply.
export function withErpSession<T>(userId: string, work: (tx: ErpTransaction) => Promise<T>) {
  return inTransaction((client) => client.query("select erp.open_session($1)", [userId]), work);
}

// Work the server does for everyone (access management by the BUMEX One super admin): every entity is visible,
// and the audit log still records who acted.
export function withErpSystemSession<T>(actorId: string, work: (tx: ErpTransaction) => Promise<T>) {
  return inTransaction((client) => client.query("select erp.open_system_session($1)", [actorId]), work);
}

// Postgres errors raised by the schema's guards carry a SQLSTATE; turn the common ones into a sentence for the page.
export function erpErrorMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";

  if (code === "42501") {
    return message.startsWith("only an ERP administrator") ? "Only an ERP administrator can change ERP access." : "This action is not allowed for your ERP access.";
  }
  if (code === "23503" && message.startsWith("unknown entity")) {
    return "One of the chosen entities does not exist in the ERP.";
  }
  if (code === "P0001" && message) {
    return message.charAt(0).toUpperCase() + message.slice(1) + ".";
  }
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || message.includes("not configured")) {
    return "The ERP database is not reachable.";
  }

  return fallback;
}
