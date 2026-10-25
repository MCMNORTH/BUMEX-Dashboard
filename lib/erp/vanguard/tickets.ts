import "server-only";

import type { Task } from "@/lib/erp/engine";
import { createClient } from "@/lib/firebase/server";
import type { TicketPriority, TicketStatus, TicketType } from "@/types/ticket";

// Vanguard's tasks are BUMEX One's tickets: read here for the person (BUMEX One's row policies apply) and shown as the
// engine's tasks (the Tasks room, the bottom bar, the floors' signals, the missions' cards). They are created and
// moved through BUMEX One's ticket actions (vanguard/one/Tasks.tsx); the ERP never writes them.

export type VanguardTicket = {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: TicketStatus;
  stage_id: string | null; // the column of its board (BUMEX One's workflows); resolved in the browser (vanguard/one/Board.tsx)
  priority: TicketPriority;
  type: TicketType;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

// What Vanguard's screens read of a ticket beyond the engine's task (vanguard/one/Tasks.tsx).
export type TaskTicket = Pick<VanguardTicket, "project_id" | "assignee_id" | "reporter_id" | "status" | "stage_id" | "priority" | "type">;

// A task with no due date sorts after every dated one and is never late.
export const NO_DUE_DATE = "9999-12-31";

export async function listTickets(): Promise<VanguardTicket[]> {
  const db = await createClient();
  if (!db) return [];
  const { data, error } = await db
    .from("tasks")
    .select("id, title, description, project_id, assignee_id, reporter_id, status, stage_id, priority, type, due_date, created_at, updated_at")
    .neq("status", "archived")
    .returns<VanguardTicket[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

// The engine's task for a ticket of a mission the person sees (by its project); tickets of no mission stay in BUMEX One.
export function ticketTasks(
  tickets: VanguardTicket[],
  missions: { id: string; entityId: string; customerId?: string; projectId?: string }[],
  names: Map<string, string>,
): (Task & { ticket: TaskTicket })[] {
  const byProject = new Map(missions.filter((m) => m.projectId).map((m) => [m.projectId!, m]));
  return tickets.flatMap((t) => {
    const mission = byProject.get(t.project_id);
    if (!mission) return [];
    const done = t.status === "done";
    return [{
      id: t.id,
      entityId: mission.entityId,
      title: t.title,
      module: "missions",
      engagementId: mission.id,
      customerId: mission.customerId,
      assignee: (t.assignee_id && names.get(t.assignee_id)) || "—",
      dueDate: t.due_date?.slice(0, 10) || NO_DUE_DATE,
      status: done ? "done" : t.status === "backlog" || t.status === "todo" ? "todo" : "in_progress",
      priority: t.priority === "urgent" || t.priority === "high" ? "high" : t.priority === "low" ? "low" : "normal",
      createdAt: t.created_at.slice(0, 10),
      completedAt: done ? t.updated_at.slice(0, 10) : undefined,
      notes: t.description || undefined,
      ticket: { project_id: t.project_id, assignee_id: t.assignee_id, reporter_id: t.reporter_id, status: t.status, stage_id: t.stage_id ?? null, priority: t.priority, type: t.type },
    }];
  });
}
