import "server-only";

import { requireCurrentEntityContext } from "@/lib/entities/scope";
import { createClient } from "@/lib/supabase/server";
import { weekBounds } from "@/lib/timesheet/validation";
import type { TimeEntry, TimeProject, TimeMission, TimeMissionFavorite, TimesheetProfile, TimesheetWeekEvent, TimesheetWeekStatus } from "@/types/timesheet";

type QueryFailure = { code?: string; message?: string };

async function readWithRetry<T>(label: string, query: () => PromiseLike<{ data: T | null; error: QueryFailure | null }>) {
  let lastError: QueryFailure | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data, error } = await query();
      if (!error) return data;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? { message: error.message } : { message: "Unknown connection error" };
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
  }
  console.error(`[timesheet:${label}]`, lastError?.code ?? "connection", lastError?.message ?? "Query failed");
  throw new Error("Timesheet unavailable");
}

export async function getTimesheet(week: string): Promise<{
  entries: TimeEntry[];
  projects: TimeProject[];
  missions: TimeMission[];
  favorites: TimeMissionFavorite[];
  weekStatus: TimesheetWeekStatus | null;
  events: TimesheetWeekEvent[];
}> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const supabase = await createClient();
  const bounds = weekBounds(week);
  if (!supabase || !bounds) throw new Error("Timesheet unavailable");

  // Page through results: totals must not silently stop at Supabase's row limit.
  const entries: TimeEntry[] = [];
  const projects: TimeProject[] = [];
  const missions: TimeMission[] = [];
  const favorites: TimeMissionFavorite[] = [];
  const events: TimesheetWeekEvent[] = [];
  let weekStatus: TimesheetWeekStatus | null = null;
  await Promise.all([
    (async () => {
      for (let offset = 0; ; offset += 500) {
        const data = await readWithRetry<TimeEntry[]>("read", () => supabase.from("time_entries")
          .select("id, project_id, work_date, duration_minutes, mission, note, updated_at, project:projects(name)")
          .eq("user_id", auth.user.id).eq("entity_code", entityCode)
          .gte("work_date", bounds.start).lt("work_date", bounds.end)
          .order("work_date", { ascending: false }).order("id")
          .range(offset, offset + 499).returns<TimeEntry[]>());
        entries.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        const data = await readWithRetry<TimeProject[]>("projects", () => supabase.from("timesheet_projects").select("id, name")
          .eq("entity_code", entityCode).order("name").order("id")
          .range(offset, offset + 499).returns<TimeProject[]>());
        projects.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        const data = await readWithRetry<TimeMission[]>("missions", () => supabase.from("timesheet_missions").select("project_id, mission")
          .eq("entity_code", entityCode).order("project_id").order("mission")
          .range(offset, offset + 499).returns<TimeMission[]>());
        missions.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        const data = await readWithRetry<TimeMissionFavorite[]>("favorites", () => supabase.from("time_mission_favorites").select("project_id, mission")
          .eq("user_id", auth.user.id).eq("entity_code", entityCode)
          .order("created_at", { ascending: false })
          .range(offset, offset + 499).returns<TimeMissionFavorite[]>());
        favorites.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
    })(),
    (async () => {
      const data = await readWithRetry<TimesheetWeekStatus>("week-status", () => supabase.from("timesheet_week_status")
        .select("user_id, week_start, entity_code, status, submitted_at, reviewed_at, reviewed_by, review_note")
        .eq("user_id", auth.user.id).eq("week_start", bounds.start).maybeSingle<TimesheetWeekStatus>());
      weekStatus = data;
    })(),
    (async () => {
      const data = await readWithRetry<Array<Omit<TimesheetWeekEvent, "actor_name"> & { actor: { full_name: string } | null }>>("events", () => supabase.from("timesheet_week_events")
        .select("id, user_id, week_start, entity_code, status, actor_id, note, created_at, actor:profiles!timesheet_week_events_actor_id_fkey(full_name)")
        .eq("user_id", auth.user.id).eq("week_start", bounds.start)
        .order("created_at", { ascending: false }).order("id") as unknown as PromiseLike<{ data: Array<Omit<TimesheetWeekEvent, "actor_name"> & { actor: { full_name: string } | null }> | null; error: QueryFailure | null }>);
      const rows = data ?? [];
      events.push(...rows.map(({ actor, ...event }) => ({ ...event, actor_name: actor?.full_name ?? null })));
    })(),
  ]);
  const projectIds = new Set(projects.map(project => project.id));
  return { entries, projects, missions: missions.filter(mission => projectIds.has(mission.project_id)), favorites: favorites.filter(favorite => projectIds.has(favorite.project_id)), weekStatus, events };
}

