import "server-only";

import { requireAuthenticatedUser } from "@/lib/auth/server";

// The person's current entity: the one they work in (an administrator switches it), for the screens that work in one
// (the timesheet).
export async function requireCurrentEntityContext() {
  const auth = await requireAuthenticatedUser();
  const entityCode = auth.activeEntityCode ?? auth.profile.entity_code;

  if (!entityCode) {
    throw new Error("The current account does not have an active Bumex entity.");
  }

  return { auth, entityCode };
}
