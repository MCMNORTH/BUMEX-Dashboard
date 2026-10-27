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

// The modules of the entities where a person's differ from their usual ones (consolidation is never an entity's).
export type ErpEntityModules = Partial<Record<BumexEntityCode, ErpModuleKey[]>>;

// One row of erp.user_access. null entityCodes = every entity; null modules = the role's modules; managesAccess = an
// administrator who changes everyone's access (the "role modifier", 0009); view3d = the building in 3D (0010).
export type ErpAccessGrant = {
  userId: string;
  role: ErpRole;
  entityCodes: BumexEntityCode[] | null;
  modules: ErpModuleKey[] | null;
  entityModules: ErpEntityModules | null;
  managesAccess: boolean;
  view3d: boolean;
  grantedBy: string;
  grantedAt: string;
  updatedBy: string | null;
  updatedAt: string;
};

// What a signed-in person may open, with the modules resolved from the role when none were chosen: modules on every
// entity they see, but those of entityModules (lib/erp/config.ts modulesOn).
export type ErpAccess = {
  role: ErpRole;
  entityCodes: BumexEntityCode[] | null;
  modules: ErpModuleKey[];
  entityModules: ErpEntityModules;
  managesAccess: boolean;
  view3d: boolean;
};
