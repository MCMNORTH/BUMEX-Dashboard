"use server";

import { getActivityLogs } from "@/lib/activity/service";
import { getActivityEntityUrl, getActivityLabel, getActivityMetadataSummary } from "@/lib/activity/presentation";
import { canRoleAccessRoute } from "@/lib/auth/permissions";
import { requireErpAccess } from "@/lib/erp/server";

// BUMEX One's half of the one History (vanguard/one/History.tsx): its activity log (projects, tickets, clients,
// contracts…), for the people its Activity page was for, cleaned for their role as that page did. The ERP's half is
// the audit log already in Vanguard's state.
export type BumexOneEvent = {
  id: string;
  at: string;
  who: string;
  action: string;
  object: string;
  detail: string;
  url: string | null;
};

export async function bumexOneHistoryAction(): Promise<BumexOneEvent[]> {
  const { auth } = await requireErpAccess();
  if (!canRoleAccessRoute(auth.role, "activity")) return [];
  const activities = await getActivityLogs({ role: auth.role, currentUserId: auth.profile.id, limit: 300 }).catch(() => []);
  return activities.map((a) => ({
    id: a.id,
    at: a.created_at,
    who: a.user?.full_name || a.user?.email || "",
    action: a.action,
    object: getActivityLabel(a.entity_type),
    detail: getActivityMetadataSummary(a) ?? "",
    url: getActivityEntityUrl(a),
  }));
}
