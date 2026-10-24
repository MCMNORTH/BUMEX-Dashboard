import type { Locale } from "@/lib/i18n/config";
import { erpModuleKeys, erpRoles, type ErpModuleKey, type ErpRole } from "@/types/erp";

export const erpRoleLabels: Record<ErpRole, Record<Locale, string>> = {
  admin: { fr: "Administrateur ERP", en: "ERP administrator" },
  partner: { fr: "Associé", en: "Partner" },
  raf: { fr: "Responsable administratif et financier", en: "Finance & administration lead" },
  manager: { fr: "Manager", en: "Manager" },
  accountant: { fr: "Comptable", en: "Accountant" },
  staff: { fr: "Collaborateur", en: "Staff" },
  intern: { fr: "Stagiaire", en: "Intern" },
};

// `step` is the step of the integration plan that brings the module's pages.
export const erpModules: Record<ErpModuleKey, { label: Record<Locale, string>; description: Record<Locale, string>; step: number }> = {
  accounting: {
    label: { fr: "Comptabilité", en: "Accounting" },
    description: { fr: "Plan comptable, journaux, écritures, grand livre, balance et clôture.", en: "Chart of accounts, journals, entries, general ledger, trial balance and closing." },
    step: 2,
  },
  reports: {
    label: { fr: "Rapports", en: "Reports" },
    description: { fr: "États financiers et synthèses par entité.", en: "Financial statements and summaries per entity." },
    step: 2,
  },
  clients: {
    label: { fr: "Clients et ventes", en: "Customers & sales" },
    description: { fr: "Factures, avoirs, encaissements, balance âgée et relances.", en: "Invoices, credit notes, receipts, aging and dunning." },
    step: 4,
  },
  suppliers: {
    label: { fr: "Fournisseurs", en: "Suppliers" },
    description: { fr: "Factures fournisseurs, approbations, règlements et dettes.", en: "Supplier invoices, approvals, payments and payables." },
    step: 4,
  },
  bank: {
    label: { fr: "Trésorerie", en: "Treasury" },
    description: { fr: "Comptes bancaires, rapprochement, prévisions et emprunts.", en: "Bank accounts, reconciliation, forecast and loans." },
    step: 4,
  },
  assets: {
    label: { fr: "Immobilisations", en: "Fixed assets" },
    description: { fr: "Registre, plans d’amortissement et dotations de fin d’exercice.", en: "Register, depreciation plans and year-end runs." },
    step: 5,
  },
  hr: {
    label: { fr: "Paie et RH", en: "Payroll & HR" },
    description: { fr: "Fiches de paie, cotisations, ITS et états de paie.", en: "Payslips, contributions, salary tax and payroll statements." },
    step: 5,
  },
  tax: {
    label: { fr: "Fiscalité", en: "Tax" },
    description: { fr: "TVA, retenues à la source, codes et règles de taxe.", en: "VAT, withholding, tax codes and rules." },
    step: 5,
  },
  archives: {
    label: { fr: "Archives", en: "Archives" },
    description: { fr: "Dossiers de mission archivés et leur emplacement.", en: "Archived engagement files and where they are." },
    step: 6,
  },
  consolidation: {
    label: { fr: "Consolidation groupe", en: "Group consolidation" },
    description: { fr: "Vue consolidée de la holding et des filiales.", en: "Consolidated view of the holding and its companies." },
    step: 6,
  },
};

// Modules whose pages exist (the others show the step that brings them).
export const erpModulePaths: Partial<Record<ErpModuleKey, string>> = {
  accounting: "/erp/accounting",
  reports: "/erp/accounting/trial-balance",
};

// From the ERP's ROLE_DEFAULT_MODULES, without the missions and tasks that BUMEX One keeps.
export const erpRoleDefaultModules: Record<ErpRole, readonly ErpModuleKey[]> = {
  admin: erpModuleKeys,
  partner: erpModuleKeys,
  raf: erpModuleKeys,
  manager: ["accounting", "bank", "clients", "suppliers", "assets", "hr", "tax", "archives", "reports"],
  accountant: ["accounting", "bank", "clients", "suppliers", "assets", "tax", "archives", "reports"],
  staff: ["archives"],
  intern: [],
};

// The group view stays with the people who decide at group level, whatever modules are chosen.
export const erpConsolidationRoles: readonly ErpRole[] = ["admin", "partner", "raf"];

export function resolveErpModules(role: ErpRole, modules: readonly ErpModuleKey[] | null): ErpModuleKey[] {
  const chosen = modules ?? erpRoleDefaultModules[role];
  return erpModuleKeys.filter((key) => chosen.includes(key) && (key !== "consolidation" || erpConsolidationRoles.includes(role)));
}

export function isErpRole(value: string): value is ErpRole {
  return (erpRoles as readonly string[]).includes(value);
}

export function isErpModuleKey(value: string): value is ErpModuleKey {
  return (erpModuleKeys as readonly string[]).includes(value);
}
