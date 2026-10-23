import type { BumexEntityCode } from "@/types/entity";

// ERP access is a second dimension next to the BUMEX One role (profiles.role), stored in Postgres (erp.user_access).
export const erpRoles = ["admin", "partner", "raf", "manager", "accountant", "staff", "intern"] as const;
export type ErpRole = (typeof erpRoles)[number];

// Missions, tasks and planning are not ERP modules: BUMEX One's projects, tickets and staffing hold them.
export const erpModuleKeys = [
  "accounting",
  "clients",
  "suppliers",
  "bank",
  "assets",
  "hr",
  "tax",
  "archives",
  "reports",
  "consolidation",
] as const;
export type ErpModuleKey = (typeof erpModuleKeys)[number];

// One row of erp.user_access. null entityCodes = every entity; null modules = the role's modules.
export type ErpAccessGrant = {
  userId: string;
  role: ErpRole;
  entityCodes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
  grantedBy: string;
  grantedAt: string;
  updatedBy: string | null;
  updatedAt: string;
};

// What a signed-in person may open, with the modules resolved from the role when none were chosen.
export type ErpAccess = {
  role: ErpRole;
  entityCodes: BumexEntityCode[] | null;
  modules: ErpModuleKey[];
};
