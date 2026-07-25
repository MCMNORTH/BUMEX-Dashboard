export type GlobalSearchEntityType =
  | "project"
  | "ticket"
  | "client"
  | "contract"
  | "document"
  | "invoice"
  | "payment"
  | "team_member";

export type GlobalSearchResult = {
  id: string;
  entityType: GlobalSearchEntityType;
  title: string;
  description: string | null;
  status: string | null;
  relatedLabel: string | null;
  updatedAt: string | null;
  href: string;
};

export type GlobalSearchGroup = {
  entityType: GlobalSearchEntityType;
  label: string;
  results: GlobalSearchResult[];
};
