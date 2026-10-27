"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { useFormStatus } from "react-dom";

import { acceptInvitationAction, type AcceptInvitationState } from "@/app/invite/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <KeyRound className="size-4" />
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const { locale } = useI18n();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [state, action] = useActionState(acceptInvitationAction.bind(null, token), {} as AcceptInvitationState);
  const error = state.error && {
    mismatch: tr("Les deux mots de passe diffèrent.", "The two passwords differ."),
    password: tr("Le mot de passe doit faire au moins 8 caractères.", "The password must be at least 8 characters."),
    expired: tr("Ce lien a expiré ou a déjà servi : demandez-en un nouveau.", "This link has expired or was already used: ask for a new one."),
  }[state.error as string];

  return (
    <form action={action} className="space-y-4">
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">{tr("Mot de passe", "Password")}</label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="confirm">{tr("Confirmer le mot de passe", "Confirm the password")}</label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      {state.error ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error || tr("Service indisponible, réessayez.", "Service unavailable, try again.")}
        </div>
      ) : null}
      <Submit label={tr("Choisir mon mot de passe", "Choose my password")} pendingLabel={tr("Enregistrement…", "Saving…")} />
    </form>
  );
}
