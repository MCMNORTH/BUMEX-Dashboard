"use client";

import { Check, MonitorCog, MoonStar, RotateCcw, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";

import { useI18n } from "@/components/layout/i18n-provider";
import { useSidebarAppearance } from "@/components/layout/sidebar-appearance-provider";
import { SidebarLogo } from "@/components/layout/sidebar-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntity } from "@/hooks/use-entity";
import { useMounted } from "@/hooks/use-mounted";
import { getBumexEntity } from "@/lib/entities/config";
import {
  DEFAULT_LOGO_APPEARANCE,
  DEFAULT_SIDEBAR_THEME,
  logoAppearances,
  sidebarThemes,
  type SidebarThemeId,
} from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";

function optionClassName(selected: boolean) {
  return cn(
    "rounded-xl border bg-card p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
    selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
  );
}

// Light or dark mode goes through next-themes, which keeps it per device (not on the profile).
const colorModes = [
  { id: "light", icon: SunMedium, label: { en: "Light", fr: "Clair" }, hint: { en: "Always light", fr: "Toujours clair" } },
  { id: "dark", icon: MoonStar, label: { en: "Dark", fr: "Sombre" }, hint: { en: "Always dark", fr: "Toujours sombre" } },
  {
    id: "system",
    icon: MonitorCog,
    label: { en: "System", fr: "Système" },
    hint: { en: "Follows your device", fr: "Suit votre appareil" },
  },
] as const;

const DEFAULT_COLOR_MODE = "system";

export function AppearancePanel() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { appearance, status, error, updateAppearance } = useSidebarAppearance();
  const mounted = useMounted();
  const { theme: colorMode, setTheme: setColorMode } = useTheme();
  // next-themes only knows the stored mode in the browser, so nothing is selected until mount.
  const selectedMode = mounted ? (colorMode ?? DEFAULT_COLOR_MODE) : null;
  const { activeEntity } = useEntity();
  const entity = activeEntity ?? getBumexEntity("bumex_it")!;
  const isDefaultTheme =
    appearance.sidebarTheme === DEFAULT_SIDEBAR_THEME && appearance.logoAppearance === DEFAULT_LOGO_APPEARANCE;
  const isDefault = isDefaultTheme && (selectedMode === null || selectedMode === DEFAULT_COLOR_MODE);

  function resetToDefault() {
    setColorMode(DEFAULT_COLOR_MODE);

    if (!isDefaultTheme) {
      updateAppearance({ sidebarTheme: DEFAULT_SIDEBAR_THEME, logoAppearance: DEFAULT_LOGO_APPEARANCE });
    }
  }

  const statusMessage =
    status === "saving"
      ? isFr ? "Enregistrement…" : "Saving…"
      : status === "saved"
        ? isFr ? "Enregistré dans votre profil." : "Saved to your profile."
        : status === "error"
          ? isFr
            ? `Échec de l’enregistrement : ${error?.replace(/\.$/, "")}. Votre choix précédent est rétabli.`
            : `Couldn’t save: ${error?.replace(/\.$/, "")}. Your previous choice is back.`
          : null;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{isFr ? "Apparence" : "Appearance"}</h1>
          <p className="text-sm text-muted-foreground">
            {isFr
              ? "Choisissez le mode clair ou sombre, la couleur du thème et le logo. Ces choix ne s’appliquent qu’à vous."
              : "Choose light or dark mode, your theme color and logo. These choices apply to you only."}
          </p>
        </div>
        <Button variant="secondary" disabled={isDefault} onClick={resetToDefault}>
          <RotateCcw />
          {isFr ? "Réinitialiser" : "Reset to default"}
        </Button>
      </div>

      <p
        aria-live="polite"
        className={cn("min-h-5 text-sm", status === "error" ? "text-danger" : "text-muted-foreground")}
      >
        {statusMessage}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{isFr ? "Mode" : "Mode"}</CardTitle>
          <CardDescription>
            {isFr
              ? "Clair, sombre ou selon votre appareil. Enregistré sur cet appareil."
              : "Light, dark, or matching your device. Saved on this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="group"
            aria-label={isFr ? "Mode d’affichage" : "Display mode"}
            className="grid gap-3 sm:grid-cols-3"
          >
            {colorModes.map((mode) => {
              const Icon = mode.icon;
              const selected = selectedMode === mode.id;

              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setColorMode(mode.id)}
                  className={cn(optionClassName(selected), "flex items-center gap-3 p-3")}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{mode.label[locale]}</span>
                    <span className="block truncate text-xs text-muted-foreground">{mode.hint[locale]}</span>
                  </span>
                  {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isFr ? "Thème" : "Theme"}</CardTitle>
          <CardDescription>
            {isFr
              ? "Colore la barre latérale ainsi que les boutons, liens, bannières et éléments actifs de l’application. Le texte et les icônes s’adaptent pour rester lisibles ; le fond des pages et les couleurs de statut ne changent pas."
              : "Colors the sidebar and the app’s buttons, links, banners and highlights. Text and icons adjust to stay readable; page backgrounds and status colors don’t change."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="group"
            aria-label={isFr ? "Thème" : "Theme"}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {sidebarThemes.map((theme) => {
              const selected = appearance.sidebarTheme === theme.id;

              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateAppearance({ sidebarTheme: theme.id })}
                  className={optionClassName(selected)}
                >
                  <SidebarThemePreview themeId={theme.id} />
                  <span className="mt-2 flex items-center justify-between gap-2 px-1">
                    <span className="min-w-0 truncate text-sm font-medium">{theme.label[locale]}</span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : theme.id === DEFAULT_SIDEBAR_THEME ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{isFr ? "Par défaut" : "Default"}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isFr ? "Logo" : "Logo"}</CardTitle>
          <CardDescription>
            {isFr
              ? "Affiché en haut de la barre latérale, ici sur votre thème actuel. Il reste visible quel que soit le thème."
              : "Shown at the top of the sidebar, previewed here on your current theme. It stays visible on every theme."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="group"
            aria-label={isFr ? "Apparence du logo" : "Logo appearance"}
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            {logoAppearances.map((option) => {
              const selected = appearance.logoAppearance === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateAppearance({ logoAppearance: option.id })}
                  className={optionClassName(selected)}
                >
                  <span
                    aria-hidden="true"
                    data-sidebar-theme={appearance.sidebarTheme}
                    className="flex h-20 items-center justify-center rounded-lg border border-border bg-sidebar"
                  >
                    <SidebarLogo entity={entity} appearance={option.id} className="size-12" />
                  </span>
                  <span className="mt-2 flex items-start justify-between gap-2 px-1">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{option.label[locale]}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint[locale]}</span>
                    </span>
                    {selected ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** A small sidebar-and-page sketch drawn with the theme's own tokens. */
function SidebarThemePreview({ themeId }: { themeId: SidebarThemeId }) {
  return (
    <span
      aria-hidden="true"
      data-sidebar-theme={themeId}
      data-app-theme={themeId}
      className="flex h-24 overflow-hidden rounded-lg border border-border"
    >
      <span className="flex w-1/2 flex-col gap-1.5 border-r border-sidebar-border bg-sidebar p-2">
        <span className="mb-0.5 flex items-center gap-1.5">
          <span className="sidebar-logo size-3.5 rounded-[4px]" />
          <span className="h-1.5 w-8 rounded-full bg-sidebar-foreground" />
        </span>
        <span className="relative flex h-4 items-center rounded-[4px] bg-sidebar-active px-1.5">
          <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-sidebar-indicator" />
          <span className="h-1.5 w-3/4 rounded-full bg-sidebar-active-foreground" />
        </span>
        <span className="mx-1.5 h-1.5 w-2/3 rounded-full bg-sidebar-muted" />
        <span className="mx-1.5 h-1.5 w-1/2 rounded-full bg-sidebar-muted" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 bg-background p-2">
        <span className="h-2 w-3/4 rounded-full bg-muted" />
        <span className="hero-fill h-7 rounded-[4px]" />
        <span className="flex gap-1">
          <span className="h-2.5 w-8 rounded-full bg-primary" />
          <span className="h-2.5 w-6 rounded-full bg-accent" />
        </span>
      </span>
    </span>
  );
}
