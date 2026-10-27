import "server-only";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { getErpAccess } from "@/lib/erp/access";
import { bumexTestEntityCode } from "@/types/entity";

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

// The timesheet's entity: the person's own, or the test floor's for someone who has it (0011), where their test lines
// stay apart from their real week (no week is sent there).
export async function requireTimeEntityContext(test = false) {
  const context = await requireCurrentEntityContext();
  if (!test) return { ...context, test: false };
  if (!(await getErpAccess(context.auth.user.id))?.testFloor) throw new Error("The test floor is not open to this account.");
  return { ...context, entityCode: bumexTestEntityCode, test: true };
}
