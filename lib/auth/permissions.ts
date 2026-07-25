import type { AppRole, PermissionSet } from "@/types/auth";
import type { AppRouteKey, NavigationGroup } from "@/types/navigation";

type RoleSource =
  | AppRole
  | null
  | {
      role: AppRole | null;
      is_super_admin?: boolean;
    }
  | {
      profile: {
        role: AppRole | null;
        is_super_admin?: boolean;
      } | null;
    };

function resolveRole(source: RoleSource) {
  if (!source) {
    return null;
  }

  if (typeof source === "string") {
    return source;
  }

  if ("profile" in source) {
    return source.profile?.role ?? null;
  }

  return source.role;
}

export const roleLabels: Record<AppRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  supervisor: "Supervisor",
  employee: "Employee",
  shareholder: "Shareholder",
};

export const routeAccess: Record<AppRouteKey, AppRole[]> = {
  overview: ["admin", "manager", "supervisor", "employee", "shareholder"],
  projects: ["admin", "manager", "supervisor", "employee", "shareholder"],
  tickets: ["admin", "manager", "supervisor", "employee", "shareholder"],
  "my-work": ["admin", "manager", "supervisor", "employee"],
  planning: ["admin", "manager", "supervisor", "employee", "shareholder"],
  roadmap: ["admin", "manager", "supervisor", "employee", "shareholder"],
  calendar: ["admin", "manager", "supervisor", "employee", "shareholder"],
  team: ["admin", "manager", "supervisor", "employee", "shareholder"],
  reports: ["admin", "manager", "supervisor", "employee", "shareholder"],
  notifications: ["admin", "manager", "supervisor", "employee", "shareholder"],
  clients: ["admin", "manager", "shareholder"],
  contracts: ["admin", "manager", "shareholder"],
  documents: ["admin", "manager", "shareholder"],
  finance: ["admin", "manager", "shareholder"],
  activity: ["admin"],
  shareholders: ["admin", "manager", "shareholder"],
  settings: ["admin", "manager", "supervisor", "employee", "shareholder"],
};

export function isManagerLikeRole(role: AppRole | null) {
  return role === "manager" || role === "supervisor";
}

export function canRoleAccessRoute(role: AppRole | null, route: AppRouteKey) {
  if (!role) {
    return false;
  }

  return routeAccess[route].includes(role);
}

export function isShareholder(source: RoleSource) {
  return resolveRole(source) === "shareholder";
}

export function canViewShareholderDashboard(source: RoleSource) {
  const role = resolveRole(source);
  return role === "admin" || role === "manager" || role === "shareholder";
}

export function canViewSensitiveFinance(source: RoleSource) {
  const role = resolveRole(source);
  return role === "admin" || role === "manager";
}

export function canViewInternalTickets(source: RoleSource) {
  const role = resolveRole(source);
  return role === "admin" || role === "manager" || role === "supervisor" || role === "employee";
}

export function canViewBankDetails(source: RoleSource) {
  const role = resolveRole(source);
  return role === "admin" || role === "manager";
}

export function canViewEmployeePerformanceDetails(source: RoleSource) {
  const role = resolveRole(source);
  return role === "admin" || role === "manager" || role === "supervisor";
}

export function getDefaultRouteForRole(role: AppRole | null) {
  if (!role) {
    return "/login";
  }

  return "/overview";
}

export function filterNavigationGroupsByRole(
  groups: NavigationGroup[],
  role: AppRole | null,
) {
  if (!role) {
    return [];
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.allowedRoles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export function buildPermissionSet(role: AppRole | null): PermissionSet {
  return buildPermissionSetForContext({ role, isSuperAdmin: false });
}

export function buildPermissionSetForContext({
  role,
  isSuperAdmin,
}: {
  role: AppRole | null;
  isSuperAdmin: boolean;
}): PermissionSet {
  return {
    role,
    isSuperAdmin,
    isAdmin: role === "admin" || isSuperAdmin,
    isManager: role === "manager",
    isSupervisor: role === "supervisor",
    isEmployee: role === "employee",
    isShareholder: role === "shareholder",
    canSwitchEntities: role === "admin" || isSuperAdmin,
    canAccessRoute: (route) => canRoleAccessRoute(role, route),
    canAccessFinance: role === "admin" || role === "manager" || role === "shareholder",
    canManageProjects: role === "admin" || role === "manager" || role === "supervisor",
    canViewShareholderArea: canViewShareholderDashboard(role),
    canViewSensitiveFinance: canViewSensitiveFinance(role),
    canViewInternalTickets: canViewInternalTickets(role),
    canViewBankDetails: canViewBankDetails(role),
    canViewEmployeePerformanceDetails: canViewEmployeePerformanceDetails(role),
  };
}
