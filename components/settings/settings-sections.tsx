import Link from "next/link";
import {
  BadgeCheck,
  ChevronRight,
  LockKeyhole,
  Palette,
  ShieldCheck,
  Users2,
} from "lucide-react";

import type { Locale } from "@/lib/i18n/config";

type SettingsSectionKey =
  | "profile"
  | "users"
  | "roles"
  | "security"
  | "preferences";

type SettingsSectionConfig = {
  key: SettingsSectionKey;
  href: `/settings/${SettingsSectionKey}`;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  icon: typeof BadgeCheck;
  adminOnly?: boolean;
};

export const settingsSections: SettingsSectionConfig[] = [
  {
    key: "profile",
    href: "/settings/profile",
    title: { en: "Profile", fr: "Profil" },
    description: { en: "Your name, photo, and contact details.", fr: "Votre nom, votre photo et vos coordonnées." },
    icon: BadgeCheck,
  },
  {
    key: "preferences",
    href: "/settings/preferences",
    title: { en: "Preferences", fr: "Préférences" },
    description: { en: "Language, theme, and notification choices.", fr: "Langue, thème et notifications." },
    icon: Palette,
  },
  {
    key: "security",
    href: "/settings/security",
    title: { en: "Security", fr: "Sécurité" },
    description: { en: "Password and sign-in.", fr: "Mot de passe et connexion." },
    icon: LockKeyhole,
  },
  {
    key: "users",
    href: "/settings/users",
    title: { en: "Users", fr: "Utilisateurs" },
    description: { en: "Invite people, manage accounts and roles.", fr: "Inviter des personnes, gérer les comptes et les rôles." },
    icon: Users2,
    adminOnly: true,
  },
  {
    key: "roles",
    href: "/settings/roles",
    title: { en: "Roles & permissions", fr: "Rôles et permissions" },
    description: { en: "What each role can see and do.", fr: "Ce que chaque rôle peut voir et faire." },
    icon: ShieldCheck,
    adminOnly: true,
  },
];

export function SettingsOverviewGrid({ isAdmin, locale }: { isAdmin: boolean; locale: Locale }) {
  const visibleSections = settingsSections.filter((section) => isAdmin || !section.adminOnly);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{locale === "fr" ? "Paramètres" : "Settings"}</h1>
      <ul className="grid gap-3 md:grid-cols-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;

          return (
            <li key={section.key}>
              <Link
                href={section.href}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{section.title[locale]}</span>
                  <span className="block text-sm text-muted-foreground">{section.description[locale]}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
