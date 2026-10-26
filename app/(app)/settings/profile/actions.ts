"use server";

import { requireAuthenticatedUser } from "@/lib/auth/server";
import { asPerson } from "@/lib/work/db";

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

  // The avatar is stored inline as a data URL (work.person.avatar_url): kept small, as every card carries it.
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

  try {
    await asPerson((tx) =>
      tx.query("update work.person set full_name = $2, avatar_url = $3, phone = $4, job_title = $5 where id = $1", [
        auth.profile.id, fullName, nextAvatarUrl, phone || null, jobTitle || null,
      ]),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The profile could not be saved." };
  }

  return {
    success: "Profile settings updated successfully.",
  };
}
