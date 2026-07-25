import type { AppRole } from "@/types/auth";
import type { ActivityEntityType, ActivityLogRecord, ActivityMetadata } from "@/types/activity";

type ActivityViewer = {
  role: AppRole;
  currentUserId?: string | null;
};

const SHAREHOLDER_ALLOWED_ENTITY_TYPES = new Set<ActivityEntityType>([
  "project",
  "milestone",
  "client",
  "contract",
  "payment",
  "finance",
  "report",
  "shareholder",
]);

const EMPLOYEE_ALLOWED_ENTITY_TYPES = new Set<ActivityEntityType>([
  "project",
  "milestone",
  "task",
  "ticket",
  "comment",
  "note",
  "profile",
]);

const MANAGER_BLOCKED_ENTITY_TYPES = new Set<ActivityEntityType>(["settings"]);
const EMPLOYEE_BLOCKED_ENTITY_TYPES = new Set<ActivityEntityType>([
  "finance",
  "payment",
  "transfer",
  "invoice",
  "receipt",
  "user",
  "settings",
  "report",
  "shareholder",
]);

const UNIVERSAL_SENSITIVE_METADATA_KEYS = new Set([
  "bank_account",
  "bank_details",
  "beneficiary_account",
  "beneficiary_bank",
  "internal_comment",
  "internal_notes",
  "private_comment",
  "private_notes",
  "secret",
  "secret_config",
  "service_role",
  "token",
  "password",
]);

const MANAGER_HIDDEN_METADATA_KEYS = new Set(["employee_performance", "employee_score", "security_scope"]);
const EMPLOYEE_HIDDEN_METADATA_KEYS = new Set([
  "employee_performance",
  "employee_score",
  "reference",
  "visibility",
]);
const SHAREHOLDER_HIDDEN_METADATA_KEYS = new Set([
  "employee_performance",
  "employee_score",
  "field",
  "from",
  "to",
  "reference",
  "note_id",
  "related_id",
  "visibility",
]);

function isSecuritySensitiveAction(activity: ActivityLogRecord) {
  const normalizedAction = activity.action.toLowerCase();
  const scope = String(activity.metadata.security_scope ?? "").toLowerCase();

  return (
    normalizedAction.includes("security")
    || normalizedAction.includes("password")
    || normalizedAction.includes("auth")
    || scope === "security"
  );
}

function isFinanceActivity(activity: ActivityLogRecord) {
  return ["finance", "invoice", "payment", "receipt", "transfer"].includes(activity.entity_type);
}

function isHighLevelShareholderActivity(activity: ActivityLogRecord) {
  const kind = activity.metadata.kind ?? "";
  const normalizedAction = activity.action.toLowerCase();

  if (activity.entity_type === "project") {
    return kind === "status_change" || normalizedAction.includes("status");
  }

  if (activity.entity_type === "milestone") {
    return normalizedAction.includes("completed") || normalizedAction.includes("delayed");
  }

  if (activity.entity_type === "contract") {
    return normalizedAction.includes("signed") || normalizedAction.includes("renewal") || normalizedAction.includes("expired");
  }

  if (activity.entity_type === "payment" || activity.entity_type === "finance") {
    return normalizedAction.includes("payment") || normalizedAction.includes("summary") || normalizedAction.includes("overdue");
  }

  if (activity.entity_type === "report" || activity.entity_type === "shareholder") {
    return true;
  }

  if (activity.entity_type === "client") {
    return Boolean(activity.metadata.summary);
  }

  return false;
}

export function canViewActivityLog(viewer: ActivityViewer, activity: ActivityLogRecord) {
  if (viewer.role === "admin") {
    return true;
  }

  if (viewer.role === "manager" || viewer.role === "supervisor") {
    if (MANAGER_BLOCKED_ENTITY_TYPES.has(activity.entity_type) && isSecuritySensitiveAction(activity)) {
      return false;
    }

    return true;
  }

  if (viewer.role === "employee") {
    if (EMPLOYEE_BLOCKED_ENTITY_TYPES.has(activity.entity_type) || isFinanceActivity(activity)) {
      return false;
    }

    if (!EMPLOYEE_ALLOWED_ENTITY_TYPES.has(activity.entity_type)) {
      return false;
    }

    if (activity.entity_type === "profile") {
      return activity.entity_id === viewer.currentUserId;
    }

    if (activity.entity_type === "comment" || activity.entity_type === "note") {
      return activity.user_id === viewer.currentUserId;
    }

    return true;
  }

  if (viewer.role === "shareholder") {
    if (!SHAREHOLDER_ALLOWED_ENTITY_TYPES.has(activity.entity_type)) {
      return false;
    }

    return isHighLevelShareholderActivity(activity);
  }

  return false;
}

export function canViewActivityMetadata(viewer: ActivityViewer, activity: ActivityLogRecord) {
  if (!canViewActivityLog(viewer, activity)) {
    return false;
  }

  if (viewer.role === "admin") {
    return true;
  }

  if (viewer.role === "manager" || viewer.role === "supervisor") {
    return !isSecuritySensitiveAction(activity);
  }

  if (viewer.role === "employee") {
    return activity.entity_type !== "comment" && activity.entity_type !== "note";
  }

  return viewer.role !== "shareholder" ? true : false;
}

export function sanitizeActivityMetadata(metadata: ActivityMetadata, role: AppRole) {
  const hiddenKeys = new Set(UNIVERSAL_SENSITIVE_METADATA_KEYS);

  if (role === "manager" || role === "supervisor") {
    MANAGER_HIDDEN_METADATA_KEYS.forEach((key) => hiddenKeys.add(key));
  }

  if (role === "employee") {
    EMPLOYEE_HIDDEN_METADATA_KEYS.forEach((key) => hiddenKeys.add(key));
  }

  if (role === "shareholder") {
    SHAREHOLDER_HIDDEN_METADATA_KEYS.forEach((key) => hiddenKeys.add(key));
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined && value !== null),
  ) as ActivityMetadata;
}

export function sanitizeActivityForRole(activity: ActivityLogRecord, role: AppRole) {
  const metadataVisible = role === "admin";
  const metadata = metadataVisible ? sanitizeActivityMetadata(activity.metadata, role) : {};

  return {
    ...activity,
    metadata,
    metadata_hidden: !metadataVisible,
  };
}

export function sanitizeActivityCollectionForViewer(
  activities: ActivityLogRecord[],
  viewer: ActivityViewer,
) {
  return activities
    .filter((activity) => canViewActivityLog(viewer, activity))
    .map((activity) => {
      const metadataVisible = canViewActivityMetadata(viewer, activity);
      // Sensitive audit metadata is stripped here so lower-privilege roles never receive raw values.
      const sanitizedMetadata = metadataVisible
        ? sanitizeActivityMetadata(activity.metadata, viewer.role)
        : {};

      return {
        ...activity,
        metadata: sanitizedMetadata,
        metadata_hidden: !metadataVisible,
      };
    });
}
