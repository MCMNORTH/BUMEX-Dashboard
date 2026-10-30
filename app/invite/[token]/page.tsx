import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findInvitation, type Invitation } from "@/lib/erp/permissions";
import { getCurrentLocale } from "@/lib/i18n/server";

// The link of an invitation (Settings › Permissions, lib/erp/permissions.ts): the person chooses their password. The
// token stays out of any other site's logs (no referrer).
export const metadata: Metadata = { title: "BUMEX · Invitation", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const invitation: Invitation | null = await findInvitation(token).catch(() => null);

  return (
    <main className="login-scene relative min-h-dvh overflow-hidden bg-background">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-35" />
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
        <Card className="login-panel w-full max-w-md shadow-[var(--shadow-elevated)]">
          {invitation && !("error" in invitation) ? (
            <>
              <CardHeader className="space-y-2 p-5 sm:p-6">
                <CardTitle className="text-2xl">
                  {invitation.returning ? tr("Nouveau mot de passe", "New password") : tr(`Bienvenue, ${invitation.name}`, `Welcome, ${invitation.name}`)}
                </CardTitle>
                <CardDescription>
                  {invitation.returning
                    ? tr(`Choisissez le nouveau mot de passe de ${invitation.email}. L’ancien ne servira plus.`, `Choose the new password of ${invitation.email}. The old one will no longer work.`)
                    : tr(`Choisissez le mot de passe de ${invitation.email} pour ouvrir BUMEX Vanguard.`, `Choose the password of ${invitation.email} to open BUMEX Vanguard.`)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                <AcceptInvitationForm token={token} email={invitation.email} />
              </CardContent>
            </>
          ) : (
            <CardHeader className="space-y-3 p-5 sm:p-6">
              <CardTitle className="text-xl">
                {invitation ? tr("Lien expiré ou déjà utilisé", "Link expired or already used") : tr("Service indisponible", "Service unavailable")}
              </CardTitle>
              <CardDescription>
                {invitation
                  ? tr("Demandez un nouveau lien (« Mot de passe oublié ? » à la connexion, ou à votre administrateur), ou connectez-vous si votre mot de passe est déjà choisi.", "Ask for a new link ('Forgot password?' on the sign-in page, or your administrator), or sign in if your password is already chosen.")
                  : tr("Réessayez dans un instant.", "Try again in a moment.")}
              </CardDescription>
              <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                {tr("Aller à la connexion", "Go to sign-in")}
              </Link>
            </CardHeader>
          )}
        </Card>
      </div>
    </main>
  );
}
