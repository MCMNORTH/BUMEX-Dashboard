"use server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { createClient } from "@/lib/firebase/server";

export async function updateEmailNotificationsAction(enabled: boolean): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();

  if (typeof enabled !== "boolean") {
    return { error: "Unknown email notification option." };
  }

  const db = await createClient();

  if (!db) {
    return { error: "Firebase is not configured." };
  }

  const { error } = await db
    .from("profiles")
    .update({ email_notifications: enabled, updated_at: new Date().toISOString() })
    .eq("id", auth.profile.id);

  return error ? { error: error.message } : {};
}
