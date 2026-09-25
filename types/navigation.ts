import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/types/auth";

export type AppRouteKey =
  | "overview"
  | "projects"
  | "tickets"
  | "my-work"
  | "staffing"
  | "planning"
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
  | "settings";

export type NavigationItemConfig = {
  href: `/${AppRouteKey}`;
  label: string;
  icon: LucideIcon;
  description: string;
  allowedRoles: AppRole[];
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
