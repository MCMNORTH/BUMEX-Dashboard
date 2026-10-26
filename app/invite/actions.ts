"use server";

import { redirect } from "next/navigation";

import { acceptInvitation, type PermissionsError } from "@/lib/erp/permissions";
import { createPasswordSession } from "@/lib/firebase/session";

export type AcceptInvitationState = { error?: PermissionsError | "mismatch" };

// The invited person chooses their password (lib/erp/permissions.ts acceptInvitation), then is signed in.
export async function acceptInvitationAction(token: string, _prev: AcceptInvitationState, formData: FormData): Promise<AcceptInvitationState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (typeof password !== "string" || typeof confirm !== "string") return { error: "password" };
  if (password !== confirm) return { error: "mismatch" };

  const result = await acceptInvitation(token, password);
  if ("error" in result) return { error: result.error };

  const signedIn = await createPasswordSession(result.email, password).then(() => true, () => false);
  redirect(signedIn ? "/" : "/login");
}
