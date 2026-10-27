"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { useFormStatus } from "react-dom";

import { forgotPasswordAction, type ForgotPasswordState } from "@/app/forgot/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <Mail className="size-4" />
      {pending ? pendingLabel : label}
    </Button>
  );
}

// The request of a link to choose a new password (app/forgot/actions.ts).
export function ForgotPasswordForm({ email }: { email?: string }) {
  const { locale } = useI18n();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [state, action] = useActionState(forgotPasswordAction, {} as ForgotPasswordState);

  if (state.sent) {
    return (
      <div role="status" className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        {tr(
          "Si cette adresse a un compte BUMEX, un lien pour choisir un nouveau mot de passe vient d’y être envoyé. Pensez à regarder les indésirables.",
          "If this address has a BUMEX account, a link to choose a new password was just sent to it. Check the spam folder too.",
        )}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">{tr("E-mail BUMEX", "BUMEX email")}</label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} placeholder="prenom.nom@bumex.mr" className="h-10" />
      </div>
      <Submit label={tr("Recevoir un lien", "Send me a link")} pendingLabel={tr("Envoi…", "Sending…")} />
    </form>
  );
}
