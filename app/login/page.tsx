import { redirect } from "next/navigation";
import { Clock3, FolderKanban, WalletMinimal } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { hasFirebaseEnv } from "@/lib/firebase/config";

export default async function LoginPage() {
  const auth = await getAuthContext();

  if (auth.user && auth.profile) {
    redirect(auth.profile?.entity_code ? "/overview" : "/select-entity");
  }

  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  return (
    <main className="login-scene relative min-h-screen overflow-hidden bg-background">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-35" />
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-orb login-orb-c" />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="container-shell relative flex min-h-screen items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="space-y-8">
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {tr("L’espace de travail BUMEX", "The BUMEX workspace")}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {tr(
                  "Projets, tickets, temps passé et finances de chaque entité BUMEX, au même endroit.",
                  "Projects, tickets, time, and finance for every BUMEX entity, in one place.",
                )}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: FolderKanban,
                  title: tr("Projets et tickets", "Projects and tickets"),
                  description: tr("Planifiez la livraison et suivez chaque demande jusqu’au bout.", "Plan delivery and follow every request to the end."),
                },
                {
                  icon: Clock3,
                  title: tr("Équipe et temps", "Team and time"),
                  description: tr("Voyez qui travaille sur quoi et saisissez votre temps chaque semaine.", "See who works on what and log your time each week."),
                },
                {
                  icon: WalletMinimal,
                  title: tr("Finances", "Finance"),
                  description: tr("Factures, paiements et virements suivis validés.", "Invoices, payments, and transfers, tracked approved."),
                },
              ].map(({ icon: Icon, title, description }) => (
                <Card key={title}>
                  <CardContent className="px-5 pt-5">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-5" />
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {!hasFirebaseEnv() ? (
              <div className="rounded-[24px] border border-warning/30 bg-warning/10 px-5 py-4 text-sm text-warning">
                Authentication is not configured for this environment. Set
                {" "}
                <code>FIREBASE_PROJECT_ID</code>,
                {" "}
                <code>FIREBASE_CLIENT_EMAIL</code>,
                {" "}
                <code>FIREBASE_PRIVATE_KEY</code>
                {" "}
                and
                {" "}
                <code>FIREBASE_API_KEY</code>
                {" "}
                in `.env.local` to activate sign-in.
              </div>
            ) : null}
          </section>

          <section className="relative">
            <AuthForm />
          </section>
        </div>
      </div>
    </main>
  );
}
