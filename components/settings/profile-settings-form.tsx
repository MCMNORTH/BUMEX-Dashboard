"use client";

import { useActionState, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { updateProfileSettingsAction, type ProfileSettingsActionState } from "@/app/(app)/settings/profile/actions";
import { useUser } from "@/hooks/use-user";
import { useI18n } from "@/components/layout/i18n-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/permissions";
import { Input } from "@/components/ui/input";
import type { AppRole, Profile } from "@/types/auth";

const initialState: ProfileSettingsActionState = {};

const frenchRoleLabels: Record<AppRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  supervisor: "Superviseur",
  employee: "Collaborateur",
  shareholder: "Actionnaire",
};

function SubmitButton({ isFr }: { isFr: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (isFr ? "Enregistrement..." : "Saving...") : (isFr ? "Enregistrer" : "Save profile")}
    </Button>
  );
}

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { refreshProfile } = useUser();
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [state, formAction] = useActionState(updateProfileSettingsAction, initialState);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const initials = useMemo(
    () =>
      profile.full_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [profile.full_name],
  );

  useEffect(() => {
    if (!state.success) {
      return;
    }

    refreshProfile();
    router.refresh();
  }, [refreshProfile, router, state.success]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setLocalPreviewUrl(null);
      return;
    }

    if (localPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
  }

  const previewUrl = localPreviewUrl ?? profile.avatar_url;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{isFr ? "Profil" : "Profile"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{isFr ? "Vos informations" : "Your details"}</CardTitle>
          <CardDescription>
            {isFr
              ? "Votre e-mail et votre rôle sont gérés par un administrateur."
              : "Your email and role are managed by an administrator."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center">
              <Avatar className="size-16 border border-border">
                {previewUrl ? <AvatarImage src={previewUrl} alt={profile.full_name} /> : null}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {isFr ? "Image carrée, PNG, JPG ou WebP, 512 Ko maximum." : "Square image, PNG, JPG, or WebP, 512 KB max."}
                </p>
                <label
                  htmlFor="settings-avatar-file"
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Camera className="size-4" />
                  {isFr ? "Changer la photo" : "Change photo"}
                </label>
                <Input
                  id="settings-avatar-file"
                  name="avatar_file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="settings-full-name" className="text-sm font-medium">{isFr ? "Nom complet" : "Full name"}</label>
              <Input id="settings-full-name" name="full_name" defaultValue={profile.full_name} required />
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-email" className="text-sm font-medium">{isFr ? "E-mail" : "Email"}</label>
              <Input id="settings-email" value={profile.email} readOnly disabled />
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-role" className="text-sm font-medium">{isFr ? "Rôle" : "Role"}</label>
              <Input id="settings-role" value={isFr ? frenchRoleLabels[profile.role] : roleLabels[profile.role]} readOnly disabled />
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-phone" className="text-sm font-medium">{isFr ? "Téléphone" : "Phone"}</label>
              <Input id="settings-phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} placeholder="+222 ..." />
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-job-title" className="text-sm font-medium">{isFr ? "Poste" : "Job title"}</label>
              <Input id="settings-job-title" name="job_title" defaultValue={profile.job_title ?? ""} />
            </div>

            {state.error ? (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger sm:col-span-2">
                {state.error}
              </div>
            ) : null}

            {state.success ? (
              <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success sm:col-span-2">
                {isFr ? "Profil enregistré." : "Profile saved."}
              </div>
            ) : null}

            <div className="flex justify-end sm:col-span-2">
              <SubmitButton isFr={isFr} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
