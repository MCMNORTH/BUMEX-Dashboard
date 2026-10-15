import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/admin";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { TABLES } from "@/lib/firebase/schema";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/session";
import { notificationsKey, readTableVersions } from "@/lib/firebase/table-versions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// The caller's own notifications counter (see notificationsKey).
const OWN_NOTIFICATIONS = "notifications:me";

/**
 * The write counters of the requested tables (see lib/firebase/table-versions.ts),
 * for pages and the notification bell to learn that what they show has changed.
 * One document read per call, and no data: only counters and the caller's uid,
 * so the session is checked without the revocation lookup.
 */
export async function GET(request: Request) {
  if (!hasFirebaseEnv()) {
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  let uid: string;

  try {
    if (!sessionCookie) throw new Error("signed out");
    uid = (await adminAuth().verifySessionCookie(sessionCookie)).uid;
  } catch {
    return Response.json({ error: "signed-out" }, { status: 401, headers: NO_STORE });
  }

  const requested = (new URL(request.url).searchParams.get("tables") ?? "")
    .split(",")
    .filter((table) => table in TABLES || table === OWN_NOTIFICATIONS)
    .slice(0, 40);
  const versions = await readTableVersions();
  const counter = (table: string) => versions[table === OWN_NOTIFICATIONS ? notificationsKey(uid) : table] ?? 0;

  return Response.json(
    { uid, versions: Object.fromEntries(requested.map((table) => [table, counter(table)])) },
    { headers: NO_STORE },
  );
}
