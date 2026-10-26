import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/firebase/session";
import { perRequest } from "@/lib/request-memo";

async function sessionCookieValue() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? "";
}

// The signed-in person (Firebase Auth's session cookie). Once per request, also in Server Actions and Route Handlers
// (where React's cache() does not apply), and per session cookie, so a sign-in or sign-out made earlier in the same
// request is still seen.
export const getCurrentSessionUser = cache(async () =>
  perRequest(`session-user:${await sessionCookieValue()}`, getSessionUser),
);
