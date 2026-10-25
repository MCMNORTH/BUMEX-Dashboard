import "server-only";

import { DomainError } from "@/lib/erp/engine";
import { ReplayError } from "@/lib/erp/vanguard/replay";
import { VanguardSaveError } from "@/lib/erp/vanguard/save";
import { TableRefusal } from "@/lib/erp/vanguard/tables";
import type { Locale } from "@/lib/i18n/config";

type Rule = { code: string; match?: RegExp; fr: string; en: string };

// The database guards (0001–0006) raise technical English; these are the sentences Vanguard shows.
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
  { code: "P0002", match: /requester cannot decide/, fr: "Le demandeur ne peut pas décider de sa propre demande.", en: "The requester cannot decide their own request." },
  { code: "P0002", match: /already decided/, fr: "Demande déjà traitée.", en: "Request already decided." },
  { code: "P0002", match: /only a partner/, fr: "Réservé aux associés, au RAF et à l'administrateur.", en: "Only partners, the finance lead and the administrator may do this." },
  { code: "P0001", match: /immutable|cannot be deleted/, fr: "Écriture comptabilisée : elle ne change plus (passer par une extourne).", en: "Posted entry: it no longer changes (reverse it instead)." },
  { code: "P0005", match: /posted entries and must be kept/, fr: "Ce journal porte des écritures comptabilisées : il est conservé.", en: "This journal carries posted entries and is kept." },
  { code: "P0005", match: /draft entries/, fr: "Ce journal porte des brouillons : les supprimer ou les déplacer d'abord.", en: "This journal carries drafts: delete or move them first." },
  { code: "P0005", match: /journal code/, fr: "Code de journal : 1 à 6 lettres ou chiffres.", en: "Journal code: 1 to 6 letters or digits." },
  { code: "P0005", match: /kind is locked/, fr: "Ce journal porte des écritures comptabilisées : son type ne change plus.", en: "This journal carries posted entries: its kind is locked." },
  { code: "P0005", match: /statutory/, fr: "Compte statutaire : numéro, classe et nature sont verrouillés.", en: "Statutory account: code, class and kind are locked." },
  { code: "P0005", match: /third-party code|already used by another|auxiliary account .* already exists/, fr: "Code de tiers invalide ou déjà utilisé (2 à 12 lettres ou chiffres).", en: "Third-party code invalid or already used (2 to 12 letters or digits)." },
  { code: "P0005", match: /collective/, fr: "Compte collectif inconnu ou inactif pour cette entité.", en: "Collective account unknown or inactive for this entity." },
  { code: "P0005", match: /bank account|ledger account|bank name|journal .* is not a bank/, fr: "Compte bancaire refusé : nom, banque, compte comptable imputable et journal de banque requis ; devise et compte verrouillés une fois mouvementé.", en: "Bank account refused: name, bank, a postable ledger account and a bank journal are required; currency and account lock once used." },
  { code: "P0005", match: /inactive: no new operation/, fr: "Compte bancaire clôturé : plus aucune opération.", en: "Closed bank account: no new operation." },
  { code: "P0005", match: /instalment|schedule/, fr: "Échéancier refusé : échéances payées figées, dates dans l'ordre, capital dans la limite de l'emprunt.", en: "Schedule refused: paid instalments are frozen, dates in order, capital within the loan." },
  { code: "P0002", match: /loan .* is closed|must be paid first|exceeds the principal/, fr: "Échéance refusée : emprunt clôturé, échéance précédente non payée ou capital dépassé.", en: "Instalment refused: loan closed, previous one unpaid or principal exceeded." },
  { code: "P0002", match: /depreciation|plan is locked|residual value|useful life/, fr: "Immobilisation refusée : plan figé après dotation, valeur résiduelle et durée (6 à 600 mois) à vérifier.", en: "Asset refused: plan locked once depreciated; check residual value and life (6 to 600 months)." },
  { code: "P0002", match: /payroll/, fr: "Paie comptabilisée : elle ne change plus.", en: "Posted payroll: it no longer changes." },
  { code: "P0002", match: /already assigned|employee is not active/, fr: "Affectation refusée : déjà affecté sur ces dates ou collaborateur sorti.", en: "Assignment refused: already assigned on these dates or employee gone." },
  { code: "P0001", match: /not_completed/, fr: "Seule une mission terminée s'archive.", en: "Only a completed engagement can be archived." },
  { code: "P0001", match: /rack_full/, fr: "Le rayonnage est plein.", en: "The rack is full." },
  { code: "P0001", match: /cannot remove their own/, fr: "Un administrateur ERP ne peut pas retirer son propre accès.", en: "An ERP administrator cannot remove their own access." },
  { code: "23505", fr: "Ce code ou ce numéro existe déjà.", en: "This code or number already exists." },
  { code: "23503", fr: "Cet élément est encore utilisé ailleurs.", en: "This item is still used elsewhere." },
];

// The engine's refusals are already worded (in French, as the screens); the database's go through the rules.
export function vanguardErrorMessage(error: unknown, locale: Locale) {
  if (error instanceof DomainError || error instanceof ReplayError || error instanceof VanguardSaveError || error instanceof TableRefusal) {
    return error.message;
  }
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  const rule = rules.find((r) => r.code === code && (!r.match || r.match.test(message)));
  if (rule) {
    return rule[locale];
  }
  console.error("[erp:vanguard]", code, message);
  return locale === "fr" ? "La modification n'a pas pu être enregistrée." : "The change could not be saved.";
}
