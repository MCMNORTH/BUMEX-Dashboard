import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb } from "@/lib/firebase/admin";
import { DbQueryError } from "@/lib/firebase/errors";
import type { AccessPolicy } from "@/lib/firebase/policies";
import { QueryBuilder, type DbError } from "@/lib/firebase/query";

// Ports of the `security definer` SQL functions that were live on Supabase.
// Like the originals they run with full access; the ones that act for the
// caller (`auth.uid()`) take the caller from the request's access policy.

type Row = Record<string, unknown>;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function readAll(table: string): Promise<Row[]> {
  const snapshot = await adminDb().collection(table).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(date: unknown) {
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : null;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtc(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getShareholderMonthlyFinance() {
  const [payments, transfers] = await Promise.all([readAll("payments"), readAll("transfers")]);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    return { key: date.toISOString().slice(0, 7), label: MONTH_LABELS[date.getUTCMonth()] };
  });

  return months.map(({ key, label }) => {
    let inflow = 0;
    let expected = 0;
    let outflow = 0;

    for (const payment of payments) {
      if (monthKey(payment.payment_date ?? payment.due_date) !== key) continue;

      if (payment.payment_date && ["received", "reconciled"].includes(String(payment.status))) {
        inflow += amount(payment.amount);
      }

      if (payment.due_date && ["expected", "late"].includes(String(payment.status))) {
        expected += amount(payment.amount);
      }
    }

    for (const transfer of transfers) {
      if (monthKey(transfer.transfer_date) === key && ["sent", "confirmed"].includes(String(transfer.status))) {
        outflow += amount(transfer.amount);
      }
    }

    return { month: label, inflow, outflow, expected, received: inflow };
  });
}

async function getShareholderInvoiceStatusSummary() {
  const invoices = await readAll("invoices");
  const counts = new Map<string, number>();

  for (const invoice of invoices) {
    const status = String(invoice.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count);
}

async function getShareholderOverdueClients() {
  const [clients, invoices, payments] = await Promise.all([
    readAll("clients"),
    readAll("invoices"),
    readAll("payments"),
  ]);

  return clients
    .map((client) => {
      const overdue = invoices.filter(
        (invoice) => invoice.client_id === client.id && invoice.status === "overdue",
      );

      return {
        client_id: client.id,
        client_name: client.name,
        overdue_amount: overdue.reduce((sum, invoice) => sum + amount(invoice.amount_ttc), 0),
        overdue_count: overdue.length,
        late_payment_count: payments.filter(
          (payment) => payment.client_id === client.id && payment.status === "late",
        ).length,
      };
    })
    .filter((row) => row.overdue_count > 0)
    .sort((left, right) => right.overdue_amount - left.overdue_amount || right.overdue_count - left.overdue_count);
}

async function getShareholderFinanceDeadlines() {
  const [clients, invoices, payments] = await Promise.all([
    readAll("clients"),
    readAll("invoices"),
    readAll("payments"),
  ]);
  const clientNames = new Map(clients.map((client) => [client.id, client.name as string | null]));
  const today = todayUtc();
  const horizon = addDaysUtc(today, 14);
  const inWindow = (date: unknown) => typeof date === "string" && date >= today && date.slice(0, 10) <= horizon;

  const invoiceDeadlines = invoices
    .filter(
      (invoice) =>
        !["paid", "cancelled", "archived"].includes(String(invoice.status)) && inWindow(invoice.due_date),
    )
    .map((invoice) => ({
      kind: "invoice_due",
      label: invoice.invoice_number,
      due_date: invoice.due_date,
      amount: amount(invoice.amount_ttc),
      currency: invoice.currency,
      status: invoice.status,
      client_name: clientNames.get(invoice.client_id) ?? null,
    }));

  const paymentDeadlines = payments
    .filter((payment) => ["expected", "late"].includes(String(payment.status)) && inWindow(payment.due_date))
    .map((payment) => ({
      kind: "payment_due",
      label: payment.reference ?? clientNames.get(payment.client_id) ?? "Payment due",
      due_date: payment.due_date,
      amount: amount(payment.amount),
      currency: payment.currency,
      status: payment.status,
      client_name: clientNames.get(payment.client_id) ?? null,
    }));

  return [...invoiceDeadlines, ...paymentDeadlines]
    .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)))
    .slice(0, 12);
}

