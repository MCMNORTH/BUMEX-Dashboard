import { redirect } from "next/navigation";
import { Orbit, ShieldCheck, Zap } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function LoginPage() {
  const auth = await getAuthContext();

  if (auth.user && auth.profile) {
    redirect(auth.profile?.entity_code ? "/overview" : "/select-entity");
  }

  return (
    <main className="login-scene relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6fbff_0%,#ffffff_34%,#f8fbff_100%)] dark:bg-[linear-gradient(180deg,#08111f_0%,#0f172a_34%,#111827_100%)]">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-35" />
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-orb login-orb-c" />

      <div className="container-shell relative flex min-h-screen items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="space-y-8">
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold leading-[0.94] tracking-[-0.07em] text-slate-900 dark:text-slate-50 sm:text-5xl xl:text-6xl">
                Authentication for the BUMEX workspace
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-500 dark:text-slate-300 sm:text-lg">
                A sharper entry point for your internal platform, designed to feel fast, polished, and confidently professional from the first click.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "Protected",
                  description: "Session-first access with a cleaner, locked-down entry flow.",
                },
                {
                  icon: Orbit,
                  title: "Fluid",
                  description: "Soft motion and layered depth keep the interface alive without noise.",
                },
                {
                  icon: Zap,
                  title: "Precise",
                  description: "Focused interactions, strong hierarchy, and a more premium visual rhythm.",
                },
              ].map(({ icon: Icon, title, description }, index) => (
                <Card
                  key={title}
                  className="login-feature-card surface-highlight group relative overflow-hidden rounded-[28px] border-white/70 bg-white/78 shadow-[0_25px_65px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/52 dark:shadow-none"
                  style={{ animationDelay: `${index * 110}ms` }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),transparent_55%)] opacity-80 transition-opacity duration-500 group-hover:opacity-100 dark:bg-[linear-gradient(135deg,rgba(56,189,248,0.12),transparent_55%)]" />
                  <CardContent className="relative px-5 py-5">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-white/70 bg-white/82 shadow-[0_12px_30px_rgba(14,165,233,0.08)] dark:border-white/10 dark:bg-slate-900/78 dark:shadow-none">
                      <Icon className="size-5 text-sky-600 dark:text-sky-300" />
                    </div>
                    <h2 className="mt-5 text-xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-50">{title}</h2>
                    <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-300">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {!hasSupabaseEnv() ? (
              <div className="rounded-[24px] border border-warning/30 bg-warning/10 px-5 py-4 text-sm text-amber-700 dark:text-amber-100">
                Authentication is not configured for this environment. Set
                {" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code>
                {" "}
                and
                {" "}
                <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
                {" "}
                in `.env.local` to activate sign-in.
              </div>
            ) : null}
          </section>

          <section className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.15),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(29,78,216,0.16),transparent_42%)] blur-2xl dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_42%)]" />
            <AuthForm />
          </section>
        </div>
      </div>
    </main>
  );
}
