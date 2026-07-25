"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function SecurityPanel({ email }: { email: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setPending(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password updated successfully.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Account protection, password controls, and authentication posture."
        subtitle="Manage your password safely while future security modules such as session controls and two-factor authentication remain staged as placeholders."
      />

      <div className="grid gap-4">
        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Update the current account password using your active authentication session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                <Mail className="size-3.5 text-primary" />
                Current account
              </div>
              <p className="mt-3 text-sm font-medium">{email}</p>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="security-new-password" className="text-sm font-medium">New password</label>
                <Input
                  id="security-new-password"
                  type="password"
                  value={newPassword}
                  placeholder="Enter a new password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="security-confirm-password" className="text-sm font-medium">Confirm password</label>
                <Input
                  id="security-confirm-password"
                  type="password"
                  value={confirmPassword}
                  placeholder="Confirm the new password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-border/65 bg-background/35 p-4 text-sm text-muted-foreground">
                Minimum password length is <span className="font-medium text-foreground">8 characters</span>.
              </div>

              {error ? (
                <div className="sm:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="sm:col-span-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              ) : null}

              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" className="rounded-2xl px-5" disabled={pending}>
                  {pending ? "Updating..." : "Update password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
