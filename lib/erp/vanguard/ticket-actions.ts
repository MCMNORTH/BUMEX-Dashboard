"use server";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCommentsForEntity } from "@/lib/comments/service";
import { requireErpAccess } from "@/lib/erp/server";
import { getTicketById, getTicketsFilterData } from "@/lib/tickets/service";
import { getTicketSubtasks } from "@/lib/tickets/subtasks";
import { evaluateTransition, getCompletedStage } from "@/lib/tickets/workflow";
import { getBoardWorkflow } from "@/lib/tickets/workflow-service";
import type { ActivityLogRecord } from "@/types/activity";
import type { AppRole } from "@/types/auth";
import { canViewComment, type CommentRecord } from "@/types/comment";
import type { TicketRecord, TicketSubtask } from "@/types/ticket";
import type { BoardWorkflow } from "@/types/workflow";

// A ticket in BUMEX Vanguard's Tasks room (vanguard/one/Ticket.tsx), as BUMEX One's ticket page showed it: read with
// BUMEX One's rules for the person (row policies, their BUMEX One role), with what its forms need. Changes go
// through BUMEX One's ticket, sub-task and comment actions.

export type TicketView = {
  ticket: Omit<TicketRecord, "activity" | "assignee" | "reporter" | "project"> & {
    projectName: string | null;
    projectStatus: string | null;
    projectEnd: string | null;
    clientName: string | null;
    assigneeName: string | null;
    reporterName: string | null;
  };
  history: { id: string; at: string; who: string; action: string; detail: string }[];
  workflow: BoardWorkflow;
  subtasks: TicketSubtask[];
  comments: CommentRecord[];
  people: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  me: string;
  role: AppRole;
  canUpdate: boolean;
  canManage: boolean;
  canComment: boolean;
  isReporter: boolean;
  signOff: { stageId: string; stageName: string } | null;
};

export async function ticketViewAction(id: string): Promise<TicketView | null> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  const ticket = await getTicketById(String(id), role);
  if (!ticket) return null;
  const shareholder = role === "shareholder";
  const [workflow, filterData, comments, subtasks] = await Promise.all([
    getBoardWorkflow(ticket.project_id),
    getTicketsFilterData(),
    getCommentsForEntity("ticket", ticket.id),
    // shareholders only get the progress counts carried on the ticket
    shareholder ? Promise.resolve([] as TicketSubtask[]) : getTicketSubtasks(ticket.id),
  ]);

  const canManage = role === "admin" || isManagerLikeRole(role);
  const isReporter = !shareholder && ticket.reporter_id === auth.profile.id;
  const open = ticket.status !== "done" && ticket.status !== "archived";
  const completed = getCompletedStage(workflow);
  const signOff = isReporter && open && completed && evaluateTransition(workflow, ticket.stage_id, completed.id, null, { canComplete: true }).ok
    ? { stageId: completed.id, stageName: completed.name }
    : null;
  const { activity, assignee, reporter, project, ...rest } = ticket;

  return {
    ticket: {
      ...rest,
      projectName: project?.name ?? null,
      projectStatus: project?.status ?? null,
      projectEnd: project?.end_date ?? null,
      clientName: project?.client?.name ?? null,
      assigneeName: assignee?.full_name ?? null,
      reporterName: reporter?.full_name ?? null,
    },
    history: shareholder
      ? []
      : activity.map((a) => ({
          id: a.id,
          at: a.created_at,
          who: a.user?.full_name ?? "",
          action: a.action,
          detail: getActivityMetadataSummary(a as unknown as ActivityLogRecord) ?? "",
        })),
    workflow,
    subtasks,
    comments: comments.filter((c) => canViewComment(c, role)),
    people: filterData.assignees.map((p) => ({ id: p.id, name: p.full_name || p.email })),
    projects: filterData.projects.map((p) => ({ id: p.id, name: p.name })),
    me: auth.profile.id,
    role,
    canUpdate: canManage || (role === "employee" && ticket.assignee_id === auth.profile.id),
    canManage,
    canComment: ["admin", "manager", "supervisor", "employee"].includes(role),
    isReporter,
    signOff,
  };
}