// ---- caller-scoped functions ---------------------------------------------------

const BUMEX_ENTITY_CODES = [
  "bumex_sa",
  "bumex_audit",
  "bumex_mauritanie",
  "bumex_maroc",
  "bumex_advisory",
  "bumex_avocat",
  "bumex_it",
];

function requireCaller(policy: AccessPolicy | null) {
  if (!policy?.uid) {
    throw new DbQueryError("Authentication required.", "42501");
  }

  return policy.uid;
}

async function getOwnProfile(_args: Row, policy: AccessPolicy | null) {
  if (!policy?.uid) {
    return null;
  }

  const doc = await adminDb().collection("profiles").doc(policy.uid).get();
  return doc.exists ? { ...doc.data(), id: doc.id } : null;
}

async function assignOwnEntity(args: Row, policy: AccessPolicy | null) {
  const uid = requireCaller(policy);
  const requested = String(args.requested_entity_code ?? "");

  if (!BUMEX_ENTITY_CODES.includes(requested)) {
    throw new DbQueryError("Invalid entity selection.", "22023");
  }

  const ref = adminDb().collection("profiles").doc(uid);

  return adminDb().runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);

    if (!doc.exists) {
      throw new DbQueryError("Profile not found.", "P0002");
    }

    const current = doc.get("entity_code");

    if (current == null) {
      const updatedAt = new Date().toISOString();
      transaction.update(ref, { entity_code: requested, updated_at: updatedAt });
      return { ...doc.data(), id: doc.id, entity_code: requested, updated_at: updatedAt };
    }

    if (current !== requested) {
      throw new DbQueryError("An entity is already assigned to this account.", "23514");
    }

    return { ...doc.data(), id: doc.id };
  });
}

// ---- trusted server functions ---------------------------------------------------

async function claimNotificationEmailOutbox(args: Row) {
  const batchSize = Math.min(Math.max(Number(args.p_batch_size ?? 50) || 50, 1), 100);
  const notificationIds = Array.isArray(args.p_notification_ids)
    ? new Set(args.p_notification_ids.map(String))
    : null;
  const collection = adminDb().collection("notification_email_outbox");

  // A transaction stands in for `for update skip locked`: concurrent claims
  // of the same rows are retried, so each email is claimed once.
  return adminDb().runTransaction(async (transaction) => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 20 * 60_000).toISOString();
    const snapshot = await transaction.get(collection.where("status", "in", ["pending", "processing"]));
    const candidates = snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Row)
      .filter((row) =>
        Number(row.attempts ?? 0) < 5
        && (
          (row.status === "pending" && String(row.next_attempt_at) <= now.toISOString())
          || (row.status === "processing" && row.locked_at != null && String(row.locked_at) < staleBefore)
        )
        && (!notificationIds || notificationIds.has(String(row.notification_id))))
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
      .slice(0, batchSize);

    return candidates.map((row) => {
      const claimed = {
        ...row,
        status: "processing",
        attempts: Number(row.attempts ?? 0) + 1,
        locked_at: now.toISOString(),
        last_error: null,
      };
      transaction.update(collection.doc(String(row.id)), {
        status: claimed.status,
        attempts: claimed.attempts,
        locked_at: claimed.locked_at,
        last_error: null,
      });
      return claimed;
    });
  });
}

