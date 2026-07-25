import type { ActivityLogRecord } from "@/types/activity";
import type { Profile } from "@/types/auth";
import type { ClientRecord } from "@/types/client";
import type { ProjectRecord } from "@/types/project";

export type ContractStatus =
  | "draft"
  | "under_review"
  | "signed"
  | "active"
  | "expired"
  | "cancelled"
  | "archived";

export type ContractType =
  | "development"
  | "maintenance"
  | "consulting"
  | "support"
  | "hosting"
  | "audit"
  | "other";

export type ContractClientPreview = Pick<ClientRecord, "id" | "name" | "status" | "contact_email">;
export type ContractProjectPreview = Pick<ProjectRecord, "id" | "name" | "status" | "end_date">;
export type ContractResponsibleUser = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type ContractRecord = {
  id: string;
  title: string;
  contract_number: string | null;
  client_id: string;
  project_id: string | null;
  status: ContractStatus;
  contract_type: ContractType;
  start_date: string | null;
  end_date: string | null;
  signed_date: string | null;
  renewal_date: string | null;
  amount: number | null;
  currency: string;
  payment_terms: string | null;
  responsible_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client: ContractClientPreview | null;
  project: ContractProjectPreview | null;
  responsibleUser: ContractResponsibleUser | null;
  recentActivity: ActivityLogRecord[];
  daysUntilRenewal: number | null;
  renewalState: "renewing_soon" | "expired" | "scheduled" | "none";
  viewMode: "full" | "summary";
};

export type ContractFilters = {
  search?: string;
  clientId?: string;
  status?: ContractStatus | "";
  date?: "all" | "expired" | "renewing_soon" | "active_window" | "none";
  value?: "all" | "under_10k" | "10k_50k" | "50k_plus" | "unset";
};

export type ContractFormValues = {
  title: string;
  contract_number: string;
  client_id: string;
  project_id: string;
  status: ContractStatus;
  contract_type: ContractType;
  start_date: string;
  end_date: string;
  signed_date: string;
  renewal_date: string;
  amount: string;
  currency: string;
  payment_terms: string;
  responsible_user_id: string;
  notes: string;
};

export type ContractFiltersData = {
  clients: Array<Pick<ClientRecord, "id" | "name" | "status" | "contact_email">>;
  projects: Array<Pick<ProjectRecord, "id" | "name" | "status" | "end_date">>;
  responsibleUsers: ContractResponsibleUser[];
};
