import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb } from "@/lib/firebase/admin";
import { raiseException } from "@/lib/firebase/errors";
import { applyDefaults, documentIdFor } from "@/lib/firebase/schema";
import type { AppRole } from "@/types/auth";

// Ports of the database triggers that were live on Supabase. Like the
// originals (all `security definer`), they read and write with full access.

type Row = Record<string, any>;

export type WriteContext = {
  // `auth.uid()` of the caller; null for the trusted admin client.
  uid: string | null;
  role: AppRole | null;
};

type Operation = "insert" | "update";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// date_trunc('week', d) — ISO weeks start on Monday.
function weekStartOf(isoDate: string) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

// ---- before triggers ---------------------------------------------------------

// trg_enforce_invoice_admin_approval
function enforceInvoiceAdminApproval(op: Operation, rows: Row[], previous: Array<Row | null>, ctx: WriteContext) {
  rows.forEach((row, index) => {
    const old = previous[index];
    const approvalChanged = op === "insert"
      || old?.approval_status !== row.approval_status
      || old?.approved_by !== row.approved_by
      || old?.approved_at !== row.approved_at;

    if (row.approval_status === "approved" && approvalChanged && ctx.role !== "admin") {
      throw raiseException("Only an administrator can approve an invoice.");
    }
  });
}

// ensure_timesheet_week_editable + validate_time_entry
async function validateTimeEntries(op: Operation, rows: Row[], previous: Array<Row | null>) {
  const today = todayUtc();
  const pendingByDay = new Map<string, number>();

  for (const [index, row] of rows.entries()) {
    const old = previous[index];
    const weekStart = weekStartOf(String(row.work_date));
    const status = await adminDb()
      .collection("timesheet_week_status")
      .doc(documentIdFor("timesheet_week_status", { user_id: row.user_id, week_start: weekStart }))
      .get();

    if (status.exists && ["submitted", "approved"].includes(status.get("status"))) {
      throw raiseException("timesheet_week_locked");
    }

    if (op === "update" && old && (old.user_id !== row.user_id || old.entity_code !== row.entity_code || old.id !== row.id)) {
      throw raiseException("time_entry_identity_immutable");
    }

    if (String(row.work_date).slice(0, 10) > today) {
      throw raiseException("time_entry_future_date");
    }

    const dayKey = `${row.user_id}|${row.work_date}`;
    const userEntries = await adminDb()
      .collection("time_entries")
      .where("user_id", "==", row.user_id)
      .get();
    const batchIds = new Set(rows.slice(0, index).map((earlier) => String(earlier.id)));
    const stored = userEntries.docs
      .filter((doc) => doc.get("work_date") === row.work_date)
      .filter((doc) => doc.id !== String(row.id) && !batchIds.has(doc.id))
      .reduce((total, doc) => total + Number(doc.get("duration_minutes") ?? 0), 0);
    // Rows earlier in the same statement are visible to later row triggers.
    const earlierInBatch = pendingByDay.get(dayKey) ?? 0;

    if (Number(row.duration_minutes ?? 0) + stored + earlierInBatch > 1440) {
      throw raiseException("time_entry_daily_limit");
    }

    pendingByDay.set(dayKey, earlierInBatch + Number(row.duration_minutes ?? 0));
    row.updated_at = new Date().toISOString();
  }
}

export async function beforeWrite(
  table: string,
  op: Operation,
  rows: Row[],
  previous: Array<Row | null>,
  ctx: WriteContext,
) {
  if (table === "invoices") {
    enforceInvoiceAdminApproval(op, rows, previous, ctx);
  }

  if (table === "time_entries") {
    await validateTimeEntries(op, rows, previous);
  }
}

// ---- after triggers ----------------------------------------------------------

// notifications_enqueue_email (on conflict (notification_id) do nothing)
async function enqueueNotificationEmails(rows: Row[]) {
  const db = adminDb();
  const userIds = [...new Set(rows.map((row) => String(row.user_id)))];
  const profiles = await db.getAll(...userIds.map((id) => db.collection("profiles").doc(id)));
  const emails = new Map(profiles.filter((doc) => doc.exists).map((doc) => [doc.id, doc.get("email") as string | null]));
  const batch = db.batch();
  let queued = 0;

  for (const row of rows) {
    const email = emails.get(String(row.user_id))?.trim();

    if (!email) continue;

    const existing = await db
      .collection("notification_email_outbox")
      .where("notification_id", "==", row.id)
      .limit(1)
      .get();

    if (!existing.empty) continue;

    const outbox = applyDefaults("notification_email_outbox", {
      notification_id: row.id,
      user_id: row.user_id,
      recipient_email: email,
      subject: row.title,
      body: row.body,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
    });
    const { id, ...data } = outbox;
    batch.set(db.collection("notification_email_outbox").doc(String(id)), data);
    queued += 1;
  }

  if (queued) {
    await batch.commit();
  }
}

// record_timesheet_week_event
async function recordTimesheetWeekEvents(op: Operation, rows: Row[], previous: Array<Row | null>, ctx: WriteContext) {
  const db = adminDb();
  const batch = db.batch();
  let recorded = 0;

  rows.forEach((row, index) => {
    if (op === "update" && previous[index]?.status === row.status) return;

    const event = applyDefaults("timesheet_week_events", {
      user_id: row.user_id,
      week_start: row.week_start,
      entity_code: row.entity_code,
      status: row.status,
      actor_id: ctx.uid,
      note: row.review_note ?? null,
      created_at: new Date().toISOString(),
    });
    const { id, ...data } = event;
    batch.set(db.collection("timesheet_week_events").doc(String(id)), data);
    recorded += 1;
  });

  if (recorded) {
    await batch.commit();
  }
}

export async function afterWrite(
  table: string,
  op: Operation,
  rows: Row[],
  previous: Array<Row | null>,
  ctx: WriteContext,
) {
  if (!rows.length) return;

  if (table === "notifications" && op === "insert") {
    await enqueueNotificationEmails(rows);
  }

  if (table === "timesheet_week_status") {
    await recordTimesheetWeekEvents(op, rows, previous, ctx);
  }
}
