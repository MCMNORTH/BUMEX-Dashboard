import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { getAuthContext } from "@/lib/auth/server";
import { isMailIntakeConfigured, OUTLOOK_STATE_COOKIE, outlookRedirectUri } from "@/lib/mail/config";
import { seal } from "@/lib/mail/crypto";
import { authorizeUrl, pkcePair } from "@/lib/mail/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Connect Outlook" (Settings, My account): off to Microsoft's sign-in, the state and PKCE verifier kept sealed in a
// cookie for the callback, the person's Vanguard address as the hint (the callback accepts that mailbox only).
export async function GET() {
  const base = await getAppBaseUrl();
  if (!isMailIntakeConfigured()) {
    return NextResponse.redirect(new URL("/vanguard?room=settings&tab=account&mail=unavailable", base));
  }

  const auth = await getAuthContext();
  if (!auth.profile) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const response = NextResponse.redirect(
    authorizeUrl({ state, challenge, redirectUri: outlookRedirectUri(base), loginHint: auth.profile.email }),
  );
  response.cookies.set(OUTLOOK_STATE_COOKIE, seal(JSON.stringify({ state, verifier, personId: auth.profile.id, exp: Date.now() + 600_000 })), {
    httpOnly: true,
    secure: base.startsWith("https://"),
    sameSite: "lax",
    path: "/api/mail/microsoft",
    maxAge: 600,
  });
  return response;
}
