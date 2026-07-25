import type { Profile } from "@/types/auth";
import type { ActivityLogRecord } from "@/types/activity";
import type { ContractRecord } from "@/types/contract";
import type { DocumentRecord } from "@/types/document";
import type { ProjectRecord } from "@/types/project";
import type { TicketRecord } from "@/types/ticket";

export type ClientStatus = "prospect" | "active" | "inactive" | "suspended" | "archived";
export type ClientType = "company" | "public_institution" | "ngo" | "individual" | "other";

export type ClientAccountManager = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "role">;

export type ClientProjectPreview = Pick<
  ProjectRecord,
  "id" | "name" | "status" | "progress" | "health" | "end_date"
>;

export type ClientLinkedContract = Pick<
  ContractRecord,
  | "id"
  | "title"
  | "status"
  | "contract_type"
  | "renewal_date"
  | "end_date"
  | "renewalState"
  | "daysUntilRenewal"
>;

export type ClientLinkedDocument = Pick<
  DocumentRecord,
  | "id"
  | "title"
  | "document_type"
  | "visibility"
  | "is_archived"
  | "updated_at"
  | "related_type"
  | "relatedLabel"
>;

export type ClientLinkedTicket = Pick<
  TicketRecord,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "due_date"
  | "updated_at"
  | "project_id"
  | "project"
  | "assignee"
  | "viewMode"
>;

export type ClientTimelineFilter = "all" | "projects" | "tickets" | "contracts" | "documents" | "client";

export type ClientTimelineItem = {
  id: string;
  date: string;
  type: ClientTimelineFilter;
  title: string;
  description: string | null;
  metadataLabel: string | null;
  entityType: ActivityLogRecord["entity_type"];
  entityId: string;
  href: string | null;
  actorName: string;
  expandableDetails: string | null;
};

export type RelationshipHealth = "healthy" | "attention_needed" | "at_risk";

export type ClientRelationshipSummary = {
  totalProjects: number;
  activeProjects: number;
  openTickets: number;
  activeContracts: number;
  documentsCount: number;
  archivedDocumentsCount: number;
  lastActivityDate: string | null;
  upcomingContractRenewal: ClientLinkedContract | null;
  upcomingProjectDeadline: ClientProjectPreview | null;
  overdueTickets: number;
  delayedProjects: number;
  expiredContracts: number;
  relationshipHealth: RelationshipHealth;
};

export type ClientRecord = {
  id: string;
  name: string;
  legal_name: string | null;
  type: ClientType;
  industry: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  tax_id: string | null;
  status: ClientStatus;
  account_manager_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  accountManager: ClientAccountManager | null;
  linkedProjects: ClientProjectPreview[];
  activeProjectsCount: number;
  totalContractValuePlaceholder: string;
  lastActivityAt: string | null;
  recentActivity: ActivityLogRecord[];
  relationshipSummary?: ClientRelationshipSummary;
  linkedContracts?: ClientLinkedContract[];
  linkedDocuments?: ClientLinkedDocument[];
  linkedTickets?: ClientLinkedTicket[];
  timeline?: ClientTimelineItem[];
  viewMode: "full" | "summary";
};

export type ClientFilters = {
  search?: string;
  status?: ClientStatus | "";
  type?: ClientType | "";
  accountManagerId?: string;
};

export type ClientFormValues = {
  name: string;
  legal_name: string;
  type: ClientType;
  industry: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  country: string;
  city: string;
  website: string;
  tax_id: string;
  status: ClientStatus;
  account_manager_id: string;
  notes: string;
};

export type ClientFiltersData = {
  accountManagers: ClientAccountManager[];
};

export type ClientStatusCount = {
  active: number;
  prospect: number;
  suspended: number;
};
