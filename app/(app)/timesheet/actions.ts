"use server";

import { requireCurrentEntityContext, requireTimeEntityContext } from "@/lib/entities/scope";
import { createScopedNotifications } from "@/lib/notifications/service";
import { TIMESHEET_PROJECTS_SQL } from "@/lib/timesheet/service";
import { addDays, validateTimeInput, weekBounds } from "@/lib/timesheet/validation";
import { asPerson, select, selectOne, type Tx } from "@/lib/work/db";
import type { TimeInput, TimeResult } from "@/types/timesheet";

// The Temps room's actions (vanguard/one/Time.tsx), in the person's current entity. The database refuses a line in a
// sent week, in the future or beyond 24 hours a day (0008 erp.time_entry_guard), and the rules a line that is not the
// person's own. On the test floor (test, 0011) the lines are its missions', apart from the person's real week: no
// favourites and no week to send there.

const isTimesheetProject = async (tx: Tx, projectId: string, entityCode: string) =>
  Boolean(await selectOne(tx, `${TIMESHEET_PROJECTS_SQL} and e.id = $2::uuid`, [entityCode, projectId]));

const entityOf = "(select id from erp.entity where code = $ENTITY)";

const guardError = (error: unknown) => (error instanceof Error ? error.message : "");

export async function saveTimeAction(input: TimeInput, test = false): Promise<TimeResult> {
  const { auth, entityCode } = await requireTimeEntityContext(test);
  const validation = validateTimeInput(input);
  if (validation) return { error: validation };
  const minutes = Number(input.hours) * 60 + Number(input.minutes);
  const note = input.note.trim();
  const mission = input.mission.trim().replace(/\s+/g, " ");
  try {
    return await asPerson(async (tx): Promise<TimeResult> => {
      if (!(await isTimesheetProject(tx, input.project_id, entityCode))) return { error: "project" };
      // an edit carries the version it started from: a line changed meanwhile is a conflict
      const written = input.updated_at
        ? await tx.run(
            `update erp.time_entry set engagement_id = $2::uuid, work_date = $3::date, minutes = $4, description = $5, mission = $6, task_id = $9::uuid
              where id = $1::uuid and user_id = $7 and updated_at = $8::timestamptz`,
            [input.id, input.project_id, input.work_date, minutes, note, mission, auth.user.id, input.updated_at, input.task_id || null],
          )
        : await tx.run(
            `insert into erp.time_entry (id, engagement_id, user_id, work_date, minutes, description, mission, entity_id, task_id)
             values ($1::uuid, $2::uuid, $7, $3::date, $4, $5, $6, ${entityOf.replace("$ENTITY", "$8")}, $9::uuid)`,
            [input.id, input.project_id, input.work_date, minutes, note, mission, auth.user.id, entityCode, input.task_id || null],
          );
      return written ? { success: true } : { error: "conflict" };
    });
  } catch (error) {
    const message = guardError(error);
    if (message.includes("time_entry_daily_limit")) return { error: "daily_limit" };
    if (message.includes("timesheet_week_locked")) return { error: "locked" };
    if (message.includes("time_entry_future_date")) return { error: "date" };
    // a ticket of another mission (0012)
    if (message.includes("time_entry_task_mismatch")) return { error: "invalid" };
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "23505") return { error: "conflict" };
    console.error("[timesheet:save]", code || message);
    return { error: "unavailable" };
  }
}

// A line removed (a cleared cell of the week, 0013): the person's own, of a week that is not sent; an edit made
// elsewhere meanwhile is a conflict.
export async function deleteTimeAction(id: string, updatedAt: string, test = false): Promise<TimeResult> {
  const { auth } = await requireTimeEntityContext(test);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(Date.parse(updatedAt))) return { error: "invalid" };
  try {
    const removed = await asPerson((tx) => tx.run("delete from erp.time_entry where id = $1::uuid and user_id = $2 and updated_at = $3::timestamptz", [id, auth.user.id, updatedAt]));
    return removed ? { success: true } : { error: "conflict" };
  } catch (error) {
    if (guardError(error).includes("timesheet_week_locked")) return { error: "locked" };
    console.error("[timesheet:delete]", guardError(error));
    return { error: "unavailable" };
  }
}

