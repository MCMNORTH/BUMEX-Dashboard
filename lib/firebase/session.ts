import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/admin";
import { getFirebaseEnv, hasFirebaseEnv } from "@/lib/firebase/config";
import type { AuthUser } from "@/types/auth";

export const SESSION_COOKIE_NAME = "__session";

// Firebase session cookies can live up to 14 days.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type IdentityToolkitError = { error?: { message?: string } };

const READABLE_AUTH_ERRORS: Record<string, string> = {
  INVALID_LOGIN_CREDENTIALS: "Invalid login credentials",
  INVALID_PASSWORD: "Invalid login credentials",
  EMAIL_NOT_FOUND: "Invalid login credentials",
  USER_DISABLED: "This account has been disabled.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later.",
};

function readableAuthError(code: string | undefined) {
  const key = code?.split(" ")[0] ?? "";
  return READABLE_AUTH_ERRORS[key] ?? "Authentication failed. Please try again.";
}

/** Verifies email/password with Firebase Auth and returns an ID token. */
async function signInWithPassword(email: string, password: string) {
  const { apiKey } = getFirebaseEnv();
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const baseUrl = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const response = await fetch(
    `${baseUrl}/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    },
  );

  const body = (await response.json()) as { idToken?: string } & IdentityToolkitError;

  if (!response.ok || !body.idToken) {
    throw new Error(readableAuthError(body.error?.message));
  }

  return body.idToken;
}

export async function createPasswordSession(email: string, password: string) {
  const idToken = await signInWithPassword(email, password);
  const decoded = await adminAuth().verifyIdToken(idToken);

  // Matches Supabase's "confirm email" setting, which blocked unconfirmed logins.
  if (decoded.email_verified === false) {
    throw new Error("Email not confirmed");
  }

  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return decoded.uid;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  cookieStore.delete(SESSION_COOKIE_NAME);

  if (sessionCookie && hasFirebaseEnv()) {
    try {
      const decoded = await adminAuth().verifySessionCookie(sessionCookie);
      await adminAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Expired or already revoked sessions need no further cleanup.
    }
  }
}

/** Returns the signed-in user from the session cookie, or null. */
export async function getSessionUser(): Promise<AuthUser | null> {
  if (!hasFirebaseEnv()) {
    return null;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const user = await adminAuth().getUser(decoded.uid);

    return {
      id: user.uid,
      email: user.email ?? null,
      email_confirmed: user.emailVerified,
      user_metadata: {
        full_name: user.displayName ?? undefined,
        avatar_url: user.photoURL ?? undefined,
      },
      created_at: user.metadata.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}
