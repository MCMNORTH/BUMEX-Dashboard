import "server-only";

import { withErpSession, withErpSystemSession, type ErpTransaction } from "@/lib/erp/db";
import { getCurrentSessionUser } from "@/lib/auth/session-user";

// The work's data (missions, tickets, time, clients, conversation: db/erp/migrations/0008_work.sql) is read and
// written in the signed-in person's ERP session, where BUMEX One's rules are row-level security: a query simply sees
// the rows the person may see, and a write they may not make fails ("row-level security"). The server's own work
// (e-mails, reminders, sign-in) runs in the system session.

export type Tx = ErpTransaction;

export class SignedOutError extends Error {
  constructor() {
    super("signed-out");
  }
}

// The signed-in person's unit of work: one transaction.
export async function asPerson<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await getCurrentSessionUser();
  if (!user) throw new SignedOutError();
  return withErpSession(user.id, work);
}

// The person's id without a database round trip (who is acting).
export async function personId(): Promise<string> {
  const user = await getCurrentSessionUser();
  if (!user) throw new SignedOutError();
  return user.id;
}

// The server's unit of work, for everyone; the audit log keeps who it acted for.
export function asSystem<T>(actorId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return withErpSystemSession(actorId, work);
}

// Rows as JSON, the way the app's types have them: timestamps as ISO strings, dates as YYYY-MM-DD, numbers as numbers,
// arrays and json as they are (node-pg would give Dates and numeric strings).
// (a write's RETURNING rows are read through a WITH: a subquery cannot hold an insert, an update or a delete)
export async function select<T>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> {
  const wrapped = /^\s*(insert|update|delete)\b/i.test(sql)
    ? `with r as (${sql}) select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as rows from r`
    : `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as rows from (${sql}) r`;
  const [{ rows }] = await tx.query<{ rows: T[] }>(wrapped, params);
  return rows;
}

export async function selectOne<T>(tx: Tx, sql: string, params: unknown[] = []): Promise<T | null> {
  const [row] = await select<T>(tx, sql, params);
  return row ?? null;
}

// A row-level security refusal (a write the rules do not allow), as opposed to a database failure.
export function isRefused(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "42501";
}

// The error code a guard raised (raise exception 'time_entry_daily_limit' …), or the SQLSTATE.
export function dbErrorKey(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z_]+$/.test(message) ? message : typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}