export async function getAdminTimesheetOverview(week: string) {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const supabase = await createClient();
  const bounds = weekBounds(week);
  if (!supabase || !bounds || (auth.role !== "admin" && auth.role !== "manager")) throw new Error("Timesheet unavailable");
  const acrossEntities = auth.role === "admin";

  const profiles: TimesheetProfile[] = [];
  const entries: TimeEntry[] = [];
  const statuses: TimesheetWeekStatus[] = [];
  const events: TimesheetWeekEvent[] = [];
  await Promise.all([
    (async () => {
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("profiles").select("id, full_name, role, entity_code, weekly_capacity_hours");
        if (!acrossEntities) query = query.eq("entity_code", entityCode);
        const { data, error } = await query.order("full_name").order("id")
          .range(offset, offset + 499).returns<TimesheetProfile[]>();
        if (error) { console.error("[timesheet:admin-profiles]", error.code); throw new Error("Timesheet unavailable"); }
        profiles.push(...data);
        if (data.length < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("time_entries")
          .select("id, user_id, entity_code, project_id, work_date, duration_minutes, mission, note, updated_at, project:projects(name)")
          .gte("work_date", bounds.start).lt("work_date", bounds.end);
        if (!acrossEntities) query = query.eq("entity_code", entityCode);
        const { data, error } = await query.order("work_date").order("user_id").order("id")
          .range(offset, offset + 499).returns<TimeEntry[]>();
        if (error) { console.error("[timesheet:admin-entries]", error.code); throw new Error("Timesheet unavailable"); }
        entries.push(...data);
        if (data.length < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("timesheet_week_status")
          .select("user_id, week_start, entity_code, status, submitted_at, reviewed_at, reviewed_by, review_note")
          .eq("week_start", bounds.start);
        if (!acrossEntities) query = query.eq("entity_code", entityCode);
        const { data, error } = await query.order("user_id")
          .range(offset, offset + 499).returns<TimesheetWeekStatus[]>();
        if (error) { console.error("[timesheet:admin-statuses]", error.code); throw new Error("Timesheet unavailable"); }
        statuses.push(...data);
        if (data.length < 500) break;
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("timesheet_week_events")
          .select("id, user_id, week_start, entity_code, status, actor_id, note, created_at, actor:profiles!timesheet_week_events_actor_id_fkey(full_name)")
          .eq("week_start", bounds.start);
        if (!acrossEntities) query = query.eq("entity_code", entityCode);
        const { data, error } = await query.order("created_at", { ascending: false }).order("id")
          .range(offset, offset + 499);
        if (error) { console.error("[timesheet:admin-events]", error.code); throw new Error("Timesheet unavailable"); }
        const rows = (data ?? []) as unknown as Array<Omit<TimesheetWeekEvent, "actor_name"> & { actor: { full_name: string } | null }>;
        events.push(...rows.map(({ actor, ...event }) => ({ ...event, actor_name: actor?.full_name ?? null })));
        if (rows.length < 500) break;
      }
    })(),
  ]);
  return { profiles, entries, statuses, events };
}
