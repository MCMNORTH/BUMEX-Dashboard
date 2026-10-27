"use server";

import { isManagerLikeRole } from "@/lib/auth/permissions";
import { getCommentsForEntity } from "@/lib/comments/service";
import { requireErpAccess } from "@/lib/erp/server";
import { getTeamWorkload } from "@/lib/team/service";
import { getTicketById, getTicketsFilterData } from "@/lib/tickets/service";
import { getTicketSubtasks } from "@/lib/tickets/subtasks";
import { evaluateTransition, getCompletedStage } from "@/lib/tickets/workflow";
import { getBoardWorkflow } from "@/lib/tickets/workflow-service";
import { asPerson, dbErrorKey, select, selectOne } from "@/lib/work/db";
import type { Load } from "@/lib/work/load";
import type { AppRole } from "@/types/auth";
import { canViewComment, type CommentRecord } from "@/types/comment";
import type { TicketRecord, TicketSubtask } from "@/types/ticket";
import type { BoardWorkflow } from "@/types/workflow";

// A ticket in BUMEX Vanguard's Tasks room (vanguard/one/Ticket.tsx), laid out as Jira's (asked on 2026-10-27): read
// with BUMEX One's rules for the person (row policies, their BUMEX One role), with its links, attachments, work log and
// whole history (0012), and each person's load for the pickers. Changes go through BUMEX One's ticket, sub-task and
// comment actions; the links through the ones below.

export type TicketLinkKind = "relates" | "blocks" | "duplicates" | "action_item";

export type TicketLink = {
  id: string;
  kind: TicketLinkKind;
  direction: "out" | "in";
  ticket: { id: string; key: string | null; title: string; status: string; priority: string; type: string; assigneeName: string | null };
  canRemove: boolean;
};

export type TicketAttachment = { id: string; title: string; fileName: string | null; size: number | null; mime: string | null; at: string; by: string | null };
export type TicketWorklog = { id: string; userId: string; who: string; date: string; minutes: number; note: string | null; at: string };
export type TicketHistory = { id: string; at: string; userId: string | null; who: string; action: string; metadata: Record<string, unknown> };
export type TicketPersonLoad = Pick<Load, "weekHours" | "capacityHours" | "percent" | "level">;

export type TicketView = {
  ticket: Omit<TicketRecord, "activity" | "assignee" | "reporter" | "project"> & {
    projectName: string | null;
    projectStatus: string | null;
    projectEnd: string | null;
    entityCode: string | null;
    clientName: string | null;
    assigneeName: string | null;
    reporterName: string | null;
  };
  history: TicketHistory[];
  workflow: BoardWorkflow;
  subtasks: TicketSubtask[];
  comments: CommentRecord[];
  links: TicketLink[];
  attachments: TicketAttachment[];
  worklog: TicketWorklog[];
  people: { id: string; name: string }[];
  loads: Record<string, TicketPersonLoad>;
  labels: string[]; // the floor's labels, for suggestions
  projects: { id: string; name: string }[];
  me: string;
  role: AppRole;
  canUpdate: boolean;
  canManage: boolean;
  canComment: boolean;
  canAttach: boolean;
  canLink: boolean;
  isReporter: boolean;
  signOff: { stageId: string; stageName: string } | null;
};

const LINKS_SQL = `
  select l.id, l.kind, case when l.from_task = $1 then 'out' else 'in' end as direction,
         jsonb_build_object('id', o.id, 'key', (select x.ticket_prefix || '-' || o.number from erp.entity x where x.id = o.entity_id),
                            'title', o.title, 'status', o.status, 'priority', case when o.priority = 'normal' then 'medium' else o.priority end,
                            'type', o.type, 'assigneeName', (select p.full_name from work.person p where p.id = o.assignee_id)) as ticket,
         work.can_edit_task(l.from_task) or work.can_edit_task(l.to_task) as "canRemove"
    from work.task_link l
    join erp.task o on o.id = case when l.from_task = $1 then l.to_task else l.from_task end
   where $1 in (l.from_task, l.to_task)
   order by l.created_at`;

