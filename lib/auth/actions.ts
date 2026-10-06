"use server";

import { getAuthContext } from "@/lib/auth/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getCurrentSessionUser } from "@/lib/firebase/server";

export async function getCurrentProfileAction() {
  const auth = await getAuthContext();
  return auth.profile;
}

export async function updatePasswordAction(newPassword: string): Promise<{ error?: string }> {
  const user = await getCurrentSessionUser();

  if (!user) {
    return { error: "Your session has expired. Please sign in again." };
  }

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  try {
    await adminAuth().updateUser(user.id, { password: newPassword });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update the password." };
  }
}
