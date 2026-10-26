import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { dispatchNotificationEmails } from "@/lib/notifications/email-delivery";
import { isErpDatabaseConfigured } from "@/lib/erp/db";
import { asSystem, selectOne } from "@/lib/work/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getPreviousWeekStart(now: Date) {
  const currentWeekStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
  ));
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);
  return currentWeekStart.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isErpDatabaseConfigured()) {
    return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
  }

  const weekStart = getPreviousWeekStart(new Date());
  let remindersCreated = 0;
  let reminderError = false;
  try {
    remindersCreated = (await asSystem("cron", (tx) => selectOne<{ n: number }>(tx, "select work.queue_weekly_timesheet_reminders($1::date) as n", [weekStart])))?.n ?? 0;
  } catch (error) {
    reminderError = true;
    console.error("[cron:timesheet-reminders]", error instanceof Error ? error.message : "database");
  }

  try {
    const delivery = await dispatchNotificationEmails();

    if (delivery.deferred) {
      return NextResponse.json({
        error: "Email delivery is not configured.",
        weekStart,
        remindersCreated,
      }, { status: 503 });
    }

    if (reminderError) {
      return NextResponse.json({
        error: "Weekly reminders could not be queued.",
        weekStart,
        emailsSent: delivery.sent,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      weekStart,
      remindersCreated,
      emailsSent: delivery.sent,
      emailFailures: delivery.failed,
    });
  } catch (error) {
    console.error("[cron:notification-emails]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Notification email processing failed." }, { status: 500 });
  }
}
