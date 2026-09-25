import type { AvailabilityStatus } from "@/types/auth";
import type { BumexEntityCode } from "@/types/entity";

export type StaffingStatus = "draft" | "requested" | "confirmed" | "completed" | "cancelled";

export type StaffingPerson = {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  entity_code: BumexEntityCode | null;
  availability_status: AvailabilityStatus;
  weekly_capacity_hours: number;
  skills: string[];
};

export type StaffingProject = {
  id: string;
  name: string;
  entity_code: BumexEntityCode | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export type StaffingAssignment = {
  id: string;
  project_id: string;
  user_id: string;
  entity_code: BumexEntityCode;
  project_role: string;
  start_date: string;
  end_date: string;
  allocation_percent: number;
  weekly_hours: number;
  status: StaffingStatus;
  note: string | null;
  created_at: string;
  actual_minutes: number;
  project: { id: string; name: string } | null;
  person: { id: string; full_name: string; job_title: string | null; entity_code: BumexEntityCode | null } | null;
};

export type StaffingActivity = {
  id: string;
  action: string;
  entity_id: string;
  created_at: string;
  metadata: Record<string, string | number | boolean | null | undefined>;
  user: { full_name: string } | null;
};
