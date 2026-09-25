import type { TimeInput, TimeError } from "../../types/timesheet.ts";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateTimeInput(input: TimeInput, today = new Date().toISOString().slice(0, 10)): TimeError | null {
  if (!input || typeof input !== "object" || !uuidPattern.test(input.id ?? "") || !uuidPattern.test(input.project_id ?? "")) return "invalid";
  if (typeof input.hours !== "string" || typeof input.minutes !== "string" || !/^\d{1,2}$/.test(input.hours) || !/^\d{1,2}$/.test(input.minutes)) return "duration";
  const hours = Number(input.hours);
  const minutes = Number(input.minutes);
  if (minutes > 59 || hours * 60 + minutes < 1 || hours * 60 + minutes > 1440) return "duration";
  if (typeof input.work_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.work_date)) return "date";
  const date = new Date(input.work_date + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.work_date || input.work_date > today || input.work_date < "2000-01-01") return "date";
  if (typeof input.note !== "string" || input.note.trim().length > 1000) return "note";
  if (typeof input.mission !== "string" || !input.mission.trim() || input.mission.trim().length > 200) return "mission";
  if (input.updated_at !== undefined && (typeof input.updated_at !== "string" || !Number.isFinite(Date.parse(input.updated_at)))) return "invalid";
  return null;
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2000-01" || month > "9998-12") return null;
  const [year, number] = month.split("-").map(Number);
  return { start: month + "-01", end: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) };
}

export function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export function addDays(date: string, count: number) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function weekBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "2000-01-03" || date > "9998-12-31") return null;
  const parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const start = addDays(date, -((parsed.getUTCDay() + 6) % 7));
  return { start, end: addDays(start, 7), days: Array.from({ length: 7 }, (_, index) => addDays(start, index)) };
}
