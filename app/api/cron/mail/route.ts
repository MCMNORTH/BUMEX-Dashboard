import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { isErpDatabaseConfigured } from "@/lib/erp/db";
import { isMailIntakeConfigured } from "@/lib/mail/config";
import { syncMail } from "@/lib/mail/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// E-mails to tickets (lib/mail/sync.ts): Cloud Scheduler calls it every 2 minutes with Authorization: Bearer
// <CRON_SECRET>. A run reads the connected inboxes and turns their new e-mails into tickets and comments within ~40 s;
// what it leaves, the next run takes.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isErpDatabaseConfigured()) {
    return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
  }

  if (!isMailIntakeConfigured()) {
    return NextResponse.json({ error: "E-mails to tickets is not configured." }, { status: 503 });
  }

  try {
    const stats = await syncMail({ budgetMs: 40_000 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("[cron:mail]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "E-mail processing failed." }, { status: 500 });
  }
}
