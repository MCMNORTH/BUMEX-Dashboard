import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentLocale } from "@/lib/i18n/server";

// "Forgot password?": a link to choose a new one, sent to the address if it has an account (lib/erp/permissions.ts
// requestPasswordLink); the link opens app/invite.
export const metadata: Metadata = { title: "BUMEX · Mot de passe oublié", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  return (
    <main className="login-scene relative min-h-screen overflow-hidden bg-background">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-35" />
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="login-panel w-full max-w-md shadow-[var(--shadow-elevated)]">
          <CardHeader className="space-y-2 p-5 sm:p-6">
            <CardTitle className="text-2xl">{tr("Mot de passe oublié", "Forgot password")}</CardTitle>
            <CardDescription>
              {tr("Recevez par e-mail un lien pour choisir un nouveau mot de passe.", "Get a link by email to choose a new password.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
            <ForgotPasswordForm email={typeof email === "string" ? email : undefined} />
            <Link href="/login" className="block text-sm font-medium text-primary underline-offset-4 hover:underline">
              {tr("Retour à la connexion", "Back to sign-in")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
