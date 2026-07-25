import type { AppRole } from "@/types/auth";
import type { GlobalSearchEntityType, GlobalSearchResult } from "@/types/search";

type SearchUser = {
  id: string;
  role: AppRole;
};

const ROLE_ENTITY_ACCESS: Record<AppRole, GlobalSearchEntityType[]> = {
  admin: ["project", "ticket", "client", "contract", "document", "invoice", "payment", "team_member"],
  manager: ["project", "ticket", "client", "contract", "document", "invoice", "payment", "team_member"],
  supervisor: ["project", "ticket", "team_member"],
  employee: ["project", "ticket", "document", "team_member"],
  shareholder: ["project", "client", "document"],
};

function isShareholderSafeStatus(status: string | null) {
  if (!status) {
    return true;
  }

  return !["restricted", "draft_internal"].includes(status);
}

export function getSearchableEntitiesForRole(role: AppRole) {
  return ROLE_ENTITY_ACCESS[role];
}

export function canSearchEntity(user: SearchUser, entityType: GlobalSearchEntityType) {
  return getSearchableEntitiesForRole(user.role).includes(entityType);
}

export function canViewSearchResult(user: SearchUser, result: GlobalSearchResult) {
  if (!canSearchEntity(user, result.entityType)) {
    return false;
  }

  if (user.role === "employee") {
    if (result.entityType === "contract" || result.entityType === "invoice" || result.entityType === "payment") {
      return false;
    }
  }

  if (user.role === "shareholder") {
    if (result.entityType === "document") {
      return isShareholderSafeStatus(result.status) && result.description?.toLowerCase() !== "restricted";
    }

    if (result.entityType === "project" || result.entityType === "client") {
      return true;
    }

    return false;
  }

  return true;
}

export function sanitizeSearchResultForRole(result: GlobalSearchResult, role: AppRole): GlobalSearchResult {
  if (role === "shareholder") {
    if (result.entityType === "document") {
      return {
        ...result,
        description: result.description === "restricted" ? null : result.description,
        relatedLabel: null,
      };
    }

    if (result.entityType === "project" || result.entityType === "client") {
      return {
        ...result,
        description: result.description,
        relatedLabel: result.entityType === "client" ? null : result.relatedLabel,
      };
    }
  }

  if (role === "employee" && result.entityType === "document") {
    return {
      ...result,
      relatedLabel: result.relatedLabel === "payment" ? null : result.relatedLabel,
    };
  }

  return {
    ...result,
    description: result.description?.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[protected]") ?? null,
  };
}
