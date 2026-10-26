"use server";

import { redirect } from "next/navigation";

import { getAppBaseUrl } from "@/lib/app-url";
import { isAllowedCompanyEmail, normalizeEmail } from "@/lib/auth/company-email";
import { sendMail } from "@/lib/email/server";
import { adminAuth } from "@/lib/firebase/admin";
import { hasFirebaseEnv } from "@/lib/firebase/config";
import { clearSession, createPasswordSession } from "@/lib/firebase/session";
import { createPerson, getPersonProfile } from "@/lib/work/people";

export type AuthActionState = {
  error?: string;
  success?: string;
};

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

  const ownProfile = await getPersonProfile(userId).catch(() => null);

  // the home page sends each person to theirs (Vanguard with ERP access)
  redirect(ownProfile?.entity_code ? "/" : "/select-entity");
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

  if (!hasFirebaseEnv()) {
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

    // self-service accounts start without an entity (chosen next) nor access (staff on it, on first opening)
    try {
      await createPerson({ id: user.uid, email, fullName, isSuperAdmin: false });
    } catch (error) {
      await adminAuth().deleteUser(user.uid);
      return {
        error: error instanceof Error ? error.message : "The account could not be created.",
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
