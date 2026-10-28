export type TimeEntry = {
  id: string;
  user_id?: string;
  entity_code?: import("@/types/entity").BumexEntityCode | null;
  project_id: string;
  work_date: string;
  duration_minutes: number;
  note: string;
  mission: string;
  updated_at: string;
  project: { name: string } | null;
  /** The ticket the time was spent on (0012), and its key (AUD-142). */
  task_id?: string | null;
  task_key?: string | null;
};

/** One of the person's open tickets on a mission of their timesheet: time logged on it counts on the ticket. */
export type TimeTicket = { id: string; key: string | null; title: string; project_id: string };

export type TimesheetProfile = {
  id: string;
  full_name: string;
  role: import("@/types/auth").AppRole;
  entity_code: import("@/types/entity").BumexEntityCode | null;
  weekly_capacity_hours: number;
};

export type TimeProject = { id: string; name: string };
export type TimeMission = { project_id: string; mission: string };
export type TimeMissionFavorite = { project_id: string; mission: string };
export type TimesheetWeekStatus = {
  user_id: string;
  week_start: string;
  entity_code: string;
  status: "submitted" | "approved" | "returned";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

export type TimesheetWeekEvent = {
  id: string;
  user_id: string;
  week_start: string;
  entity_code: string;
  status: "submitted" | "approved" | "returned";
  actor_id: string | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

export type TimeInput = {
  id: string;
  project_id: string;
  work_date: string;
  hours: string;
  minutes: string;
  note: string;
  mission: string;
  updated_at?: string;
  /** The ticket the time is spent on, of the line's mission (0012). */
  task_id?: string | null;
};

export type TimeError = "invalid" | "duration" | "date" | "note" | "mission" | "project" | "unavailable" | "conflict" | "daily_limit" | "locked";
export type TimeResult = { success: true } | { error: TimeError };
