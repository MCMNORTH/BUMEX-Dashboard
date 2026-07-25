import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

import type { Locale } from "@/lib/i18n/config";

export const dictionaries = {
  en,
  fr,
} as const satisfies Record<Locale, Record<string, unknown>>;

export type Dictionary = (typeof dictionaries)[Locale];
