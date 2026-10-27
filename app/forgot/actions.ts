"use server";

import { getAppBaseUrl } from "@/lib/app-url";
import { requestPasswordLink } from "@/lib/erp/permissions";

export type ForgotPasswordState = { sent?: boolean };

// "Forgot password?" (app/forgot): the same answer whatever the address, so nobody learns who has an account.
export async function forgotPasswordAction(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = formData.get("email");
  await requestPasswordLink(typeof email === "string" ? email : "", await getAppBaseUrl());
  return { sent: true };
}
