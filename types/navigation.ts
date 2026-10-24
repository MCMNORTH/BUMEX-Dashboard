import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/types/auth";
import type { ErpModuleKey } from "@/types/erp";

export type AppRouteKey =
  | "overview"
  | "projects"
  | "tickets"
  | "my-work"
  | "timesheet"
  | "planning"
  | "staffing"
  | "roadmap"
  | "calendar"
  | "team"
  | "reports"
  | "notifications"
  | "clients"
  | "contracts"
  | "documents"
  | "finance"
  | "activity"
  | "shareholders"
  | "erp"
  | "settings";

export type NavigationItemConfig = {
  href: `/${AppRouteKey}` | `/erp/${string}`;
  label: string;
  icon: LucideIcon;
  description: string;
  allowedRoles: AppRole[];
  // ERP pages: shown only to people whose ERP access opens this module (lib/erp/config.ts)
  erpModule?: ErpModuleKey;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItemConfig[];
};

export type PlaceholderPageContent = {
  title: string;
  subtitle: string;
  eyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  placeholderLabel: string;
};
