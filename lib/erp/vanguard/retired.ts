import "server-only";

import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/server";
import { getOrProvisionErpAccess } from "@/lib/erp/roles";

// BUMEX One's pages that moved into Vanguard's rooms: people with ERP access are sent to the room (the frame opens it
// from /vanguard?room=…&tab=…, components/vanguard/vanguard-shell.tsx); the others, whose ERP access was removed,
// keep BUMEX One's page. Choices of 2026-10-25 (step 3 of the merge).
export type RetiredPage =
  | "overview"
  | "projects"
  | "tickets"
  | "clients"
  | "staffing"
  | "planning"
  | "team"
  | "activity"
  | "reports"
  | "settings"
  | "settings/roles"
  | "settings/appearance";

const ROOMS: Record<RetiredPage, string> = {
  overview: "/vanguard?room=myday",
  projects: "/vanguard?room=missions",
  tickets: "/vanguard?room=tasks",
  clients: "/vanguard?room=clients&tab=customers",
  staffing: "/vanguard?room=missions&tab=planning",
  planning: "/vanguard?room=missions&tab=week",
  team: "/vanguard?room=hr&tab=people",
  activity: "/vanguard?room=settings&tab=history",
  reports: "/vanguard?room=reports&tab=activity",
  // the account's own pages stay (profile, preferences, security, users); the roles are Vanguard's
  settings: "/settings/profile",
  "settings/roles": "/vanguard?room=settings&tab=access",
  // one design, Vanguard's: no theme to choose
  "settings/appearance": "/settings/profile",
};

export async function movedToVanguard(page: RetiredPage) {
  const { profile } = await getAuthContext();
  if (profile && (await getOrProvisionErpAccess(profile))) redirect(ROOMS[page]);
}
