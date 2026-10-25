"use server";

import { canRoleAccessRoute, isManagerLikeRole } from "@/lib/auth/permissions";
import { getCalendarEvents } from "@/lib/calendar/service";
import { getContracts } from "@/lib/contracts/service";
import { requireErpAccess } from "@/lib/erp/server";
import { getRoadmapFilterData, getRoadmapProjects } from "@/lib/roadmap/service";
import type { CalendarEventType } from "@/types/calendar";
import type { MilestoneStatus } from "@/types/milestone";

// The Missions room's "Calendrier" and "Jalons" tabs (vanguard/one/Calendar.tsx, vanguard/one/Milestones.tsx): BUMEX
// One's Calendar and Roadmap pages, moved there (choice of 2026-10-25). Read with BUMEX One's rules for the person.

export type CalendarItem = {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  who: string | null;
  status: string | null;
  // what opens it: a ticket, a mission, a contract
  open: { kind: "ticket" | "mission" | "contract"; id: string } | null;
};

export async function calendarAction(): Promise<CalendarItem[]> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  const [events, contracts] = await Promise.all([
    getCalendarEvents(role),
    canRoleAccessRoute(role, "contracts") ? getContracts(role).catch(() => []) : Promise.resolve([]),
  ]);
  // BUMEX One's placeholder dates (billing windows, renewal checkpoints) were stand-ins: the contracts' real renewal
  // and end dates take their place
  const items: CalendarItem[] = events
    .filter((e) => e.entityType !== "placeholder")
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.date.slice(0, 10),
      projectId: e.projectId ?? null,
      projectName: e.projectName ?? null,
      clientName: e.clientName ?? null,
      who: e.assigneeName ?? null,
      status: e.status ? String(e.status) : null,
      open: e.entityType === "task" && e.entityId ? { kind: "ticket", id: e.entityId } : e.projectId ? { kind: "mission", id: e.projectId } : null,
    }));
  for (const c of contracts) {
    const date = c.renewal_date ?? c.end_date;
    if (!date || c.status === "archived") continue;
    items.push({
      id: `contract-${c.id}`,
      title: c.title,
      type: "contract_renewal",
      date: date.slice(0, 10),
      projectId: c.project_id,
      projectName: c.project?.name ?? null,
      clientName: c.client?.name ?? null,
      who: null,
      status: c.status,
      open: { kind: "contract", id: c.id },
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export type RoadmapLane = {
  id: string;
  name: string;
  status: string;
  health: string;
  start: string | null;
  end: string | null;
  clientName: string | null;
  ownerName: string | null;
  completion: number;
  milestones: { id: string; title: string; description: string | null; status: MilestoneStatus; dueDate: string; ownerId: string | null; ownerName: string | null; completedAt: string | null }[];
};

export type RoadmapData = { lanes: RoadmapLane[]; owners: { id: string; name: string }[]; canManage: boolean; me: string; role: string };

export async function roadmapAction(): Promise<RoadmapData> {
  const { auth } = await requireErpAccess();
  const [projects, filterData] = await Promise.all([getRoadmapProjects(), getRoadmapFilterData()]);
  return {
    lanes: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      health: p.health,
      start: p.start_date,
      end: p.end_date,
      clientName: p.client?.name ?? null,
      ownerName: p.owner?.full_name ?? null,
      completion: p.milestoneCompletion,
      milestones: p.milestones.map((m) => ({ id: m.id, title: m.title, description: m.description, status: m.status, dueDate: m.due_date.slice(0, 10), ownerId: m.owner_id, ownerName: m.owner?.full_name ?? null, completedAt: m.completed_at })),
    })),
    owners: filterData.owners.map((o) => ({ id: o.id, name: o.full_name })),
    canManage: auth.role === "admin" || isManagerLikeRole(auth.role),
    me: auth.profile.id,
    role: auth.role,
  };
}
