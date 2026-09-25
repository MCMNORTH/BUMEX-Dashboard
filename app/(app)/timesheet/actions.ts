"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentEntityContext } from "@/lib/entities/scope";
import { createClient } from "@/lib/supabase/server";
import { createScopedNotifications } from "@/lib/notifications/service";
import { addDays, validateTimeInput, weekBounds } from "@/lib/timesheet/validation";
import type { TimeInput, TimeResult } from "@/types/timesheet";

export async function saveTimeAction(input: TimeInput): Promise<TimeResult> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const validation = validateTimeInput(input);
  if (validation) return { error: validation };
  const supabase = await createClient();
  if (!supabase) return { error: "unavailable" };
  try {
    const { data: project, error: projectError } = await supabase.from("timesheet_projects").select("id")
      .eq("id", input.project_id).eq("entity_code", entityCode).maybeSingle();
    if (projectError || !project) return { error: "project" };
    const payload = {
      project_id: input.project_id,
      work_date: input.work_date,
      duration_minutes: Number(input.hours) * 60 + Number(input.minutes),
      note: input.note.trim(),
      mission: input.mission.trim().replace(/\s+/g, " "),
    };
    const query = input.updated_at
      ? supabase.from("time_entries").update(payload).eq("id", input.id)
        .eq("user_id", auth.user.id).eq("entity_code", entityCode).eq("updated_at", input.updated_at)
      : supabase.from("time_entries").insert({ ...payload, id: input.id, user_id: auth.user.id, entity_code: entityCode });
    const { data, error } = await query.select("id").maybeSingle();
    if (error) {
      if (error.message.includes("time_entry_daily_limit")) return { error: "daily_limit" };
      if (error.message.includes("time_entry_future_date")) return { error: "date" };
      if (error.code === "23505") return { error: "conflict" };
      console.error("[timesheet:save]", error.code);
      return { error: "unavailable" };
    }
    if (!data) return { error: "conflict" };
    revalidatePath("/timesheet");
    return { success: true };
  } catch {
    console.error("[timesheet:save] connection failed");
    return { error: "unavailable" };
  }
}

export async function copyPreviousWeekAction(targetWeek: string): Promise<{ success: true; count: number } | { error: "invalid" | "not_empty" | "no_source" | "unavailable" }> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const target = weekBounds(targetWeek);
  const today = new Date().toISOString().slice(0, 10);
  if (!target || target.start > today) return { error: "invalid" };
  const source = weekBounds(addDays(target.start, -7));
  const supabase = await createClient();
  if (!supabase || !source) return { error: "unavailable" };
  try {
    const [{ count, error: countError }, { data: sourceEntries, error: sourceError }, { data: allowedProjects, error: projectsError }] = await Promise.all([
      supabase.from("time_entries").select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id).eq("entity_code", entityCode)
        .gte("work_date", target.start).lt("work_date", target.end),
      supabase.from("time_entries").select("project_id, work_date, duration_minutes, mission, note")
        .eq("user_id", auth.user.id).eq("entity_code", entityCode)
        .gte("work_date", source.start).lt("work_date", source.end)
        .order("work_date").order("id"),
      supabase.from("timesheet_projects").select("id").eq("entity_code", entityCode),
    ]);
    if (countError || sourceError || projectsError) return { error: "unavailable" };
    if ((count ?? 0) > 0) return { error: "not_empty" };
    const allowed = new Set((allowedProjects ?? []).map(project => project.id));
    const rows = (sourceEntries ?? []).filter(entry => allowed.has(entry.project_id)).map(entry => ({
      id: crypto.randomUUID(),
      user_id: auth.user.id,
      entity_code: entityCode,
      project_id: entry.project_id,
      work_date: addDays(entry.work_date, 7),
      duration_minutes: entry.duration_minutes,
      mission: entry.mission,
      note: entry.note,
    }));
    if (!rows.length) return { error: "no_source" };
    const { error } = await supabase.from("time_entries").insert(rows);
    if (error) {
      console.error("[timesheet:copy-week]", error.code);
      return { error: "unavailable" };
    }
    revalidatePath("/timesheet");
    return { success: true, count: rows.length };
  } catch {
    console.error("[timesheet:copy-week] connection failed");
    return { error: "unavailable" };
  }
}

