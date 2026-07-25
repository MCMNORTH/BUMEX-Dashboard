import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getBumexEntity } from "@/lib/entities/config";
import { normalizeEntityMutationError } from "@/lib/entities/errors";
import type { AppRole, AvailabilityStatus, Profile } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

export type SettingsUserFilters = {
  search?: string;
  role?: AppRole | "";
};

export type SettingsUserRecord = Pick<
  Profile,
  "id" | "full_name" | "email" | "role" | "is_super_admin" | "entity_code" | "availability_status" | "created_at"
> & {
  entity_name: string | null;
};

export type SettingsUsersResult = {
  users: SettingsUserRecord[];
  supportsEntityManagement: boolean;
};

function isMissingEntityFoundationColumn(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  return normalized.includes("is_super_admin") || normalized.includes("entity_code");
}

export async function getSettingsUsers(filters: SettingsUserFilters = {}) {
  const supabase = await createClient();

  if (!supabase) {
    return {
      users: [] satisfies SettingsUserRecord[],
      supportsEntityManagement: false,
    } satisfies SettingsUsersResult;
  }

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, is_super_admin, entity_code, availability_status, created_at")
    .order("full_name", { ascending: true });

  const search = filters.search?.trim();
  if (search) {
    const escapedSearch = search.replace(/[%_]/g, "\\$&");
    query = query.or(`full_name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`);
  }

  if (filters.role) {
    query = query.eq("role", filters.role);
  }

  let { data, error } = await query.returns<SettingsUserRecord[]>();

  const supportsEntityManagement = !isMissingEntityFoundationColumn(error?.message);

  if (error && isMissingEntityFoundationColumn(error.message)) {
    const legacyResponse = await supabase
      .from("profiles")
      .select("id, full_name, email, role, availability_status, created_at")
      .order("full_name", { ascending: true })
      .returns<Array<Omit<SettingsUserRecord, "is_super_admin" | "entity_code" | "entity_name">>>();

    data = (legacyResponse.data ?? []).map((user) => ({
      ...user,
      is_super_admin: false,
      entity_code: "bumex_it",
      entity_name: getBumexEntity("bumex_it")?.name ?? null,
    }));
    error = legacyResponse.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    users: (data ?? []).map((user) => ({
      ...user,
      entity_name: getBumexEntity(user.entity_code as BumexEntityCode | null)?.name ?? null,
    })),
    supportsEntityManagement,
  } satisfies SettingsUsersResult;
}

export async function updateSettingsUserRole(userId: string, role: AppRole) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateSettingsUserEntity(userId: string, entityCode: BumexEntityCode) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      entity_code: entityCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(normalizeEntityMutationError(error, entityCode));
  }
}

export function getAvailabilityLabel(status: AvailabilityStatus) {
  return status.replaceAll("_", " ");
}
