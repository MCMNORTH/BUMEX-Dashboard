import type { User } from "@supabase/supabase-js";

import type { BumexEntityCode } from "@/types/entity";
import type { AppRouteKey } from "@/types/navigation";

export type AppRole = "admin" | "manager" | "supervisor" | "employee" | "shareholder";
export type AvailabilityStatus = "available" | "busy" | "overloaded" | "away" | "inactive";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  is_super_admin: boolean;
  entity_code: BumexEntityCode | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  skills: string[];
  phone: string | null;
  availability_status: AvailabilityStatus;
  weekly_capacity_hours: number;
  created_at: string;
  updated_at: string;
};

export type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

export type PermissionSet = {
  role: AppRole | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isSupervisor: boolean;
  isEmployee: boolean;
  isShareholder: boolean;
  canSwitchEntities: boolean;
  canAccessRoute: (route: AppRouteKey) => boolean;
  canAccessFinance: boolean;
  canManageProjects: boolean;
  canViewShareholderArea: boolean;
  canViewSensitiveFinance: boolean;
  canViewInternalTickets: boolean;
  canViewBankDetails: boolean;
  canViewEmployeePerformanceDetails: boolean;
};
