"use server";

import { redirect } from "next/navigation";

import { getAppBaseUrl } from "@/lib/app-url";
import { getAuthContext } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  if (!supabase) {
    return {
      error: "Supabase environment variables are missing.",
    };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        error: error.message,
      };
    }
  } catch (error) {
    return {
      error: getReadableAuthError(error),
    };
  }

  const auth = await getAuthContext();

  redirect(auth.profile?.entity_code ? "/overview" : "/select-entity");
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

  const supabase = await createClient();

  if (!supabase) {
    return {
      error: "Supabase environment variables are missing.",
    };
  }

  try {
    const appBaseUrl = await getAppBaseUrl();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appBaseUrl ? `${appBaseUrl}/login` : undefined,
        data: {
          full_name: fullName,
          role: "employee",
          entity_code: null,
          is_super_admin: false,
        },
      },
    });

    if (error) {
      return {
        error: error.message,
      };
    }
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
  const supabase = await createClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}