export async function setMissionFavoriteAction(input: { projectId: string; mission: string; favorite: boolean }): Promise<{ success: true } | { error: "invalid" | "project" | "unavailable" }> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const mission = input.mission.trim().replace(/\s+/g, " ");
  if (!input.projectId || !mission || mission.length > 200) return { error: "invalid" };
  const supabase = await createClient();
  if (!supabase) return { error: "unavailable" };
  try {
    const { data: project, error: projectError } = await supabase.from("timesheet_projects").select("id")
      .eq("id", input.projectId).eq("entity_code", entityCode).maybeSingle();
    if (projectError || !project) return { error: "project" };
    const query = input.favorite
      ? supabase.from("time_mission_favorites").upsert({ user_id: auth.user.id, entity_code: entityCode, project_id: input.projectId, mission }, { onConflict: "user_id,project_id,mission" })
      : supabase.from("time_mission_favorites").delete().eq("user_id", auth.user.id).eq("entity_code", entityCode).eq("project_id", input.projectId).eq("mission", mission);
    const { error } = await query;
    if (error) {
      console.error("[timesheet:favorite]", error.code);
      return { error: "unavailable" };
    }
    revalidatePath("/timesheet");
    return { success: true };
  } catch {
    console.error("[timesheet:favorite] connection failed");
    return { error: "unavailable" };
  }
}

export async function submitTimesheetWeekAction(week: string): Promise<{ success: true } | { error: "invalid" | "empty" | "approved" | "unavailable" }> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  const today = new Date().toISOString().slice(0, 10);
  if (!bounds || bounds.start > today) return { error: "invalid" };
  const supabase = await createClient();
  if (!supabase) return { error: "unavailable" };
  try {
    const [{ count, error: entriesError }, { data: current, error: statusError }] = await Promise.all([
      supabase.from("time_entries").select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.id).eq("entity_code", entityCode)
        .gte("work_date", bounds.start).lt("work_date", bounds.end),
      supabase.from("timesheet_week_status").select("status")
        .eq("user_id", auth.user.id).eq("week_start", bounds.start).maybeSingle(),
    ]);
    if (entriesError || statusError) return { error: "unavailable" };
    if (!count) return { error: "empty" };
    if (current?.status === "approved") return { error: "approved" };
    if (current?.status === "submitted") return { success: true };
    const { error } = current?.status === "returned"
      ? await supabase.from("timesheet_week_status").update({ status: "submitted", submitted_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, review_note: null }).eq("user_id", auth.user.id).eq("week_start", bounds.start).eq("status", "returned")
      : await supabase.from("timesheet_week_status").insert({ user_id: auth.user.id, week_start: bounds.start, entity_code: entityCode, status: "submitted" });
    if (error) { console.error("[timesheet:submit-week]", error.code); return { error: "unavailable" }; }
    const [{ data: admins }, { data: managers }] = await Promise.all([
      supabase.from("profiles").select("id").eq("role", "admin"),
      supabase.from("profiles").select("id").eq("role", "manager").eq("entity_code", entityCode),
    ]);
    await createScopedNotifications({
      userIds: [...(admins ?? []).map(profile => profile.id), ...(managers ?? []).map(profile => profile.id)],
      type: "status_change",
      title: "Timesheet submitted",
      body: `${auth.profile.full_name} submitted a weekly timesheet for review.`,
      entityType: "timesheet",
      entityId: auth.user.id,
      skipUserId: auth.user.id,
    }).catch(() => console.error("[timesheet:submit-notification] failed"));
    revalidatePath("/timesheet");
    return { success: true };
  } catch {
    return { error: "unavailable" };
  }
}

export async function approveTimesheetWeekAction(userId: string, week: string): Promise<void> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  if (!bounds || (auth.role !== "admin" && auth.role !== "manager")) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { data: profile } = await supabase.from("profiles").select("entity_code").eq("id", userId).maybeSingle();
  if (!profile || (auth.role === "manager" && profile.entity_code !== entityCode)) return;
  const { data: approved, error } = await supabase.from("timesheet_week_status").update({
    status: "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user.id,
  }).eq("user_id", userId).eq("week_start", bounds.start).eq("status", "submitted").select("user_id");
  if (error) console.error("[timesheet:approve-week]", error.code);
  else if (approved?.length) await createScopedNotifications({ userIds: [userId], type: "status_change", title: "Timesheet approved", body: "Your weekly timesheet was approved.", entityType: "timesheet", entityId: userId, skipUserId: auth.user.id }).catch(() => console.error("[timesheet:approve-notification] failed"));
  revalidatePath("/timesheet");
}

