import type { AppRole, Profile } from "@/types/auth";
import type { ActivityLogRecord } from "@/types/activity";
import type {
  DeadlineState,
  ProjectClient,
  ProjectHealth,
  ProjectOwner,
  ProjectStatus,
} from "@/types/project";

export type MilestoneStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "delayed"
  | "cancelled";

export type RoadmapView = "month" | "quarter" | "project" | "client";

export type MilestoneOwner = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type MilestoneRecord = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  due_date: string;
  completed_at: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  owner: MilestoneOwner | null;
  dueState: DeadlineState;
};

export type RoadmapProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  status: ProjectStatus;
  owner_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  client: ProjectClient | null;
  owner: ProjectOwner | null;
  progress: number;
  health: ProjectHealth;
  milestoneCompletion: number;
  totalMilestones: number;
  openMilestones: number;
  delayedMilestones: number;
  nextMilestone: MilestoneRecord | null;
  milestones: MilestoneRecord[];
};

export type RoadmapFilters = {
  search?: string;
  status?: MilestoneStatus | "open" | "";
  projectId?: string;
  clientId?: string;
  ownerId?: string;
};

export type RoadmapFilterData = {
  projects: Array<Pick<RoadmapProjectRecord, "id" | "name">>;
  clients: ProjectClient[];
  owners: MilestoneOwner[];
};

export type MilestoneFormValues = {
  project_id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  due_date: string;
  owner_id: string;
};

export type RoadmapPeriod = {
  key: string;
  label: string;
  start: string;
  end: string;
};

export type RoadmapSummary = {
  visibleProjects: number;
  openMilestones: number;
  completedMilestones: number;
  delayedMilestones: number;
};

export type MilestonePermissions = {
  canManage: boolean;
  role: AppRole;
};

export type MilestoneActivity = ActivityLogRecord;
