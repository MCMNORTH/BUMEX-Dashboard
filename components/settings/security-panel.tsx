"use client";

import { useState } from "react";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updatePasswordAction } from "@/lib/auth/actions";

export function SecurityPanel({ email }: { email: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { locale } = useI18n();
  const isFr = locale === "fr";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError(isFr ? "Le mot de passe doit contenir au moins 8 caractères." : "Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isFr ? "Les mots de passe ne correspondent pas." : "Passwords do not match.");
      return;
    }

    setPending(true);

    const { error: updateError } = await updatePasswordAction(newPassword);

    setPending(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setSuccess(isFr ? "Mot de passe mis à jour." : "Password updated.");
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{isFr ? "Sécurité" : "Security"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{isFr ? "Changer le mot de passe" : "Change password"}</CardTitle>
          <CardDescription>
            {isFr ? `Compte : ${email}` : `Account: ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="space-y-2">
              <label htmlFor="security-new-password" className="text-sm font-medium">{isFr ? "Nouveau mot de passe" : "New password"}</label>
              <Input
                id="security-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                aria-describedby="security-password-hint"
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <p id="security-password-hint" className="text-xs text-muted-foreground">
                {isFr ? "8 caractères minimum." : "At least 8 characters."}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="security-confirm-password" className="text-sm font-medium">{isFr ? "Confirmer le mot de passe" : "Confirm password"}</label>
              <Input
                id="security-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            {success ? (
              <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                {success}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? (isFr ? "Mise à jour..." : "Updating...") : (isFr ? "Mettre à jour le mot de passe" : "Update password")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
