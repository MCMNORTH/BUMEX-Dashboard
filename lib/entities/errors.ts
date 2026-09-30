import { getEntityConstraintErrorMessage } from "@/lib/entities/runtime";

export const missingEntityColumnMessage =
  "The live database is missing the `entity_code` field. Apply `supabase/entities-foundation.sql` before editing entities.";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim();
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message.trim();
  }

  return "";
}

export function normalizeEntityMutationError(
  error: unknown,
  entityCode?: string | null,
  fallback = "The entity could not be updated.",
) {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();

  if (!message) {
    return fallback;
  }

  if (
    normalized.includes("profiles_entity_code_chk")
    || (normalized.includes("violates check constraint") && normalized.includes("profiles"))
  ) {
    return getEntityConstraintErrorMessage(entityCode);
  }

  if (
    normalized.includes("entity_code")
    && (normalized.includes("schema cache") || normalized.includes("column") || normalized.includes("field"))
  ) {
    return missingEntityColumnMessage;
  }

  return message;
}
