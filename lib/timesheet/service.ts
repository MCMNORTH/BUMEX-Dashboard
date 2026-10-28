import "server-only";

import { requireCurrentEntityContext, requireTimeEntityContext } from "@/lib/entities/scope";
import { weekBounds } from "@/lib/timesheet/validation";
import { asPerson, select, selectOne } from "@/lib/work/db";
import type { TimeEntry, TimeProject, TimeMission, TimeMissionFavorite, TimeTicket, TimesheetProfile, TimesheetWeekEvent, TimesheetWeekStatus } from "@/types/timesheet";

// Timesheets: lines are erp.time_entry (minutes on a mission), weeks work.timesheet_week and their history
// work.timesheet_week_event (0008), each in the person's current entity. The rules let a person read their own, their
// entity's managers and the administrators everyone's.

// a line as the screens read it (`t` the line, `x` its entity)
export const TIME_ENTRY_COLUMNS = `
  t.id, t.user_id, x.code as entity_code, t.engagement_id as project_id, t.work_date, t.minutes as duration_minutes, coalesce(t.description, '') as note,
  t.mission, t.updated_at, (select jsonb_build_object('name', e.name) from erp.engagement e where e.id = t.engagement_id) as project,
  t.task_id, (select kx.ticket_prefix || '-' || k.number from erp.task k join erp.entity kx on kx.id = k.entity_id where k.id = t.task_id) as task_key`;

export const WEEK_COLUMNS = `w.user_id, w.week_start, x.code as entity_code, w.status, w.submitted_at, w.reviewed_at, w.reviewed_by, w.review_note`;

const EVENT_SQL = `
  select v.id, v.user_id, v.week_start, x.code as entity_code, v.status, v.actor_id, (select p.full_name from work.person p where p.id = v.actor_id) as actor_name,
         v.note, v.created_at
    from work.timesheet_week_event v join erp.entity x on x.id = v.entity_id`;

// The missions of the entity a person enters time on (BUMEX One's timesheet_projects view).
export const TIMESHEET_PROJECTS_SQL = `
  select e.id, e.name from erp.engagement e join erp.entity x on x.id = e.entity_id
   where x.code = $1 and work.is_timesheet_project(e.id)`;

// test: the person's test lines on the test floor (0011), without a week
export async function getTimesheet(week: string, test = false): Promise<{
  entries: TimeEntry[];
  projects: TimeProject[];
  missions: TimeMission[];
  favorites: TimeMissionFavorite[];
  tickets: TimeTicket[];
  weekStatus: TimesheetWeekStatus | null;
  events: TimesheetWeekEvent[];
}> {
  const { auth, entityCode } = await requireTimeEntityContext(test);
  const bounds = weekBounds(week);
  if (!bounds) throw new Error("Timesheet unavailable");

  try {
    return await asPerson(async (tx) => {
      const entries = await select<TimeEntry>(
        tx,
        `select ${TIME_ENTRY_COLUMNS} from erp.time_entry t join erp.entity x on x.id = t.entity_id
          where t.user_id = $1 and x.code = $2 and t.work_date >= $3::date and t.work_date < $4::date
          order by t.work_date desc, t.id`,
        [auth.user.id, entityCode, bounds.start, bounds.end],
      );
      const projects = await select<TimeProject>(tx, `${TIMESHEET_PROJECTS_SQL} order by e.name, e.id`, [entityCode]);
      // the mission labels used on the entity's lines the person may read
      const missions = await select<TimeMission>(
        tx,
        `select distinct t.engagement_id as project_id, t.mission from erp.time_entry t join erp.entity x on x.id = t.entity_id
          where x.code = $1 and t.mission <> '' order by 1, 2`,
        [entityCode],
      );
      const favorites = await select<TimeMissionFavorite>(
        tx,
        `select f.engagement_id as project_id, f.mission from work.mission_favorite f join erp.entity x on x.id = f.entity_id
          where f.user_id = $1 and x.code = $2 order by f.created_at desc`,
        [auth.user.id, entityCode],
      );
      const weekStatus = test ? null : await selectOne<TimesheetWeekStatus>(
        tx,
        `select ${WEEK_COLUMNS} from work.timesheet_week w join erp.entity x on x.id = w.entity_id where w.user_id = $1 and w.week_start = $2::date`,
        [auth.user.id, bounds.start],
      );
      const events = test ? [] : await select<TimesheetWeekEvent>(
        tx,
        `${EVENT_SQL} where v.user_id = $1 and v.week_start = $2::date order by v.created_at desc, v.id`,
        [auth.user.id, bounds.start],
      );
      const projectIds = new Set(projects.map((project) => project.id));
      // the person's open tickets on these missions: an entry on one counts on the ticket (0012)
      const tickets = await select<TimeTicket>(
        tx,
        `select k.id, kx.ticket_prefix || '-' || k.number as key, k.title, k.engagement_id as project_id
           from erp.task k join erp.entity kx on kx.id = k.entity_id
          where k.assignee_id = $1 and k.status not in ('done', 'archived') and k.engagement_id = any($2::uuid[])
          order by k.updated_at desc limit 100`,
        [auth.user.id, [...projectIds]],
      );
      return {
        tickets,
        entries,
        projects,
        missions: missions.filter((mission) => projectIds.has(mission.project_id)),
        favorites: favorites.filter((favorite) => projectIds.has(favorite.project_id)),
        weekStatus,
        events,
      };
    });
  } catch (error) {
    console.error("[timesheet:read]", error instanceof Error ? error.message : "connection");
    throw new Error("Timesheet unavailable");
  }
}

export async function getAdminTimesheetOverview(week: string) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  if (!bounds || (auth.role !== "admin" && auth.role !== "manager")) throw new Error("Timesheet unavailable");
  // an administrator reviews every entity; a manager their own
  const scope = auth.role === "admin" ? null : entityCode;

  try {
    return await asPerson(async (tx) => ({
      profiles: await select<TimesheetProfile>(
        tx,
        `select p.id, p.full_name, work.person_role(p.id) as role, p.entity_code, p.weekly_capacity_hours from work.person p
          where $1::text is null or p.entity_code = $1 order by p.full_name, p.id`,
        [scope],
      ),
      entries: await select<TimeEntry>(
        tx,
        `select ${TIME_ENTRY_COLUMNS} from erp.time_entry t join erp.entity x on x.id = t.entity_id
          where t.work_date >= $1::date and t.work_date < $2::date and ($3::text is null or x.code = $3) and not x.is_test
          order by t.work_date, t.user_id, t.id`,
        [bounds.start, bounds.end, scope],
      ),
      statuses: await select<TimesheetWeekStatus>(
        tx,
        `select ${WEEK_COLUMNS} from work.timesheet_week w join erp.entity x on x.id = w.entity_id
          where w.week_start = $1::date and ($2::text is null or x.code = $2) order by w.user_id`,
        [bounds.start, scope],
      ),
      events: await select<TimesheetWeekEvent>(
        tx,
        `${EVENT_SQL} where v.week_start = $1::date and ($2::text is null or x.code = $2) order by v.created_at desc, v.id`,
        [bounds.start, scope],
      ),
    }));
  } catch (error) {
    console.error("[timesheet:overview]", error instanceof Error ? error.message : "connection");
    throw new Error("Timesheet unavailable");
  }
}
