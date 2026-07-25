import type { AppRole } from "@/types/auth";

export type ReportType =
  | "daily_individual"
  | "weekly_individual"
  | "weekly_team"
  | "project_progress"
  | "project_status"
  | "finance_summary"
  | "team_workload"
  | "client_relationship"
  | "shareholder_executive"
  | "shareholder_monthly"
  | "shareholder_portfolio"
  | "shareholder_finance"
  | "shareholder_risk";

export type ReportSectionKey =
  | "summary"
  | "completed_work"
  | "ongoing_work"
  | "blockers"
  | "upcoming_priorities"
  | "risks"
  | "notes";

export type ReportSection = {
  key: ReportSectionKey;
  title: string;
  items: string[];
};

export type ReportDocument = {
  type: ReportType;
  title: string;
  subtitle: string;
  scopeLabel: string;
  generatedAt: string;
  summary: string;
  sections: ReportSection[];
  text: string;
  csvFilename?: string;
  csvRows?: Array<Record<string, string | number | boolean | null | undefined>>;
};

export type ReportBuilderFilters = {
  type: ReportType;
  startDate: string;
  endDate: string;
  userId: string;
  projectId: string;
  clientId: string;
};

export type ReportBuilderData = {
  allowedTypes: ReportType[];
  users: Array<{ id: string; full_name: string }>;
  projects: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
};

export type ReportContext = {
  role: AppRole;
  currentUserId: string;
  targetUserId?: string;
  projectId?: string;
  clientId?: string;
  startDate: string;
  endDate: string;
};
