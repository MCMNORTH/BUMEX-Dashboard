"use server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { asPerson } from "@/lib/work/db";

export async function updateEmailNotificationsAction(enabled: boolean): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();

  if (typeof enabled !== "boolean") {
    return { error: "Unknown email notification option." };
  }

  try {
    await asPerson((tx) => tx.query("update work.person set email_notifications = $2 where id = $1", [auth.profile.id, enabled]));
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The preference could not be saved." };
  }
}
