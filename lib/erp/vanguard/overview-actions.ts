"use server";

import { requireErpAccess } from "@/lib/erp/server";
import { floors } from "@/lib/erp/vanguard/floors";
import { getTeamWorkload } from "@/lib/team/service";
import { weekBounds } from "@/lib/timesheet/validation";
import { asPerson, select } from "@/lib/work/db";
import type { Load } from "@/lib/work/load";

// The floor's overview (vanguard/one/Overview.tsx, asked on 2026-10-28): what the browser's state does not hold. Its
// tickets and missions are the state's (the person's rules already applied); this brings the floor's people (its own,
// and those of other floors working on its tickets), their load, their week's hours and timesheet where the database
// lets the viewer read them (themselves, their entity's managers, the administrators: 0008), and the floor's recent
// activity. Read in the person's session: whatever they may not see is not there.

export type OverviewPerson = {
  id: string;
  name: string;
  jobTitle: string | null;
  floor: string | null; // their home floor's code (AUD, IT…)
  home: boolean; // a person of this floor (else of another one, working on its tickets)
  capacity: number;
  load: Load | null;
  week: { minutes: number; byDay: number[]; status: string | null } | null; // null: not the viewer's to read
};

export type OverviewActivity = { id: string; at: string; who: string; userId: string | null; action: string; metadata: Record<string, unknown>; subjectType: string; subjectId: string; key: string | null; title: string | null };

export type FloorOverview = { people: OverviewPerson[]; activity: OverviewActivity[]; week: { start: string; days: string[] } };

export async function floorOverviewAction(entityId: string): Promise<FloorOverview> {
  const { auth } = await requireErpAccess();
  const today = new Date().toISOString().slice(0, 10);
  const week = weekBounds(today)!;
  const [read, loads] = await Promise.all([
    asPerson(async (tx) => {
      const people = await select<{ id: string; name: string; job_title: string | null; entity_code: string | null; capacity: number; home: boolean; readable: boolean }>(
        tx,
        `with x as (select id, code from erp.entity where id = $1::uuid)
         select p.id, coalesce(nullif(p.full_name, ''), p.email) as name, p.job_title, p.entity_code, p.weekly_capacity_hours as capacity,
                p.entity_code = x.code as home,
                work.actor_class() = 'admin' or p.id = erp.actor_id()
                  or work.is_entity_manager((select e.id from erp.entity e where e.code = p.entity_code)) as readable
           from work.person p, x
          where p.availability_status <> 'inactive'
            and (p.entity_code = x.code
                 or exists (select 1 from erp.task t where t.entity_id = x.id and t.assignee_id = p.id and t.status not in ('done', 'archived')))`,
        [entityId],
      );
      const ids = people.map((p) => p.id);
      const time = ids.length
        ? await select<{ user_id: string; work_date: string; minutes: number }>(
            tx,
            `select user_id, work_date::text as work_date, sum(minutes)::int as minutes from erp.time_entry
              where user_id = any($1::text[]) and work_date >= $2::date and work_date <= $3::date group by user_id, work_date`,
            [ids, week.start, week.days[6]],
          )
        : [];
      const weeks = ids.length
        ? await select<{ user_id: string; status: string }>(tx, "select user_id, status from work.timesheet_week where user_id = any($1::text[]) and week_start = $2::date", [ids, week.start])
        : [];
      const activity = await select<OverviewActivity>(
        tx,
        `select a.id, a.created_at as at, coalesce(p.full_name, p.email, '') as who, a.user_id as "userId", a.action, a.metadata,
                a.subject_type as "subjectType", a.subject_id as "subjectId",
                case when t.id is not null then (select e.ticket_prefix || '-' || t.number from erp.entity e where e.id = t.entity_id) end as key,
                coalesce(t.title, g.name) as title
           from work.activity a
           left join work.person p on p.id = a.user_id
           left join erp.task t on a.subject_type in ('task', 'ticket') and t.id = work.uuid_or_null(a.subject_id)
           left join erp.engagement g on a.subject_type = 'project' and g.id = work.uuid_or_null(a.subject_id)
          where (t.entity_id = $1::uuid or g.entity_id = $1::uuid)
          order by a.created_at desc limit 12`,
        [entityId],
      );
      return { people, time, weeks, activity };
    }),
    getTeamWorkload(auth.role, auth.profile.id).catch(() => []),
  ]);
  const loadOf = new Map(loads.map((w) => [w.id, w.load]));
  const statusOf = new Map(read.weeks.map((w) => [w.user_id, w.status]));
  return {
    people: read.people.map((p) => {
      const lines = read.time.filter((t) => t.user_id === p.id);
      const byDay = week.days.map((d) => lines.filter((t) => t.work_date === d).reduce((s, t) => s + t.minutes, 0));
      return {
        id: p.id,
        name: p.name,
        jobTitle: p.job_title,
        floor: p.entity_code ? (floors[p.entity_code]?.code ?? null) : null,
        home: p.home,
        capacity: p.capacity,
        load: loadOf.get(p.id) ?? null,
        week: p.readable ? { minutes: byDay.reduce((s, m) => s + m, 0), byDay, status: statusOf.get(p.id) ?? null } : null,
      };
    }),
    activity: read.activity,
    week: { start: week.start, days: week.days },
  };
}
