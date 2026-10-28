import "server-only";

import type { Task } from "@/lib/erp/engine";
import type { ErpTransaction } from "@/lib/erp/db";
import type { TicketPriority, TicketStatus, TicketType } from "@/types/ticket";

// Vanguard's tasks are the tickets (erp.task, 0008): read in the person's session (BUMEX One's rules apply) and shown
// as the engine's tasks (the Tasks room, the bottom bar, the floors' signals, the missions' cards). They are created and
// moved through the ticket actions (vanguard/one/Tasks.tsx); the engine never writes them (save.ts).

export type VanguardTicket = {
  id: string;
  title: string;
  description: string | null;
  project_id: string; // its mission (erp.engagement)
  assignee_id: string | null;
  reporter_id: string | null;
  status: TicketStatus;
  stage_id: string | null; // the column of its board (work.board); resolved in the browser (vanguard/one/stages.tsx)
  stage_name: string | null; // that stage's name on a board that saved its workflow; null on the built-in boards (named by status)
  priority: TicketPriority;
  type: TicketType;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  key: string; // the floor's prefix and its number (0012): AUD-142
  labels: string[];
  estimated_hours: number | null;
  logged_minutes: number; // time entered on the ticket
};

// What Vanguard's screens read of a ticket beyond the engine's task (vanguard/one/Tasks.tsx).
export type TaskTicket = Pick<VanguardTicket, "project_id" | "assignee_id" | "reporter_id" | "status" | "stage_id" | "stage_name" | "priority" | "type" | "key" | "labels" | "estimated_hours" | "logged_minutes">;

// A task with no due date sorts after every dated one and is never late.
export const NO_DUE_DATE = "9999-12-31";

// The tickets the person sees, archived ones apart ('normal', the engine's default priority, is the boards' medium).
export async function listTickets(tx: ErpTransaction): Promise<VanguardTicket[]> {
  const [{ rows }] = await tx.query<{ rows: VanguardTicket[] }>(
    `select coalesce(jsonb_agg(jsonb_build_object(
              'id', t.id, 'title', t.title, 'description', t.notes, 'project_id', t.engagement_id, 'assignee_id', t.assignee_id,
              'reporter_id', t.reporter_id, 'status', t.status, 'stage_id', t.stage_id,
              'stage_name', (select s->>'name' from work.floor_board b, jsonb_array_elements(b.stages) s
                              where b.entity_id = t.entity_id and s->>'id' = coalesce(t.stage_id, t.status) limit 1),
              'priority', case when t.priority = 'normal' then 'medium' else t.priority end, 'type', t.type,
              'due_date', t.due_date, 'created_at', t.created_at, 'updated_at', t.updated_at, 'completed_at', t.completed_at,
              'key', (select x.ticket_prefix || '-' || t.number from erp.entity x where x.id = t.entity_id), 'labels', t.labels,
              'estimated_hours', t.estimated_hours::float8, 'logged_minutes', work.task_logged_minutes(t.id))), '[]'::jsonb) as rows
       from erp.task t
      where t.engagement_id is not null and t.status <> 'archived'`,
  );
  return rows;
}

// The engine's task for a ticket of a mission of the state (the floors the person sees); the others stay in the
// person's own lists (My day, the ticket's page).
export function ticketTasks(
  tickets: VanguardTicket[],
  missions: { id: string; entityId: string; customerId?: string }[],
  names: Map<string, string>,
): (Task & { ticket: TaskTicket })[] {
  const byId = new Map(missions.map((m) => [m.id, m]));
  return tickets.flatMap((t) => {
    const mission = byId.get(t.project_id);
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
      completedAt: done ? (t.completed_at ?? t.updated_at).slice(0, 10) : undefined,
      notes: t.description || undefined,
      ticket: {
        project_id: t.project_id, assignee_id: t.assignee_id, reporter_id: t.reporter_id, status: t.status, stage_id: t.stage_id ?? null, stage_name: t.stage_name ?? null, priority: t.priority, type: t.type,
        key: t.key, labels: t.labels ?? [], estimated_hours: t.estimated_hours, logged_minutes: t.logged_minutes ?? 0,
      },
    }];
  });
}
