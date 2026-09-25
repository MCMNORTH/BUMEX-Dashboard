import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { dispatchNotificationEmails } from "@/lib/notifications/email-delivery";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service configuration is missing." }, { status: 503 });
  }

  const weekStart = getPreviousWeekStart(new Date());
  const { data: remindersCreated, error: reminderError } = await supabase.rpc(
    "queue_weekly_timesheet_reminders",
    { p_week_start: weekStart },
  );

  if (reminderError) {
    console.error("[cron:timesheet-reminders]", reminderError.code ?? "database");
  }

  try {
    const delivery = await dispatchNotificationEmails();

    if (delivery.deferred) {
      return NextResponse.json({
        error: "Email delivery is not configured.",
        weekStart,
        remindersCreated: remindersCreated ?? 0,
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
      remindersCreated: remindersCreated ?? 0,
      emailsSent: delivery.sent,
      emailFailures: delivery.failed,
    });
  } catch (error) {
    console.error("[cron:notification-emails]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Notification email processing failed." }, { status: 500 });
  }
}
