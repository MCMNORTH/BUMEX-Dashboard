"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from "@/app/login/actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

function SubmitButton({
  label,
  pendingLabel,
  icon: Icon,
}: {
  label: string;
  pendingLabel: string;
  icon: typeof LogIn;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <Icon className="size-4" />
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AuthForm() {
  const selfSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP !== "0";
  const { locale } = useI18n();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [signInState, signInFormAction] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction] = useActionState(signUpAction, initialState);
  const activeState = mode === "signin" ? signInState : signUpState;

  return (
    <Card className="login-panel relative overflow-hidden shadow-[var(--shadow-elevated)]">
      <CardHeader className="space-y-5 p-5 sm:p-6">
        {selfSignupEnabled ? (
          <div role="tablist" className="grid w-full grid-cols-2 rounded-lg border border-border bg-muted p-1">
            {(["signin", "signup"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                onClick={() => setMode(tab)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  mode === tab ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "signin" ? tr("Se connecter", "Sign in") : tr("Créer un compte", "Create account")}
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <CardTitle className="text-2xl">
            {mode === "signin" ? tr("Connexion", "Sign in") : tr("Créer votre compte", "Create your account")}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? tr("Utilisez votre e-mail BUMEX et mot de passe.", "Use your BUMEX email and password.")
              : tr("Utilisez votre e-mail professionnel pour demander l’accès.", "Use your company email to request access.")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
        <form action={mode === "signin" ? signInFormAction : signUpFormAction} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="full_name">
                {tr("Nom complet", "Full name")}
              </label>
              <Input id="full_name" name="full_name" autoComplete="name" required className="h-10" />
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              {tr("E-mail", "Email")}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@bumex.mr"
              aria-describedby="email-hint"
              required
              className="h-10"
            />
            <p id="email-hint" className="text-xs text-muted-foreground">
              {tr("Domaines acceptés : @bumex.mr et @bumex.ma", "Allowed domains: @bumex.mr and @bumex.ma")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              {tr("Mot de passe", "Password")}
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                className="h-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-1 flex items-center justify-center rounded-md px-2.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? tr("Masquer le mot de passe", "Hide password") : tr("Afficher le mot de passe", "Show password")}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {activeState.error ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {activeState.error}
            </div>
          ) : null}

          {activeState.success ? (
            <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              {activeState.success}
            </div>
          ) : null}

          <SubmitButton
            label={mode === "signin" ? tr("Se connecter", "Sign in") : tr("Créer le compte", "Create account")}
            pendingLabel={tr("Veuillez patienter...", "Please wait...")}
            icon={mode === "signin" ? LogIn : UserPlus}
          />
        </form>
      </CardContent>
    </Card>
  );
}