export async function copyPreviousWeekAction(targetWeek: string, test = false): Promise<{ success: true; count: number } | { error: "invalid" | "not_empty" | "no_source" | "unavailable" }> {
  const { auth, entityCode } = await requireTimeEntityContext(test);
  const target = weekBounds(targetWeek);
  const today = new Date().toISOString().slice(0, 10);
  if (!target || target.start > today) return { error: "invalid" };
  const source = weekBounds(addDays(target.start, -7));
  if (!source) return { error: "unavailable" };
  try {
    return await asPerson(async (tx) => {
      // the person's week, on every entity's missions (0015)
      const own = `from erp.time_entry t where t.user_id = $1 and t.work_date >= $2::date and t.work_date < $3::date`;
      const [{ n }] = await select<{ n: number }>(tx, `select count(*)::int as n ${own}`, [auth.user.id, target.start, target.end]);
      if (n > 0) return { error: "not_empty" as const };
      const allowed = new Set((await select<{ id: string }>(tx, TIMESHEET_PROJECTS_SQL, [entityCode])).map((project) => project.id));
      const sourceEntries = await select<{ project_id: string; work_date: string; minutes: number; mission: string; note: string; task_id: string | null }>(
        tx,
        `select t.engagement_id as project_id, t.work_date, t.minutes, t.mission, coalesce(t.description, '') as note, t.task_id ${own} order by t.work_date, t.id`,
        [auth.user.id, source.start, source.end],
      );
      const rows = sourceEntries.filter((entry) => allowed.has(entry.project_id)).map((entry) => ({ ...entry, work_date: addDays(entry.work_date, 7) }));
      if (!rows.length) return { error: "no_source" as const };
      await tx.query(
        `insert into erp.time_entry (engagement_id, user_id, work_date, minutes, description, mission, entity_id, task_id)
         select r.project_id, $2, r.work_date, r.minutes, r.note, r.mission, ${entityOf.replace("$ENTITY", "$3")},
                -- the same ticket, if it is still of that mission
                (select k.id from erp.task k where k.id = r.task_id and k.engagement_id = r.project_id)
           from jsonb_to_recordset($1::jsonb) as r(project_id uuid, work_date date, minutes integer, mission text, note text, task_id uuid)`,
        [JSON.stringify(rows), auth.user.id, entityCode],
      );
      return { success: true as const, count: rows.length };
    });
  } catch (error) {
    console.error("[timesheet:copy-week]", guardError(error));
    return { error: "unavailable" };
  }
}

export async function setMissionFavoriteAction(input: { projectId: string; mission: string; favorite: boolean }): Promise<{ success: true } | { error: "invalid" | "project" | "unavailable" }> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const mission = input.mission.trim().replace(/\s+/g, " ");
  if (!input.projectId || !mission || mission.length > 200) return { error: "invalid" };
  try {
    return await asPerson(async (tx) => {
      if (!(await isTimesheetProject(tx, input.projectId, entityCode))) return { error: "project" as const };
      if (input.favorite) {
        await tx.query(
          `insert into work.mission_favorite (user_id, engagement_id, mission, entity_id) values ($1, $2::uuid, $3, ${entityOf.replace("$ENTITY", "$4")})
           on conflict (user_id, engagement_id, mission) do nothing`,
          [auth.user.id, input.projectId, mission, entityCode],
        );
      } else {
        await tx.query("delete from work.mission_favorite where user_id = $1 and engagement_id = $2::uuid and mission = $3", [auth.user.id, input.projectId, mission]);
      }
      return { success: true as const };
    });
  } catch (error) {
    console.error("[timesheet:favorite]", guardError(error));
    return { error: "unavailable" };
  }
}

// The administrators, and the managers of an entity: who reviews its weeks.
const REVIEWERS_SQL = `select p.id from work.person p
  where work.person_role(p.id) = 'admin' or (work.person_role(p.id) = 'manager' and p.entity_code = $1)`;

export async function submitTimesheetWeekAction(week: string): Promise<{ success: true } | { error: "invalid" | "empty" | "approved" | "unavailable" }> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  const today = new Date().toISOString().slice(0, 10);
  if (!bounds || bounds.start > today) return { error: "invalid" };
  try {
    const outcome = await asPerson(async (tx) => {
      const [{ n }] = await select<{ n: number }>(
        tx,
        `select count(*)::int as n from erp.time_entry t join erp.entity x on x.id = t.entity_id
          where t.user_id = $1 and x.code = $2 and t.work_date >= $3::date and t.work_date < $4::date`,
        [auth.user.id, entityCode, bounds.start, bounds.end],
      );
      const current = await selectOne<{ status: string }>(tx, "select status from work.timesheet_week where user_id = $1 and week_start = $2::date", [auth.user.id, bounds.start]);
      if (!n) return "empty" as const;
      if (current?.status === "approved") return "approved" as const;
      if (current?.status === "submitted") return "unchanged" as const;
      if (current?.status === "returned") {
        await tx.query(
          `update work.timesheet_week set status = 'submitted', submitted_at = now(), reviewed_at = null, reviewed_by = null, review_note = null
            where user_id = $1 and week_start = $2::date and status = 'returned'`,
          [auth.user.id, bounds.start],
        );
      } else {
        await tx.query(
          `insert into work.timesheet_week (user_id, week_start, entity_id, status) values ($1, $2::date, ${entityOf.replace("$ENTITY", "$3")}, 'submitted')`,
          [auth.user.id, bounds.start, entityCode],
        );
      }
      return { reviewers: (await select<{ id: string }>(tx, REVIEWERS_SQL, [entityCode])).map((p) => p.id) };
    });
    if (outcome === "empty" || outcome === "approved") return { error: outcome };
    if (outcome === "unchanged") return { success: true };
    await createScopedNotifications({
      userIds: outcome.reviewers,
      type: "status_change",
      title: "Timesheet submitted",
      body: `${auth.profile.full_name} submitted a weekly timesheet for review.`,
      entityType: "timesheet",
      entityId: auth.user.id,
      skipUserId: auth.user.id,
    }).catch(() => console.error("[timesheet:submit-notification] failed"));
    return { success: true };
  } catch (error) {
    console.error("[timesheet:submit-week]", guardError(error));
    return { error: "unavailable" };
  }
}

