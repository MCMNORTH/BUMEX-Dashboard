"use server";

import { getAppBaseUrl } from "@/lib/app-url";
import { canManageErpAccess } from "@/lib/erp/access";
import {
  invitePerson,
  listPermissions,
  removeAccess,
  resendInvitation,
  savePermissions,
  sendPasswordLink,
  setPassword,
  type InviteInput,
  type PermissionsData,
  type PermissionsError,
  type PermissionsInput,
} from "@/lib/erp/permissions";
import { requireErpAccess } from "@/lib/erp/server";
import { prepareTestFloor } from "@/lib/erp/test-floor";

// The Settings room's Permissions tab (vanguard/one/Permissions.tsx), for the administrators who manage access (the
// "role modifiers", migration 0009) and nobody else: the database refuses the others' changes too.

async function modifier() {
  const { auth, access } = await requireErpAccess();
  return canManageErpAccess(access) ? auth : null;
}

export async function permissionsAction(): Promise<PermissionsData | null> {
  const auth = await modifier();
  return auth ? listPermissions(auth.profile.id) : null;
}

export async function savePermissionsAction(userId: string, input: PermissionsInput): Promise<{ error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return savePermissions(auth.profile.id, userId, input);
}

export async function removeAccessAction(userId: string): Promise<{ error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return removeAccess(auth.profile.id, userId);
}

export async function invitePersonAction(input: InviteInput): Promise<{ id?: string; mailed?: boolean; error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return invitePerson(auth.profile.id, auth.profile.full_name || auth.profile.email, input, await getAppBaseUrl());
}

export async function resendInvitationAction(userId: string): Promise<{ mailed?: boolean; error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return resendInvitation(auth.profile.id, auth.profile.full_name || auth.profile.email, userId, await getAppBaseUrl());
}

// The test floor's sample data (lib/erp/test-floor.ts), once.
export async function prepareTestFloorAction(): Promise<{ error?: "not_allowed" | "ready" | "unavailable" }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return prepareTestFloor(auth.profile.id, auth.profile.full_name || auth.profile.email);
}

// Someone's password: a link sent to them, or set by the role modifier.
export async function sendPasswordLinkAction(userId: string): Promise<{ mailed?: boolean; error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return sendPasswordLink(auth.profile.id, auth.profile.full_name || auth.profile.email, userId, await getAppBaseUrl());
}

export async function setPasswordAction(userId: string, password: string): Promise<{ error?: PermissionsError }> {
  const auth = await modifier();
  if (!auth) return { error: "not_allowed" };
  return setPassword(auth.profile.id, userId, password);
}
