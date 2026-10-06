"use server";

import { redirect } from "next/navigation";

import { getAppBaseUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/email/server";
import { adminAuth } from "@/lib/firebase/admin";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { createAdminClient } from "@/lib/firebase/server";
import { clearSession, createPasswordSession } from "@/lib/firebase/session";

export type AuthActionState = {
  error?: string;
  success?: string;
};

const allowedEmailDomains = ["@bumex.mr", "@bumex.ma"] as const;

function isSelfSignupEnabled() {
  return process.env.ENABLE_SELF_SIGNUP !== "0";
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getRawString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAllowedCompanyEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return allowedEmailDomains.some((domain) => normalizedEmail.endsWith(domain));
}

function getCompanyEmailError() {
  return "Only @bumex.mr and @bumex.ma email addresses are allowed.";
}

function getReadableAuthError(error: unknown) {
  if ((error as { code?: string })?.code === "auth/email-already-exists") {
    return "User already registered";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  return "Authentication is temporarily unavailable. Please try again in a moment.";
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(getString(formData, "email"));
  const password = getRawString(formData, "password");

  if (!email || !password) {
    return {
      error: "Email and password are required.",
    };
  }

  if (!isAllowedCompanyEmail(email)) {
    return {
      error: getCompanyEmailError(),
    };
  }

  if (!hasFirebaseEnv()) {
    return {
      error: "Firebase environment variables are missing.",
    };
  }

  let userId: string;

  try {
    userId = await createPasswordSession(email, password);
  } catch (error) {
    return {
      error: getReadableAuthError(error),
    };
  }

  const { data: ownProfile } = await createAdminClient()!
    .from("profiles")
    .select("entity_code")
    .eq("id", userId)
    .maybeSingle<{ entity_code: string | null }>();

  redirect(ownProfile?.entity_code ? "/overview" : "/select-entity");
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSelfSignupEnabled()) {
    return {
      error: "Self-service signup is disabled. Ask an administrator to create or invite your account.",
    };
  }

  const fullName = getString(formData, "full_name");
  const email = normalizeEmail(getString(formData, "email"));
  const password = getRawString(formData, "password");

  if (!fullName || !email || !password) {
    return {
      error: "Full name, email, and password are required.",
    };
  }

  if (!isAllowedCompanyEmail(email)) {
    return {
      error: getCompanyEmailError(),
    };
  }

  const db = createAdminClient();

  if (!db) {
    return {
      error: "Firebase environment variables are missing.",
    };
  }

  try {
    const user = await adminAuth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: false,
    });

    // Replaces the former `on_auth_user_created` trigger: self-service
    // accounts always start as employees without an entity.
    const { error } = await db.from("profiles").insert({
      id: user.uid,
      email,
      full_name: fullName,
      role: "employee",
      entity_code: null,
      is_super_admin: false,
    });

    if (error) {
      await adminAuth().deleteUser(user.uid);
      return {
        error: error.message,
      };
    }

    const appBaseUrl = await getAppBaseUrl();
    const confirmationLink = await adminAuth().generateEmailVerificationLink(
      email,
      appBaseUrl ? { url: `${appBaseUrl}/login` } : undefined,
    );

    await sendMail({
      to: email,
      subject: "Confirm your BUMEX account",
      text: `Confirm your email address to finish creating your account: ${confirmationLink}`,
      html: `<p>Confirm your email address to finish creating your account.</p><p><a href="${confirmationLink}">Confirm my email</a></p>`,
    });
  } catch (error) {
    return {
      error: getReadableAuthError(error),
    };
  }

  return {
    success: "Account created. Check your email to confirm your signup.",
  };
}

export async function signOutAction() {
  await clearSession();

  redirect("/login");
}
