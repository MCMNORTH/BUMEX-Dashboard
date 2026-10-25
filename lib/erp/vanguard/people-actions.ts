"use server";

import { listErpAccessGrants } from "@/lib/erp/access";
import { requireErpAccess } from "@/lib/erp/server";
import { floors } from "@/lib/erp/vanguard/load";
import { getTeamMembers } from "@/lib/team/service";
import type { AvailabilityStatus } from "@/types/auth";
import type { ErpRole } from "@/types/erp";
import type { TeamWorkloadLevel } from "@/types/team";

// The HR room's "Personnes" tab (vanguard/one/People.tsx): everyone in BUMEX One's team, as its Team page showed them
// (BUMEX One's rules: shareholders see no one), with their Vanguard role. Their HR record, when they have one, comes
// from the room's own state, which only people with the HR module receive.
export type PersonRow = {
  id: string;
  name: string;
  email: string;
  floor: string | null; // the Vanguard floor code (AUD, IT…)
  jobTitle: string | null;
  department: string | null;
  role: ErpRole | null;
  availability: AvailabilityStatus;
  capacity: number;
  projects: number;
  tasks: number;
  overdue: number;
  workload: TeamWorkloadLevel;
};

export async function peopleAction(): Promise<PersonRow[]> {
  const { auth } = await requireErpAccess();
  const [members, grants] = await Promise.all([
    getTeamMembers(auth.role),
    listErpAccessGrants(auth.profile.id).catch(() => new Map<string, { role: ErpRole }>()),
  ]);
  return members
    .map((m) => ({
      id: m.id,
      name: m.full_name || m.email,
      email: m.email,
      floor: m.entity_code ? (floors[m.entity_code]?.code ?? null) : null,
      jobTitle: m.job_title,
      department: m.department,
      role: grants.get(m.id)?.role ?? null,
      availability: m.availability_status,
      capacity: m.weekly_capacity_hours,
      projects: m.active_projects_count,
      tasks: m.active_tasks_count,
      overdue: m.overdue_tasks_count,
      workload: m.workload_level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