export async function approveTimesheetWeeksAction(userIds: string[], week: string): Promise<void> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  const uniqueIds = [...new Set(userIds)].filter(Boolean).slice(0, 500);
  if (!bounds || !uniqueIds.length || (auth.role !== "admin" && auth.role !== "manager")) return;
  const supabase = await createClient();
  if (!supabase) return;
  let profileQuery = supabase.from("profiles").select("id").in("id", uniqueIds);
  if (auth.role === "manager") profileQuery = profileQuery.eq("entity_code", entityCode);
  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError || !profiles?.length) return;
  const allowedIds = profiles.map(profile => profile.id);
  const { data: approved, error } = await supabase.from("timesheet_week_status").update({
    status: "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user.id,
  }).in("user_id", allowedIds).eq("week_start", bounds.start).eq("status", "submitted").select("user_id");
  if (error) console.error("[timesheet:approve-weeks]", error.code);
  else await Promise.all((approved ?? []).map(({ user_id: userId }) => createScopedNotifications({ userIds: [userId], type: "status_change", title: "Timesheet approved", body: "Your weekly timesheet was approved.", entityType: "timesheet", entityId: userId, skipUserId: auth.user.id }).catch(() => console.error("[timesheet:approve-notification] failed"))));
  revalidatePath("/timesheet");
}

export async function returnTimesheetWeekAction(userId: string, week: string, formData: FormData): Promise<void> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ");
  if (!bounds || reason.length < 3 || reason.length > 500 || (auth.role !== "admin" && auth.role !== "manager")) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { data: profile } = await supabase.from("profiles").select("entity_code").eq("id", userId).maybeSingle();
  if (!profile || (auth.role === "manager" && profile.entity_code !== entityCode)) return;
  const { data: returned, error } = await supabase.from("timesheet_week_status").update({
    status: "returned",
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user.id,
    review_note: reason,
  }).eq("user_id", userId).eq("week_start", bounds.start).eq("status", "submitted").select("user_id");
  if (error) console.error("[timesheet:return-week]", error.code);
  else if (returned?.length) await createScopedNotifications({ userIds: [userId], type: "status_change", title: "Timesheet needs changes", body: `Your weekly timesheet was returned: ${reason}`, entityType: "timesheet", entityId: userId, skipUserId: auth.user.id }).catch(() => console.error("[timesheet:return-notification] failed"));
  revalidatePath("/timesheet");
}

export async function remindTimesheetWeekAction(userId: string, week: string): Promise<void> {
  const { auth, entityCode } = await requireCurrentEntityContext();
  const bounds = weekBounds(week);
  if (!bounds || userId === auth.user.id || (auth.role !== "admin" && auth.role !== "manager")) return;
  const supabase = await createClient();
  if (!supabase) return;
  const [{ data: profile }, { data: status }] = await Promise.all([
    supabase.from("profiles").select("id, entity_code").eq("id", userId).maybeSingle(),
    supabase.from("timesheet_week_status").select("status").eq("user_id", userId).eq("week_start", bounds.start).maybeSingle(),
  ]);
  if (!profile || (auth.role === "manager" && profile.entity_code !== entityCode) || status?.status === "submitted" || status?.status === "approved") return;
  const title = status?.status === "returned" ? "Timesheet correction reminder" : "Timesheet reminder";
  const { error: reminderError } = await supabase.from("timesheet_reminders").insert({
    user_id: userId,
    week_start: bounds.start,
    entity_code: profile.entity_code,
    sent_by: auth.user.id,
  });
  if (reminderError?.code === "23505") return;
  if (reminderError) { console.error("[timesheet:reminder]", reminderError.code); return; }
  const body = status?.status === "returned"
    ? `Please correct and resubmit your timesheet for the week of ${bounds.start}.`
    : `Please complete and submit your timesheet for the week of ${bounds.start}.`;
  await createScopedNotifications({ userIds: [userId], type: "deadline", title, body, entityType: "timesheet", entityId: userId, skipUserId: auth.user.id }).catch(() => console.error("[timesheet:reminder-notification] failed"));
  revalidatePath("/timesheet");
}
