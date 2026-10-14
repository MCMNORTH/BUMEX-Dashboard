import type { Locale } from "@/lib/i18n/config";

// The colors themselves live in app/globals.css under [data-sidebar-theme="..."],
// so every sidebar surface and every settings preview reads the same tokens.
export const sidebarThemes = [
  { id: "white", label: { en: "Neutral White", fr: "Blanc neutre" } },
  { id: "bumex", label: { en: "BUMEX Brand", fr: "Bleu BUMEX" } },
  { id: "forest", label: { en: "Forest Green", fr: "Vert forêt" } },
  { id: "red", label: { en: "Red", fr: "Rouge" } },
  { id: "purple", label: { en: "Purple", fr: "Violet" } },
  { id: "black", label: { en: "Black", fr: "Noir" } },
  { id: "grey", label: { en: "Dark Grey", fr: "Gris foncé" } },
  { id: "pink", label: { en: "Dark Pink", fr: "Rose foncé" } },
  { id: "orange", label: { en: "Orange", fr: "Orange" } },
] as const satisfies ReadonlyArray<{ id: string; label: Record<Locale, string> }>;

export const logoAppearances = [
  {
    id: "original",
    label: { en: "Original", fr: "Original" },
    hint: { en: "Full-color BUMEX logo", fr: "Logo BUMEX en couleur" },
  },
  {
    id: "dark",
    label: { en: "Monochrome dark", fr: "Monochrome foncé" },
    hint: { en: "Single dark color", fr: "Une seule couleur foncée" },
  },
  {
    id: "white",
    label: { en: "Monochrome white", fr: "Monochrome blanc" },
    hint: { en: "Single white color", fr: "Une seule couleur blanche" },
  },
  {
    id: "auto",
    label: { en: "Automatic", fr: "Automatique" },
    hint: { en: "White on dark sidebars", fr: "Blanc sur les barres foncées" },
  },
] as const satisfies ReadonlyArray<{ id: string; label: Record<Locale, string>; hint: Record<Locale, string> }>;

export type SidebarThemeId = (typeof sidebarThemes)[number]["id"];
export type LogoAppearance = (typeof logoAppearances)[number]["id"];

export type SidebarAppearance = {
  sidebarTheme: SidebarThemeId;
  logoAppearance: LogoAppearance;
};

export const DEFAULT_SIDEBAR_THEME: SidebarThemeId = "white";
export const DEFAULT_LOGO_APPEARANCE: LogoAppearance = "original";

// New profiles get the defaults written by the profiles schema. Profiles created
// before themes existed have no stored value and keep the navy sidebar they had.
const LEGACY_SIDEBAR_THEME: SidebarThemeId = "bumex";

export function isSidebarThemeId(value: unknown): value is SidebarThemeId {
  return sidebarThemes.some((theme) => theme.id === value);
}

export function isLogoAppearance(value: unknown): value is LogoAppearance {
  return logoAppearances.some((option) => option.id === value);
}

export function resolveSidebarAppearance(
  profile: { sidebar_theme?: string | null; logo_appearance?: string | null } | null,
): SidebarAppearance {
  return {
    sidebarTheme: isSidebarThemeId(profile?.sidebar_theme) ? profile.sidebar_theme : LEGACY_SIDEBAR_THEME,
    logoAppearance: isLogoAppearance(profile?.logo_appearance) ? profile.logo_appearance : DEFAULT_LOGO_APPEARANCE,
  };
}
