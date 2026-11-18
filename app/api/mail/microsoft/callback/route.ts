import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { getAuthContext } from "@/lib/auth/server";
import { normalizeEmail } from "@/lib/auth/company-email";
import { isMailIntakeConfigured, OUTLOOK_STATE_COOKIE, outlookRedirectUri } from "@/lib/mail/config";
import { open, seal } from "@/lib/mail/crypto";
import { exchangeCode, Mailbox } from "@/lib/mail/graph";
import { saveConnection } from "@/lib/mail/store";
import { asSystem } from "@/lib/work/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SavedState = { state: string; verifier: string; personId: string; exp: number };

// Microsoft's sign-in comes back here: the same person, the same sign-in (state), their own mailbox (the Microsoft
// account's address is their Vanguard one), then the refresh token sealed and the inbox read from now on. Back to
// Settings, My account, with the outcome (?mail=…) for the card to say.
export async function GET(request: Request) {
  const base = await getAppBaseUrl();
  const back = (outcome: string) => {
    const response = NextResponse.redirect(new URL(`/vanguard?room=settings&tab=account&mail=${outcome}`, base));
    response.cookies.set(OUTLOOK_STATE_COOKIE, "", { path: "/api/mail/microsoft", maxAge: 0 });
    return response;
  };

  if (!isMailIntakeConfigured()) return back("unavailable");

  const auth = await getAuthContext();
  if (!auth.profile) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const url = new URL(request.url);
  let saved: SavedState | null = null;
  try {
    saved = JSON.parse(open((await cookies()).get(OUTLOOK_STATE_COOKIE)?.value ?? "")) as SavedState;
  } catch {
    saved = null;
  }
  if (!saved || saved.exp < Date.now() || saved.state !== url.searchParams.get("state") || saved.personId !== auth.profile.id) {
    return back("expired");
  }

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back("cancelled");

  try {
    const tokens = await exchangeCode({ code, verifier: saved.verifier, redirectUri: outlookRedirectUri(base) });
    const me = await new Mailbox(tokens.accessToken).me();
    const address = normalizeEmail(me.mail || me.userPrincipalName || "");
    if (address !== normalizeEmail(auth.profile.email)) return back("wrong_account");

    const personId = auth.profile.id;
    await asSystem(personId, (tx) => saveConnection(tx, personId, address, seal(tokens.refreshToken)));
    return back("connected");
  } catch (error) {
    console.error("[mail:connect]", error instanceof Error ? error.message : "unknown");
    return back("failed");
  }
}
