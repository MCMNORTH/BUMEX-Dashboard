import type { Locale } from "@/lib/i18n/config";
import { bumexEntityCodes, type BumexEntity, type BumexEntityCode } from "@/types/entity";

export const activeEntityCookieName = "bumex-active-entity";

export const bumexEntities: BumexEntity[] = [
  {
    code: "bumex_holding",
    shortLabel: "Holding",
    name: "BUMEX Holding",
    logoPath: null,
    billingName: "BUMEX Holding",
    title: {
      fr: "Pilotage strat\u00e9gique \u00e0 l\u2019\u00e9chelle du groupe Bumex.",
      en: "Strategic oversight across the Bumex group.",
    },
    description: {
      fr: "R\u00e9serv\u00e9 \u00e0 la supervision centrale et \u00e0 la visibilit\u00e9 op\u00e9rationnelle de haut niveau.",
      en: "Reserved for the central supervision layer and high-level operational visibility.",
    },
    primaryColor: "#14386b",
    secondaryColor: "#7ea6e5",
    available: false,
  },
  {
    code: "bumex_sa",
    shortLabel: "SA",
    name: "BUMEX SA",
    logoPath: "/entities/bumex-sa.png",
    billingName: "BUMEX S.A",
    title: {
      fr: "Op\u00e9rations corporate et ex\u00e9cution commerciale.",
      en: "Core corporate operations and commercial execution.",
    },
    description: {
      fr: "Administration, gouvernance partag\u00e9e et fonctions centrales de livraison.",
      en: "Business administration, shared governance, and corporate delivery functions.",
    },
    primaryColor: "#213f73",
    secondaryColor: "#7ea6e5",
    available: true,
  },
  {
    code: "bumex_audit",
    shortLabel: "Audit",
    name: "BUMEX Audit",
    logoPath: "/entities/bumex-audit.png",
    billingName: "BUMEX Audit",
    title: {
      fr: "Ex\u00e9cution des audits, contr\u00f4le et assurance.",
      en: "Audit execution, control work, and assurance visibility.",
    },
    description: {
      fr: "Un espace d\u00e9di\u00e9 aux \u00e9quipes d\u2019audit, au suivi des missions et \u00e0 la rigueur d\u2019ex\u00e9cution.",
      en: "A focused environment for audit teams, mission tracking, and delivery discipline.",
    },
    primaryColor: "#1f3d71",
    secondaryColor: "#84aef1",
    available: true,
  },
  {
    code: "bumex_mauritanie",
    shortLabel: "Mauritanie",
    name: "BUMEX Mauritanie",
    logoPath: "/entities/bumex-mauritanie.png",
    billingName: "BUMEX Mauritanie",
    title: {
      fr: "Op\u00e9rations mauritaniennes, \u00e9quipes et ex\u00e9cution r\u00e9gionale.",
      en: "Mauritanian operations, teams, and regional execution.",
    },
    description: {
      fr: "Un espace local pour les \u00e9quipes, les projets et la supervision financi\u00e8re en Mauritanie.",
      en: "A local operating shell for people, work, and financial oversight in Mauritania.",
    },
    primaryColor: "#1f3f73",
    secondaryColor: "#7ea6e5",
    available: true,
  },
  {
    code: "bumex_maroc",
    shortLabel: "Maroc",
    name: "BUMEX Maroc",
    logoPath: null,
    billingName: "BUMEX Maroc",
    title: {
      fr: "Op\u00e9rations marocaines et d\u00e9ploiement r\u00e9gional \u00e0 venir.",
      en: "Moroccan operations and future regional delivery.",
    },
    description: {
      fr: "L\u2019entit\u00e9 est pr\u00eate. Le logo final pourra \u00eatre appliqu\u00e9 d\u00e8s r\u00e9ception de l\u2019identit\u00e9 visuelle.",
      en: "The entity is ready. The final logo can be applied as soon as the visual identity is delivered.",
    },
    primaryColor: "#104f86",
    secondaryColor: "#7cc7ff",
    available: true,
  },
  {
    code: "bumex_advisory",
    shortLabel: "Advisory",
    name: "BUMEX Advisory",
    logoPath: null,
    billingName: "BUMEX Advisory",
    title: {
      fr: "Missions de conseil, visibilit\u00e9 consulting et support client premium.",
      en: "Advisory workstreams, consulting visibility, and premium client support.",
    },
    description: {
      fr: "L\u2019entit\u00e9 est active. Le logo Advisory pourra \u00eatre appliqu\u00e9 d\u00e8s validation de l\u2019identit\u00e9 visuelle.",
      en: "The entity is active. The Advisory logo can be applied as soon as the visual identity is approved.",
    },
    primaryColor: "#183d70",
    secondaryColor: "#9ab6ea",
    available: true,
  },
  {
    code: "bumex_avocat",
    shortLabel: "Avocat",
    name: "BUMEX Avocat",
    logoPath: "/entities/bumex-avocat.png",
    billingName: "BUMEX Avocat",
    title: {
      fr: "Pilotage juridique, dossiers contentieux et execution du pole avocat.",
      en: "Legal operations, casework, and execution for the law practice.",
    },
    description: {
      fr: "L'espace dedie aux affaires juridiques, au suivi des dossiers et a la coordination des interventions avocat.",
      en: "A dedicated environment for legal matters, case tracking, and lawyer coordination.",
    },
    primaryColor: "#b88400",
    secondaryColor: "#f3c44f",
    available: true,
  },
  {
    code: "bumex_it",
    shortLabel: "IT",
    name: "BUMEX IT",
    logoPath: "/entities/bumex-it.png",
    billingName: "BUMEX IT",
    title: {
      fr: "Livraison digitale, op\u00e9rations produit et ex\u00e9cution technique.",
      en: "Digital delivery, product operations, and technical execution.",
    },
    description: {
      fr: "L\u2019espace op\u00e9rationnel actuel et le point d\u2019ancrage par d\u00e9faut des anciennes donn\u00e9es internes.",
      en: "The current operational workspace and default home for legacy internal data.",
    },
    primaryColor: "#1d4e89",
    secondaryColor: "#7ea6e5",
    available: true,
  },
];

export const bumexEntityMap = new Map<BumexEntityCode, BumexEntity>(
  bumexEntities.map((entity) => [entity.code, entity]),
);

export function getBumexEntity(code: BumexEntityCode | null | undefined) {
  if (!code) {
    return null;
  }

  return bumexEntityMap.get(code) ?? null;
}

export function isBumexEntityCode(value: string | null | undefined): value is BumexEntityCode {
  return Boolean(value && bumexEntityMap.has(value as BumexEntityCode));
}

export const selectableEntityCodes = bumexEntityCodes;
export const availableEntityCodes = bumexEntities
  .filter((entity) => entity.available)
  .map((entity) => entity.code) as BumexEntityCode[];

export function getEntityCopy(entity: BumexEntity, locale: Locale) {
  return {
    title: entity.title[locale] ?? entity.title.en,
    description: entity.description[locale] ?? entity.description.en,
  };
}
