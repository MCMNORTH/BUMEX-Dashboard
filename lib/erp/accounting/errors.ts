import "server-only";

import type { Locale } from "@/lib/i18n/config";

// A refusal meant for the person (already worded): shown as is.
export class AccountingError extends Error {}

type Rule = { code: string; match?: RegExp; fr: string; en: string };

// The database guards (0001–0006) raise technical English; these are the sentences the pages show.
const rules: Rule[] = [
  { code: "42501", match: /cannot post/, fr: "Votre rôle ERP ne permet pas de comptabiliser.", en: "Your ERP role cannot post entries." },
  { code: "42501", fr: "Votre rôle ERP ne permet pas cette action.", en: "Your ERP role does not allow this action." },
  { code: "P0003", fr: "Écriture déséquilibrée : le total des débits doit égaler celui des crédits.", en: "Unbalanced entry: debits must equal credits." },
  { code: "P0004", match: /customer or supplier/, fr: "Une ligne exige un client ou un fournisseur.", en: "A line needs its customer or supplier." },
  { code: "P0004", match: /dimension/, fr: "Une ligne exige une dimension (client, fournisseur ou mission).", en: "A line misses a required dimension." },
  { code: "P0004", fr: "Un compte n'est pas imputable pour cette entité (regroupement, bloqué ou désactivé).", en: "An account cannot be posted to for this entity (grouping, blocked or inactive)." },
  { code: "P0002", match: /soft-closed/, fr: "Période en clôture douce : seuls les associés, le RAF et l'administrateur comptabilisent.", en: "Soft-closed period: only partners, the finance lead and the administrator post." },
  { code: "P0002", match: /period .* is locked/, fr: "Période verrouillée.", en: "The period is locked." },
  { code: "P0002", match: /fiscal year of entry .* is closed/, fr: "Exercice clôturé.", en: "The fiscal year is closed." },
  { code: "P0002", match: /outside period/, fr: "La date est en dehors de la période.", en: "The date is outside the period." },
  { code: "P0002", match: /unlocked periods/, fr: "L'exercice a encore des périodes non verrouillées.", en: "The fiscal year still has unlocked periods." },
  { code: "P0002", match: /draft entries/, fr: "Il reste des brouillons dans la période ou l'exercice : les comptabiliser ou les supprimer.", en: "Drafts remain in the period or year: post or delete them first." },
  { code: "P0002", match: /only a partner/, fr: "Réservé aux associés, au RAF et à l'administrateur.", en: "Only partners, the finance lead and the administrator may do this." },
  { code: "P0002", match: /out of range/, fr: "Année hors limites.", en: "Year out of range." },
  { code: "P0001", match: /immutable|cannot be deleted/, fr: "Écriture comptabilisée : elle ne change plus (passer par une extourne).", en: "Posted entry: it no longer changes (reverse it instead)." },
  { code: "P0005", match: /posted entries and must be kept/, fr: "Ce journal porte des écritures comptabilisées : il est conservé.", en: "This journal carries posted entries and is kept." },
  { code: "P0005", match: /draft entries/, fr: "Ce journal porte des brouillons : les supprimer ou les déplacer d'abord.", en: "This journal carries drafts: delete or move them first." },
  { code: "P0005", match: /journal code/, fr: "Code de journal : 1 à 6 lettres ou chiffres.", en: "Journal code: 1 to 6 letters or digits." },
  { code: "P0005", match: /kind is locked/, fr: "Ce journal porte des écritures comptabilisées : son type ne change plus.", en: "This journal carries posted entries: its kind is locked." },
  { code: "P0005", match: /statutory/, fr: "Compte statutaire : numéro, classe et nature sont verrouillés.", en: "Statutory account: code, class and kind are locked." },
  { code: "23505", fr: "Ce code existe déjà.", en: "This code already exists." },
];

export function accountingErrorMessage(error: unknown, locale: Locale, fallback: { fr: string; en: string }) {
  if (error instanceof AccountingError) {
    return error.message;
  }
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  const rule = rules.find((r) => r.code === code && (!r.match || r.match.test(message)));
  if (rule) {
    return rule[locale];
  }
  console.error("[erp:accounting]", code, message);
  return fallback[locale];
}