async function queueWeeklyTimesheetReminders(args: Row) {
  const weekStart = String(args.p_week_start ?? "");
  const date = new Date(`${weekStart}T00:00:00Z`);

  if (!weekStart || Number.isNaN(date.getTime()) || date.getUTCDay() !== 1) {
    throw new DbQueryError("The timesheet reminder week must start on a Monday.", "P0001");
  }

  const [profiles, statuses, reminders] = await Promise.all([
    readAll("profiles"),
    adminDb().collection("timesheet_week_status").where("week_start", "==", weekStart).get(),
    adminDb().collection("timesheet_weekly_reminders").where("week_start", "==", weekStart).get(),
  ]);
  const closedWeeks = new Set(
    statuses.docs.filter((doc) => ["submitted", "approved"].includes(doc.get("status"))).map((doc) => doc.get("user_id")),
  );
  const alreadyReminded = new Set(reminders.docs.map((doc) => doc.get("user_id")));
  const eligible = profiles.filter((profile) =>
    profile.role !== "shareholder"
    && profile.availability_status !== "inactive"
    && String(profile.email ?? "").trim() !== ""
    && !closedWeeks.has(profile.id)
    && !alreadyReminded.has(profile.id));

  if (!eligible.length) {
    return 0;
  }

  const [year, month, day] = weekStart.split("-");
  const reminderInsert = await new QueryBuilder("timesheet_weekly_reminders", null).insert(
    eligible.map((profile) => ({ user_id: profile.id, week_start: weekStart, entity_code: profile.entity_code ?? null })),
  );

  if (reminderInsert.error) {
    throw new DbQueryError(reminderInsert.error.message, reminderInsert.error.code);
  }

  // Inserted through the query builder so the email outbox trigger fires.
  const notificationInsert = await new QueryBuilder("notifications", null).insert(
    eligible.map((profile) => ({
      user_id: profile.id,
      type: "deadline",
      title: "Rappel : timesheet à envoyer",
      body: `Votre timesheet de la semaine du ${day}/${month}/${year} n’est pas soumise. Merci de la compléter et de l’envoyer dans BUMEX One.`,
      entity_type: "system",
      entity_id: profile.id,
      is_read: false,
    })),
  );

  if (notificationInsert.error) {
    throw new DbQueryError(notificationInsert.error.message, notificationInsert.error.code);
  }

  return eligible.length;
}

// ---- dispatch ---------------------------------------------------------------------

type RpcFunction = (args: Row, policy: AccessPolicy | null) => Promise<unknown>;

const FUNCTIONS: Record<string, RpcFunction> = {
  get_shareholder_monthly_finance: getShareholderMonthlyFinance,
  get_shareholder_invoice_status_summary: getShareholderInvoiceStatusSummary,
  get_shareholder_overdue_clients: getShareholderOverdueClients,
  get_shareholder_finance_deadlines: getShareholderFinanceDeadlines,
  get_own_profile: getOwnProfile,
  assign_own_entity: assignOwnEntity,
  claim_notification_email_outbox: claimNotificationEmailOutbox,
  queue_weekly_timesheet_reminders: queueWeeklyTimesheetReminders,
};

type RpcResult<T> = { data: T; error: DbError | null };

function toError(error: unknown): DbError {
  if (error instanceof DbQueryError) {
    return { message: error.message, code: error.code, details: null, hint: null };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    code: "FIRESTORE",
    details: null,
    hint: null,
  };
}

/** Chainable like supabase-js `rpc()`: supports returns/single/maybeSingle. */
export class RpcCall<T = any> implements PromiseLike<RpcResult<T>> {
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(
    private readonly name: string,
    private readonly args: Row,
    private readonly policy: AccessPolicy | null,
  ) {}

  returns<R>() {
    return this as unknown as RpcCall<R>;
  }

  single<R = any>() {
    this.singleMode = "single";
    return this as unknown as RpcCall<R>;
  }

  maybeSingle<R = any>() {
    this.singleMode = "maybeSingle";
    return this as unknown as RpcCall<R | null>;
  }

  then<TResult1 = RpcResult<T>, TResult2 = never>(
    onfulfilled?: ((value: RpcResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<RpcResult<T>> {
    const fn = FUNCTIONS[this.name];

    if (!fn) {
      return {
        data: null as T,
        error: { message: `Unknown function "${this.name}".`, code: "PGRST202", details: null, hint: null },
      };
    }

    try {
      let data = await fn(this.args, this.policy);

      if (this.singleMode) {
        const rows = Array.isArray(data) ? data : data == null ? [] : [data];

        if (rows.length > 1 || (this.singleMode === "single" && rows.length === 0)) {
          return {
            data: null as T,
            error: {
              message: "JSON object requested, multiple (or no) rows returned",
              code: "PGRST116",
              details: null,
              hint: null,
            },
          };
        }

        data = rows[0] ?? null;
      }

      return { data: data as T, error: null };
    } catch (error) {
      return { data: null as T, error: toError(error) };
    }
  }
}
