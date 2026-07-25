export type PlanningAlertType =
  | "overdue"
  | "workload"
  | "deadline_risk"
  | "blocked"
  | "unassigned"
  | "financial_due"
  | "contract_due";

export type AlertSeverity = "info" | "warning" | "critical";

export type PlanningAlert = {
  id: string;
  type: PlanningAlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  href?: string | null;
  label?: string | null;
  metric?: string | null;
  entityId?: string | null;
  entityType?: "project" | "task" | "milestone" | "person" | "payment" | "contract" | "placeholder";
};
