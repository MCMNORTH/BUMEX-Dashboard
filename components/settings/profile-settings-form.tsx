"use client";

import { useActionState, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, Camera, Mail, Phone, UserRound } from "lucide-react";

import { updateProfileSettingsAction, type ProfileSettingsActionState } from "@/app/(app)/settings/profile/actions";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/types/auth";

const initialState: ProfileSettingsActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
      {pending ? "Saving..." : "Save profile"}
    </Button>
  );
}

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { refreshProfile } = useUser();
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profile"
        title="Personal identity, presentation details, and operator context."
        subtitle="Keep your visible profile details current while role and authentication boundaries remain read-only."
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Profile details</CardTitle>
            <CardDescription>Editable fields are limited to basic profile information only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex flex-col gap-4 rounded-2xl border border-border/65 bg-background/35 p-4 sm:flex-row sm:items-center">
                  <Avatar className="size-20 border border-border/70">
                    {previewUrl ? <AvatarImage src={previewUrl} alt={profile.full_name} /> : null}
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium">Avatar</p>
                      <p className="text-xs text-muted-foreground">Upload a square image. PNG, JPG, or WebP. Max 2 MB.</p>
                    </div>
                    <label
                      htmlFor="settings-avatar-file"
                      className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Camera className="size-4" />
                      Upload image
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
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="settings-full-name" className="text-sm font-medium">Full name</label>
                <Input id="settings-full-name" name="full_name" defaultValue={profile.full_name} required />
              </div>

              <div className="space-y-2">
                <label htmlFor="settings-email" className="text-sm font-medium">Email</label>
                <Input id="settings-email" value={profile.email} readOnly disabled />
              </div>

              <div className="space-y-2">
                <label htmlFor="settings-role" className="text-sm font-medium">Role</label>
                <Input id="settings-role" value={profile.role} readOnly disabled />
              </div>

              <div className="space-y-2">
                <label htmlFor="settings-phone" className="text-sm font-medium">Phone</label>
                <Input id="settings-phone" name="phone" defaultValue={profile.phone ?? ""} placeholder="+33 ..." />
              </div>

              <div className="space-y-2">
                <label htmlFor="settings-job-title" className="text-sm font-medium">Job title</label>
                <Input id="settings-job-title" name="job_title" defaultValue={profile.job_title ?? ""} placeholder="Head of IT Operations" />
              </div>

              {state.error ? (
                <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
                  {state.error}
                </div>
              ) : null}

              {state.success ? (
                <div className="sm:col-span-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {state.success}
                </div>
              ) : null}

              <div className="sm:col-span-2 flex justify-end">
                <SubmitButton />
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Profile summary</CardTitle>
            <CardDescription>Current identity data visible to the workspace where allowed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow icon={UserRound} label="Identity" value={profile.full_name} detail={profile.avatar_url ? "Avatar linked" : "No avatar linked"} />
            <SummaryRow icon={Mail} label="Account" value={profile.email} detail="Authentication email is read-only here" />
            <SummaryRow icon={BadgeCheck} label="Role scope" value={profile.role} detail="Role changes stay controlled in user administration" />
            <SummaryRow icon={Phone} label="Contact" value={profile.phone ?? "Not set"} detail="Optional profile field" />
            <SummaryRow icon={BriefcaseBusiness} label="Job title" value={profile.job_title ?? "Not set"} detail="Optional profile field" />

            <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Profile state</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">Connected user</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">Settings-ready</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-3 text-sm font-medium capitalize">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
