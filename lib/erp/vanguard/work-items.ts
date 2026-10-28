import { getTicketDueState } from "@/lib/tickets/helpers";
import type { TicketRecord } from "@/types/ticket";

// A ticket as the work screens list it (My work, a person's page: lib/erp/vanguard/myday-actions.ts, people-actions.ts),
// and their order: most pressing first.
export type MyWorkTicket = {
  id: string;
  key: string | null;
  title: string;
  type: string;
  projectId: string;
  projectName: string | null;
  status: string;
  stageId: string | null; // its stage on its board (resolved), for the stage picker (vanguard/one/stages.tsx)
  stageName: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  priority: string;
  dueDate: string | null;
  dueState: ReturnType<typeof getTicketDueState>; // overdue, soon (7 days), planned, none
  estimatedHours: number | null;
  loggedMinutes: number;
  labels: string[];
  assigneeName: string | null;
  updatedAt: string;
};

export const asItem = (t: TicketRecord): MyWorkTicket => ({
  id: t.id,
  key: t.key,
  title: t.title,
  type: t.type,
  projectId: t.project_id,
  projectName: t.project?.name ?? null,
  status: t.status,
  stageId: t.stage_id || null,
  stageName: t.stage_name,
  assigneeId: t.assignee_id,
  reporterId: t.reporter_id,
  priority: t.priority,
  dueDate: t.due_date?.slice(0, 10) ?? null,
  dueState: getTicketDueState(t.due_date),
  estimatedHours: t.estimated_hours,
  loggedMinutes: t.logged_minutes ?? 0,
  labels: t.labels ?? [],
  assigneeName: t.assignee?.full_name ?? null,
  updatedAt: t.updated_at,
});

const PRESSURE: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
// blocked first, then late, then by priority, then the nearest due date
export function pressing(a: MyWorkTicket, b: MyWorkTicket) {
  const rank = (t: MyWorkTicket) => (t.status === "blocked" ? 0 : t.dueState === "overdue" ? 1 : 2);
  return rank(a) - rank(b) || (PRESSURE[a.priority] ?? 2) - (PRESSURE[b.priority] ?? 2) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

