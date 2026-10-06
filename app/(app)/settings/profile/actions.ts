"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { createClient } from "@/lib/firebase/server";

export type ProfileSettingsActionState = {
  error?: string;
  success?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getAvatarDataUrl(formData: FormData) {
  const file = formData.get("avatar_file");

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

  if (!allowedTypes.has(file.type)) {
    return { error: "Avatar must be a PNG, JPG, or WebP image." } as const;
  }

  // The avatar is stored inline as a data URL, and Firestore documents are
  // capped at 1 MiB, so keep the encoded image comfortably below that.
  if (file.size > 512 * 1024) {
    return { error: "Avatar image must be 512 KB or smaller." } as const;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  return { value: `data:${file.type};base64,${base64}` } as const;
}

function validateProfileValues(fullName: string) {
  if (!fullName) {
    return "Full name is required.";
  }

  if (fullName.length < 3) {
    return "Full name is too short.";
  }

  return null;
}

export async function updateProfileSettingsAction(
  _prevState: ProfileSettingsActionState,
  formData: FormData,
): Promise<ProfileSettingsActionState> {
  const auth = await requireAuthenticatedUser();
  const db = await createClient();

  if (!db) {
    return { error: "Firebase is not configured." };
  }

  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");
  const jobTitle = getString(formData, "job_title");

  const validationError = validateProfileValues(fullName);
  if (validationError) {
    return { error: validationError };
  }

  const avatarUpload = await getAvatarDataUrl(formData);
  if (avatarUpload && "error" in avatarUpload) {
    return { error: avatarUpload.error };
  }

  const nextAvatarUrl = avatarUpload?.value ?? auth.profile.avatar_url ?? null;

  const { error } = await db
    .from("profiles")
    .update({
      full_name: fullName,
      avatar_url: nextAvatarUrl,
      phone: phone || null,
      job_title: jobTitle || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.profile.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/profile");

  return {
    success: "Profile settings updated successfully.",
  };
}