// The people a reviewer may review: anyone for an administrator, their entity's people for a manager.
const reviewable = (role: string, entityCode: string, userIds: string[]) =>
  asPerson((tx) =>
    select<{ id: string; entity_code: string | null }>(
      tx,
      "select id, entity_code from work.person where id = any($1::text[]) and ($2 = 'admin' or entity_code = $3)",
      [userIds, role, entityCode],
    ),
  );

async function review(userIds: string[], week: string, change: { status: "approved" | "returned"; note?: string }) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, 500);
  if (!bounds || !ids.length || (auth.role !== "admin" && auth.role !== "manager")) return { auth, done: [] as string[] };
  const allowed = (await reviewable(auth.role, entityCode, ids)).map((p) => p.id);
  if (!allowed.length) return { auth, done: [] };
  const done = await asPerson((tx) =>
    select<{ user_id: string }>(
      tx,
      `update work.timesheet_week set status = $3, reviewed_at = now(), reviewed_by = $4, review_note = $5
        where user_id = any($1::text[]) and week_start = $2::date and status = 'submitted' returning user_id`,
      [allowed, bounds.start, change.status, auth.user.id, change.note ?? null],
    ),
  ).catch((error) => {
    console.error(`[timesheet:${change.status}]`, guardError(error));
    return [];
  });
  return { auth, done: done.map((row) => row.user_id), bounds };
}

export async function approveTimesheetWeekAction(userId: string, week: string): Promise<void> {
  await approveTimesheetWeeksAction([userId], week);
}

export async function approveTimesheetWeeksAction(userIds: string[], week: string): Promise<void> {
  const { auth, done } = await review(userIds, week, { status: "approved" });
  await Promise.all(done.map((userId) =>
    createScopedNotifications({ userIds: [userId], type: "status_change", title: "Timesheet approved", body: "Your weekly timesheet was approved.", entityType: "timesheet", entityId: userId, skipUserId: auth.user.id })
      .catch(() => console.error("[timesheet:approve-notification] failed"))));
}

export async function returnTimesheetWeekAction(userId: string, week: string, formData: FormData): Promise<void> {
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > 500) return;
  const { auth, done } = await review([userId], week, { status: "returned", note: reason });
  if (done.length) {
    await createScopedNotifications({ userIds: [userId], type: "status_change", title: "Timesheet needs changes", body: `Your weekly timesheet was returned: ${reason}`, entityType: "timesheet", entityId: userId, skipUserId: auth.user.id })
      .catch(() => console.error("[timesheet:return-notification] failed"));
  }
}

export async function remindTimesheetWeekAction(userId: string, week: string): Promise<void> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  if (!bounds || userId === auth.user.id || (auth.role !== "admin" && auth.role !== "manager")) return;
  const [person] = await reviewable(auth.role, entityCode, [userId]);
  if (!person) return;
  const status = await asPerson(async (tx) => {
    const week = await selectOne<{ status: string }>(tx, "select status from work.timesheet_week where user_id = $1 and week_start = $2::date", [userId, bounds.start]);
    if (week?.status === "submitted" || week?.status === "approved") return null;
    // one reminder per person, week and day
    const sent = await tx.run(
      `insert into work.timesheet_reminder (user_id, week_start, entity_id, sent_by)
       values ($1, $2::date, (select id from erp.entity where code = $3), $4) on conflict do nothing`,
      [userId, bounds.start, person.entity_code, auth.user.id],
    );
    return sent ? (week?.status ?? "open") : null;
  }).catch((error) => {
    console.error("[timesheet:reminder]", guardError(error));
    return null;
  });
  if (!status) return;
  const title = status === "returned" ? "Timesheet correction reminder" : "Timesheet reminder";
  const body = status === "returned"
    ? `Please correct and resubmit your timesheet for the week of ${bounds.start}.`
    : `Please complete and submit your timesheet for the week of ${bounds.start}.`;
  await createScopedNotifications({ userIds: [userId], type: "deadline", title, body, entityType: "timesheet", entityId: userId, skipUserId: auth.user.id })
    .catch(() => console.error("[timesheet:reminder-notification] failed"));
}
