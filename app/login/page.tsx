import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getAuthContext } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { hasFirebaseEnv } from "@/lib/firebase/config";

export default async function LoginPage() {
  const auth = await getAuthContext();

  if (auth.user && auth.profile) {
    redirect(auth.profile?.entity_code ? "/" : "/select-entity");
  }

  const isFr = (await getCurrentLocale()) === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);

  // Fluent's sign-in (2026-11-19): one card on the page's canvas, the app's name in it, a line about the app under it
  return (
    <main className="login-scene relative flex min-h-dvh flex-col bg-background">
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-14">
        <div className="w-full max-w-[440px] space-y-4">
          <AuthForm />

          {!hasFirebaseEnv() ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
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

          <p className="px-1 text-sm text-muted-foreground">
            {tr(
              "L’espace de travail BUMEX : projets, tickets, temps passé et finances de chaque entité, au même endroit.",
              "The BUMEX workspace: projects, tickets, time, and finance for every entity, in one place.",
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