export async function ticketViewAction(id: string): Promise<TicketView | null> {
  const { auth } = await requireErpAccess();
  const role = auth.role;
  const ticket = await getTicketById(String(id), role);
  if (!ticket) return null;
  const shareholder = role === "shareholder";
  const [workflow, filterData, comments, subtasks, more, workload] = await Promise.all([
    getBoardWorkflow(ticket.project_id),
    getTicketsFilterData(),
    getCommentsForEntity("ticket", ticket.id),
    // shareholders only get the progress counts carried on the ticket
    shareholder ? Promise.resolve([] as TicketSubtask[]) : getTicketSubtasks(ticket.id),
    asPerson(async (tx) => ({
      links: await select<TicketLink>(tx, LINKS_SQL, [ticket.id]),
      attachments: shareholder ? [] : await select<TicketAttachment>(
        tx,
        `select d.id, d.title, d.file_name as "fileName", d.file_size as size, d.mime_type as mime, d.created_at as at,
                (select p.full_name from work.person p where p.id = d.uploaded_by) as by
           from work.document d
          where d.related_type = 'task' and d.related_id = $1::uuid and not d.is_archived
          order by d.created_at desc`,
        [ticket.id],
      ),
      worklog: shareholder ? [] : await select<TicketWorklog>(
        tx,
        `select w.id, w.user_id as "userId", coalesce(p.full_name, p.email, '—') as who, w.work_date::text as date, w.minutes, w.note, w.created_at as at
           from work.task_worklog($1::uuid) w left join work.person p on p.id = w.user_id`,
        [ticket.id],
      ),
      history: shareholder ? [] : await select<TicketHistory>(
        tx,
        `select a.id, a.created_at as at, a.user_id as "userId", coalesce(p.full_name, p.email, '') as who, a.action, a.metadata
           from work.activity a left join work.person p on p.id = a.user_id
          where a.subject_type = 'task' and a.subject_id = $1
          order by a.created_at desc limit 300`,
        [ticket.id],
      ),
      labels: (await select<{ label: string }>(
        tx,
        `select distinct unnest(t.labels) as label from erp.task t
          where t.entity_id = (select entity_id from erp.task where id = $1::uuid) order by 1 limit 200`,
        [ticket.id],
      )).map((r) => r.label),
      canAttach: !shareholder && Boolean((await selectOne<{ ok: boolean }>(tx, "select work.can_manage_document('task', $1::uuid) as ok", [ticket.id]))?.ok),
      canLink: !shareholder && Boolean((await selectOne<{ ok: boolean }>(tx, "select work.can_edit_task($1::uuid) as ok", [ticket.id]))?.ok),
    })),
    shareholder ? Promise.resolve([]) : getTeamWorkload(role, auth.profile.id).catch(() => []),
  ]);

  const canManage = role === "admin" || isManagerLikeRole(role);
  const isReporter = !shareholder && ticket.reporter_id === auth.profile.id;
  const open = ticket.status !== "done" && ticket.status !== "archived";
  const completed = getCompletedStage(workflow);
  const signOff = isReporter && open && completed && evaluateTransition(workflow, ticket.stage_id, completed.id, null, { canComplete: true }).ok
    ? { stageId: completed.id, stageName: completed.name }
    : null;
  const { activity: _activity, assignee, reporter, project, ...rest } = ticket;
  void _activity;

  return {
    ticket: {
      ...rest,
      projectName: project?.name ?? null,
      projectStatus: project?.status ?? null,
      projectEnd: project?.end_date ?? null,
      entityCode: project?.entity_code ?? null,
      clientName: project?.client?.name ?? null,
      assigneeName: assignee?.full_name ?? null,
      reporterName: reporter?.full_name ?? null,
    },
    history: more.history,
    workflow,
    subtasks,
    comments: comments.filter((c) => canViewComment(c, role)),
    links: more.links,
    attachments: more.attachments,
    worklog: more.worklog,
    people: filterData.assignees.map((p) => ({ id: p.id, name: p.full_name || p.email })),
    loads: Object.fromEntries(workload.map((w) => [w.id, { weekHours: w.load.weekHours, capacityHours: w.load.capacityHours, percent: w.load.percent, level: w.load.level }])),
    labels: more.labels,
    projects: filterData.projects.map((p) => ({ id: p.id, name: p.name })),
    me: auth.profile.id,
    role,
    canUpdate: canManage || (role === "employee" && ticket.assignee_id === auth.profile.id),
    canManage,
    canComment: ["admin", "manager", "supervisor", "employee"].includes(role),
    canAttach: more.canAttach,
    canLink: more.canLink,
    isReporter,
    signOff,
  };
}

// ---- links between tickets (work.task_link, 0012) ----

const LINK_KINDS: TicketLinkKind[] = ["relates", "blocks", "duplicates", "action_item"];

/** Tickets to link to: by key (AUD-142) or by title, among those the person reads. */
export async function searchTicketsAction(query: string, excludeId?: string): Promise<{ id: string; key: string | null; title: string; status: string }[]> {
  await requireErpAccess();
  const q = String(query ?? "").trim();
  if (q.length < 1) return [];
  const key = /^([A-Za-z][A-Za-z0-9]{0,7})-(\d+)$/.exec(q);
  return asPerson((tx) =>
    select(
      tx,
      `select t.id, x.ticket_prefix || '-' || t.number as key, t.title, t.status
         from erp.task t join erp.entity x on x.id = t.entity_id
        where t.engagement_id is not null and t.status <> 'archived' and ($2::uuid is null or t.id <> $2::uuid)
          and (($3::text is not null and x.ticket_prefix = upper($3) and t.number = $4::int) or t.title ilike '%' || $1 || '%'
               or (x.ticket_prefix || '-' || t.number) ilike $1 || '%')
        order by ($3::text is not null and x.ticket_prefix = upper($3) and t.number = $4::int) desc, t.updated_at desc
        limit 12`,
      [q.replace(/[%_\\]/g, (c) => `\\${c}`), excludeId || null, key?.[1] ?? null, key ? Number(key[2]) : null],
    ),
  );
}

export async function addTicketLinkAction(fromId: string, toId: string, kind: TicketLinkKind): Promise<{ error?: string }> {
  const { auth } = await requireErpAccess();
  if (auth.role === "shareholder") return { error: "Read only." };
  if (!LINK_KINDS.includes(kind) || !fromId || !toId || fromId === toId) return { error: "Lien invalide." };
  try {
    await asPerson((tx) => tx.query("insert into work.task_link (from_task, to_task, kind) values ($1::uuid, $2::uuid, $3)", [fromId, toId, kind]));
    return {};
  } catch (error) {
    const key = dbErrorKey(error);
    if (key === "23505") return { error: "Ce lien existe déjà." };
    if (key === "test_task_mismatch") return { error: "Un ticket de l'étage de test ne se lie qu'à un autre ticket de test." };
    return { error: "Vous ne pouvez pas lier ces tickets." };
  }
}

export async function removeTicketLinkAction(linkId: string): Promise<{ error?: string }> {
  const { auth } = await requireErpAccess();
  if (auth.role === "shareholder") return { error: "Read only." };
  const removed = await asPerson((tx) => select(tx, "delete from work.task_link where id = $1::uuid returning id", [linkId])).catch(() => []);
  return removed.length ? {} : { error: "Vous ne pouvez pas retirer ce lien." };
}
