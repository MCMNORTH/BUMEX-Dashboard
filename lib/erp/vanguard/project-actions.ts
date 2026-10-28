"use server";

import { getActivityMetadataSummary } from "@/lib/activity/presentation";
import { getProjectRisks } from "@/lib/alerts/service";
import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCommentsForEntity } from "@/lib/comments/service";
import { requireErpAccess } from "@/lib/erp/server";
import { resolveMissionId } from "@/lib/erp/vanguard/mission-actions";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getNotesForEntity } from "@/lib/notes/service";
import { getMentionCandidates } from "@/lib/notifications/service";
import { getProjectMemberCandidates } from "@/lib/projects/members";
import { getProjectById } from "@/lib/projects/service";
import { canManageBoard } from "@/lib/tickets/board-access";
import type { PlanningAlert } from "@/types/alert";
import type { AppRole } from "@/types/auth";
import { canViewComment, type CommentRecord } from "@/types/comment";
import type { InternalNoteRecord } from "@/types/note";
import type { ProjectRecord } from "@/types/project";

// A mission's page in BUMEX Vanguard's Missions room (vanguard/one/Mission.tsx), as BUMEX One's project page had it:
// its delivery figures and health, alerts, team, tickets, notes, conversation and history, read with BUMEX One's rules
// for the person (row-level security). The mission's own form is vanguard/one/Missions.tsx; its board's rules, vanguard/one/Workflow.tsx.

export type ProjectView = {
  project: Omit<ProjectRecord, "members" | "recentActivity" | "owner"> & { ownerName: string | null };
  members: { id: string; name: string; entity: string | null; title: string | null }[];
  history: { id: string; at: string; who: string; action: string; detail: string }[];
  alerts: PlanningAlert[];
  comments: CommentRecord[];
  notes: InternalNoteRecord[];
  candidates: { id: string; name: string; entity: string | null }[];
  people: { id: string; name: string }[];
  me: string;
  role: AppRole;
  canEdit: boolean;
  canDelete: boolean;
  canManageTeam: boolean;
  canComment: boolean;
};

export async function projectViewAction(projectId: string): Promise<ProjectView | null> {
  const { auth, access } = await requireErpAccess();
  // a link from before the move names the project's id in BUMEX One (an e-mail, a bookmark)
  const id = (await resolveMissionId(String(projectId))) ?? String(projectId);
  const [project, comments, notes, mentions, locale] = await Promise.all([
    getProjectById(id),
    getCommentsForEntity("project", id),
    getNotesForEntity("project", id),
    getMentionCandidates(),
    getCurrentLocale(),
  ]);
  if (!project) return null;
  const [alerts, canManageTeam] = await Promise.all([getProjectRisks(id, locale), canManageBoard(auth.role, auth.profile.id, id)]);
  const memberIds = project.members.flatMap((m) => (m.user ? [m.user.id] : []));
  const candidates = canManageTeam ? await getProjectMemberCandidates(memberIds) : [];
  const { members, recentActivity, owner, ...rest } = project;

  return {
    project: { ...rest, ownerName: owner?.full_name ?? null },
    members: members.flatMap((m) => (m.user ? [{ id: m.user.id, name: m.user.full_name, entity: m.user.entity_code ?? null, title: m.user.job_title ?? null }] : [])),
    history: recentActivity.map((a) => ({ id: a.id, at: a.created_at, who: a.user?.full_name ?? "", action: a.action, detail: getActivityMetadataSummary(a) ?? "" })),
    alerts,
    comments: comments.filter((c) => canViewComment(c, auth.role)),
    notes,
    candidates: candidates.map((p) => ({ id: p.id, name: p.full_name, entity: p.entity_code ?? null })),
    people: mentions.map((p) => ({ id: p.id, name: p.full_name })),
    me: auth.profile.id,
    role: auth.role,
    // the mission form's rule (mission-actions.ts): partners, the finance lead and the administrator; managers their own
    canEdit: ["admin", "partner", "raf"].includes(access.role) || (access.role === "manager" && project.owner_id === auth.profile.id),
    canDelete: auth.role === "admin" || isManagerLikeRole(auth.role),
    canManageTeam,
    canComment: ["admin", "manager", "supervisor", "employee"].includes(auth.role),
  };
}
