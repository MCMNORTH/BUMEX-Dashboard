"use client";

import { useEffect, useState } from "react";
import { BellRing, Globe2, MonitorCog, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";

import { useI18n } from "@/components/layout/i18n-provider";
import { useMounted } from "@/hooks/use-mounted";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LanguagePreference = "fr" | "en";
type ThemePreference = "dark" | "light" | "system";
type NotificationPreferenceState = {
  inApp: boolean;
  email: boolean;
};

const storageKeys = {
  language: "bumex-preferences-language",
  notifications: "bumex-preferences-notifications",
} as const;

export function PreferencesPanel() {
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [language, setLanguage] = useState<LanguagePreference>("fr");
  const [notifications, setNotifications] = useState<NotificationPreferenceState>({
    inApp: true,
    email: false,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(storageKeys.language, language);
  }, [language, mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(storageKeys.notifications, JSON.stringify(notifications));
  }, [mounted, notifications]);

  const selectedTheme = (theme as ThemePreference | undefined) ?? "system";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isFr ? "Préférences" : "Preferences"}
        title={isFr ? "Paramètres personnels d’interface pour le thème, la langue et les notifications." : "Personal interface defaults for theme, language, and notification posture."}
        subtitle={isFr ? "Ces préférences restent volontairement légères. Le thème est appliqué directement, tandis que le reste est stocké localement jusqu’à l’introduction d’un vrai modèle de préférences." : "These preferences stay intentionally lightweight. Theme is applied directly, while the rest are stored locally until a dedicated preferences model is introduced."}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{isFr ? "Préférences d’interface" : "Interface preferences"}</CardTitle>
            <CardDescription>{isFr ? "Valeurs visuelles par défaut et comportement personnel dans l’espace." : "Visual defaults and personal workspace behavior."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PreferenceSection
              icon={selectedTheme === "light" ? SunMedium : selectedTheme === "system" ? MonitorCog : MoonStar}
              title={isFr ? "Préférence de thème" : "Theme preference"}
              description={isFr ? "Appliqué via le fournisseur de thème existant." : "Applied through the existing theme provider."}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {(["dark", "light", "system"] as ThemePreference[]).map((option) => (
                  <PreferenceButton
                    key={option}
                    active={selectedTheme === option}
                    label={option}
                    onClick={() => setTheme(option)}
                  />
                ))}
              </div>
            </PreferenceSection>

            <PreferenceSection
              icon={Globe2}
              title={isFr ? "Préférence de langue" : "Language preference"}
              description={isFr ? "Placeholder d’interface pour le moment. Stocké localement dans le navigateur." : "UI placeholder only for now. Stored locally in the browser."}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <PreferenceButton active={language === "fr"} label={isFr ? "Français" : "French"} onClick={() => setLanguage("fr")} />
                <PreferenceButton active={language === "en"} label={isFr ? "Anglais" : "English"} onClick={() => setLanguage("en")} />
              </div>
            </PreferenceSection>

            <PreferenceSection
              icon={BellRing}
              title={isFr ? "Préférences de notifications" : "Notification preferences"}
              description={isFr ? "Stocké localement jusqu’à l’introduction d’une table de préférences dédiée." : "Stored locally until a dedicated preferences table is introduced."}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleCard
                  title={isFr ? "Notifications dans l’application" : "In-app notifications"}
                  active={notifications.inApp}
                  onToggle={() => setNotifications((current) => ({ ...current, inApp: !current.inApp }))}
                  isFr={isFr}
                />
                <ToggleCard
                  title={isFr ? "Notifications par e-mail" : "Email notifications"}
                  active={notifications.email}
                  onToggle={() => setNotifications((current) => ({ ...current, email: !current.email }))}
                  isFr={isFr}
                />
              </div>
            </PreferenceSection>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{isFr ? "État des préférences" : "Preferences state"}</CardTitle>
            <CardDescription>{isFr ? "Résumé local actuel des préférences pour cette session navigateur." : "Current local preference summary for this browser session."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryTile label={isFr ? "Thème" : "Theme"} value={selectedTheme} detail={isFr ? "Appliqué via next-themes" : "Applied through next-themes"} />
            <SummaryTile label={isFr ? "Langue" : "Language"} value={language === "fr" ? (isFr ? "Français" : "French") : (isFr ? "Anglais" : "English")} detail={isFr ? "État local temporaire" : "Local placeholder state"} />
            <SummaryTile
              label={isFr ? "Notifications dans l’application" : "In-app notifications"}
              value={notifications.inApp ? (isFr ? "Activées" : "Enabled") : (isFr ? "Désactivées" : "Disabled")}
              detail={isFr ? "Préférence locale du navigateur" : "Local browser preference"}
            />
            <SummaryTile
              label={isFr ? "Notifications e-mail" : "Email notifications"}
              value={notifications.email ? (isFr ? "Activées" : "Enabled") : (isFr ? "Désactivées" : "Disabled")}
              detail={isFr ? "Placeholder temporaire" : "Placeholder only for now"}
            />

            <div className="rounded-2xl border border-border/65 bg-background/35 p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{isFr ? "Mode de stockage" : "Storage mode"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">{isFr ? "Fournisseur de thème" : "Theme provider"}</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">{isFr ? "État local du navigateur" : "Local browser state"}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreferenceSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof BellRing;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-border/65 bg-background/35 p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-primary" />
          {title}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function PreferenceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-2xl border px-4 py-4 text-left text-sm transition-all ${
        active
          ? "border-primary/30 bg-primary/12 text-foreground shadow-[0_10px_24px_rgba(14,165,233,0.08)] dark:border-sky-400/25 dark:bg-sky-500/14 dark:text-sky-100"
          : "border-border/65 bg-background/45 text-foreground hover:bg-accent/40 dark:border-white/10 dark:bg-slate-950/45 dark:hover:bg-slate-900/70"
      }`}
      onClick={onClick}
    >
      <span className="font-medium capitalize">{label}</span>
    </button>
  );
}

function ToggleCard({
  title,
  active,
  onToggle,
  isFr,
}: {
  title: string;
  active: boolean;
  onToggle: () => void;
  isFr: boolean;
}) {
  return (
    <button
      type="button"
      className={`rounded-2xl border px-4 py-4 text-left transition-all ${
        active
          ? "border-primary/40 bg-primary/12 dark:border-sky-400/25 dark:bg-sky-500/14"
          : "border-border/65 bg-background/45 hover:bg-accent/40 dark:border-white/10 dark:bg-slate-950/45 dark:hover:bg-slate-900/70"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant={active ? "secondary" : "outline"} className="rounded-full px-3 py-1">
          {active ? (isFr ? "Oui" : "On") : (isFr ? "Non" : "Off")}
        </Badge>
      </div>
    </button>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/65 bg-background/35 p-4 dark:border-white/10 dark:bg-slate-950/40">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-sm font-medium capitalize">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
